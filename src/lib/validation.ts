import { z } from "zod";

const short = z.string().trim().max(250);
const optional = short.optional().nullable();
const money = z.coerce.number().finite().min(0).max(999999999);
const stock = z.coerce.number().int().min(0).max(100000000);
const phone = z.string().trim().max(30).refine(v => !v || /^\+?[\d ()-]{7,25}$/.test(v), "Enter a valid phone number").optional().nullable();
const email = z.union([z.string().trim().email().toLowerCase(), z.literal("")]).optional().nullable();
const pinCode = z.union([z.string().regex(/^\d{6}$/, "PIN code must have six digits"), z.literal("")]).optional().nullable();
const gstin = z.union([z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, "Enter a valid GSTIN"), z.literal("")]).optional().nullable();
export const loginSchema = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1).max(72), rememberMe: z.boolean().optional() });
export const productSchema = z.object({
  name: short.min(2), sku: short.min(2).max(64), barcode: optional, description: z.string().max(3000).optional().nullable(),
  categoryId: short.min(1), supplierId: short.min(1), costPrice: money, sellingPrice: money,
  gstPercentage: z.coerce.number().min(0).max(100), hsnCode: optional,
  minStock: stock.default(10), reorderPoint: stock.default(20), reorderQuantity: stock.default(50),
  unit: z.enum(["pcs", "kg", "g", "litre", "ml", "packet", "box"]).default("pcs"),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"), initialStock: stock.optional(),
});
export const categorySchema = z.object({ name: short.min(2), description: optional, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });
export const supplierSchema = z.object({ name: short.min(2), contactPerson: optional, phone, email, addressLine: optional, area: optional, city: optional, state: optional, pinCode, country: short.default("India"), gstin, leadTimeDays: z.coerce.number().int().min(0).max(365).default(5), status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"), notes: z.string().max(3000).optional().nullable() });
export const customerSchema = z.object({ name: short.min(2), phone, email, addressLine: optional, area: optional, city: optional, state: optional, pinCode, country: short.default("India"), gstin });
export const movementSchema = z.object({ productId: short.min(1), type: z.enum(["PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "DAMAGED", "TRANSFER"]), quantity: z.coerce.number().int().min(-100000000).max(100000000).refine(v => v !== 0, "Quantity cannot be zero"), notes: z.string().max(1000).optional(), reference: short.optional() });
export const orderItemSchema = z.object({ productId: short.min(1), quantity: z.coerce.number().int().min(1).max(1000000), unitPrice: money.optional(), gstPercentage: z.coerce.number().min(0).max(100).optional() });
export const orderStatusSchema = z.enum(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]);
export const orderSchema = z.object({ customerId: short.optional(), customer: customerSchema.optional(), items: z.array(orderItemSchema).min(1).max(100), discount: money.default(0), status: orderStatusSchema.default("PENDING"), paymentMethod: z.enum(["CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER"]).default("CASH"), paymentStatus: z.enum(["PENDING", "PAID", "PARTIALLY_PAID", "REFUNDED"]).default("PENDING"), notes: z.string().max(2000).optional().nullable() });
export const userSchema = z.object({ name: short.min(2), email: z.string().trim().email().toLowerCase(), password: z.string().min(10).max(72), role: z.enum(["ADMIN", "MANAGER", "STAFF"]), isActive: z.boolean().default(true) });
export const settingsSchema = z.object({ storeName: short.min(2), gstin, addressLine: optional, area: optional, city: short.min(1), state: short.min(1), pinCode, country: short.default("India"), phone, currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code"), defaultReorderLevel: stock, safetyStockDays: z.coerce.number().int().min(0).max(180), defaultForecastPeriod: z.union([z.literal(7), z.literal(30), z.literal(90)]), historicalDataDays: z.coerce.number().int().min(30).max(3650), gstRates: z.array(z.number().min(0).max(100)).min(1).optional() });

export function pagination(params: URLSearchParams) {
  const rawPage = Number(params.get("page") || 1);
  const rawSize = Number(params.get("pageSize") || 20);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawSize) ? Math.min(100, Math.max(1, Math.floor(rawSize))) : 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function dateRange(params: URLSearchParams) {
  const from = params.get("dateFrom") || params.get("from");
  const to = params.get("dateTo") || params.get("to");
  let gte = from ? z.coerce.date().parse(from) : undefined;
  let lte = to ? z.coerce.date().parse(to) : undefined;
  if (gte && from?.length === 10) gte = new Date(gte.getTime() - 330 * 60000);
  if (lte && to?.length === 10) lte = new Date(lte.getTime() - 330 * 60000 + 86400000 - 1);
  if(gte && lte && gte > lte) throw new z.ZodError([{code:'custom',path:['dateFrom'],message:'Start date must be before end date'}]);
  return gte || lte ? { gte, lte } : undefined;
}
