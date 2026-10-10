import {previousIndiaMonthStart, indiaDateKey} from "@/lib/chart-presentation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { dateRange } from "@/lib/validation";
import { forecastDemand } from "@/services/forecasting";

export const productInclude = { category: true, supplier: true, inventory: true } as const;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export function productFilters(params: URLSearchParams): Prisma.ProductWhereInput {
  const q = params.get("q") || params.get("search") || "";
  const status = params.get("status");
  return {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: { contains: q, mode: "insensitive" } }] } : {}),
    ...(params.get("categoryId") ? { categoryId: params.get("categoryId")! } : {}),
    ...(params.get("supplierId") ? { supplierId: params.get("supplierId")! } : {}),
    ...(params.get("productId") ? { id: params.get("productId")! } : {}),
    ...(["ACTIVE", "INACTIVE", "DISCONTINUED"].includes(status || "") ? { status: status as "ACTIVE" | "INACTIVE" | "DISCONTINUED" } : {}),
  };
}

export function stockStatus(currentStock: number, reorderPoint: number, reorderQuantity: number) {
  return currentStock <= 0 ? "OUT_OF_STOCK" : currentStock <= reorderPoint ? "LOW_STOCK" : currentStock > Math.max(reorderPoint * 3, reorderQuantity * 2) ? "OVERSTOCK" : "IN_STOCK";
}

export async function inventoryStatusIds(status: string | null) {
  const normalized = (status || "").toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  const conditions: Record<string, Prisma.Sql> = {
    OUT_OF_STOCK: Prisma.sql`i."currentStock" <= 0`,
    LOW_STOCK: Prisma.sql`i."currentStock" > 0 AND i."currentStock" <= p."reorderPoint"`,
    OVERSTOCK: Prisma.sql`i."currentStock" > GREATEST(p."reorderPoint" * 3, p."reorderQuantity" * 2)`,
    IN_STOCK: Prisma.sql`i."currentStock" > p."reorderPoint" AND i."currentStock" <= GREATEST(p."reorderPoint" * 3, p."reorderQuantity" * 2)`,
  };
  if (!conditions[normalized]) return undefined;
  const rows = await db.$queryRaw<{ productId: string }[]>(Prisma.sql`SELECT i."productId" FROM "Inventory" i JOIN "Product" p ON p.id = i."productId" WHERE ${conditions[normalized]}`);
  return rows.map(r => r.productId);
}

export async function salesAnalytics(params: URLSearchParams) {
  const where: Prisma.SaleWhereInput = { voidedAt: null, date: dateRange(params), product: productFilters(params) };
  const [totals, grouped, dailySales, orderIds] = await Promise.all([
    db.sale.aggregate({ where, _sum: { revenue: true, quantity: true } }),
    db.sale.groupBy({ by: ["productId"], where, _sum: { revenue: true, quantity: true }, orderBy: { _sum: { quantity: "desc" } } }),
    db.sale.findMany({ where, select: { date: true, revenue: true, quantity: true } }),
    db.sale.findMany({ where: { ...where, orderId: { not: null } }, distinct: ["orderId"], select: { orderId: true } }),
  ]);
  const products = await db.product.findMany({ where: productFilters(params), include: { category: true } });
  const productMap = new Map(products.map(p => [p.id, p]));
  const daily = new Map<string, { date: string; revenue: number; units: number }>();
  const monthly = new Map<string, { date: string; revenue: number; units: number }>();
  for (const sale of dailySales) {
    // Reporting follows the store's India time zone, including its midnight boundary.
    const date = new Date(sale.date.getTime() + 330 * 60000).toISOString().slice(0, 10);
    for (const [map, key] of [[daily, date], [monthly, date.slice(0, 7)]] as const) {
      const entry = map.get(key) || { date: key, revenue: 0, units: 0 };
      entry.revenue += Number(sale.revenue); entry.units += sale.quantity; map.set(key, entry);
    }
  }
  const topProducts = grouped.map(g => ({ id: g.productId, name: productMap.get(g.productId)?.name || "Product", sku: productMap.get(g.productId)?.sku, units: g._sum.quantity || 0, revenue: Number(g._sum.revenue || 0) }));
  const categoryMap = new Map<string, { name: string; revenue: number; units: number; color: string }>();
  for (const g of grouped) {
    const category = productMap.get(g.productId)?.category;
    if (!category) continue;
    const entry = categoryMap.get(category.id) || { name: category.name, revenue: 0, units: 0, color: category.color };
    entry.revenue += Number(g._sum.revenue || 0); entry.units += g._sum.quantity || 0; categoryMap.set(category.id, entry);
  }
  const revenue = Number(totals._sum.revenue || 0);
  const actualOrderRevenue = await db.sale.aggregate({ where: { ...where, orderId: { not: null } }, _sum: { revenue: true } });
  return { revenue, unitsSold: totals._sum.quantity || 0, orderCount: orderIds.length, averageOrderValue: orderIds.length ? Number(actualOrderRevenue._sum.revenue || 0) / orderIds.length : 0, dailyRevenue: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), monthlyRevenue: [...monthly.values()].sort((a, b) => a.date.localeCompare(b.date)), topProducts: topProducts.slice(0, 10), slowMovingProducts: products.map(p => topProducts.find(t => t.id === p.id) || { id: p.id, name: p.name, sku: p.sku, units: 0, revenue: 0 }).sort((a, b) => a.units - b.units).slice(0, 10), salesByCategory: [...categoryMap.values()] };
}

export async function getForecast(productId: string, days: 7 | 30 | 90 = 30, persist = true) {
  const forecast = (await getForecastBatch([productId], days))[0];
  if (!forecast) throw new AppError("Product not found", 404);
  const product = forecast.product;
  if (persist) {
    const recent = await db.forecast.findFirst({ where: { productId, periodDays: days, createdAt: { gte: new Date(Date.now() - 6 * 3600000) } } });
    if (!recent) await db.forecast.create({ data: { productId, periodDays: days, algorithm: forecast.method, confidence: forecast.confidence, expectedDemand: forecast.expectedDemand, averageDailyDemand: forecast.averageDailyDemand, peakDemand: forecast.peakDemand, safetyStock: forecast.safetyStock, expectedShortage: forecast.expectedShortage, expectedSurplus: forecast.expectedSurplus, recommendedReorderQuantity: forecast.recommendedReorder, estimatedDaysUntilStockout: forecast.daysUntilStockout, points: { create: forecast.forecast.map(p => ({ date: new Date(p.date), demand: p.quantity, lowerBound: p.lower, upperBound: p.upper })) } } });
    const shortageSoon = forecast.daysUntilStockout !== null && forecast.daysUntilStockout <= product.supplier.leadTimeDays;
    if (shortageSoon && product.status === "ACTIVE") {
      const alert = await db.alert.findFirst({ where: { productId, status: { in: ["ACTIVE", "ACKNOWLEDGED"] } }, orderBy: { createdAt: "desc" } });
      const data = { currentStock: product.inventory?.currentStock || 0, reorderPoint: product.reorderPoint, forecastDemand: forecast.expectedDemand, severity: "CRITICAL" as const, message: `${product.name}: forecast suggests a shortage within supplier lead time` };
      if (alert) await db.alert.update({ where: { id: alert.id }, data: { ...data, status: alert.severity === "CRITICAL" ? alert.status : "ACTIVE" } });
      else await db.alert.create({ data: { ...data, productId } });
    }
  }
  return { ...forecast, product, generatedAt: new Date().toISOString() };
}

/** Load all selected histories together so overview pages do not query per product. */
export async function getForecastBatch(productIds: string[], days: 7 | 30 | 90 = 30) {
  if (!productIds.length) return [];
  const [products, settings] = await Promise.all([db.product.findMany({where:{id:{in:productIds}},include:productInclude}),db.storeSettings.findUnique({where:{id:'default'}})]);
  const businessToday = indiaStart(new Date());
  const cutoff = new Date(businessToday.getTime()-(settings?.historicalDataDays||730)*86400000);
  const history = await db.sale.findMany({where:{productId:{in:productIds},voidedAt:null,date:{gte:cutoff,lte:new Date()}},select:{productId:true,date:true,quantity:true},orderBy:{date:'asc'}});
  const indiaDay = (value:Date)=>new Date(value.getTime()+330*60000).toISOString().slice(0,10);
  const groups=new Map<string,{date:string;quantity:number}[]>();
  const todayByProduct=new Map<string,number>();
  for(const sale of history){
    if(sale.date>=businessToday){todayByProduct.set(sale.productId,(todayByProduct.get(sale.productId)||0)+sale.quantity);continue;}
    const group=groups.get(sale.productId)||[];group.push({date:indiaDay(sale.date),quantity:sale.quantity});groups.set(sale.productId,group);
  }
  // Expose today's live sales without treating an incomplete day as a full
  // training observation. Billing feeds this same Sale source automatically.
  return products.map(product=>({...forecastDemand({history:groups.get(product.id)||[],days,currentStock:product.inventory?.currentStock||0,reservedStock:product.inventory?.reservedStock||0,leadTimeDays:product.supplier.leadTimeDays,safetyStockDays:settings?.safetyStockDays??7,asOf:new Date(indiaDay(new Date(businessToday.getTime()-86400000))),historyStart:new Date(indiaDay(product.createdAt>cutoff?product.createdAt:cutoff))}),product,todaySales:{date:indiaDay(businessToday),quantity:todayByProduct.get(product.id)||0},generatedAt:new Date().toISOString()}));
}

function indiaStart(date: Date, month = false) {
  const shifted = new Date(date.getTime() + 330 * 60000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), month ? 1 : shifted.getUTCDate()) - 330 * 60000);
}

export async function productSales(id: string, days = 90) {
  const now = new Date(); const monthStart = indiaStart(now, true);
  const previousMonth = previousIndiaMonthStart(now);
  const [month, previous, history] = await Promise.all([
    db.sale.aggregate({ where: { productId: id, voidedAt: null, date: { gte: monthStart } }, _sum: { quantity: true, revenue: true } }),
    db.sale.aggregate({ where: { productId: id, voidedAt: null, date: { gte: previousMonth, lt: monthStart } }, _sum: { revenue: true } }),
    db.sale.findMany({ where: { productId: id, voidedAt: null, date: { gte: new Date(now.getTime() - days * 86400000) } }, select: { date: true, quantity: true, revenue: true }, orderBy: { date: "asc" } }),
  ]);
  const daily = new Map<string, { date: string; quantity: number; revenue: number }>();
  for (const s of history) {
    const date = new Date(s.date.getTime() + 330 * 60000).toISOString().slice(0, 10);
    const row = daily.get(date) || { date, quantity: 0, revenue: 0 }; row.quantity += s.quantity; row.revenue += Number(s.revenue); daily.set(date, row);
  }
  const revenue = Number(month._sum.revenue || 0); const previousRevenue = Number(previous._sum.revenue || 0);
  return { salesSummary: { unitsSoldThisMonth: month._sum.quantity || 0, revenueThisMonth: revenue, averageDailySales: (month._sum.quantity || 0) / Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000)), previousMonthRevenue: previousRevenue, previousMonthComparison: previousRevenue ? (revenue - previousRevenue) / previousRevenue * 100 : null }, salesHistory: [...daily.values()] };
}

export async function dashboard(days: number, includeForecast = true) {
  const now = new Date(); const start = indiaStart(now); const monthStart = indiaStart(now, true);
  const previousMonth = previousIndiaMonthStart(now);
  const [products, today, month, previous, pendingOrders, recentOrders, alertCount] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE" }, include: productInclude }),
    db.sale.aggregate({ where: { voidedAt: null, date: { gte: start } }, _sum: { revenue: true } }),
    db.sale.aggregate({ where: { voidedAt: null, date: { gte: monthStart } }, _sum: { revenue: true } }),
    db.sale.aggregate({ where: { voidedAt: null, date: { gte: previousMonth, lt: monthStart } }, _sum: { revenue: true } }),
    db.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "PROCESSING"] } } }),
    db.order.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { customer: true, items: { include: { product: true } } } }),
    db.alert.count({ where: { status: "ACTIVE" } }),
  ]);
  const params = new URLSearchParams({ dateFrom: indiaDateKey(new Date(start.getTime() - (days - 1) * 86400000)) });
  const analytics = await salesAnalytics(params);
  const categoryMap = new Map<string, { name: string; value: number; units: number; color: string }>();
  for (const p of products) {
    const row = categoryMap.get(p.categoryId) || { name: p.category.name, value: 0, units: 0, color: p.category.color };
    row.units += p.inventory?.currentStock || 0; row.value += (p.inventory?.currentStock || 0) * Number(p.costPrice); categoryMap.set(p.categoryId, row);
  }
  const monthlyRevenue = Number(month._sum.revenue || 0); const prev = Number(previous._sum.revenue || 0);
  const low = products.filter(p => (p.inventory?.currentStock || 0) <= p.reorderPoint).sort((a, b) => (a.inventory?.currentStock || 0) - (b.inventory?.currentStock || 0));
  const previewIds = includeForecast ? analytics.topProducts.slice(0, 3).map(p => p.id) : [];
  const forecasts = includeForecast ? await getForecastBatch([...new Set([...previewIds,...low.slice(0,8).map(p=>p.id)])],30) : [];
  const forecastPreview = previewIds.map(id=>forecasts.find(f=>f.product.id===id)).filter((f):f is NonNullable<typeof f>=>!!f).map(forecast=>({product:forecast.product,forecast}));
  const salesByDate = new Map(analytics.dailyRevenue.map(row => [row.date, row]));
  const salesOverview = Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + 330 * 60000 - (days - 1 - index) * 86400000).toISOString().slice(0, 10);
    return salesByDate.get(date) || { date, revenue: 0, units: 0 };
  });
  return { kpis: { totalProducts: products.length, totalStockUnits: sum(products.map(p => p.inventory?.currentStock || 0)), inventoryValue: sum(products.map(p => Number(p.costPrice) * (p.inventory?.currentStock || 0))), todaySales: Number(today._sum.revenue || 0), monthlyRevenue, monthlyRevenueChange: prev ? (monthlyRevenue - prev) / prev * 100 : null, lowStockProducts: low.length, outOfStockProducts: low.filter(p => !p.inventory?.currentStock).length, pendingOrders }, salesOverview, inventoryByCategory: [...categoryMap.values()], topProducts: analytics.topProducts, lowStockProducts: low.slice(0, 8).map(p=>({...p,recommendedReorder:forecasts.find(f=>f.product.id===p.id)?.recommendedReorder||0})), recentOrders, forecastPreview, alertCount };
}
