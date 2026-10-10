import { describe, expect, it } from "vitest";
import { calculateOrderTotals, resultingStock, stockDelta, validateOrderTransition } from "../src/services/business";
import { hasPermission } from "../src/lib/permissions";
import {dateRange} from '../src/lib/validation';

describe("stock accounting", () => {
  it("records the correct signed movement and preserves reservations", () => {
    expect(stockDelta("PURCHASE", 10)).toBe(10);
    expect(stockDelta("SALE", 7)).toBe(-7);
    expect(stockDelta("RETURN", 7)).toBe(7);
    expect(stockDelta("ADJUSTMENT", -3)).toBe(-3);
    expect(resultingStock(20, 5, -15)).toBe(5);
    expect(() => resultingStock(20, 5, -16)).toThrow("Insufficient");
    expect(() => stockDelta("SALE", -2)).toThrow();
    expect(() => stockDelta("PURCHASE", 0)).toThrow();
  });
  it("rejects order regressions and reopening a cancellation", () => {
    expect(() => validateOrderTransition("PENDING", "CONFIRMED")).not.toThrow();
    expect(() => validateOrderTransition("CONFIRMED", "PENDING")).toThrow();
    expect(() => validateOrderTransition("CANCELLED", "CONFIRMED")).toThrow();
    expect(() => validateOrderTransition("CANCELLED", "CANCELLED")).not.toThrow();
  });
});

describe("GST invoice arithmetic", () => {
  it('allocates penny discounts without creating negative line amounts',()=>{
    const tiny=Array.from({length:100},(_,i)=>({productId:String(i),quantity:1,unitPrice:0.01,gstPercentage:18}));
    const total=calculateOrderTotals(tiny,0.51,true);
    expect(total.items.every(i=>i.taxableAmount.gte(0))).toBe(true);
    expect(Number(total.taxableAmount)).toBe(0.49);
    expect(Number(total.items.reduce((sum,i)=>sum.add(i.taxableAmount),total.total.mul(0)))).toBe(0.49);
  });
  const lines = [{ productId: "a", quantity: 2, unitPrice: 100, gstPercentage: 18 }];
  it("splits intra-state GST and applies the discount before tax", () => {
    const result = calculateOrderTotals(lines, 20, true);
    expect(Number(result.taxableAmount)).toBe(180);
    expect(Number(result.cgst)).toBe(16.2);
    expect(Number(result.sgst)).toBe(16.2);
    expect(Number(result.igst)).toBe(0);
    expect(Number(result.total)).toBe(212.4);
  });
  it("uses IGST for interstate transactions", () => {
    const result = calculateOrderTotals(lines, 0, false);
    expect(Number(result.igst)).toBe(36);
    expect(Number(result.cgst)).toBe(0);
    expect(Number(result.total)).toBe(236);
  });
  it("preserves exact invoice totals across mixed tax rates and proportional discount", () => {
    const result = calculateOrderTotals([...lines, { productId: "b", quantity: 3, unitPrice: 33.33, gstPercentage: 5 }], 17.19, true);
    const lineTotal = result.items.reduce((sum, i) => sum.add(i.total), result.total.mul(0));
    expect(lineTotal.equals(result.total)).toBe(true);
    expect(result.cgst.add(result.sgst).equals(result.totalTax)).toBe(true);
    expect(() => calculateOrderTotals(lines, 201, true)).toThrow();
    expect(() => calculateOrderTotals([lines[0], lines[0]], 0, true)).toThrow();
  });
});

describe('Indian reporting dates',()=>{it('includes sales from midnight IST and rejects reversed ranges',()=>{
  const range=dateRange(new URLSearchParams({dateFrom:'2026-09-09',dateTo:'2026-09-09'}));
  expect(range?.gte?.toISOString()).toBe('2026-09-08T18:30:00.000Z');
  expect(range?.lte?.toISOString()).toBe('2026-09-09T18:29:59.999Z');
  expect(()=>dateRange(new URLSearchParams({dateFrom:'2026-10-01',dateTo:'2026-09-09'}))).toThrow();
})});

describe("role permissions", () => {
  it("enforces manager and staff boundaries", () => {
    expect(hasPermission("ADMIN", "users")).toBe(true);
    expect(hasPermission("MANAGER", "reports")).toBe(true);
    expect(hasPermission("MANAGER", "settings")).toBe(false);
    expect(hasPermission("STAFF", "orders")).toBe(true);
    expect(hasPermission("STAFF", "inventory:write")).toBe(true);
    expect(hasPermission("STAFF", "inventory:adjust")).toBe(false);
    expect(hasPermission("STAFF", "catalog:write")).toBe(false);
    expect(hasPermission("STAFF", "users")).toBe(false);
  });
});
