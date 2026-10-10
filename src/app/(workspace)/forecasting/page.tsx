'use client';
import {TableScroll} from '@/components/shared';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight, CalendarDays, CalendarRange, Download, History, PackageCheck, RefreshCw, Sparkles, Sun, TrendingUp} from 'lucide-react';
import {useI18n} from '@/components/language-provider';
import {PageHeading, Panel, Metric, Status, Loading, ErrorState, Empty} from '@/components/shared';
import {Pager, SearchField} from '@/components/operations/shared';
import {Button} from '@/components/ui/button';
import ProductForecast from '@/components/product-forecast';
import {useResource} from '@/hooks/use-resource';
import type {EventPlan} from '@/services/event-demand';
import type {PlanningEvent} from '@/services/event-calendar';

type Planner = {events: PlanningEvent[]; selected: EventPlan | null; asOf: string; generatedAt: string; region: string; horizonDays: number};

export default function Forecasting() {
  const {t} = useI18n();
  const [view, setView] = useState('events');
  useEffect(() => {if (new URLSearchParams(window.location.search).has('productId')) setView('products');}, []);
  return <>
    <div className="tab-group event-view-tabs" aria-label={t('Forecasting')}>
      <button className={view === 'events' ? 'selected' : ''} aria-pressed={view === 'events'} onClick={() => setView('events')}><CalendarRange size={16}/>{t('Season & festival planning')}</button>
      <button className={view === 'products' ? 'selected' : ''} aria-pressed={view === 'products'} onClick={() => setView('products')}><TrendingUp size={16}/>{t('Product trends')}</button>
    </div>
    {view === 'events' ? <EventPlanning/> : <ProductForecast/>}
  </>;
}

function EventPlanning() {
  const {t, number, date} = useI18n();
  const [horizon, setHorizon] = useState(180);
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [sort, setSort] = useState('lift');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({view: 'events', horizon: String(horizon)});
  if (eventId) params.set('eventId', eventId);
  const {data, loading, error, refresh} = useResource<Planner>(`forecasting?${params}`);
  const plan = data?.selected;
  const event = plan?.event;
  const query = search.trim().toLocaleLowerCase();
  const products = (plan?.products || []).filter(p => (!onlyReorder || p.recommendedReorder > 0) && `${p.name} ${p.sku} ${p.categoryName}`.toLocaleLowerCase().includes(query)).sort((a, b) =>
    (sort === 'lift' ? (b.liftPercent ?? -Infinity) - (a.liftPercent ?? -Infinity) : 0) || b.expectedDemand - a.expectedDemand || a.name.localeCompare(b.name));
  const range = (start: string, end: string) => `${date(start)} – ${date(end)}`;
  const choose = (id: string) => {setEventId(id); setPage(1); setSearch('');};
  const exportParams = new URLSearchParams({view: 'events', horizon: String(horizon), eventId: event?.id || '', format: 'csv'});

  return <>
    <PageHeading title={t('Season & festival planning')} description={t('Plan stock for upcoming events using last year’s sales.')}>
      <Button variant="secondary" onClick={refresh} disabled={loading}><RefreshCw size={15}/>{t('Refresh forecast')}</Button>
      {event && !loading && !error && <Button asChild><a href={`/api/forecasting?${exportParams}`}><Download size={15}/>{t('Export event plan')}</a></Button>}
    </PageHeading>
    <div className="event-toolbar">
      <div><h2>{t('Upcoming events')}</h2><p>{data?.region}</p></div>
      <label className="field">{t('Planning horizon')}<select className="select" value={horizon} onChange={e => {setHorizon(Number(e.target.value)); setEventId(''); setPage(1);}}><option value={180}>{t('Next 6 months')}</option><option value={365}>{t('Next 12 months')}</option></select></label>
    </div>
    <div className="event-calendar" aria-label={t('Upcoming events')}>
      {data?.events.map(item => <button key={item.id} className={`event-card ${event?.id === item.id ? 'selected' : ''}`} aria-pressed={event?.id === item.id} onClick={() => choose(item.id)}>
        <span className="event-card-top">{item.kind === 'FESTIVAL' ? <Sparkles size={19}/> : <Sun size={19}/>}<span>{t(item.kind === 'FESTIVAL' ? 'Festival' : 'Season')}</span></span>
        <strong>{t(item.name)}</strong><span className="event-card-date">{range(item.startDate, item.endDate)}</span>
      </button>)}
    </div>
    {loading ? <Loading/> : error ? <ErrorState error={error} retry={refresh}/> : !plan || !event ? <Empty message={t('No upcoming events in this period.')}/> : <>
      <section className="event-banner">
        <div><span className="eyebrow"><CalendarDays size={15}/>{t('Products to prepare')}</span><h2>{t(event.name)}</h2><p>{t('Planning window')}: {range(event.startDate, event.endDate)}</p>{event.eventDate && <p>{t('Festival day')}: {date(event.eventDate)}</p>}</div>
        <div className="event-comparison"><span><History size={17}/>{t('Last year’s comparison')}</span><strong>{range(event.previousStartDate, event.previousEndDate)}</strong><p>{t('Based on the same event last year, adjusted for recent sales trends.')}</p></div>
      </section>
      <div className="metrics-grid">
        <Metric label={t('Products to prepare')} value={number(plan.summary.eligibleProducts)} icon={Sparkles} tone="green"/>
        <Metric label={t('Products needing stock')} value={number(plan.summary.reorderProducts)} icon={PackageCheck} tone="amber"/>
        <Metric label={t('Planning window')} value={t('{0} days', [number(plan.metadata.upcomingWindowDays)])} icon={CalendarRange} tone="blue"/>
        <Metric label={t('Last year’s comparison')} value={t('{0} days', [number(plan.metadata.previousWindowDays)])} icon={History} tone="purple"/>
      </div>
      <Panel title={t('Recommended products')} description={t('Products ranked using sales recorded during last year’s event.')}>
        <div className="toolbar event-product-toolbar">
          <SearchField value={search} onChange={value => {setSearch(value); setPage(1);}}/>
          <label className="checkbox-label"><input type="checkbox" checked={onlyReorder} onChange={e => {setOnlyReorder(e.target.checked); setPage(1);}}/>{t('Only products needing stock')}</label>
          <select className="select" aria-label={t('Sort by')} value={sort} onChange={e => {setSort(e.target.value); setPage(1);}}><option value="lift">{t('Seasonal lift')}</option><option value="demand">{t('Expected need')}</option></select>
        </div>
        {products.length ? <><TableScroll className="table-wrap"><table className="data-table event-products"><thead><tr>{['Product', 'Last year', 'Expected need', 'Available stock', 'Reorder quantity', 'Order by'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>
          {products.slice((page - 1) * 10, page * 10).map(product => <tr key={product.id}>
            <td><Link className="event-product-link" href={`/products/${product.id}`}>{product.name}<ArrowUpRight size={13}/></Link><small>{product.sku}</small>{product.liftPercent !== null && <span className={`badge ${product.liftPercent > 0 ? 'green' : ''}`}>{product.liftPercent > 0 ? '+' : ''}{number(product.liftPercent)}% · {t('Seasonal lift')}</span>}</td>
            <td>{number(product.previousUnits)} {t(product.unit)}</td>
            <td><strong>{number(product.expectedDemand)} {t(product.unit)}</strong><small>{product.trendApplied ? `${t('Recent trend')}: ${number(product.recentTrendPercent!)}%` : t('At the previous-year rate')}</small></td>
            <td>{number(product.availableStock)} {t(product.unit)}<small>{t('Projected stock')}: {number(Math.floor(product.projectedStockAtStart))}</small></td>
            <td><strong className={product.recommendedReorder > 0 ? 'event-reorder' : ''}>{number(product.recommendedReorder)} {t(product.unit)}</strong><small>{t('Safety stock')}: {number(product.safetyStock)}</small></td>
            <td>{product.recommendedReorder > 0 ? date(product.orderByDate) : '—'}<div><Status value={product.status}/></div><small>{product.supplierName}</small></td>
          </tr>)}
        </tbody></table></TableScroll><Pager page={page} total={products.length} onChange={setPage}/></> : <Empty message={t(plan.products.length ? 'No matching products for this plan.' : plan.insufficientHistoryProducts.length ? 'Not enough comparable history' : 'No event sales last year')}/>}
      </Panel>
      {plan.insufficientHistoryProducts.length > 0 && <details className="event-history-note"><summary>{t('{0} products need more history', [number(plan.insufficientHistoryProducts.length)])}</summary><p>{t('Products without enough history are excluded from recommendations.')}</p><p>{plan.insufficientHistoryProducts.map(p => p.name).join(' · ')}</p></details>}
      <section className="card event-method"><h3><TrendingUp size={17}/>{t('How this plan is calculated')}</h3>
        <p>{t('Estimated demand: last year’s daily sales × planning days × recent growth.')}</p>
        <p>{t('Stock to order includes your safety buffer and expected sales before the event.')}</p>
        <p>{t('Seasonal lift compares event sales with the 28 days before that event.')}</p>
        <p>{t('Recent growth compares the last 28 days with last year, capped between 0.5× and 2×.')}</p>
        <p>{t('Event plans may overlap. Review them separately before placing orders.')}</p>
        <div className="event-sources">{event.sourceUrl ? <><a href={event.sourceUrl} target="_blank" rel="noreferrer">{t('Festival dates')}<ArrowUpRight size={13}/></a>{event.previousSourceUrl && <a href={event.previousSourceUrl} target="_blank" rel="noreferrer">{t('Previous year calendar')}<ArrowUpRight size={13}/></a>}</> : <p>{t('Season dates are planning windows; local weather and school dates vary.')}</p>}</div>
      </section>
    </>}
  </>;
}
