'use client';
import { useI18n } from '@/components/language-provider';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, ArrowDownRight, Minus, PackageOpen, RefreshCw, type LucideIcon } from 'lucide-react';
import { growthDirection } from '@/lib/chart-presentation';
import { Button } from './ui/button';
export function TableScroll({children, className = ''}: {children: React.ReactNode; className?: string}) {
    const {t} = useI18n();
    const ref = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState(false);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const update = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
        const observer = new ResizeObserver(update);
        observer.observe(element);
        if (element.firstElementChild) observer.observe(element.firstElementChild);
        update();
        return () => observer.disconnect();
    }, [children]);
    return <div ref={ref} className={`table-wrap ${className}`} role={overflow ? 'region' : undefined} tabIndex={overflow ? 0 : undefined} aria-label={overflow ? t('Scrollable table') : undefined}>{children}</div>;
}
export function PageHeading({ title, description, children }: {
    title: string;
    description?: string;
    children?: React.ReactNode;
}) {
    useI18n();
    return <div className="page-heading"><div><h1 className="page-title">{title}</h1>{description && <p className="page-subtitle">{description}</p>}</div><div className="heading-actions">{children}</div></div>;
}
export function Metric({ label, value, hint, icon: Icon, tone = 'blue' }: {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    icon?: LucideIcon;
    tone?: string;
}) {
    const { t } = useI18n();
    return <div className="metric-card"><div className="metric-top"><span>{t(label)}</span>{Icon && <span className={`metric-icon ${tone}`}><Icon size={18}/></span>}</div><strong className="metric-value">{value}</strong>{hint && <div className="metric-hint">{hint}</div>}</div>;
}
export function Badge({ children, tone }: {
    children: React.ReactNode;
    tone?: string;
}) {
    useI18n();
    return <span className={`badge ${tone || ''}`}>{children}</span>;
}
export function Status({ value }: {
    value: string;
}) {
    const { t } = useI18n();
    const color = /CRITICAL|OUT_OF_STOCK|CANCELLED|DISCONTINUED/.test(value) ? 'red' : /LOW|WARNING|PENDING|REORDER|PROCESSING|PARTIALLY/.test(value) ? 'amber' : /ACTIVE|PAID|DELIVERED|CONFIRMED|RESOLVED|NO_ACTION|IN_STOCK/.test(value) ? 'green' : 'blue';
    return <Badge tone={color}>{t(value.toLowerCase().replaceAll('_', ' '))}</Badge>;
}
export function Loading() {
    const { t } = useI18n();
    return <div className="loading-stack" role="status" aria-busy="true"><span className="loading-label">{t("Loading data")}</span><div className="skeleton h-20" aria-hidden="true"/><div className="skeleton h-64" aria-hidden="true"/></div>;
}
export function ErrorState({ error, retry }: {
    error: string;
    retry?: () => void;
}) {
    const { t } = useI18n();
    return <div className="error-state" role="alert"><AlertCircle size={26}/><div><strong>{t("We couldn\u2019t load this information")}</strong><p>{t(error)}</p></div>{retry && <Button variant="secondary" onClick={retry}><RefreshCw size={16}/>{t("Try again")}</Button>}</div>;
}
export function Empty({ message = 'No records to show yet.' }: {
    message?: string;
}) {
    const { t } = useI18n();
    return <div className="empty-state" role="status"><PackageOpen size={32} aria-hidden="true"/><p>{t(message)}</p></div>;
}
export function Panel({ title, description, action, children, className = '' }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    useI18n();
    return <section className={`card ${className}`}><div className="card-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
export function Growth({ value }: {
    value: number | null | undefined;
}) {
    const { t, number } = useI18n();
    const direction = growthDirection(value);
    if (direction === 'unavailable') return <span>{t('No previous period')}</span>;
    if (direction === 'unchanged') return <span className="growth neutral"><Minus size={14} aria-hidden="true"/>{t('No change')}</span>;
    const Icon = direction === 'increase' ? ArrowUpRight : ArrowDownRight;
    return <span className={`growth ${direction === 'increase' ? 'positive' : 'negative'}`}><Icon size={14} aria-hidden="true"/>{number(Math.abs(value!))}% {t(direction)}</span>;
}
