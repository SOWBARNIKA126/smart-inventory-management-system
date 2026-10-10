'use client';
import { useI18n, LanguageSelector } from '@/components/language-provider';
import { useEffect, useState } from 'react';
import { Save, Store, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from '@/lib/i18n/toast';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/client';
import { useSession } from '@/components/session-provider';
import { PageHeading, Panel, Loading, ErrorState } from '@/components/shared';
import { indianStates } from '@/components/operations/order-form';
type Settings = {
    storeName: string;
    gstin: string;
    addressLine: string;
    area: string;
    city: string;
    state: string;
    pinCode: string;
    country: string;
    phone: string;
    currency: string;
    defaultReorderLevel: number;
    safetyStockDays: number;
    defaultForecastPeriod: number;
    historicalDataDays: number;
    gstRates: number[];
};
export default function Settings() {
    const { t } = useI18n();
    const { data, loading, error, refresh } = useResource<Settings>('settings');
    const { refresh: refreshSession } = useSession();
    const [form, setForm] = useState<Settings | null>(null);
    const [rates, setRates] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (data) {
            setForm(data);
            setRates(data.gstRates.join(', '));
        }
    }, [data]);
    function field(key: keyof Settings, label: string, type = 'text') { return <label className="field" key={key}>{t(label)}<input className="input" type={type} min={0} required={['storeName', 'city', 'state', 'currency'].includes(key)} value={String(form?.[key] ?? '')} onChange={e => setForm(f => f ? { ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value } : f)}/></label>; }
    return <><PageHeading title={t("Store settings")} description={t("Set up your store details, inventory rules, and forecasting preferences.")}/><Panel title={t("Language preference")} description={t("Choose the language used in this browser. Your store data stays unchanged.")} action={<LanguageSelector id="settings-language"/>}><div /></Panel>{loading ? <Loading /> : error ? <ErrorState error={error} retry={refresh}/> : form && <form onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                    const gstRates = rates.split(',').map(v => Number(v.trim()));
                    if (gstRates.some(v => !Number.isFinite(v) || v < 0 || v > 100))
                        throw new Error('Enter GST rates between 0 and 100, separated by commas.');
                    await api('settings', { method: 'PATCH', body: JSON.stringify({ ...form, gstRates }) });
                    toast.success('Store settings saved');
                    await refreshSession();
                    refresh();
                }
                catch (e) {
                    toast.error((e as Error).message);
                }
                finally {
                    setBusy(false);
                }
            }}><div className="section-grid"><Panel title={t("Store & contact details")} description={t("Used throughout your workspace and invoices")} action={<Store size={19} color="#829c89"/>}><div className="form-grid" style={{ padding: '0 23px 24px' }}>{field('storeName', 'Store name')}{field('gstin', 'GSTIN')}{field('addressLine', 'Address line')}{field('area', 'Area / locality')}{field('city', 'City')}<label className="field">{t("State")}<select className="select" value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}>{indianStates.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label>{field('pinCode', 'PIN code')}{field('country', 'Country')}{field('phone', 'Phone')}<label className="field">{t("Display currency")}<select className="select" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>{['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map(c => <option key={c} value={c}>{t(c)}</option>)}</select></label></div></Panel><div style={{ display: 'grid', gap: 22, alignContent: 'start' }}><Panel title={t("Inventory preferences")} action={<ShieldCheck size={18} color="#829c89"/>}><div style={{ padding: '0 23px 24px', display: 'grid', gap: 17 }}>{field('defaultReorderLevel', 'Default reorder level', 'number')}{field('safetyStockDays', 'Safety stock (days)', 'number')}</div></Panel><Panel title={t("Forecasting preferences")} action={<Sparkles size={18} color="#829c89"/>}><div style={{ padding: '0 23px 24px', display: 'grid', gap: 17 }}><label className="field">{t("Default forecast period")}<select className="select" value={form.defaultForecastPeriod} onChange={e => setForm({ ...form, defaultForecastPeriod: Number(e.target.value) })}>{[7, 30, 90].map(n => <option key={n} value={n}>{t(n)}{t(" days")}</option>)}</select></label>{field('historicalDataDays', 'Historical data range (days)', 'number')}</div></Panel></div></div><Panel title={t("GST configuration")} description={t("Product rates remain editable for each item")}><div style={{ padding: '0 23px 24px' }}><label className="field">{t("Available GST percentages (comma separated)")}<input className="input" value={rates} onChange={e => setRates(e.target.value)} required/></label><p className="info-note">{t("Orders split tax into CGST and SGST when the customer state matches the store state, and use IGST for other states. Currency changes update display labels; they do not convert stored amounts.")}</p></div></Panel><div className="dialog-footer"><button className="button button-primary" disabled={busy}><Save size={16}/>{busy ? t('Saving…') : t('Save settings')}</button></div></form>}</>;
}
