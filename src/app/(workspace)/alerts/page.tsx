'use client';
import { useI18n } from '@/components/language-provider';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { toast } from '@/lib/i18n/toast';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/client';
import { PageHeading, Panel, Status, Loading, ErrorState, Empty } from '@/components/shared';
import { Pager } from '@/components/operations/shared';
type Alert = {
    id: string;
    product: {
        id: string;
        name: string;
        sku: string;
    };
    currentStock: number;
    reorderPoint: number;
    forecastDemand: number | null;
    severity: string;
    message: string;
    status: string;
    createdAt: string;
};
export default function Alerts() {
    const { t, date, number } = useI18n();
    const [status, setStatus] = useState('ACTIVE');
    const [severity, setSeverity] = useState('');
    const [page, setPage] = useState(1);
    const [busy, setBusy] = useState('');
    const { data, loading, error, refresh } = useResource<{
        items: Alert[];
        total: number;
        activeCount: number;
    }>(`alerts?status=${status}&severity=${severity}&page=${page}&pageSize=15`);
    async function change(id: string, next: string) {
        setBusy(id);
        try {
            await api(`alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
            toast.success(`Alert ${next.toLowerCase()}`);
            refresh();
        }
        catch (e) {
            toast.error((e as Error).message);
        }
        finally {
            setBusy('');
        }
    }
    return <><PageHeading title={t("Stock alerts")} description={t("Catch shortages early and keep your shelves ready.")}><button className="button button-secondary" onClick={refresh}><RefreshCw size={15}/>{t("Refresh")}</button></PageHeading><div className="forecast-banner"><div className="forecast-banner-text"><div className="feature-icon"><Bell size={22}/></div><div><h2>{number(data?.activeCount)}{t(" active alerts")}</h2><p>{t("Stock alerts update when inventory changes. Forecasts flag shortages within supplier lead time.")}</p></div></div><Link href="/forecasting">{t("Review demand forecast \u2192")}</Link></div><div className="toolbar"><select aria-label={t("Alert status")} className="select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{t("All statuses")}</option>{['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select><select aria-label={t("Alert severity")} className="select" value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}><option value="">{t("All severities")}</option>{['CRITICAL', 'WARNING', 'INFO'].map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : <Panel title={t("Your stock watchlist")} description={t("Acknowledge an alert when reviewed, or resolve it after taking action")}>{data?.items.length ? data.items.map(a => <div className="alert-item" key={a.id}><span className={`alert-icon ${a.severity === 'CRITICAL' ? 'critical' : ''}`}><TriangleAlert size={20}/></span><div className="alert-content"><Link href={`/products/${a.product.id}`}><h3>{a.product.name}</h3></Link><p>{t(a.message)}</p><p>{t("Stock: ")}<strong>{a.currentStock}</strong>{t(" \u00B7 Reorder point: ")}<strong>{a.reorderPoint}</strong>{a.forecastDemand !== null && <>{t(" \u00B7 Forecast demand: ")}<strong>{number(a.forecastDemand)}</strong></>}</p><div className="alert-meta"><Status value={a.severity}/><Status value={a.status}/><span>{date(a.createdAt)}</span><span>{a.product.sku}</span></div></div>{a.status === 'ACTIVE' && <button className="button button-secondary" disabled={busy === a.id} onClick={() => change(a.id, 'ACKNOWLEDGED')}><Check size={14}/>{t("Acknowledge")}</button>}{a.status !== 'RESOLVED' && <button className="button button-secondary" disabled={busy === a.id} onClick={() => change(a.id, 'RESOLVED')}><CheckCheck size={14}/>{t("Resolve")}</button>}</div>) : <Empty message={t("No alerts match these filters.")}/>}<Pager page={page} total={data?.total || 0} pageSize={15} onChange={setPage}/></Panel>}</>;
}
