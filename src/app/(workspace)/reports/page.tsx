'use client';
import {TableScroll} from '@/components/shared';
import {useI18n} from '@/components/language-provider';
import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';

import { useSession } from '@/components/session-provider';
import { PageHeading, Panel, Loading, ErrorState, Empty } from '@/components/shared';
import { Pager } from '@/components/operations/shared';
const types = [['inventory', 'Inventory valuation'], ['low-stock', 'Low stock'], ['out-of-stock', 'Out of stock'], ['movements', 'Stock movements'], ['sales', 'Sales'], ['best-selling', 'Best selling products'], ['slow-moving', 'Slow moving products'], ['forecasting', 'Demand forecasting'], ['reorder', 'Reorder recommendations']];
const hidden = ['id', 'productId', 'orderId', 'userId', 'createdAt', 'voidedAt', 'updatedAt'];
const enumColumns = new Set(['status', 'stockStatus', 'confidence', 'type', 'paymentStatus', 'paymentMethod', 'method', 'algorithm', 'severity']);
function label(key: string) { const labels: Record<string, string> = {sku: 'SKU', user: 'Recorded by'}; return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()); }
export default function Reports() {
    const {t, currency, number, date} = useI18n(); const [type, setType] = useState('inventory'); const [page, setPage] = useState(1); const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', productId: '', categoryId: '', supplierId: '' }); const { store } = useSession(); const products = useResource<{
    items: {
        id: string;
        name: string;
    }[];
}>('products?pageSize=100'); const categories = useResource<{
    items: {
        id: string;
        name: string;
    }[];
}>('categories?pageSize=100'); const suppliers = useResource<{
    items: {
        id: string;
        name: string;
    }[];
}>('suppliers?pageSize=100'); const params = new URLSearchParams({ type, ...filters, page: String(page), pageSize: '20' }); const { data, loading, error, refresh } = useResource<{
    items: Record<string, unknown>[];
    total: number;
    summary?: Record<string, unknown>;
}>(`reports?${params}`); const columns = Object.keys(data?.items[0] || {}).filter(k => !hidden.includes(k)); const dateApplicable = ['movements', 'sales', 'best-selling', 'slow-moving'].includes(type); function value(key: string, v: unknown) { if (v === null || v === undefined)
    return '—'; if (typeof v === 'object') {
    const row = v as Record<string, unknown>;
    return String(row.name || row.orderNumber || '—');
} if (/date/i.test(key) && typeof v === 'string')
    return date(v); if (typeof v === 'number')
    return /revenue|price|amount|value|total|taxable/i.test(key) && !key.includes('quantity') ? currency(v, store.currency) : number(v); return enumColumns.has(key) ? t(String(v).replaceAll('_', ' ')) : String(v); } return <><PageHeading title={t("Reports")} description={t("A clear view of your store, ready to review or export.")}><a className="button button-primary" href={`/api/reports?${new URLSearchParams({ ...filters, type, format: 'csv' })}`}><Download size={15}/>{t("Export CSV")}</a></PageHeading><div className="card report-selectors"><div className="form-grid"><label className="field">{t("Report")}<select className="select" value={type} onChange={e => { setType(e.target.value); setPage(1); }}>{types.map(([id, title]) => <option value={id} key={id}>{t(title)}</option>)}</select></label>{(['productId', 'categoryId', 'supplierId'] as const).map((key, i) => <label className="field" key={key}>{t(['Product', 'Category', 'Supplier'][i])}<select className="select" value={filters[key]} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); setPage(1); }}><option value="">{t(['All products', 'All categories', 'All suppliers'][i])}</option>{[products, categories, suppliers][i].data?.items.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}{dateApplicable && (['dateFrom', 'dateTo'] as const).map(key => <label className="field" key={key}>{key === 'dateFrom' ? t('From date') : t('To date')}<input className="input" type="date" value={filters[key]} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); setPage(1); }}/></label>)}</div></div>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : <Panel title={t(types.find(t => t[0] === type)?.[1]) || t('Report')} description={t("{0} matching records", [number(data?.total)])} action={<FileSpreadsheet size={19} color="#829e8b"/>}><TableScroll className="table-wrap"><table className="data-table"><thead><tr>{columns.map(c => <th key={c}>{t(label(c))}</th>)}</tr></thead><tbody>{data?.items.map((r, i) => <tr key={String(r.id || r.sku || i)}>{columns.map(c => <td key={c}>{value(c, r[c])}</td>)}</tr>)}</tbody></table>{!data?.items.length && <Empty message={t("No records match your report filters.")}/>}</TableScroll><Pager page={page} total={data?.total || 0} pageSize={20} onChange={setPage}/><p className="report-note">{type === 'inventory' ? t('Valuation uses current quantities × product cost price.') : type === 'forecasting' || type === 'reorder' ? t('Forecasts use a 30-day horizon and your configured historical range.') : t('Exports include all matching records, up to 50,000 rows.')}</p></Panel>}</>; }
