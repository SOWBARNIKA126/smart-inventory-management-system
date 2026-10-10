import { Prisma, type MovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { resultingStock, stockDelta } from "@/services/business";

export async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

export async function refreshProductAlert(tx: Prisma.TransactionClient, productId: string) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, include: { inventory: true } });
  const stock = product.inventory?.currentStock ?? 0;
  const existing = await tx.alert.findMany({ where: { productId, status: { in: ["ACTIVE", "ACKNOWLEDGED"] } }, orderBy: { createdAt: "desc" } });
  if (stock > product.reorderPoint * 1.2 || product.status !== "ACTIVE") {
    await tx.alert.updateMany({ where: { productId, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", currentStock: stock } });
    return;
  }
  const severity = stock === 0 ? "CRITICAL" : stock <= product.reorderPoint ? "WARNING" : "INFO";
  const data = { currentStock: stock, reorderPoint: product.reorderPoint, severity, message: stock === 0 ? `${product.name} is out of stock` : stock <= product.reorderPoint ? `${product.name} is at or below its reorder point` : `${product.name} is approaching its reorder point` } as const;
  if (existing[0]) {
    await tx.alert.update({ where: { id: existing[0].id }, data: { ...data, status: existing[0].severity === severity ? existing[0].status : "ACTIVE" } });
    if (existing.length > 1) await tx.alert.updateMany({ where: { id: { in: existing.slice(1).map(a => a.id) } }, data: { status: "RESOLVED" } });
  } else await tx.alert.create({ data: { productId, ...data } });
}

export async function changeStock(tx: Prisma.TransactionClient, input: { productId: string; type: MovementType; quantity: number; userId?: string; notes?: string; reference?: string }) {
  const inventory = await tx.inventory.findUnique({ where: { productId: input.productId } });
  if (!inventory) throw new AppError("Inventory record not found", 404);
  const delta = stockDelta(input.type, input.quantity);
  const newStock = resultingStock(inventory.currentStock, inventory.reservedStock, delta);
  const changed = await tx.inventory.updateMany({ where: { id: inventory.id, currentStock: inventory.currentStock, reservedStock: inventory.reservedStock }, data: { currentStock: newStock } });
  if (changed.count !== 1) throw new AppError("Inventory changed concurrently. Please retry.", 409);
  const movement = await tx.stockMovement.create({ data: { ...input, quantity: delta, previousStock: inventory.currentStock, newStock } });
  await refreshProductAlert(tx, input.productId);
  return movement;
}

