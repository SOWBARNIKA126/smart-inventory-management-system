import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, publicUserSelect, requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { hasPermission, type Permission } from "@/lib/permissions";
import { categorySchema, dateRange, movementSchema, pagination, productSchema, settingsSchema, supplierSchema, userSchema } from "@/lib/validation";
import { dashboard, getForecast, getForecastBatch, inventoryStatusIds, productFilters, productInclude, productSales, salesAnalytics, stockStatus } from "@/services/analytics";
import { changeStock, refreshProductAlert, transaction } from "@/services/inventory";
import { createOrder, orderInclude, updateOrder } from "@/services/orders";
import {getEventPlanning} from '@/services/event-planning';

const list = <T>(items: T[], total: number, p: ReturnType<typeof pagination>) => ({ items, total, page: p.page, pageSize: p.pageSize });
const query = (p: URLSearchParams) => (p.get("q") || p.get("search") || "").trim();
const readPermissions: Record<string, Permission> = { products: "catalog:read", categories: "catalog:read", suppliers: "suppliers", inventory: "inventory:read", movements: "inventory:read", orders: "orders", sales: "sales", alerts: "alerts", forecasting: "forecasting", reports: "reports", users: "users", settings: "settings", dashboard: "dashboard" };
const writePermissions: Record<string, Permission> = { products: "catalog:write", categories: "catalog:write", suppliers: "suppliers", inventory: "inventory:write", orders: "orders", alerts: "alerts", forecasting: "forecasting", users: "users", settings: "settings" };
export async function resourceUser(resource: string, write = false) {
  if (resource === "settings" && !write) return requireUser();
  const permission = (write ? writePermissions : readPermissions)[resource];
  if (!permission) throw new AppError("Endpoint not found", 404);
  return requireUser(permission);
}

export async function listResource(resource: string, params: URLSearchParams): Promise<unknown> {
  const user = await resourceUser(resource);
  const p = pagination(params); const q = query(params); const pageArgs = { skip: p.skip, take: p.take };
  switch (resource) {
    case "products": {
      const where = productFilters(params);
      const requested = params.get("sortBy") || "createdAt";
      const sortBy = ["name", "sku", "sellingPrice", "costPrice", "createdAt", "updatedAt"].includes(requested) ? requested : "createdAt";
      const orderBy = { [sortBy]: params.get("sortOrder") === "asc" || params.get("sort") === "asc" ? "asc" : "desc" } as Prisma.ProductOrderByWithRelationInput;
      const [items, total] = await Promise.all([db.product.findMany({ where, include: productInclude, orderBy, ...pageArgs }), db.product.count({ where })]);
      return list(items, total, p);
    }
    case "categories": {
      const where = { name: { contains: q, mode: "insensitive" as const } };
      const [items, total] = await Promise.all([db.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" }, ...pageArgs }), db.category.count({ where })]);
      return list(items, total, p);
    }
    case "suppliers": {
      const where: Prisma.SupplierWhereInput = { OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { contactPerson: { contains: q, mode: "insensitive" } }], ...(["ACTIVE", "INACTIVE"].includes(params.get("status") || "") ? { status: params.get("status") as "ACTIVE" | "INACTIVE" } : {}) };
      const [items, total] = await Promise.all([db.supplier.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" }, ...pageArgs }), db.supplier.count({ where })]);
      return list(items, total, p);
    }
    case "inventory": {
      const ids = await inventoryStatusIds(params.get("stockStatus") || params.get("status"));
      const where: Prisma.InventoryWhereInput = { product: productFilters(params), ...(ids ? { productId: { in: ids } } : {}) };
      const [items, total] = await Promise.all([db.inventory.findMany({ where, include: { product: { include: { category: true, supplier: true } } }, orderBy: { updatedAt: "desc" }, ...pageArgs }), db.inventory.count({ where })]);
      return list(items.map(i => ({ ...i, availableStock: i.currentStock - i.reservedStock, stockStatus: stockStatus(i.currentStock, i.product.reorderPoint, i.product.reorderQuantity), inventoryValue: i.currentStock * Number(i.product.costPrice) })), total, p);
    }
    case "movements": {
      const type = params.get("type");
      const where: Prisma.StockMovementWhereInput = { product: productFilters(params), createdAt: dateRange(params), ...(["PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "DAMAGED", "TRANSFER"].includes(type || "") ? { type: type as Prisma.EnumMovementTypeFilter } : {}) };
      const [items, total] = await Promise.all([db.stockMovement.findMany({ where, include: { product: { include: { category: true } }, user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs }), db.stockMovement.count({ where })]);
      return list(items, total, p);
    }
    case "orders": {
      const status = params.get("status");
      const where: Prisma.OrderWhereInput = { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }], createdAt: dateRange(params), ...(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"].includes(status || "") ? { status: status as Prisma.EnumOrderStatusFilter } : {}) };
      const [items, total] = await Promise.all([db.order.findMany({ where, include: orderInclude, orderBy: { createdAt: "desc" }, ...pageArgs }), db.order.count({ where })]);
      return list(items, total, p);
    }
    case "sales": {
      const where: Prisma.SaleWhereInput = { voidedAt: null, date: dateRange(params), product: productFilters(params) };
      const [items, total, summary] = await Promise.all([db.sale.findMany({ where, include: { product: { include: { category: true } }, order: { select: { id: true, orderNumber: true } } }, orderBy: { date: "desc" }, ...pageArgs }), db.sale.count({ where }), salesAnalytics(params)]);
      return { ...list(items, total, p), summary };
    }
    case "alerts": {
      const status = params.get("status"); const severity = params.get("severity");
      const where: Prisma.AlertWhereInput = { product: productFilters(params), ...(["ACTIVE", "ACKNOWLEDGED", "RESOLVED"].includes(status || "") ? { status: status as Prisma.EnumAlertStatusFilter } : {}), ...(["INFO", "WARNING", "CRITICAL"].includes(severity || "") ? { severity: severity as Prisma.EnumAlertSeverityFilter } : {}) };
      const [items, total, activeCount] = await Promise.all([db.alert.findMany({ where, include: { product: { include: productInclude } }, orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }], ...pageArgs }), db.alert.count({ where }), db.alert.count({ where: { status: "ACTIVE" } })]);
      return { ...list(items, total, p), activeCount };
    }
    case "users": {
      const where = { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] };
      const [items, total] = await Promise.all([db.user.findMany({ where, select: publicUserSelect, orderBy: { createdAt: "asc" }, ...pageArgs }), db.user.count({ where })]);
      return list(items, total, p);
    }
    case "settings": return db.storeSettings.findUniqueOrThrow({ where: { id: "default" } });
    case "dashboard": return dashboard([7, 30, 90, 365].includes(Number(params.get("days"))) ? Number(params.get("days")) : 30, user.role !== 'STAFF');
    case "forecasting": {
      if (params.get('view') === 'events') return getEventPlanning(params);
      const days = [7, 30, 90].includes(Number(params.get("days"))) ? Number(params.get("days")) as 7 | 30 | 90 : 30;
      if (params.get("productId")) return getForecast(params.get("productId")!, days);
      const where = { ...productFilters(params), status: "ACTIVE" as const };
      const [products, total] = await Promise.all([db.product.findMany({ where, orderBy: { name: "asc" }, ...pageArgs }), db.product.count({ where })]);
      const items = (await getForecastBatch(products.map(p=>p.id),days)).map(forecast=>({product:forecast.product,forecast}));
      return list(items, total, p);
    }
    case "reports": return report(params);
    default: throw new AppError("Endpoint not found", 404);
  }
}

export async function getResource(resource: string, id: string, params: URLSearchParams) {
  await resourceUser(resource);
  switch (resource) {
    case "products": {
      const product = await db.product.findUniqueOrThrow({ where: { id }, include: productInclude });
      const days = Math.min(730, Math.max(1, Number(params.get("days")) || 90));
      return { ...product, ...(await productSales(id, days)), inventoryValue: Number(product.costPrice) * (product.inventory?.currentStock || 0) };
    }
    case "suppliers": {
      const supplier = await db.supplier.findUniqueOrThrow({ where: { id }, include: { products: { include: productInclude } } });
      const purchaseHistory = await db.stockMovement.findMany({ where: { product: { supplierId: id }, type: "PURCHASE" }, include: { product: true, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
      return { ...supplier, purchaseHistory, inventoryValue: supplier.products.reduce((sum, p) => sum + Number(p.costPrice) * (p.inventory?.currentStock || 0), 0) };
    }
    case "orders": return db.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    case "users": return db.user.findUniqueOrThrow({ where: { id }, select: publicUserSelect });
    case "categories": return db.category.findUniqueOrThrow({ where: { id } });
    case "inventory": return db.inventory.findUniqueOrThrow({ where: { productId: id }, include: { product: { include: productInclude } } });
    case "forecasting": return getForecast(id, [7, 30, 90].includes(Number(params.get("days"))) ? Number(params.get("days")) as 7 | 30 | 90 : 30);
    default: throw new AppError("Endpoint not found", 404);
  }
}

export async function createResource(resource: string, raw: unknown) {
  const user = await resourceUser(resource, true);
  switch (resource) {
    case "products": {
      const { initialStock = 0, ...data } = productSchema.parse(raw);
      return transaction(async tx => {
        const product = await tx.product.create({ data: { ...data, barcode: data.barcode || null, inventory: { create: {} } } });
        if (initialStock) await changeStock(tx, { productId: product.id, type: "PURCHASE", quantity: initialStock, userId: user.id, notes: "Opening stock", reference: "OPENING" });
        else await refreshProductAlert(tx, product.id);
        return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
      });
    }
    case "categories": return db.category.create({ data: categorySchema.parse(raw) });
    case "suppliers": return db.supplier.create({ data: supplierSchema.parse(raw) });
    case "inventory": {
      const data = movementSchema.parse(raw);
      if (["ADJUSTMENT", "DAMAGED", "TRANSFER"].includes(data.type) && !hasPermission(user.role, "inventory:adjust")) throw new AppError("Only managers and administrators can adjust, damage, or transfer stock", 403);
      return transaction(async tx => {
        const movement = await changeStock(tx, { ...data, userId: user.id });
        if (data.type === "SALE") {
          const product = await tx.product.findUniqueOrThrow({ where: { id: data.productId } });
          const taxableAmount = product.sellingPrice.mul(data.quantity);
          const taxAmount = taxableAmount.mul(product.gstPercentage).div(100).toDecimalPlaces(2);
          await tx.sale.create({ data: { productId: product.id, quantity: data.quantity, sellingPrice: product.sellingPrice, gstPercentage: product.gstPercentage, taxableAmount, taxAmount, revenue: taxableAmount.add(taxAmount) } });
        }
        return movement;
      });
    }
    case "orders": return createOrder(raw, user.id);
    case "users": {
      const { password, ...data } = userSchema.parse(raw);
      return db.user.create({ data: { ...data, passwordHash: await hashPassword(password) }, select: publicUserSelect });
    }
    case "settings": return updateResource("settings", "default", raw);
    case "forecasting": {
      const input = z.object({ productId: z.string().min(1), days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }).parse(raw);
      return getForecast(input.productId, input.days);
    }
    default: throw new AppError("This resource cannot be created directly", 405);
  }
}

async function protectLastAdmin(tx: Prisma.TransactionClient, id: string, role?: Role, isActive?: boolean) {
  const existing = await tx.user.findUniqueOrThrow({ where: { id } });
  if (existing.role === "ADMIN" && existing.isActive && (role && role !== "ADMIN" || isActive === false)) {
    const count = await tx.user.count({ where: { role: "ADMIN", isActive: true } });
    if (count <= 1) throw new AppError("At least one active administrator is required", 409);
  }
}

export async function updateResource(resource: string, id: string, raw: unknown) {
  const user = await resourceUser(resource, true);
  switch (resource) {
    case "products": {
      const data = productSchema.omit({ initialStock: true }).partial().parse(raw);
      return transaction(async tx => {
        const product = await tx.product.update({ where: { id }, data: { ...data, ...(data.barcode !== undefined ? { barcode: data.barcode || null } : {}) }, include: productInclude });
        await refreshProductAlert(tx, id); return product;
      });
    }
    case "categories": return db.category.update({ where: { id }, data: categorySchema.partial().parse(raw) });
    case "suppliers": return db.supplier.update({ where: { id }, data: supplierSchema.partial().parse(raw) });
    case "orders": return updateOrder(id, raw, user.id);
    case "alerts": return db.alert.update({ where: { id }, data: z.object({ status: z.enum(["ACKNOWLEDGED", "RESOLVED", "ACTIVE"]) }).parse(raw), include: { product: true } });
    case "users": {
      const { password, ...data } = userSchema.partial().parse(raw);
      const passwordHash = password ? await hashPassword(password) : undefined;
      return transaction(async tx => {
        await protectLastAdmin(tx, id, data.role, data.isActive);
        const updated = await tx.user.update({ where: { id }, data: { ...data, passwordHash }, select: publicUserSelect });
        if (data.isActive === false || passwordHash || data.role) await tx.session.deleteMany({ where: { userId: id } });
        return updated;
      });
    }
    case "settings": return db.storeSettings.update({ where: { id: "default" }, data: settingsSchema.partial().parse(raw) });
    default: throw new AppError("This resource cannot be edited directly", 405);
  }
}

export async function deleteResource(resource: string, id: string) {
  await resourceUser(resource, true);
  switch (resource) {
    case "products": return updateResource(resource, id, { status: "DISCONTINUED" });
    case "suppliers": return updateResource(resource, id, { status: "INACTIVE" });
    case "users": return updateResource(resource, id, { isActive: false });
    case "orders": return updateResource(resource, id, { status: "CANCELLED" });
    case "categories": await db.category.delete({ where: { id } }); return { success: true };
    default: throw new AppError("This resource cannot be deleted", 405);
  }
}

async function report(params: URLSearchParams) {
  const type = params.get("type") || "inventory";
  const p = pagination(params); const where = productFilters(params);
  if (["sales", "movements"].includes(type)) return listResource(type, params);
  if (["best-selling", "slow-moving"].includes(type)) {
    const summary = await salesAnalytics(params);
    const rows = type === "best-selling" ? summary.topProducts : summary.slowMovingProducts;
    return { ...list(rows.slice(p.skip, p.skip + p.take), rows.length, p), summary };
  }
  if (["forecasting", "reorder"].includes(type)) {
    const [products, total] = await Promise.all([db.product.findMany({ where: { ...where, status: "ACTIVE" }, orderBy: { name: "asc" }, skip: p.skip, take: p.take }), db.product.count({ where: { ...where, status: "ACTIVE" } })]);
    const forecastRows = await getForecastBatch(products.map(p=>p.id),30);
    const items = forecastRows.map(f => {
      const product = f.product;
      return { product: product.name, sku: product.sku, currentStock: f.currentStock, expectedDemand: f.expectedDemand, averageDailyDemand: f.averageDailyDemand, safetyStock: f.safetyStock, recommendedReorder: f.recommendedReorder, status: f.status, confidence: f.confidence, daysUntilStockout: f.daysUntilStockout };
    });
    return { ...list(items, total, p), summary: { periodDays: 30 } };
  }
  if (!["inventory", "low-stock", "out-of-stock"].includes(type)) throw new AppError("Unknown report type");
  const ids = type === "low-stock" ? await inventoryStatusIds("LOW_STOCK") : type === "out-of-stock" ? await inventoryStatusIds("OUT_OF_STOCK") : undefined;
  const filter = { ...where, ...(ids ? { id: { in: ids } } : {}) };
  const [products, total] = await Promise.all([db.product.findMany({ where: filter, include: productInclude, orderBy: { name: "asc" }, skip: p.skip, take: p.take }), db.product.count({ where: filter })]);
  const items = products.map(product => ({ product: product.name, sku: product.sku, category: product.category.name, supplier: product.supplier.name, currentStock: product.inventory?.currentStock || 0, reservedStock: product.inventory?.reservedStock || 0, costPrice: Number(product.costPrice), inventoryValue: Number(product.costPrice) * (product.inventory?.currentStock || 0), reorderPoint: product.reorderPoint, stockStatus: stockStatus(product.inventory?.currentStock || 0, product.reorderPoint, product.reorderQuantity) }));
  return { ...list(items, total, p), summary: { pageInventoryValue: items.reduce((sum, i) => sum + i.inventoryValue, 0) } };
}

export async function exportReport(params: URLSearchParams) {
  await resourceUser("reports");
  const all: Record<string, unknown>[] = [];
  for (let page = 1; ; page++) {
    const next = new URLSearchParams(params); next.set("page", String(page)); next.set("pageSize", "100");
    const result = await report(next);
    const resultList = result as { items: Record<string, unknown>[]; total: number };
    all.push(...resultList.items);
    if (all.length >= resultList.total || resultList.items.length === 0 || all.length >= 50000) break;
  }
  const rows = all.map(row => Object.fromEntries(Object.entries(row).flatMap(([key, value]) => {
    if (value instanceof Prisma.Decimal) return [[key, value.toNumber()]];
    if (value instanceof Date) return [[key, value.toISOString()]];
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      return [[key, obj.name || obj.orderNumber || ""]];
    }
    return [[key, value]];
  })));
  const columns = rows.length ? Object.keys(rows[0]) : ["No matching records"];
  const escape = (value: unknown) => {
    let s = String(value ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [columns.map(escape).join(","), ...rows.map(row => columns.map(c => escape(row[c])).join(","))].join("\r\n");
}

