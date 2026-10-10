import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { orderSchema } from "@/lib/validation";
import { calculateOrderTotals, fulfillmentStatuses, validateOrderTransition } from "@/services/business";
import { changeStock, transaction } from "@/services/inventory";

export const orderInclude = { customer: true, items: { include: { product: { include: { category: true } } } }, user: { select: { id: true, name: true } } } as const;
type OrderInput = z.infer<typeof orderSchema>;

async function prepareOrder(tx: Prisma.TransactionClient, input: OrderInput) {
  const customer = input.customerId ? await tx.customer.findUnique({ where: { id: input.customerId } }) : input.customer ? await tx.customer.create({ data: input.customer }) : null;
  if (!customer) throw new AppError("Select or enter a customer");
  const products = await tx.product.findMany({ where: { id: { in: input.items.map(i => i.productId) }, status: "ACTIVE" } });
  if (products.length !== input.items.length) throw new AppError("Products must be unique and active");
  const settings = await tx.storeSettings.findUnique({ where: { id: "default" } });
  const intraState = (customer.state || settings?.state || "Tamil Nadu").trim().toLowerCase() === (settings?.state || "Tamil Nadu").trim().toLowerCase();
  const lines = input.items.map(item => {
    const product = products.find(p => p.id === item.productId)!;
    return { ...item, unitPrice: item.unitPrice ?? Number(product.sellingPrice), gstPercentage: item.gstPercentage ?? Number(product.gstPercentage) };
  });
  return { customer, ...calculateOrderTotals(lines, input.discount, intraState) };
}

async function fulfillOrder(tx: Prisma.TransactionClient, orderId: string, userId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  if (order.stockDeducted || !fulfillmentStatuses.includes(order.status)) return;
  for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await changeStock(tx, { productId: item.productId, type: "SALE", quantity: item.quantity, userId, reference: order.orderNumber, notes: "Order fulfillment" });
    await tx.sale.create({ data: { productId: item.productId, orderId, quantity: item.quantity, sellingPrice: item.unitPrice, gstPercentage: item.gstPercentage, taxableAmount: item.taxableAmount, taxAmount: item.taxAmount, revenue: item.total } });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockDeducted: true } });
}

export async function createOrder(raw: unknown, userId: string) {
  const input = orderSchema.parse(raw);
  if (input.status === "CANCELLED") throw new AppError("New orders cannot start cancelled");
  return transaction(async tx => {
    const { customer, items, ...totals } = await prepareOrder(tx, input);
    const order = await tx.order.create({ data: { ...totals, customerId: customer.id, userId, orderNumber: `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`, status: input.status, paymentMethod: input.paymentMethod, paymentStatus: input.paymentStatus, notes: input.notes, items: { create: items } } });
    await fulfillOrder(tx, order.id, userId);
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}

export async function updateOrder(id: string, raw: unknown, userId: string) {
  const patch = orderSchema.partial().parse(raw);
  return transaction(async tx => {
    const existing = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    if (existing.isBill) throw new AppError("Completed bills cannot be edited or cancelled", 409);
    const nextStatus = patch.status ?? existing.status;
    validateOrderTransition(existing.status, nextStatus);
    if (existing.status === "CANCELLED" && Object.keys(patch).some(k => k !== "status")) throw new AppError("Cancelled orders cannot be edited", 409);
    const contentChanged = patch.items !== undefined || patch.customer !== undefined || patch.customerId !== undefined || patch.discount !== undefined;
    if (contentChanged && (existing.status !== "PENDING" || existing.stockDeducted)) throw new AppError("Only pending orders can have their items or customer edited", 409);
    if (contentChanged) {
      const merged = orderSchema.parse({ ...existing, ...patch, customerId: patch.customer ? undefined : patch.customerId ?? existing.customerId, items: patch.items ?? existing.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: Number(i.unitPrice), gstPercentage: Number(i.gstPercentage) })), discount: patch.discount ?? Number(existing.discount) });
      const { customer, items, ...totals } = await prepareOrder(tx, merged);
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.order.update({ where: { id }, data: { ...totals, customerId: customer.id, items: { create: items } } });
    }
    await tx.order.update({ where: { id }, data: { status: nextStatus, paymentMethod: patch.paymentMethod, paymentStatus: patch.paymentStatus, notes: patch.notes } });
    if (nextStatus === "CANCELLED" && existing.stockDeducted) {
      for (const item of [...existing.items].sort((a, b) => a.productId.localeCompare(b.productId))) await changeStock(tx, { productId: item.productId, type: "RETURN", quantity: item.quantity, userId, reference: existing.orderNumber, notes: "Order cancellation reversal" });
      await tx.sale.updateMany({ where: { orderId: id, voidedAt: null }, data: { voidedAt: new Date() } });
      await tx.order.update({ where: { id }, data: { stockDeducted: false, paymentStatus: existing.paymentStatus === "PAID" || existing.paymentStatus === "PARTIALLY_PAID" ? "REFUNDED" : patch.paymentStatus } });
    } else await fulfillOrder(tx, id, userId);
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
}
