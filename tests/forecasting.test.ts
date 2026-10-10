import { describe, expect, it } from "vitest";
import { calculateReorder, forecastDemand } from "../src/services/forecasting";

const DAY = 86_400_000;
const base = { days: 30 as const, currentStock: 100, leadTimeDays: 5, safetyStockDays: 7 };
function history(start: string, days: number, demand: (date: Date, index: number) => number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(new Date(start).getTime() + index * DAY);
    return { date, quantity: demand(date, index) };
  });
}

describe("calendar demand aggregation and fallbacks", () => {
  it("aggregates same-day sales and counts zero-sale days in the moving average", () => {
    const result = forecastDemand({ ...base, historyStart: new Date("2026-01-01"), asOf: new Date("2026-01-07"), history: [{ date: "2026-01-01T10:00:00Z", quantity: 7 }, { date: "2026-01-01T16:00:00Z", quantity: 7 }] });
    expect(result.history).toHaveLength(7);
    expect(result.history[0].quantity).toBe(14);
    expect(result.history[1].quantity).toBe(0);
    expect(result.averageDailyDemand).toBe(2);
    expect(result.expectedDemand).toBe(60);
    expect(result.confidence).toBe("LOW");
    expect(result.method).toBe("MOVING_AVERAGE");
  });

  it("does not leak future sales or include records outside the requested observation window", () => {
    const result = forecastDemand({ ...base, historyStart: new Date("2026-01-01"), asOf: new Date("2026-01-07"), history: [{ date: "2025-12-01", quantity: 100_000 }, { date: "2026-01-01", quantity: 7 }, { date: "2026-01-08", quantity: 100_000 }] });
    expect(result.averageDailyDemand).toBe(1);
    expect(result.forecast[0].date).toBe("2026-01-08");
  });

  it("returns an explicit low-confidence zero forecast without sales", () => {
    const result = forecastDemand({ ...base, history: [], asOf: new Date("2026-01-01") });
    expect(result.expectedDemand).toBe(0);
    expect(result.confidence).toBe("LOW");
    expect(result.daysUntilStockout).toBeNull();
    expect(result.highestDemandMonth).toBeNull();
    expect(result.yearOverYearGrowth).toBeNull();
    expect(result.forecast).toHaveLength(30);
  });

  it("ignores malformed/negative sales and keeps every prediction and interval nonnegative", () => {
    const sales = [...history("2025-01-01", 90, (_, index) => Math.max(0, 50 - index)), { date: new Date("invalid"), quantity: 999 }, { date: new Date("2025-03-01"), quantity: -999 }];
    const result = forecastDemand({ ...base, days: 90, history: sales, asOf: new Date("2025-03-31") });
    expect(result.forecast).toHaveLength(90);
    for (const point of result.forecast) {
      expect(point.quantity).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeGreaterThanOrEqual(0);
      expect(point.upper).toBeGreaterThanOrEqual(point.quantity);
    }
  });
});

describe("seasonal forecasting from observed sales", () => {
  it("learns summer demand and predicts it when the forecast enters summer", () => {
    const sales = history("2024-03-01", 730, (date) => [2, 3, 4].includes(date.getUTCMonth()) ? 30 : 5);
    const result = forecastDemand({ ...base, history: sales, asOf: new Date("2026-02-28") });
    expect(result.method).toBe("SEASONAL_DAMPED_TREND");
    expect(result.seasonalIndices[3].index).toBeGreaterThan(result.seasonalIndices[0].index * 4);
    expect(result.averageDailyDemand).toBeGreaterThan(20);
    expect(result.insights.some((insight) => insight.includes("March–May"))).toBe(true);
  });

  it("learns weekend differences while leaving stable monthly demand stable", () => {
    const sales = history("2024-01-01", 731, (date) => [0, 6].includes(date.getUTCDay()) ? 25 : 10);
    const result = forecastDemand({ ...base, history: sales, asOf: new Date("2025-12-31") });
    const saturday = result.forecast.find((point) => new Date(point.date).getUTCDay() === 6)!;
    const monday = result.forecast.find((point) => new Date(point.date).getUTCDay() === 1)!;
    expect(saturday.quantity).toBeGreaterThan(monday.quantity * 1.8);
    expect(Math.max(...result.seasonalIndices.map((month) => month.index))).toBeLessThan(1.15);
  });

  it("uses a recent growth trend rather than forecasting the lifetime average", () => {
    const sales = history("2026-01-01", 90, (_, index) => index < 62 ? 10 : 20);
    const result = forecastDemand({ ...base, history: sales, asOf: new Date("2026-03-31") });
    expect(result.averageDailyDemand).toBeGreaterThan(18);
    expect(result.forecast.at(-1)!.quantity).toBeGreaterThan(result.forecast[0].quantity);
  });

  it("calculates year-over-year change on comparable complete 90-day windows", () => {
    const sales = history("2024-01-01", 731, (_, index) => index < 366 ? 10 : 12);
    const result = forecastDemand({ ...base, history: sales, asOf: new Date("2025-12-31") });
    expect(result.yearOverYearGrowth).toBe(20);
    expect(result.insights.some((insight) => insight.includes("20% higher"))).toBe(true);
  });
});

describe("reorder recommendations", () => {
  it("covers supplier lead time and safety stock using available, unreserved inventory", () => {
    expect(calculateReorder({ averageDailyDemand: 5, currentStock: 40, reservedStock: 10, leadTimeDays: 5, safetyStockDays: 7 })).toEqual({ availableStock: 30, leadTimeDemand: 25, safetyStock: 35, recommendedStock: 60, recommendedReorder: 30, status: "REORDER_NOW" });
  });

  it("marks stock unable to cover lead time critical and never recommends negative quantities", () => {
    expect(calculateReorder({ averageDailyDemand: 5, currentStock: 20, leadTimeDays: 5, safetyStockDays: 7 }).status).toBe("CRITICAL");
    const result = calculateReorder({ averageDailyDemand: 5, currentStock: 500, leadTimeDays: 5, safetyStockDays: 7 });
    expect(result.recommendedReorder).toBe(0);
    expect(result.status).toBe("NO_ACTION");
  });

  it("rounds fractional reorder quantities upward and rejects invalid stock inputs", () => {
    expect(calculateReorder({ averageDailyDemand: 0.15, currentStock: 1, leadTimeDays: 5, safetyStockDays: 7 }).recommendedReorder).toBe(1);
    expect(() => calculateReorder({ averageDailyDemand: 5, currentStock: -1, leadTimeDays: 5, safetyStockDays: 7 })).toThrow();
    expect(() => forecastDemand({ ...base, currentStock: NaN, history: [] })).toThrow();
  });

  it("reports stockout using cumulative forecast demand and distinguishes horizon shortage", () => {
    const result = forecastDemand({ ...base, currentStock: 5, days: 7, history: [{ date: "2026-01-01", quantity: 14 }], historyStart: new Date("2026-01-01"), asOf: new Date("2026-01-07") });
    expect(result.daysUntilStockout).toBe(3);
    expect(result.expectedShortage).toBe(9);
    expect(result.expectedSurplus).toBe(0);
  });
});
