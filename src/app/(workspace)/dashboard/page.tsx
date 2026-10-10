'use client';
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Boxes, CalendarDays, Clock, Download, Package, PackageX, Plus, ShoppingBag, Sparkles, TriangleAlert, Wallet } from 'lucide-react';
import { useSession } from '@/components/session-provider';
import { useResource } from '@/hooks/use-resource';
import { PageHeading, Metric, Panel, Status, Loading, ErrorState, Empty, Growth } from '@/components/shared';
import { RevenueChart, CategoryChart } from '@/components/charts';
import { Button } from '@/components/ui/button';
import type { ForecastResult } from '@/services/forecasting';
type Product = {
    id: string;
    name: string;
    sku: string;
    reorderPoint: number;
    reorderQuantity: number;
    recommendedReorder: number;
    inventory: {
        currentStock: number;
    };
    category: {
        name: string;
    };
};
type Dashboard = {
    kpis: {
        totalProducts: number;
        totalStockUnits: number;
        inventoryValue: number;
        todaySales: number;
        monthlyRevenue: number;
        monthlyRevenueChange: number | null;
        lowStockProducts: number;
        outOfStockProducts: number;
        pendingOrders: number;
    };
    salesOverview: {
        date: string;
        revenue: number;
    }[];
    inventoryByCategory: {
        name: string;
        value: number;
        units: number;
        color: string;
    }[];
    topProducts: {
        id: string;
        name: string;
        sku: string;
        units: number;
        revenue: number;
    }[];
    lowStockProducts: Product[];
    recentOrders: {
        id: string;
        orderNumber: string;
        customer: {
            name: string;
        };
        createdAt: string;
        total: number;
        status: string;
    }[];
    forecastPreview: {
        product: Product;
        forecast: ForecastResult;
    }[];
};
export default function Dashboard() {
    const { t, currency, number, date } = useI18n();
    const [days, setDays] = useState(30);
    const { user, store } = useSession();
    const { data, loading, error, refresh } = useResource<Dashboard>(`dashboard?days=${days}`);
    const money = (n: number) => currency(n, store.currency);
    return <><PageHeading title={t(new Date().getHours() < 12 ? 'Good morning, {0} 👋' : new Date().getHours() < 17 ? 'Good afternoon, {0} 👋' : 'Good evening, {0} 👋', [user?.name.split(' ')[0] || ''])} description={t("Here’s what’s happening at your store today.")}><Button asChild variant="secondary"><Link href="/orders/new"><Plus size={16}/>{t("New order")}</Link></Button>{user?.role !== 'STAFF' && <Button asChild><Link href="/reports"><Download size={15}/>{t("Export report")}</Link></Button>}</PageHeading>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : data && <><div className="metrics-grid"><Metric label={t("Monthly revenue")} value={money(data.kpis.monthlyRevenue)} icon={Wallet} tone="green" hint={<><span>{t("Month to date")}</span><Growth value={data.kpis.monthlyRevenueChange}/><span>{t("vs. previous full month")}</span></>}/><Metric label={t("Inventory value")} value={money(data.kpis.inventoryValue)} icon={Boxes} tone="blue" hint={t("Based on current stock at cost price")}/><Metric label={t("Total products")} value={number(data.kpis.totalProducts)} icon={Package} tone="purple" hint={t("{0} units across your store", [number(data.kpis.totalStockUnits)])}/><Metric label={t("Today’s sales")} value={money(data.kpis.todaySales)} icon={ShoppingBag} tone="amber" hint={t("Sales recorded today · IST")}/></div><div className="secondary-metrics"><div className="secondary-metric"><Boxes size={19}/><div><strong>{number(data.kpis.totalStockUnits)}</strong><span>{t("Total stock units")}</span></div></div><div className="secondary-metric"><TriangleAlert size={19}/><div><strong>{number(data.kpis.lowStockProducts)}</strong><span>{t("Low stock products")}</span></div></div><div className="secondary-metric"><PackageX size={19}/><div><strong>{number(data.kpis.outOfStockProducts)}</strong><span>{t("Out of stock")}</span></div></div><div className="secondary-metric"><Clock size={19}/><div><strong>{number(data.kpis.pendingOrders)}</strong><span>{t("Pending orders")}</span></div></div></div><div className="section-grid"><Panel title={t("Sales overview")} description={t("A closer look at your store’s revenue")} action={<div className="tab-group" role="group" aria-label={t("Sales range")}>{[7, 30, 90, 365].map(x => <button aria-pressed={days === x} onClick={() => setDays(x)} className={days === x ? 'selected' : ''} key={x}>{x === 365 ? t('1 year') : t("{0} days", [x])}</button>)}</div>}><div className="chart-container">{data.salesOverview.length ? <RevenueChart data={data.salesOverview}/> : <Empty message={t("Your sales will appear here.")}/>}</div><div className="chart-legend"><span><i className="legend-line"/>{t("Revenue (")}{store.currency})</span></div></Panel><Panel title={t("Inventory by category")} description={t("Stock distribution across your store")}><CategoryChart data={data.inventoryByCategory.map(x => ({ ...x, value: x.units }))}/></Panel></div>{user?.role !== 'STAFF' && <div className="forecast-banner"><div className="forecast-banner-text"><div className="feature-icon"><Sparkles size={22}/></div><div><h2>{t("Make room for what sells next.")}</h2><p>{t("Your sales history holds the clues. Explore seasonal demand and plan your next reorder.")}</p></div></div><Link href="/forecasting">{t("View demand forecast ")}<ArrowRight size={16}/></Link></div>}<div className="section-grid"><Panel title={t("Low stock watchlist")} description={t("A few products could use your attention")} action={<Link href="/inventory?status=LOW_STOCK">{t("View inventory ")}<ArrowUpRight size={14}/></Link>}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("PRODUCT")}</th><th>{t("IN STOCK")}</th><th>{t("REORDER AT")}</th><th>{t("ORDER QTY")}</th><th>{t("STATUS")}</th></tr></thead><tbody>{data.lowStockProducts.slice(0, 5).map(p => <tr key={p.id}><td><Link href={`/products/${p.id}`} className="product-cell"><span className="product-glyph"><Package size={16}/></span><div><strong>{p.name}</strong><small>{p.sku}</small></div></Link></td><td>{number(p.inventory?.currentStock)}</td><td>{number(p.reorderPoint)}</td><td>{number(p.recommendedReorder)}</td><td><Status value={p.inventory?.currentStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'}/></td></tr>)}</tbody></table>{!data.lowStockProducts.length && <Empty message={t("All products are above their reorder points.")}/>}</TableScroll><div className="table-footer"><span>{data.kpis.lowStockProducts}{t(" products at or below reorder point")}</span><Link href="/inventory">{t("Manage stock \u2192")}</Link></div></Panel><Panel title={t("Top selling products")} description={t("Your best performers in the last {0}", [days === 365 ? t('1 year') : t('{0} days', [number(days)])])}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("PRODUCT")}</th><th>{t("UNITS")}</th><th>{t("REVENUE")}</th></tr></thead><tbody>{data.topProducts.slice(0, 5).map((p, i) => <tr key={p.id}><td><Link href={`/products/${p.id}`} className="product-cell"><span className="product-glyph">{i + 1}</span><div><strong>{p.name}</strong><small>{p.sku}</small></div></Link></td><td>{number(p.units)}</td><td>{money(p.revenue)}</td></tr>)}</tbody></table>{!data.topProducts.length && <Empty />}</TableScroll></Panel></div><div className="section-grid"><Panel title={t("Recent orders")} description={t("The latest activity at your store")} action={<Link href="/orders">{t("All orders ")}<ArrowUpRight size={14}/></Link>}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("ORDER")}</th><th>{t("CUSTOMER")}</th><th>{t("AMOUNT")}</th><th>{t("STATUS")}</th></tr></thead><tbody>{data.recentOrders.slice(0, 5).map(o => <tr key={o.id}><td><Link href={`/orders/${o.id}`}><strong>{o.orderNumber}</strong><small>{date(o.createdAt)}</small></Link></td><td>{o.customer.name}</td><td>{money(o.total)}</td><td><Status value={o.status}/></td></tr>)}</tbody></table>{!data.recentOrders.length && <Empty />}</TableScroll></Panel><Panel title={t("Demand forecast")} description={t("Expected units over the next 30 days")} action={<Sparkles size={17} color="#82a591"/>}>{data.forecastPreview?.length ? data.forecastPreview.slice(0, 4).map(({ product, forecast }) => <Link href={`/forecasting?productId=${product.id}`} className="forecast-product" key={product.id}><span className="product-glyph"><Package size={16}/></span><div><strong>{product.name}</strong><p>{t(forecast.confidence.toLowerCase())}{t(" confidence \u00B7 ")}{forecast.historyDays}{t(" days of history")}</p></div><div className="forecast-demand"><strong>{number(forecast.expectedDemand)}</strong><p>{t("units")}</p></div></Link>) : <Empty message={t("Forecasts appear as sales history becomes available.")}/>}<div className="table-footer"><span>{t("Calculated from your sales records")}</span><CalendarDays size={14}/></div></Panel></div></>}</>;
}
