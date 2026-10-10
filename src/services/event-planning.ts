import {db} from '@/lib/db';
import {AppError} from '@/lib/errors';
import {upcomingEvents} from './event-calendar';
import {forecastEvent, type EventPlan, type EventProduct} from './event-demand';

const DAY = 86400000;
const businessDate = (date: Date) => new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);

export async function getEventPlanning(params: URLSearchParams) {
  const horizonDays = Number(params.get('horizon') || 180);
  if (![180, 365].includes(horizonDays)) throw new AppError('Planning horizon must be 180 or 365 days');
  const now = new Date();
  const asOf = businessDate(now);
  const events = upcomingEvents(asOf, horizonDays);
  const eventId = params.get('eventId');
  const event = eventId ? events.find(item => item.id === eventId) : events[0];
  if (eventId && !event) throw new AppError('This event is outside the selected planning period', 404);
  const settings = await db.storeSettings.findUniqueOrThrow({where: {id: 'default'}});
  const base = {events, asOf, horizonDays, generatedAt: now.toISOString(), region: `${settings.city}, ${settings.state}`};
  if (!event) return {...base, selected: null};
  const today = new Date(`${asOf}T00:00:00+05:30`);
  // Full prior-event coverage plus a pre-event baseline and last-year trend window.
  const rangeStart = new Date(Math.min(Date.parse(`${event.previousStartDate}T00:00:00+05:30`) - 28 * DAY, today.getTime() - 400 * DAY));
  const products = await db.product.findMany({where: {status: 'ACTIVE'}, include: {category: true, supplier: true, inventory: true}, orderBy: {name: 'asc'}});
  const ids = products.map(product => product.id);
  const [history, firstSales] = await Promise.all([
    db.sale.findMany({where: {productId: {in: ids}, voidedAt: null, date: {gte: rangeStart, lt: today}}, select: {productId: true, date: true, quantity: true}}),
    db.sale.groupBy({by: ['productId'], where: {productId: {in: ids}, voidedAt: null, date: {lt: today}}, _min: {date: true}}),
  ]);
  const firstByProduct = new Map(firstSales.map(sale => [sale.productId, sale._min.date]));
  const input: EventProduct[] = products.map(product => {
    const firstSale = firstByProduct.get(product.id);
    // Imported historic sales can predate creation of the product record.
    const observedSince = firstSale && firstSale < product.createdAt ? firstSale : product.createdAt;
    return {id: product.id, name: product.name, sku: product.sku, unit: product.unit, categoryName: product.category.name,
      supplierName: product.supplier.name, leadTimeDays: product.supplier.leadTimeDays,
      currentStock: product.inventory?.currentStock || 0, reservedStock: product.inventory?.reservedStock || 0,
      historyStart: businessDate(observedSince)};
  });
  return {...base, selected: forecastEvent(event, input, history.map(sale => ({...sale, date: businessDate(sale.date)})), {asOf, safetyStockDays: settings.safetyStockDays})};
}

export function eventPlanCsv(plan: EventPlan) {
  const columns = ['Event','Planning start','Planning end','Previous start','Previous end','Product','SKU','Unit','Last year units','Expected units','Available stock','Projected stock at start','Safety stock','Reorder quantity','Order by','Supplier'];
  const escape = (value: unknown) => {let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`;};
  const rows = plan.products.map(product => [plan.event.name,plan.event.startDate,plan.event.endDate,plan.event.previousStartDate,plan.event.previousEndDate,product.name,product.sku,product.unit,product.previousUnits,product.expectedDemand,product.availableStock,Math.floor(product.projectedStockAtStart),product.safetyStock,product.recommendedReorder,product.orderByDate,product.supplierName]);
  return '\uFEFF' + [columns,...rows].map(row => row.map(escape).join(',')).join('\r\n');
}
