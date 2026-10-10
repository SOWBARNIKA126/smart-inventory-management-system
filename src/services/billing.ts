import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Bill, BillCustomer, BillStore } from "@/lib/billing-types";
import { customerSchema, dateRange, pagination } from "@/lib/validation";
import { calculateBillTotals, calculateCashChange } from "@/services/billing-business";
import { changeStock, transaction } from "@/services/inventory";

const money = z.number().finite().min(0).max(999999999999.99)
  .refine(value => new Prisma.Decimal(value).decimalPlaces() <= 2, "Use at most two decimal places");
const billingCustomerSchema = customerSchema.pick({ name: true, phone: true, email: true, gstin: true, addressLine: true, city: true, state: true, pinCode: true })
  .extend({ name: z.string().trim().max(250).optional().nullable() });

export const billingSchema = z.object({
  checkoutKey: z.string().uuid().toLowerCase(),
  items: z.array(z.object({ productId: z.string().trim().min(1).max(250), quantity: z.number().int().min(1).max(1000000), discount: money.default(0) })).min(1).max(100),
  discount: money.default(0),
  paymentMethod: z.enum(["CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER"]),
  amountReceived: money.optional(),
  customer: billingCustomerSchema.optional(),
});

export const billInclude = { items: { orderBy: { id: "asc" } }, customer: true, user: { select: { id: true, name: true } } } as const;
type StoredBill = Prisma.OrderGetPayload<{ include: typeof billInclude }>;

/** Expose only invoice data; idempotency credentials remain on the server. */
export function billResponse(order: StoredBill): Bill {
  const storeSnapshot = order.storeSnapshot as unknown as BillStore;
  const customerSnapshot = order.customerSnapshot as unknown as BillCustomer;
  return {
    id: order.id, orderNumber: order.orderNumber, customerId: order.customerId, userId: order.userId,
    isBill: true, status: "DELIVERED", paymentStatus: "PAID", stockDeducted: true, paymentMethod: order.paymentMethod,
    subtotal: order.subtotal.toNumber(), discount: order.discount.toNumber(), taxableAmount: order.taxableAmount.toNumber(),
    cgst: order.cgst.toNumber(), sgst: order.sgst.toNumber(), igst: order.igst.toNumber(), totalTax: order.totalTax.toNumber(), total: order.total.toNumber(),
    amountReceived: order.amountReceived?.toNumber() ?? null, change: order.change?.toNumber() ?? null,
    createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString(), storeSnapshot, customerSnapshot,
    customer: { ...customerSnapshot, id: order.customerId }, user: order.user,
    items: order.items.map(item => ({
      id: item.id, productId: item.productId, productName: item.productName ?? "", sku: item.sku ?? "", hsnCode: item.hsnCode, unit: item.unit ?? "pcs",
      quantity: item.quantity, unitPrice: item.unitPrice.toNumber(), gstPercentage: item.gstPercentage.toNumber(), discount: item.discount.toNumber(),
      taxableAmount: item.taxableAmount.toNumber(), taxAmount: item.taxAmount.toNumber(), total: item.total.toNumber(),
    })),
  };
}

function assertReplay(order: StoredBill, userId: string, fingerprint: string) {
  if (!order.isBill || order.userId !== userId || order.checkoutFingerprint !== fingerprint) {
    throw new AppError("This checkout key was already used for a different sale", 409);
  }
  return billResponse(order);
}

export async function completeBill(raw: unknown, userId: string) {
  const input = billingSchema.parse(raw);
  const items = [...input.items].sort((a, b) => a.productId.localeCompare(b.productId));
  if (new Set(items.map(item => item.productId)).size !== items.length) throw new AppError("Each product must appear once in a bill");
  const supplied = input.customer;
  const customerDetails = {
    name: supplied?.name || "Walk-in Customer", phone: supplied?.phone || null, email: supplied?.email || null,
    gstin: supplied?.gstin || null, addressLine: supplied?.addressLine || null,
    area: null, city: supplied?.city || null, state: supplied?.state || null, pinCode: supplied?.pinCode || null, country: "India",
  };
  // Stable semantic input: ignored client price/tax/stock fields can never influence the sale.
  const fingerprint = createHash("sha256").update(JSON.stringify({ items, discount: input.discount, paymentMethod: input.paymentMethod,
    amountReceived: input.paymentMethod === "CASH" ? input.amountReceived ?? null : null, customer: customerDetails })).digest("hex");

  try {
    return await transaction(async tx => {
      const replay = await tx.order.findUnique({ where: { checkoutKey: input.checkoutKey }, include: billInclude });
      if (replay) return assertReplay(replay, userId, fingerprint);
      const products = await tx.product.findMany({ where: { id: { in: items.map(item => item.productId) } }, include: { inventory: true } });
      if (products.length !== items.length) throw new AppError("One or more products no longer exist", 404);
      const byId = new Map(products.map(product => [product.id, product]));
      for (const item of items) {
        const product = byId.get(item.productId)!;
        if (product.status !== "ACTIVE") throw new AppError("Only active products can be sold", 409);
        if (!product.inventory || product.inventory.currentStock - product.inventory.reservedStock < item.quantity) throw new AppError("Insufficient available stock", 409);
      }
      const settings = await tx.storeSettings.findUnique({ where: { id: "default" } });
      if (!settings) throw new AppError("Configure store settings before completing a bill", 409);
      const storeSnapshot: BillStore = {
        storeName: settings.storeName, gstin: settings.gstin, addressLine: settings.addressLine, area: settings.area, city: settings.city,
        state: settings.state, pinCode: settings.pinCode, country: settings.country, phone: settings.phone, currency: settings.currency,
      };
      const customerSnapshot: BillCustomer = { ...customerDetails, state: customerDetails.state || settings.state };
      const intraState = customerSnapshot.state!.trim().toLowerCase() === settings.state.trim().toLowerCase();
      const { items: computedItems, ...totals } = calculateBillTotals(items.map(item => {
        const product = byId.get(item.productId)!;
        return { ...item, unitPrice: product.sellingPrice, gstPercentage: product.gstPercentage };
      }), input.discount, intraState);
      const payment = input.paymentMethod === "CASH" ? calculateCashChange(totals.total, input.amountReceived) : { amountReceived: null, change: null };
      const customer = await tx.customer.findFirst({ where: customerSnapshot }) ?? await tx.customer.create({ data: customerSnapshot });
      const businessYear = new Date(Date.now() + 330 * 60000).getUTCFullYear();
      const orderNumber = `INV-${businessYear}-${randomBytes(8).toString("hex").toUpperCase()}`;
      const order = await tx.order.create({ data: {
        orderNumber, customerId: customer.id, userId, isBill: true, checkoutKey: input.checkoutKey, checkoutFingerprint: fingerprint,
        status: "DELIVERED", paymentStatus: "PAID", stockDeducted: true, paymentMethod: input.paymentMethod, ...totals, ...payment,
        storeSnapshot: { ...storeSnapshot }, customerSnapshot: { ...customerSnapshot },
        items: { create: computedItems.map(item => {
          const product = byId.get(item.productId)!;
          return { ...item, productName: product.name, sku: product.sku, hsnCode: product.hsnCode, unit: product.unit };
        }) },
      } });
      for (const item of computedItems) {
        await changeStock(tx, { productId: item.productId, type: "SALE", quantity: item.quantity, userId, reference: orderNumber, notes: "Billing sale" });
        await tx.sale.create({ data: { productId: item.productId, orderId: order.id, quantity: item.quantity, sellingPrice: item.unitPrice,
          gstPercentage: item.gstPercentage, taxableAmount: item.taxableAmount, taxAmount: item.taxAmount, revenue: item.total, date: order.createdAt } });
      }
      return billResponse(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: billInclude }));
    });
  } catch (error) {
    // A simultaneous identical request can hit the unique key after the first transaction commits.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await transaction(tx => tx.order.findUnique({ where: { checkoutKey: input.checkoutKey }, include: billInclude }));
      if (replay) return assertReplay(replay, userId, fingerprint);
    }
    throw error;
  }
}

export async function getBill(id: string) {
  const order = await db.order.findFirst({ where: { id, isBill: true }, include: billInclude });
  if (!order) throw new AppError("Bill not found", 404);
  return billResponse(order);
}

export async function listBills(params: URLSearchParams) {
  const { page, pageSize, skip, take } = pagination(params);
  const q = (params.get("q") || "").trim().slice(0, 250);
  const where: Prisma.OrderWhereInput = { isBill: true, createdAt: dateRange(params), ...(q ? { OR: [
    { orderNumber: { contains: q, mode: "insensitive" } },
    { customerSnapshot: { path: ["name"], string_contains: q, mode: "insensitive" } },
    { customerSnapshot: { path: ["phone"], string_contains: q } },
  ] } : {}) };
  const [orders, total] = await db.$transaction([
    db.order.findMany({ where, include: billInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
    db.order.count({ where }),
  ]);
  return { items: orders.map(billResponse), total, page, pageSize };
}
