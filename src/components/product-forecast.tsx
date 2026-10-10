'use client';
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import { useEffect, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { PageHeading, Metric, Panel, Status, Loading, ErrorState, Empty } from '@/components/shared';
import { DemandChart, SeasonChart } from '@/components/charts';
import { Button } from '@/components/ui/button';
import { BarChart3, Boxes, CalendarClock, Download, PackageCheck, RefreshCw, ShieldCheck, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react';
import type { ForecastResult } from '@/services/forecasting';
type Product = {
    id: string;
    name: string;
    sku: string;
    supplier: {
        name: string;
        leadTimeDays: number;
    };
};
export default function Forecasting() {
    const { t, formatLocale, number } = useI18n();
    const [productId, setProductId] = useState('');
    const [days, setDays] = useState(30);
    const [historyDays, setHistoryDays] = useState(90);
    const settings = useResource<{
        defaultForecastPeriod: number;
    }>('settings');
    useEffect(() => {
        if (settings.data)
            setDays(settings.data.defaultForecastPeriod);
    }, [settings.data]);
    const products = useResource<{
        items: Product[];
    }>('products?pageSize=100&status=ACTIVE');
    useEffect(() => {
        if (products.data?.items.length && !productId) {
            const query = new URLSearchParams(window.location.search).get('productId');
            setProductId(products.data.items.some(x => x.id === query) ? query! : products.data.items[0].id);
        }
    }, [products.data, productId]);
    const { data, loading, error, refresh } = useResource<ForecastResult & {
        product: Product;
        generatedAt: string;
    }>(productId ? `forecasting?productId=${productId}&days=${days}` : null);
    return <><PageHeading title={t("Demand forecasting")} description={t("Turn your sales history into a clearer view of what’s next.")}><Button variant="secondary" onClick={refresh} disabled={!productId || loading}><RefreshCw size={15}/>{t("Refresh forecast")}</Button><Button asChild><a href={`/api/reports?type=forecasting&productId=${productId}&format=csv`}><Download size={15}/>{t("Export")}</a></Button></PageHeading><div className="card forecast-controls"><label className="field">{t("Choose a product")}<select className="select" value={productId} onChange={e => setProductId(e.target.value)}><option value="">{t("Select product")}</option>{products.data?.items.map(p => <option value={p.id} key={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="field">{t("Forecast period")}<select className="select" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(n => <option key={n} value={n}>{t("Next {0} days", [number(n)])}</option>)}</select></label>{data && <div style={{ marginLeft: 'auto', paddingBottom: 8 }}><Status value={`${data.confidence}_CONFIDENCE`}/></div>}</div>{products.error ? <ErrorState error={products.error} retry={products.refresh}/> : loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : !data ? <Empty message={t("Add products and record sales to begin forecasting.")}/> : <><div className="metrics-grid"><Metric label={t("Expected demand · {0} days", [number(days)])} value={number(data.expectedDemand)} icon={TrendingUp} tone="green" hint={t("{0} units per day", [number(data.averageDailyDemand)])}/><Metric label={t("Available stock")} value={number(data.availableStock)} icon={Boxes} tone="blue" hint={t("{0} units on hand, less reservations", [number(data.currentStock)])}/><Metric label={t("Recommended reorder")} value={number(data.recommendedReorder)} icon={PackageCheck} tone="purple" hint={<Status value={data.status}/>}/><Metric label={t("Estimated stockout")} value={data.daysUntilStockout === null ? t('No stockout') : t('{0} days', [number(data.daysUntilStockout)])} icon={CalendarClock} tone="amber" hint={t("Supplier lead time: {0} days", [number(data.product.supplier.leadTimeDays)])}/></div><Panel title={t("{0} · demand outlook", [data.product.name])} description={t('{0} days of history', [number(data.historyDays)])} action={<div className="tab-group" role="group" aria-label={t("Historical chart range")}>{[30, 90, 180, 365].map(n => <button aria-pressed={historyDays === n} className={historyDays === n ? 'selected' : ''} onClick={() => setHistoryDays(n)} key={n}>{n === 180 ? t('6 mo') : n === 365 ? t('1 year') : t("{0} days", [number(n)])}</button>)}</div>}><div className="chart-container large"><DemandChart result={data} historyDays={historyDays}/></div><div className="chart-legend"><span><i className="legend-line"/>{t("Actual sales")}</span><span><i className="legend-line forecast"/>{t("Forecast demand")}</span></div></Panel><div style={{ height: 22 }}/><div className="section-grid"><Panel title={t("Seasonal demand by month")} description={t("Average daily units, calculated across your historical data")}><div className="chart-container"><SeasonChart data={data.seasonalIndices}/></div></Panel><Panel title={t("Seasonal insights")} description={t("Patterns found in this product’s sales")}><div style={{ padding: '0 23px 20px' }}>{data.insights.map((insight, i) => <div className="insight-card" style={{ marginBottom: 12, padding: 15 }} key={i}><h3><Sparkles size={15}/>{i === 0 ? t('Demand pattern') : i === 1 ? t('Seasonal signal') : t('Sales insight')}</h3><p>{t(insight)}</p></div>)}<div className="info-note">{t("Highest month: ")}<strong>{t(data.highestDemandMonth || 'Insufficient data')}</strong><br />{t("Lowest month: ")}<strong>{t(data.lowestDemandMonth || 'Insufficient data')}</strong><br />{t("Year-over-year growth: ")}<strong>{data.yearOverYearGrowth === null ? t('Not enough comparable history') : t("{0}%", [number(data.yearOverYearGrowth)])}</strong></div></div></Panel></div><div className="metrics-grid"><Metric label={t("Safety stock")} value={number(data.safetyStock)} icon={ShieldCheck} tone="green" hint={t("Buffer based on your store’s safety-stock days")}/><Metric label={t("Expected shortage")} value={number(data.expectedShortage)} icon={TriangleAlert} tone="red" hint={t("Demand beyond available stock over {0} days", [number(days)])}/><Metric label={t("Expected surplus")} value={number(data.expectedSurplus)} icon={Boxes} tone="blue" hint={t("Stock remaining after forecast demand")}/><Metric label={t("Peak daily demand")} value={number(data.peakDemand)} icon={BarChart3} tone="purple" hint={t("Highest predicted daily quantity")}/></div><Panel title={t("Reorder calculation")} description={t("Supplier: {0}", [data.product.supplier.name])}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("LEAD-TIME DEMAND")}</th><th>{t("SAFETY STOCK")}</th><th>{t("TARGET STOCK")}</th><th>{t("AVAILABLE STOCK")}</th><th>{t("REORDER QUANTITY")}</th></tr></thead><tbody><tr><td>{number(data.leadTimeDemand)}</td><td>{number(data.safetyStock)}</td><td>{number(data.recommendedStock)}</td><td>{number(data.availableStock)}</td><td><strong>{number(data.recommendedReorder)}{t(" units")}</strong></td></tr></tbody></table></TableScroll></Panel><p className="info-note">{t("Forecasts are estimates derived from non-voided sales. Zero-sale days are included; stockouts can suppress observed demand. Confidence describes available data coverage, not a guarantee of accuracy. Limited histories use a moving average. Forecast generated ")}{new Date(data.generatedAt).toLocaleString(formatLocale, { timeZone: 'Asia/Kolkata' })}.</p></>}</>;
}

