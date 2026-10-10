import { describe, expect, it } from "vitest";
import type { PlanningEvent } from "../src/services/event-calendar";
import { forecastEvent, type EventObservation, type EventProduct } from "../src/services/event-demand";

const event: PlanningEvent = {
  id: "festival-2026",
  name: "Moving festival",
  kind: "FESTIVAL",
  startDate: "2026-10-28",
  endDate: "2026-11-03",
  previousStartDate: "2025-10-17",
  previousEndDate: "2025-10-23",
  eventDate: "2026-11-01",
  previousEventDate: "2025-10-21",
  sourceUrl: null,
  sourceLabel: null,
};
const product: EventProduct = {
  id: "product-1", name: "Plain product", sku: "PLAIN-1", unit: "piece", categoryName: "General", supplierName: "Supplier",
  currentStock: 0, reservedStock: 0, leadTimeDays: 7, historyStart: "2024-01-01",
};
const options = { asOf: "2026-10-01", safetyStockDays: 0 };
const sale = (date: string, quantity: number, productId = product.id): EventObservation => ({ productId, date, quantity });
function daily(start: string, days: number, quantity: number): EventObservation[] {
  return Array.from({ length: days }, (_, index) => sale(new Date(new Date(start).getTime() + index * 86_400_000).toISOString().slice(0, 10), quantity));
}

describe("event windows and evidence", () => {
  it("uses the explicitly aligned prior festival dates, including zero-sale days", () => {
    const result = forecastEvent(event, [product], [sale("2025-10-17", 14), sale("2025-10-23", 7), sale("2025-11-01", 5_000)], options);
    expect(result.products[0]).toMatchObject({ previousUnits: 21, previousDailyAverage: 3, expectedDemand: 21, historyCoverage: "COMPLETE" });
    expect(result.metadata).toMatchObject({ previousWindowDays: 7, upcomingWindowDays: 7, automaticOrdering: false, overlappingPlansAreAdditive: false });
  });

  it("flags partial/missing history separately and excludes complete zero-sale windows", () => {
    const partial = { ...product, id: "partial", historyStart: "2025-10-18" };
    const missing = { ...product, id: "missing", historyStart: null };
    const knownZero = { ...product, id: "known-zero", name: "Festival firecrackers", categoryName: "Festival" };
    const result = forecastEvent(event, [product, partial, missing, knownZero], [sale("2025-10-20", 21), sale("2025-10-20", 500, partial.id), sale("2025-10-20", 500, missing.id)], options);
    expect(result.products.map((item) => item.id)).toEqual([product.id]);
    expect(result.insufficientHistoryProducts.map((item) => item.id)).toEqual([partial.id, missing.id]);
    expect(result.summary).toMatchObject({ eligibleProducts: 1, insufficientHistoryProducts: 2, previousUnits: 21, expectedUnits: 21 });
  });

  it("does not treat a prior event that has not fully finished as observed", () => {
    const result = forecastEvent(event, [product], [sale("2025-10-17", 21)], { ...options, asOf: "2025-10-23" });
    expect(result.products).toEqual([]);
    expect(result.summary.insufficientHistoryProducts).toBe(1);
  });

  it("scales daily demand to the actual upcoming season duration", () => {
    const season = { ...event, kind: "SEASON" as const, startDate: "2026-11-01", endDate: "2026-11-14" };
    const result = forecastEvent(season, [product], [sale("2025-10-20", 21)], options);
    expect(result.products[0].expectedDemand).toBe(42);
    expect(result.metadata.upcomingWindowDays).toBe(14);
  });

  it("reports lift against all 28 preceding days and leaves zero/missing baselines unknown", () => {
    const sales = [sale("2025-10-20", 21), sale("2025-10-16", 28)];
    expect(forecastEvent(event, [product], sales, options).products[0].liftPercent).toBe(200);
    expect(forecastEvent(event, [product], sales.slice(0, 1), options).products[0].liftPercent).toBeNull();
    const shortHistory = { ...product, historyStart: event.previousStartDate };
    expect(forecastEvent(event, [shortHistory], sales, options).products[0].liftPercent).toBeNull();
  });
});

describe("recent year-over-year adjustments", () => {
  it("applies a comparable observed 28-day year-over-year trend", () => {
    const sales = [sale("2025-10-20", 21), ...daily("2025-09-03", 28, 10), ...daily("2026-09-03", 28, 15)];
    const recommendation = forecastEvent(event, [product], sales, options).products[0];
    expect(recommendation).toMatchObject({ recentTrendPercent: 50, adjustmentFactor: 1.5, trendApplied: true, expectedDemand: 32, recentDailyAverage: 15 });
  });

  it.each([{ recent: 100, factor: 2, percent: 900 }, { recent: 1, factor: 0.5, percent: -90 }, { recent: 0, factor: 0.5, percent: -100 }])("clamps the applied factor to [0.5, 2] for recent rate $recent", ({ recent, factor, percent }) => {
    const sales = [sale("2025-10-20", 28), ...daily("2025-09-03", 28, 10), ...daily("2026-09-03", 28, recent)];
    const recommendation = forecastEvent(event, [product], sales, options).products[0];
    expect(recommendation.adjustmentFactor).toBe(factor);
    expect(recommendation.recentTrendPercent).toBeCloseTo(percent);
    expect(recommendation.trendApplied).toBe(true);
    expect(recommendation.expectedDemand).toBe(28 * factor);
  });

  it("uses factor one when the prior comparison has zero sales or missing coverage", () => {
    const sales = [sale("2025-10-20", 21), ...daily("2026-09-03", 28, 15)];
    expect(forecastEvent(event, [product], sales, options).products[0]).toMatchObject({ adjustmentFactor: 1, trendApplied: false, recentTrendPercent: null });
    const shorterHistory = { ...product, historyStart: "2025-10-01" };
    expect(forecastEvent(event, [shorterHistory], [...sales, sale("2025-09-20", 100)], options).products[0]).toMatchObject({ adjustmentFactor: 1, trendApplied: false, recentTrendPercent: null });
  });

  it("clamps leap-day endpoints and compares daily averages for unequal calendar windows", () => {
    const leapEvent = { ...event, startDate: "2024-04-01", endDate: "2024-04-07", previousStartDate: "2023-04-01", previousEndDate: "2023-04-07", eventDate: null, previousEventDate: null };
    const sales = [sale("2023-04-01", 21), ...daily("2023-02-02", 27, 10), ...daily("2024-02-02", 28, 20), sale("2023-03-01", 100_000)];
    const result = forecastEvent(leapEvent, [{ ...product, historyStart: "2023-01-01" }], sales, { ...options, asOf: "2024-03-01" });
    expect(result.products[0]).toMatchObject({ recentDailyAverage: 20, recentTrendPercent: 100, adjustmentFactor: 2, expectedDemand: 42 });
  });
});

describe("stock planning and observation safety", () => {
  it("deducts reservations and sales before the event, then adds event safety stock", () => {
    const stocked = { ...product, currentStock: 100, reservedStock: 20 };
    const sales = [sale("2025-10-20", 70), ...daily("2026-09-03", 28, 2)];
    const recommendation = forecastEvent(event, [stocked], sales, { ...options, safetyStockDays: 3 }).products[0];
    expect(recommendation).toMatchObject({ availableStock: 80, projectedStockAtStart: 26, expectedDemand: 70, safetyStock: 30, recommendedReorder: 74 });
  });

  it("rounds demand and safety units upward without rounding the daily rate first", () => {
    const longEvent = { ...event, endDate: "2026-11-10" };
    const recommendation = forecastEvent(longEvent, [product], [sale("2025-10-20", 1)], { ...options, safetyStockDays: 7 }).products[0];
    expect(recommendation.previousDailyAverage).toBe(1 / 7);
    expect(recommendation).toMatchObject({ expectedDemand: 2, safetyStock: 1, recommendedReorder: 3 });
  });

  it("does not add a unit when floating-point arithmetic lands just above a whole unit", () => {
    // 29 / 7 * 7 evaluates to 29.000000000000004 in JavaScript.
    const recommendation = forecastEvent(event, [product], [sale("2025-10-20", 29)], { ...options, safetyStockDays: 7 }).products[0];
    expect(recommendation).toMatchObject({ expectedDemand: 29, safetyStock: 29, recommendedReorder: 58 });
  });

  it("preserves a whole-unit total across the 15-day festival window", () => {
    const festival = { ...event, endDate: "2026-11-11", previousEndDate: "2025-10-31" };
    const recommendation = forecastEvent(festival, [product], [sale("2025-10-20", 31)], options).products[0];
    expect(recommendation.expectedDemand).toBe(31);
    expect(recommendation.recommendedReorder).toBe(31);
  });

  it("does not invent pre-event consumption from an incompletely observed recent window", () => {
    const closeEvent = { ...event, previousStartDate: "2026-09-25", previousEndDate: "2026-09-30" };
    const stocked = { ...product, historyStart: "2026-09-25", currentStock: 100, reservedStock: 10 };
    const recommendation = forecastEvent(closeEvent, [stocked], [sale("2026-09-25", 60)], options).products[0];
    expect(recommendation).toMatchObject({ recentHistoryObserved: false, recentDailyAverage: 0, projectedStockAtStart: 90, recommendedReorder: 0, status: "NO_ACTION" });
  });

  it("clamps available and projected stock to zero", () => {
    const recommendation = forecastEvent(event, [{ ...product, currentStock: 5, reservedStock: 10 }], [sale("2025-10-20", 21), ...daily("2026-09-03", 28, 2)], options).products[0];
    expect(recommendation).toMatchObject({ availableStock: 0, projectedStockAtStart: 0, recommendedReorder: 21 });
  });

  it("sets the supplier order deadline and changes status on its exact business date", () => {
    const sales = [sale("2025-10-20", 21)];
    expect(forecastEvent(event, [product], sales, { ...options, asOf: "2026-10-20" }).products[0]).toMatchObject({ orderByDate: "2026-10-21", status: "REORDER_SOON" });
    expect(forecastEvent(event, [product], sales, { ...options, asOf: "2026-10-21" }).products[0].status).toBe("REORDER_NOW");
    expect(forecastEvent(event, [{ ...product, currentStock: 100 }], sales, { ...options, asOf: "2026-10-22" }).products[0].status).toBe("NO_ACTION");
  });

  it("ignores current/future, malformed, negative, nonfinite, and out-of-coverage sales", () => {
    const valid = [sale("2025-10-20", 21)];
    const invalid = [sale(options.asOf, 100_000), sale("2027-01-01", 100_000), sale("2025-10-20", -100_000), sale("2025-10-20", Infinity), sale("2025-10-20", NaN), sale("2025-02-30", 100_000), sale("invalid", 100_000), sale("2023-10-20", 100_000), sale("2025-10-20", 100_000, "unknown-product")];
    expect(forecastEvent(event, [product], [...valid, ...invalid], options)).toEqual(forecastEvent(event, [product], valid, options));
  });

  it("sorts by expected units and sums each event's recommendations independently", () => {
    const second = { ...product, id: "second" };
    const result = forecastEvent(event, [product, second], [sale("2025-10-20", 21), sale("2025-10-20", 70, second.id)], options);
    expect(result.products.map((item) => item.id)).toEqual([second.id, product.id]);
    expect(result.summary).toEqual({ eligibleProducts: 2, insufficientHistoryProducts: 0, expectedUnits: 91, previousUnits: 91, reorderUnits: 91, reorderProducts: 2 });
  });

  it("rejects invalid configuration dates and nonfinite inventory inputs", () => {
    expect(() => forecastEvent(event, [product], [], { ...options, asOf: "2026-02-30" })).toThrow("valid YYYY-MM-DD");
    expect(() => forecastEvent({ ...event, endDate: "2026-01-01" }, [product], [], options)).toThrow("windows");
    expect(() => forecastEvent(event, [{ ...product, currentStock: NaN }], [], options)).toThrow("currentStock");
    expect(() => forecastEvent(event, [{ ...product, historyStart: "invalid" }], [], options)).toThrow("historyStart");
    expect(() => forecastEvent(event, [product], [], { ...options, safetyStockDays: Infinity })).toThrow("safetyStockDays");
  });
});
