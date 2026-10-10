// Browser-safe invoice preview. Checkout always recalculates from database values.
export type PreviewLine = {productId: string; quantity: number; unitPrice: number; gstPercentage: number; discount: number};
const cents = (value: number) => {
  if (!Number.isFinite(value) || value < 0 || value > 999999999999.99) throw new Error('Enter a valid amount');
  return BigInt(Math.round((value + Number.EPSILON) * 100));
};
const money = (value: bigint) => Number(value) / 100;
const rounded = (value: bigint, divisor: bigint) => (value + divisor / 2n) / divisor;

export function previewBill(lines: PreviewLine[], billDiscount: number, intraState: boolean) {
  const bases = lines.map(line => {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000000) throw new Error('Enter a valid quantity');
    if (!Number.isFinite(line.gstPercentage) || line.gstPercentage < 0 || line.gstPercentage > 100) throw new Error('Enter a valid GST rate');
    return cents(line.unitPrice) * BigInt(line.quantity);
  });
  const lineDiscounts = lines.map((line, index) => {
    const value = cents(line.discount);
    if (value > bases[index]) throw new Error('Line discount cannot exceed the line subtotal');
    return value;
  });
  const net = bases.map((base, index) => base - lineDiscounts[index]);
  const netTotal = net.reduce((sum, value) => sum + value, 0n);
  const additional = cents(billDiscount);
  if (additional > netTotal) throw new Error('Discount cannot exceed the subtotal');
  const allocations = net.map(base => netTotal ? additional * base / netTotal : 0n);
  let remainder = additional - allocations.reduce((sum, value) => sum + value, 0n);
  const fractions = net.map((base, index) => ({index, fraction: netTotal ? additional * base % netTotal : 0n})).sort((a, b) => a.fraction === b.fraction ? lines[a.index].productId.localeCompare(lines[b.index].productId) : a.fraction > b.fraction ? -1 : 1);
  for (const {index} of fractions) if (remainder > 0n && allocations[index] < net[index]) {allocations[index]++; remainder--;}
  const items = lines.map((line, index) => {
    const taxable = net[index] - allocations[index];
    const rate = BigInt(Math.round(line.gstPercentage * 100));
    const tax = intraState ? rounded(taxable * rate, 20000n) * 2n : rounded(taxable * rate, 10000n);
    return {productId: line.productId, discount: money(lineDiscounts[index] + allocations[index]), taxableAmount: money(taxable), taxAmount: money(tax), total: money(taxable + tax)};
  });
  const subtotal = money(bases.reduce((sum, value) => sum + value, 0n));
  const discount = money(lineDiscounts.reduce((sum, value) => sum + value, additional));
  const taxableAmount = money(netTotal - additional);
  const totalTax = money(items.reduce((sum, item) => sum + cents(item.taxAmount), 0n));
  if (subtotal > 999999999999.99 || taxableAmount + totalTax > 999999999999.99) throw new Error('Bill total exceeds the supported limit');
  return {items, subtotal, discount, taxableAmount, cgst: intraState ? totalTax / 2 : 0, sgst: intraState ? totalTax / 2 : 0, igst: intraState ? 0 : totalTax, totalTax, total: money(cents(taxableAmount) + cents(totalTax))};
}
