import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

type BillingTaxLine = {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  gstPercentage: Prisma.Decimal.Value;
  discount?: number;
};

const zero = () => new Prisma.Decimal(0);
const round = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const maxAmount = new Prisma.Decimal("999999999999.99");

function amount(value: Prisma.Decimal.Value, label: string) {
  const result = new Prisma.Decimal(value);
  if (!result.isFinite() || result.isNegative() || result.gt(maxAmount) || result.decimalPlaces() > 2) {
    throw new AppError(`${label} must be a nonnegative amount with at most two decimal places`);
  }
  return result;
}

/** Prices exclude GST. Line discounts apply first, then the bill discount is allocated in paise. */
export function calculateBillTotals(lines: BillingTaxLine[], billDiscount: number, intraState: boolean) {
  if (!lines.length || lines.length > 100 || new Set(lines.map(line => line.productId)).size !== lines.length) {
    throw new AppError("Each product must appear once in a non-empty bill");
  }
  const prepared = lines.map(line => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000) throw new AppError("Quantity must be a positive integer");
    const unitPrice = amount(line.unitPrice, "Unit price");
    const gstPercentage = amount(line.gstPercentage, "GST rate");
    if (gstPercentage.gt(100)) throw new AppError("GST rate cannot exceed 100%");
    const base = unitPrice.mul(line.quantity);
    const discount = amount(line.discount ?? 0, "Line discount");
    if (discount.gt(base)) throw new AppError("Line discount cannot exceed the line subtotal");
    return { ...line, unitPrice, gstPercentage, base, discount, net: base.sub(discount) };
  });
  const subtotal = prepared.reduce((sum, line) => sum.add(line.base), zero());
  const afterLineDiscounts = prepared.reduce((sum, line) => sum.add(line.net), zero());
  const additionalDiscount = amount(billDiscount, "Bill discount");
  if (additionalDiscount.gt(afterLineDiscounts)) throw new AppError("Bill discount cannot exceed the remaining subtotal");

  // Largest-remainder allocation keeps every paise, including mixed tax rates and small bills.
  const exact = prepared.map(line => afterLineDiscounts.isZero() ? zero() : additionalDiscount.mul(line.net).div(afterLineDiscounts));
  const allocations = exact.map(value => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN));
  let remaining = additionalDiscount.sub(allocations.reduce((sum, value) => sum.add(value), zero()));
  const priority = prepared.map((line, index) => ({ index, productId: line.productId, fraction: exact[index].sub(allocations[index]) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction) || a.productId.localeCompare(b.productId));
  for (const { index } of priority) {
    if (remaining.isZero()) break;
    if (allocations[index].lt(prepared[index].net)) {
      allocations[index] = allocations[index].add("0.01");
      remaining = remaining.sub("0.01");
    }
  }
  const items = prepared.map((line, index) => {
    const discount = line.discount.add(allocations[index]);
    const taxableAmount = line.base.sub(discount);
    const halfTax = round(taxableAmount.mul(line.gstPercentage).div(200));
    const taxAmount = intraState ? halfTax.mul(2) : round(taxableAmount.mul(line.gstPercentage).div(100));
    return { productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, gstPercentage: line.gstPercentage,
      discount, taxableAmount, taxAmount, total: taxableAmount.add(taxAmount) };
  });
  const discount = prepared.reduce((sum, line) => sum.add(line.discount), additionalDiscount);
  const taxableAmount = subtotal.sub(discount);
  const totalTax = items.reduce((sum, line) => sum.add(line.taxAmount), zero());
  const total = taxableAmount.add(totalTax);
  if (subtotal.gt(maxAmount) || total.gt(maxAmount)) throw new AppError("Bill total exceeds the supported limit");
  return { items, subtotal, discount, taxableAmount, totalTax, total,
    cgst: intraState ? totalTax.div(2) : zero(), sgst: intraState ? totalTax.div(2) : zero(), igst: intraState ? zero() : totalTax };
}

export function calculateCashChange(total: Prisma.Decimal, received: number | undefined) {
  if (received === undefined) throw new AppError("Enter the amount received for a cash payment");
  const amountReceived = amount(received, "Amount received");
  if (amountReceived.lt(total)) throw new AppError("Amount received must cover the grand total");
  return { amountReceived, change: amountReceived.sub(total) };
}
