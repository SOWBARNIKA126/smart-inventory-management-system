'use client';
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import { useState } from 'react';
import {indiaDateKey} from '@/lib/chart-presentation';
import Link from 'next/link';
import { Download, ShoppingBag, Wallet, Boxes, Receipt } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useSession } from '@/components/session-provider';
import { PageHeading, Metric, Panel, Loading, ErrorState, Empty } from '@/components/shared';
import { RevenueChart, CategoryChart } from '@/components/charts';
import { Pager } from '@/components/operations/shared';
type Sale = {
    id: string;
    date: string;
    product: {
        id: string;
        name: string;
        sku: string;
    };
    order?: {
        id: string;
        orderNumber: string;
    };
    quantity: number;
    sellingPrice: number;
    gstPercentage: number;
    revenue: number;
};
type Ranking = {
    id: string;
    name: string;
    units: number;
    revenue: number;
};
type Sales = {
    items: Sale[];
    total: number;
    summary: {
        revenue: number;
        unitsSold: number;
        averageOrderValue: number;
        orderCount: number;
        dailyRevenue: {
            date: string;
            revenue: number;
        }[];
        monthlyRevenue: {
            date: string;
            revenue: number;
        }[];
        topProducts: Ranking[];
        slowMovingProducts: Ranking[];
        salesByCategory: {
            name: string;
            revenue: number;
            units: number;
            color: string;
        }[];
    };
};
export default function Sales() {
    const { t, currency, date, number } = useI18n();
    const [page, setPage] = useState(1);
    const [days, setDays] = useState(30);
    const [chart, setChart] = useState('daily');
    const { store } = useSession();
    const money = (v: number) => currency(v, store.currency);
    const from = indiaDateKey(new Date(Date.now() - (days - 1) * 86400000));
    const params = `dateFrom=${from}&page=${page}&pageSize=15`;
    const { data, loading, error, refresh } = useResource<Sales>(`sales?${params}`);
    return <><PageHeading title={t("Sales analytics")} description={t("Follow your revenue, spot your bestsellers, and keep sales moving.")}><select aria-label={t("Sales period")} className="select" value={days} onChange={e => { setDays(Number(e.target.value)); setPage(1); }}>{[7, 30, 90, 365].map(n => <option key={n} value={n}>{n === 365 ? t("Last year") : t("Last {0} days", [number(n)])}</option>)}</select><a className="button button-primary" href={`/api/reports?type=sales&dateFrom=${from}&format=csv`}><Download size={15}/>{t("Export sales")}</a></PageHeading>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : data && <><div className="metrics-grid"><Metric label={t("Revenue incl. tax")} value={money(data.summary.revenue)} icon={Wallet} tone="green" hint={t("Over the last {0} days", [days])}/><Metric label={t("Units sold")} value={number(data.summary.unitsSold)} icon={Boxes} tone="blue" hint={t("Excludes cancelled sales")}/><Metric label={t("Average order value")} value={money(data.summary.averageOrderValue)} icon={Receipt} tone="purple" hint={t("Based on linked customer orders")}/><Metric label={t("Customer orders")} value={number(data.summary.orderCount)} icon={ShoppingBag} tone="amber" hint={t("Orders with sales in this period")}/></div><div className="section-grid"><Panel title={t("Revenue trend")} description={t("Recorded sales over time")} action={<div className="tab-group" role="group" aria-label={t("Revenue trend")}><button aria-pressed={chart === 'daily'} className={chart === 'daily' ? 'selected' : ''} onClick={() => setChart('daily')}>{t("Daily")}</button><button aria-pressed={chart === 'monthly'} className={chart === 'monthly' ? 'selected' : ''} onClick={() => setChart('monthly')}>{t("Monthly")}</button></div>}><div className="chart-container"><RevenueChart period={chart === 'daily' ? 'daily' : 'monthly'} data={chart === 'daily' ? data.summary.dailyRevenue : data.summary.monthlyRevenue.map(x => ({ ...x, date: `${x.date}-01` }))}/></div></Panel><Panel title={t("Sales by category")} description={t("Revenue contribution")}><CategoryChart measurement="revenue" data={data.summary.salesByCategory.map(x => ({ ...x, value: x.revenue }))}/></Panel></div><div className="section-grid equal-grid">{(['topProducts', 'slowMovingProducts'] as const).map(key => <Panel key={key} title={key === 'topProducts' ? t('Best selling products') : t('Slow moving products')} description={key === 'topProducts' ? t('Your most popular products in this period') : t('Products that may need a closer look')}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("PRODUCT")}</th><th>{t("UNITS")}</th><th>{t("REVENUE")}</th></tr></thead><tbody>{data.summary[key].slice(0, 5).map(p => <tr key={p.id}><td><Link href={`/products/${p.id}`}><strong>{p.name}</strong></Link></td><td>{number(p.units)}</td><td>{money(p.revenue)}</td></tr>)}</tbody></table>{!data.summary[key].length && <Empty />}</TableScroll></Panel>)}</div><Panel title={t("Sales ledger")} description={t("Every recorded sale, connected to your inventory")}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("DATE")}</th><th>{t("PRODUCT")}</th><th>{t("QUANTITY")}</th><th>{t("UNIT PRICE")}</th><th>{t("GST")}</th><th>{t("REVENUE")}</th><th>{t("ORDER")}</th></tr></thead><tbody>{data.items.map(s => <tr key={s.id}><td>{date(s.date)}</td><td><Link href={`/products/${s.product.id}`}><strong>{s.product.name}</strong><small>{s.product.sku}</small></Link></td><td>{number(s.quantity)}</td><td>{money(s.sellingPrice)}</td><td>{s.gstPercentage}%</td><td>{money(s.revenue)}</td><td>{s.order ? <Link href={`/orders/${s.order.id}`}>{s.order.orderNumber}</Link> : t('Imported POS sale')}</td></tr>)}</tbody></table>{!data.items.length && <Empty />}</TableScroll><Pager page={page} total={data.total} pageSize={15} onChange={setPage}/></Panel></>}</>;
}
