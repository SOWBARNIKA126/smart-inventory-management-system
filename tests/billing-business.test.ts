import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateBillTotals, calculateCashChange } from "@/services/billing-business";

const line = (productId = "p1", quantity = 3, unitPrice = 100, gstPercentage = 5, discount = 0) => ({ productId, quantity, unitPrice, gstPercentage, discount });
const number = (value: Prisma.Decimal) => value.toNumber();

describe("billing totals", () => {
  it("calculates the 3-unit checkout using exact decimal tax components", () => {
    const total = calculateBillTotals([line()], 0, true);
    expect(number(total.subtotal)).toBe(300);
    expect(number(total.taxableAmount)).toBe(300);
    expect(number(total.cgst)).toBe(7.5);
    expect(number(total.sgst)).toBe(7.5);
    expect(number(total.igst)).toBe(0);
    expect(number(total.total)).toBe(315);
  });

  it("applies line discounts before allocating a bill discount across mixed GST rates", () => {
    const total = calculateBillTotals([line("p1", 2, 100, 5, 20), line("p2", 1, 200, 18, 10)], 37, true);
    expect(number(total.subtotal)).toBe(400);
    expect(number(total.discount)).toBe(67);
    expect(total.items.map(item => number(item.discount))).toEqual([38, 29]);
    expect(number(total.taxableAmount)).toBe(333);
    expect(number(total.totalTax)).toBe(38.88);
    expect(number(total.cgst)).toBe(19.44);
    expect(number(total.sgst)).toBe(19.44);
    expect(number(total.total)).toBe(371.88);
  });

  it("uses IGST for interstate sales", () => {
    const total = calculateBillTotals([line("p1", 1, 100, 18)], 10, false);
    expect(number(total.cgst)).toBe(0);
    expect(number(total.sgst)).toBe(0);
    expect(number(total.igst)).toBe(16.2);
    expect(number(total.total)).toBe(106.2);
  });

  it("allocates every paise and resolves equal fractions consistently by product id", () => {
    const total = calculateBillTotals([line("c", 1, 1, 0), line("a", 1, 1, 0), line("b", 1, 1, 0)], 0.01, true);
    expect(total.items.map(item => [item.productId, number(item.discount)])).toEqual([["c", 0], ["a", 0.01], ["b", 0]]);
    expect(number(total.total)).toBe(2.99);
    expect(total.items.reduce((sum, item) => sum.add(item.total), new Prisma.Decimal(0)).eq(total.total)).toBe(true);
  });

  it("handles fully discounted and zero-price lines without dividing by zero", () => {
    const total = calculateBillTotals([line("p1", 1, 100, 18, 100), line("p2", 1, 0, 5)], 0, true);
    expect(number(total.total)).toBe(0);
    expect(number(total.totalTax)).toBe(0);
    expect(number(total.discount)).toBe(100);
    expect(total.items.every(item => item.total.isZero())).toBe(true);
  });

  it("does not apply bill discount to already fully discounted lines", () => {
    const total = calculateBillTotals([line("p1", 1, 100, 18, 100), line("p2", 1, 100, 5)], 1, true);
    expect(total.items.map(item => number(item.discount))).toEqual([100, 1]);
    expect(number(total.taxableAmount)).toBe(99);
  });

  it("rounds CGST and SGST independently so displayed components equal item taxes", () => {
    const total = calculateBillTotals([line("p1", 1, 0.1, 18)], 0, true);
    expect(number(total.totalTax)).toBe(0.02);
    expect(number(total.cgst)).toBe(0.01);
    expect(number(total.sgst)).toBe(0.01);
    expect(number(total.total)).toBe(0.12);
  });

  it("rejects a line discount that would subsidize another product", () => {
    expect(() => calculateBillTotals([line("p1", 1, 100, 5, 101), line("p2", 1, 100, 5)], 0, true)).toThrow("Line discount");
  });

  it("rejects bill discounts above the amount remaining after line discounts", () => {
    expect(() => calculateBillTotals([line("p1", 1, 100, 5, 20)], 80.01, true)).toThrow("Bill discount");
  });

  it("rejects empty or duplicate-product bills", () => {
    expect(() => calculateBillTotals([], 0, true)).toThrow("non-empty bill");
    expect(() => calculateBillTotals([line(), line()], 0, true)).toThrow("once");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1000001])("rejects invalid quantity %s", quantity => {
    expect(() => calculateBillTotals([line("p1", quantity)], 0, true)).toThrow("Quantity");
  });

  it.each([-1, 0.001, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid discount %s", discount => {
    expect(() => calculateBillTotals([line()], discount, true)).toThrow();
  });

  it("rejects values that overflow the persisted monetary columns", () => {
    expect(() => calculateBillTotals([line("p1", 1000000, 1000000, 5)], 0, true)).toThrow("supported limit");
  });

  it("accepts canonical decimal prices without converting them to binary floats", () => {
    const total = calculateBillTotals([{ ...line("p1", 3, 0, 18), unitPrice: new Prisma.Decimal("19.99") }], 0.01, true);
    expect(number(total.subtotal)).toBe(59.97);
    expect(number(total.taxableAmount)).toBe(59.96);
    expect(number(total.total)).toBe(70.76);
  });
});

describe("cash payment", () => {
  it("returns exact change", () => {
    const payment = calculateCashChange(new Prisma.Decimal("371.88"), 500);
    expect(number(payment.amountReceived)).toBe(500);
    expect(number(payment.change)).toBe(128.12);
  });

  it("accepts exact payment", () => {
    expect(number(calculateCashChange(new Prisma.Decimal("0.30"), 0.3).change)).toBe(0);
  });

  it("rejects missing and insufficient cash", () => {
    expect(() => calculateCashChange(new Prisma.Decimal(100), undefined)).toThrow("amount received");
    expect(() => calculateCashChange(new Prisma.Decimal(100), 99.99)).toThrow("cover");
  });
});
