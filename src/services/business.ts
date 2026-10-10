import { Prisma, type MovementType, type OrderStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";

export function stockDelta(type: MovementType, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity === 0) throw new AppError("Quantity must be a nonzero integer");
  if (type === "ADJUSTMENT" || type === "TRANSFER") return quantity;
  if (quantity < 0) throw new AppError("Use a positive quantity for this movement type");
  return type === "SALE" || type === "DAMAGED" ? -quantity : quantity;
}

export function resultingStock(current: number, reserved: number, delta: number): number {
  const result = current + delta;
  if (result < reserved || result < 0) throw new AppError("Insufficient available stock", 409);
  if (!Number.isSafeInteger(result) || result > 100000000) throw new AppError("Stock limit exceeded");
  return result;
}

export const fulfillmentStatuses: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
export function validateOrderTransition(from: OrderStatus, to: OrderStatus) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ["PENDING", "CONFIRMED", "PROCESSING", "DELIVERED", "CANCELLED"],
    CONFIRMED: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
    PROCESSING: ["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
    SHIPPED: ["SHIPPED", "DELIVERED", "CANCELLED"],
    DELIVERED: ["DELIVERED", "CANCELLED"], CANCELLED: ["CANCELLED"],
  };
  if (!allowed[from].includes(to)) throw new AppError(`Cannot change an order from ${from} to ${to}`, 409);
}

type TaxLine = { productId: string; quantity: number; unitPrice: number; gstPercentage: number };
const round = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export function calculateOrderTotals(lines: TaxLine[], discount: number, intraState: boolean) {
  if (lines.length === 0 || new Set(lines.map(l => l.productId)).size !== lines.length) throw new AppError("Each product must appear once in a non-empty order");
  const bases = lines.map(l => round(new Prisma.Decimal(l.unitPrice).mul(l.quantity)));
  const subtotal = bases.reduce((a, b) => a.add(b), new Prisma.Decimal(0));
  const discountAmount = round(new Prisma.Decimal(discount));
  if (discountAmount.isNegative() || discountAmount.gt(subtotal)) throw new AppError("Discount cannot exceed the subtotal");
  const allocations = bases.map(base => subtotal.isZero() ? new Prisma.Decimal(0) : discountAmount.mul(base).div(subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN));
  let remainder = discountAmount.sub(allocations.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)));
  const byFraction = bases.map((base, index) => ({ index, fraction: subtotal.isZero() ? new Prisma.Decimal(0) : discountAmount.mul(base).div(subtotal).sub(allocations[index]) })).sort((a,b) => b.fraction.comparedTo(a.fraction));
  for (const {index} of byFraction) { if (remainder.lte(0)) break; if (allocations[index].lt(bases[index])) { allocations[index] = allocations[index].add('0.01'); remainder = remainder.sub('0.01'); } }
  const items = lines.map((line, index) => {
    const allocation = allocations[index];
    const taxableAmount = bases[index].sub(allocation);
    // Round the component taxes independently so printed CGST + SGST equals the invoice tax.
    const halfTax = round(taxableAmount.mul(line.gstPercentage).div(200));
    const taxAmount = intraState ? halfTax.mul(2) : round(taxableAmount.mul(line.gstPercentage).div(100));
    return { ...line, unitPrice: new Prisma.Decimal(line.unitPrice), gstPercentage: new Prisma.Decimal(line.gstPercentage), taxableAmount, taxAmount, total: taxableAmount.add(taxAmount) };
  });
  const taxableAmount = subtotal.sub(discountAmount);
  const totalTax = items.reduce((a, b) => a.add(b.taxAmount), new Prisma.Decimal(0));
  const zero = new Prisma.Decimal(0);
  return { items, subtotal, discount: discountAmount, taxableAmount, cgst: intraState ? totalTax.div(2) : zero, sgst: intraState ? totalTax.div(2) : zero, igst: intraState ? zero : totalTax, totalTax, total: taxableAmount.add(totalTax) };
}
