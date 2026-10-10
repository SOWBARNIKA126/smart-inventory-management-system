/**
 * Database-independent demand forecasting. Every calendar day in the observed
 * window counts, including days without a sale. Dates use UTC calendar days;
 * callers may pass date-only strings when their source has local business dates.
 * `asOf` is the last fully observed day, inclusive, and defaults to yesterday.
 */
export type ForecastPeriod = 7 | 30 | 90;
export type ForecastConfidence = "LOW" | "MEDIUM" | "HIGH";
export type ReorderStatus = "NO_ACTION" | "REORDER_SOON" | "REORDER_NOW" | "CRITICAL";

export interface DemandObservation {
  date: Date | string;
  quantity: number;
}

export interface ForecastInput {
  history: DemandObservation[];
  days: ForecastPeriod;
  currentStock: number;
  reservedStock?: number;
  leadTimeDays: number;
  safetyStockDays: number;
  asOf?: Date;
  historyStart?: Date;
}

export interface ForecastPoint {
  date: string;
  quantity: number;
  lower: number;
  upper: number;
}

export interface SeasonalIndex {
  month: number;
  label: string;
  averageDemand: number;
  index: number;
  observedDays: number;
}

export interface ForecastResult {
  history: { date: string; quantity: number }[];
  forecast: ForecastPoint[];
  seasonalIndices: SeasonalIndex[];
  confidence: ForecastConfidence;
  confidenceScore: number;
  method: "SEASONAL_DAMPED_TREND" | "WEEKLY_DAMPED_TREND" | "MOVING_AVERAGE";
  historyDays: number;
  expectedDemand: number;
  averageDailyDemand: number;
  peakDemand: number;
  currentStock: number;
  availableStock: number;
  safetyStock: number;
  expectedShortage: number;
  expectedSurplus: number;
  recommendedReorder: number;
  leadTimeDemand: number;
  recommendedStock: number;
  daysUntilStockout: number | null;
  status: ReorderStatus;
  highestDemandMonth: string | null;
  lowestDemandMonth: string | null;
  yearOverYearGrowth: number | null;
  insights: string[];
}

const DAY = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const round = (value: number, precision = 2) => Number(value.toFixed(precision));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const dayOf = (value: Date | string): number => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NaN : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};
const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10);

export function calculateReorder(input: {
  averageDailyDemand: number;
  currentStock: number;
  reservedStock?: number;
  leadTimeDays: number;
  safetyStockDays: number;
}) {
  const numericFields = { averageDailyDemand: input.averageDailyDemand, currentStock: input.currentStock, reservedStock: input.reservedStock, leadTimeDays: input.leadTimeDays, safetyStockDays: input.safetyStockDays };
  for (const [key, value] of Object.entries(numericFields)) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`${key} must be a nonnegative finite number`);
  }
  const availableStock = Math.max(0, input.currentStock - (input.reservedStock ?? 0));
  const demand = input.averageDailyDemand;
  const leadTimeDemand = demand * input.leadTimeDays;
  const safetyStock = demand * input.safetyStockDays;
  const recommendedStock = leadTimeDemand + safetyStock;
  const recommendedReorder = Math.max(0, Math.ceil(recommendedStock - availableStock));
  const status: ReorderStatus = availableStock === 0 || (demand > 0 && availableStock <= leadTimeDemand)
    ? "CRITICAL"
    : recommendedReorder > 0
      ? "REORDER_NOW"
      : demand > 0 && availableStock <= recommendedStock + demand * 7
        ? "REORDER_SOON"
        : "NO_ACTION";
  return {
    availableStock,
    leadTimeDemand: round(leadTimeDemand),
    safetyStock: Math.ceil(safetyStock),
    recommendedStock: Math.ceil(recommendedStock),
    recommendedReorder,
    status,
  };
}

export function forecastDemand(input: ForecastInput): ForecastResult {
  if (![7, 30, 90].includes(input.days)) throw new Error("Forecast period must be 7, 30, or 90 days");
  // Validate inventory inputs even when no sales exist.
  calculateReorder({ ...input, averageDailyDemand: 0 });
  const asOf = input.asOf ? dayOf(input.asOf) : dayOf(new Date()) - DAY;
  const explicitStart = input.historyStart ? dayOf(input.historyStart) : undefined;
  if (!Number.isFinite(asOf) || (explicitStart !== undefined && !Number.isFinite(explicitStart))) throw new Error("Forecast dates must be valid");
  const totals = new Map<number, number>();
  for (const sale of input.history) {
    const date = dayOf(sale.date);
    if (!Number.isFinite(date) || date > asOf || (explicitStart !== undefined && date < explicitStart)) continue;
    if (!Number.isFinite(sale.quantity) || sale.quantity < 0) continue;
    totals.set(date, (totals.get(date) ?? 0) + sale.quantity);
  }
  const firstSale = totals.size ? Math.min(...totals.keys()) : asOf + DAY;
  // A five-year cap bounds work if a caller accidentally provides an ancient date.
  const start = Math.max(explicitStart ?? firstSale, asOf - (365 * 5 - 1) * DAY);
  const daily: { time: number; quantity: number; month: number; weekday: number }[] = [];
  for (let time = start; time <= asOf; time += DAY) {
    const date = new Date(time);
    daily.push({ time, quantity: totals.get(time) ?? 0, month: date.getUTCMonth(), weekday: date.getUTCDay() });
  }
  const values = daily.map((point) => point.quantity);
  const average = mean(values);
  const positiveDays = values.filter((value) => value > 0).length;
  const monthly = MONTHS.map((label, month) => {
    const observations = daily.filter((point) => point.month === month);
    const averageDemand = mean(observations.map((point) => point.quantity));
    return { month: month + 1, label, averageDemand: round(averageDemand), index: average > 0 && observations.length ? round(averageDemand / average, 3) : 1, observedDays: observations.length };
  });
  const seasonal = daily.length >= 365 && positiveDays >= 60;
  const weekly = daily.length >= 56 && positiveDays >= 20;
  const monthFactors = monthly.map((month) => seasonal && month.observedDays >= 21
    ? clamp((month.averageDemand * month.observedDays + average * 7) / (month.observedDays + 7) / (average || 1), 0.1, 5)
    : 1);
  const monthFactorMean = mean(monthFactors) || 1;
  if (seasonal) for (let i = 0; i < monthFactors.length; i++) monthFactors[i] /= monthFactorMean;
  const monthAdjustedMean = mean(daily.map((point) => point.quantity / monthFactors[point.month]));
  const weekdayFactors = Array.from({ length: 7 }, (_, weekday) => {
    if (!weekly || monthAdjustedMean === 0) return 1;
    const observations = daily.filter((point) => point.weekday === weekday);
    const sum = observations.reduce((total, point) => total + point.quantity / monthFactors[point.month], 0);
    return clamp((sum + monthAdjustedMean * 7) / (observations.length + 7) / monthAdjustedMean, 0.3, 3);
  });
  const weekdayFactorMean = mean(weekdayFactors) || 1;
  for (let i = 0; i < weekdayFactors.length; i++) weekdayFactors[i] /= weekdayFactorMean;
  const adjusted = daily.map((point) => point.quantity / (monthFactors[point.month] * weekdayFactors[point.weekday]));
  const recent = adjusted.slice(-28);
  const previous = adjusted.slice(-56, -28);
  let smoothed = mean(adjusted.slice(0, 28));
  for (const value of adjusted) smoothed = (2 / 29) * value + (27 / 29) * smoothed;
  const level = weekly ? 0.6 * smoothed + 0.4 * mean(recent) : mean(values.slice(-28));
  const trend = weekly && previous.length === 28 ? clamp((mean(recent) - mean(previous)) / 28, -level * 0.02, level * 0.02) : 0;
  const residuals = recent.map((value) => value - level);
  const deviation = Math.sqrt(mean(residuals.map((value) => value * value)));
  const coefficientOfVariation = level > 0 ? deviation / level : 1;
  const confidence: ForecastConfidence = seasonal && positiveDays >= 180 && coefficientOfVariation < 0.8 ? "HIGH" : weekly && coefficientOfVariation < 1.5 ? "MEDIUM" : "LOW";
  const confidenceScore = positiveDays === 0 ? 0 : round(clamp((Math.min(daily.length, 730) / 730) * 0.55 + (positiveDays / Math.max(daily.length, 1)) * 0.25 + (1 / (1 + coefficientOfVariation)) * 0.2, 0, 0.95), 2);
  const forecast: ForecastPoint[] = [];
  for (let index = 1; index <= input.days; index++) {
    const time = asOf + index * DAY;
    const date = new Date(time);
    const factors = monthFactors[date.getUTCMonth()] * weekdayFactors[date.getUTCDay()];
    const dampedTrend = trend * (0.9 * (1 - Math.pow(0.9, index)) / 0.1);
    const quantity = Math.max(0, (level + dampedTrend) * factors);
    // Approximate 80% prediction interval, descriptive rather than calibrated ML confidence.
    const uncertainty = 1.28 * Math.max(deviation * factors, Math.sqrt(quantity)) * Math.sqrt(1 + index / 90);
    forecast.push({ date: dateKey(time), quantity: round(quantity), lower: round(Math.max(0, quantity - uncertainty)), upper: round(quantity + uncertainty) });
  }
  const expectedDemand = round(forecast.reduce((sum, point) => sum + point.quantity, 0));
  const averageDailyDemand = expectedDemand / input.days;
  const reorder = calculateReorder({ ...input, averageDailyDemand });
  let daysUntilStockout: number | null = null;
  if (reorder.availableStock === 0) daysUntilStockout = 0;
  else if (averageDailyDemand > 0) {
    let cumulativeDemand = 0;
    const crossing = forecast.findIndex((point) => {
      cumulativeDemand += point.quantity;
      return cumulativeDemand >= reorder.availableStock;
    });
    daysUntilStockout = crossing >= 0 ? crossing + 1 : Math.ceil(reorder.availableStock / averageDailyDemand);
  }
  const observedMonths = monthly.filter((month) => month.observedDays >= 14);
  const sortedMonths = [...observedMonths].sort((a, b) => b.averageDemand - a.averageDemand);
  const highestDemandMonth = average > 0 ? sortedMonths[0]?.label ?? null : null;
  const lowestDemandMonth = average > 0 ? sortedMonths.at(-1)?.label ?? null : null;
  let yearOverYearGrowth: number | null = null;
  if (daily.length >= 455) {
    const recent90 = values.slice(-90).reduce((sum, value) => sum + value, 0);
    const prior90 = values.slice(-455, -365).reduce((sum, value) => sum + value, 0);
    if (prior90 > 0) yearOverYearGrowth = round((recent90 - prior90) / prior90 * 100, 1);
  }
  const insights: string[] = [];
  if (!positiveDays) insights.push("No historical demand is available. Forecast demand is zero until sales are recorded.");
  else if (!weekly) insights.push(`Limited history (${daily.length} observed days). The forecast uses the latest ${Math.min(daily.length, 28)}-day average; confidence is limited.`);
  else if (!seasonal) insights.push("Weekly demand and recent trends are included. At least one year of history is needed to model monthly seasonality.");
  if (seasonal && sortedMonths.length) {
    const peak = sortedMonths[0];
    const difference = round((peak.averageDemand / average - 1) * 100);
    insights.push(`${peak.label} has the highest observed daily demand (${peak.averageDemand} units), ${Math.abs(difference)}% ${difference >= 0 ? "above" : "below"} the historical daily average.`);
    const seasons = [
      { name: "March–May", months: [2, 3, 4] },
      { name: "June–September", months: [5, 6, 7, 8] },
      { name: "November–February", months: [10, 11, 0, 1] },
      { name: "October–November", months: [9, 10] },
    ].map((season) => {
      const observations = daily.filter((point) => season.months.includes(point.month));
      return { ...season, count: observations.length, lift: average > 0 ? mean(observations.map((point) => point.quantity)) / average - 1 : 0 };
    }).filter((season) => season.count >= 45).sort((a, b) => b.lift - a.lift);
    if (seasons[0]?.lift > 0.1) insights.push(`Demand during ${seasons[0].name} is historically ${round(seasons[0].lift * 100)}% above the daily average, based on ${seasons[0].count} observed days.`);
  }
  if (yearOverYearGrowth !== null) insights.push(`Demand in the latest 90 days is ${Math.abs(yearOverYearGrowth)}% ${yearOverYearGrowth >= 0 ? "higher" : "lower"} than the matching 90-day window one year earlier.`);
  if (reorder.recommendedReorder > 0) insights.push(`Order ${reorder.recommendedReorder} units to cover ${input.leadTimeDays} supplier lead-time days and ${input.safetyStockDays} safety-stock days at forecast demand.`);
  return {
    history: daily.map((point) => ({ date: dateKey(point.time), quantity: round(point.quantity) })),
    forecast,
    seasonalIndices: monthly,
    confidence,
    confidenceScore,
    method: seasonal ? "SEASONAL_DAMPED_TREND" : weekly ? "WEEKLY_DAMPED_TREND" : "MOVING_AVERAGE",
    historyDays: daily.length,
    expectedDemand,
    averageDailyDemand: round(averageDailyDemand),
    peakDemand: round(Math.max(0, ...forecast.map((point) => point.quantity))),
    currentStock: input.currentStock,
    ...reorder,
    expectedShortage: Math.ceil(Math.max(0, expectedDemand - reorder.availableStock)),
    expectedSurplus: Math.floor(Math.max(0, reorder.availableStock - expectedDemand)),
    daysUntilStockout,
    highestDemandMonth,
    lowestDemandMonth,
    yearOverYearGrowth,
    insights,
  };
}
