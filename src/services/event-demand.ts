import type { PlanningEvent } from "./event-calendar";

/** Business dates are YYYY-MM-DD. `asOf` is the current, incomplete business day. */
export interface EventProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  categoryName: string;
  supplierName: string | null;
  leadTimeDays: number;
  currentStock: number;
  reservedStock: number;
  /** First day from which the caller can guarantee continuous sales coverage. */
  historyStart: string | null;
}

/** Callers must exclude voided sales before supplying observations. */
export interface EventObservation {
  productId: string;
  date: string;
  quantity: number;
}

export interface EventForecastOptions {
  asOf: string;
  safetyStockDays: number;
}

export interface EventRecommendation extends EventProduct {
  previousUnits: number;
  previousDailyAverage: number;
  liftPercent: number | null;
  recentTrendPercent: number | null;
  adjustmentFactor: number;
  trendApplied: boolean;
  expectedDemand: number;
  expectedDailyAverage: number;
  availableStock: number;
  safetyStock: number;
  recentDailyAverage: number;
  recentHistoryObserved: boolean;
  projectedStockAtStart: number;
  recommendedReorder: number;
  orderByDate: string;
  status: "REORDER_NOW" | "REORDER_SOON" | "NO_ACTION";
  historyCoverage: "COMPLETE";
}

export interface EventPlan {
  event: PlanningEvent;
  products: EventRecommendation[];
  insufficientHistoryProducts: EventProduct[];
  summary: {
    eligibleProducts: number;
    insufficientHistoryProducts: number;
    expectedUnits: number;
    previousUnits: number;
    reorderUnits: number;
    reorderProducts: number;
  };
  metadata: {
    asOf: string;
    previousWindowDays: number;
    upcomingWindowDays: number;
    automaticOrdering: false;
    overlappingPlansAreAdditive: false;
  };
}

const DAY = 86_400_000;
const RECENT_DAYS = 28;

// Division and multiplication can leave an exact unit count a few ULPs above
// its integer (31 / 15 * 15). Preserve genuine fractions, not that binary noise.
const ceilUnits = (value: number) => Math.max(0, Math.ceil(value - Number.EPSILON * Math.max(1, Math.abs(value)) * 4));

function parseDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = new Date(`${value}T00:00:00.000Z`).getTime();
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

function requireDay(value: string, field: string): number {
  const time = parseDay(value);
  if (!Number.isFinite(time)) throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  return time;
}

function requireNonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a nonnegative finite number`);
}

function dayKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function daysInclusive(start: number, end: number): number {
  return (end - start) / DAY + 1;
}

/** Shift calendar dates, clamping leap day to February 28 in a non-leap year. */
function previousYear(time: number): number {
  const date = new Date(time);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.getTime();
}

/**
 * Estimate each event independently from its explicitly aligned previous window.
 * No product names/categories create demand. A complete zero-sale window is known
 * zero demand; a window before history coverage is separately flagged as unknown.
 * These recommendations never place orders and overlapping plans must not be added.
 */
export function forecastEvent(
  event: PlanningEvent,
  products: EventProduct[],
  observations: EventObservation[],
  options: EventForecastOptions,
): EventPlan {
  const asOf = requireDay(options.asOf, "asOf");
  const start = requireDay(event.startDate, "event.startDate");
  const end = requireDay(event.endDate, "event.endDate");
  const previousStart = requireDay(event.previousStartDate, "event.previousStartDate");
  const previousEnd = requireDay(event.previousEndDate, "event.previousEndDate");
  if (event.eventDate !== null) requireDay(event.eventDate, "event.eventDate");
  if (event.previousEventDate !== null) requireDay(event.previousEventDate, "event.previousEventDate");
  if (end < start || previousEnd < previousStart) throw new Error("Event windows must end on or after their start date");
  requireNonnegative(options.safetyStockDays, "safetyStockDays");

  const histories = new Map<string, number | null>();
  for (const product of products) {
    requireNonnegative(product.currentStock, "currentStock");
    requireNonnegative(product.reservedStock, "reservedStock");
    requireNonnegative(product.leadTimeDays, "leadTimeDays");
    if (!Number.isSafeInteger(product.leadTimeDays)) throw new Error("leadTimeDays must be a whole number");
    histories.set(product.id, product.historyStart === null ? null : requireDay(product.historyStart, "historyStart"));
  }

  const salesByProduct = new Map<string, Map<number, number>>();
  for (const observation of observations) {
    const date = parseDay(observation.date);
    const historyStart = histories.get(observation.productId);
    if (historyStart === undefined || historyStart === null || !Number.isFinite(date)
      || date >= asOf || date < historyStart || !Number.isFinite(observation.quantity) || observation.quantity < 0) continue;
    const sales = salesByProduct.get(observation.productId) ?? new Map<number, number>();
    sales.set(date, (sales.get(date) ?? 0) + observation.quantity);
    salesByProduct.set(observation.productId, sales);
  }

  const previousWindowDays = daysInclusive(previousStart, previousEnd);
  const upcomingWindowDays = daysInclusive(start, end);
  const recentStart = asOf - RECENT_DAYS * DAY;
  const recentEnd = asOf - DAY;
  const priorRecentStart = previousYear(recentStart);
  const priorRecentEnd = previousYear(recentEnd);
  const priorRecentDays = daysInclusive(priorRecentStart, priorRecentEnd);
  const baselineStart = previousStart - RECENT_DAYS * DAY;
  const daysUntilStart = Math.max(0, (start - asOf) / DAY);
  const recommendations: EventRecommendation[] = [];
  const insufficientHistoryProducts: EventProduct[] = [];

  for (const product of products) {
    const historyStart = histories.get(product.id) ?? null;
    if (historyStart === null || historyStart > previousStart || previousEnd >= asOf) {
      insufficientHistoryProducts.push(product);
      continue;
    }

    const sales = salesByProduct.get(product.id);
    const total = (from: number, through: number): number => {
      let sum = 0;
      for (const [day, quantity] of sales ?? []) {
        if (day >= from && day <= through) sum += quantity;
      }
      if (!Number.isFinite(sum)) throw new Error("Observed demand exceeds the supported numeric range");
      return sum;
    };

    const previousUnits = total(previousStart, previousEnd);
    if (previousUnits === 0) continue;
    const previousDailyAverage = previousUnits / previousWindowDays;
    const baselineUnits = historyStart <= baselineStart ? total(baselineStart, previousStart - DAY) : 0;
    const liftPercent = baselineUnits > 0 ? (previousDailyAverage / (baselineUnits / RECENT_DAYS) - 1) * 100 : null;
    const recentHistoryObserved = historyStart <= recentStart;
    const recentDailyAverage = recentHistoryObserved ? total(recentStart, recentEnd) / RECENT_DAYS : 0;
    const priorRecentUnits = historyStart <= priorRecentStart ? total(priorRecentStart, priorRecentEnd) : 0;
    const trendApplied = recentHistoryObserved && historyStart <= priorRecentStart && priorRecentUnits > 0;
    const trendRatio = trendApplied ? recentDailyAverage / (priorRecentUnits / priorRecentDays) : 1;
    const recentTrendPercent = trendApplied ? (trendRatio - 1) * 100 : null;
    const adjustmentFactor = trendApplied ? Math.min(2, Math.max(0.5, trendRatio)) : 1;
    const expectedDailyAverage = previousDailyAverage * adjustmentFactor;
    const expectedDemand = ceilUnits(expectedDailyAverage * upcomingWindowDays);
    const availableStock = Math.max(0, product.currentStock - product.reservedStock);
    const safetyStock = ceilUnits(expectedDailyAverage * options.safetyStockDays);
    const projectedStockAtStart = Math.max(0, availableStock - recentDailyAverage * daysUntilStart);
    const recommendedReorder = ceilUnits(expectedDemand + safetyStock - projectedStockAtStart);
    const orderBy = start - product.leadTimeDays * DAY;

    recommendations.push({
      ...product,
      previousUnits,
      previousDailyAverage,
      liftPercent,
      recentTrendPercent,
      adjustmentFactor,
      trendApplied,
      expectedDemand,
      expectedDailyAverage,
      availableStock,
      safetyStock,
      recentDailyAverage,
      recentHistoryObserved,
      projectedStockAtStart,
      recommendedReorder,
      orderByDate: dayKey(orderBy),
      status: recommendedReorder === 0 ? "NO_ACTION" : orderBy <= asOf ? "REORDER_NOW" : "REORDER_SOON",
      historyCoverage: "COMPLETE",
    });
  }

  recommendations.sort((a, b) => b.expectedDemand - a.expectedDemand || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    event,
    products: recommendations,
    insufficientHistoryProducts,
    summary: {
      eligibleProducts: recommendations.length,
      insufficientHistoryProducts: insufficientHistoryProducts.length,
      expectedUnits: recommendations.reduce((sum, product) => sum + product.expectedDemand, 0),
      previousUnits: recommendations.reduce((sum, product) => sum + product.previousUnits, 0),
      reorderUnits: recommendations.reduce((sum, product) => sum + product.recommendedReorder, 0),
      reorderProducts: recommendations.filter((product) => product.recommendedReorder > 0).length,
    },
    metadata: {
      asOf: options.asOf,
      previousWindowDays,
      upcomingWindowDays,
      automaticOrdering: false,
      overlappingPlansAreAdditive: false,
    },
  };
}
