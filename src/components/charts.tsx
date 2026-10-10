'use client';
import {useId} from 'react';
import {useI18n} from '@/components/language-provider';
import {Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {useSession} from './session-provider';
import {Empty} from './shared';
import {revenuePresentation, type RevenuePoint} from '@/lib/chart-presentation';
import type {ForecastResult} from '@/services/forecasting';

const axis = {fontSize: 12, fill: '#566e60'};
const tip = {border: '1px solid #cbdcd1', borderRadius: 9, fontSize: 13, color: '#254231', boxShadow: '0 5px 20px #173b2818'};
const calendarDate = (value: string | number) => new Date(String(value).slice(0, 10) + 'T12:00:00Z');
export function RevenueChart({data, period = 'daily'}: {data: RevenuePoint[]; period?: 'daily' | 'monthly'}) {
  const {t, formatLocale, currency, number} = useI18n();
  const {store} = useSession();
  const gradient = useId();
  const {completed, current} = revenuePresentation(data, period);
  const date = (value: string | number, full = false) => calendarDate(value).toLocaleDateString(formatLocale, {timeZone: 'UTC', ...(period === 'daily' ? {day: 'numeric' as const} : {}), month: 'short', ...(full || period === 'monthly' ? {year: 'numeric' as const} : {})});
  return <div className="revenue-visual">
    <div className="revenue-plot" role="group" aria-label={t('Revenue trend')}>
      {completed.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart accessibilityLayer data={completed} margin={{top: 15, right: 18, left: 2, bottom: 0}}>
        <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#087f6b" stopOpacity={.18}/><stop offset="100%" stopColor="#087f6b" stopOpacity={.02}/></linearGradient></defs>
        <CartesianGrid stroke="#dfe8e2" strokeDasharray="3 4" vertical={false}/>
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={axis} minTickGap={34} tickFormatter={v => date(v)}/>
        <YAxis tickLine={false} axisLine={false} tick={axis} width={56} tickFormatter={v => v >= 1000 ? number(v / 1000) + 'k' : number(v)}/>
        <Tooltip contentStyle={tip} formatter={(v: number) => [currency(v, store.currency), t('Revenue')]} labelFormatter={v => date(v, true)}/>
        <Area type="monotone" dataKey="revenue" stroke="#087f6b" strokeWidth={2.3} fill={'url(#' + gradient + ')'} isAnimationActive={false} dot={completed.length === 1 ? {r: 4} : false}/>
      </AreaChart></ResponsiveContainer> : <Empty message="No completed periods to compare yet."/>}
    </div>
    <div className="chart-period-note"><span>{t(period === 'daily' ? 'Completed days only · IST' : 'Completed months only · IST')}</span>{current && <span>{t(period === 'daily' ? 'Today so far' : 'This month so far')}: <strong>{currency(current.revenue, store.currency)}</strong> · {t('In progress')}</span>}</div>
  </div>;
}

export function CategoryChart({data, measurement = 'units'}: {data: {name: string; value: number; color?: string}[]; measurement?: 'units' | 'revenue'}) {
  const {t, number, currency} = useI18n();
  const {store} = useSession();
  const colors = ['#267f62','#6ba287','#a3cbb4','#c6ddd0','#8caba5','#b6c6d3','#dfd2a8','#b4b2d4','#91c0cf','#cae1b5'];
  const total = data.reduce((sum, row) => sum + row.value, 0);
  const value = (n: number) => measurement === 'revenue' ? currency(n, store.currency) : number(n) + ' ' + t('units');
  const entries = data.map((row, index) => ({...row, color: row.color || colors[index % colors.length]}));
  return <div className="category-visual">
    {total > 0 ? <><div className="category-plot" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie rootTabIndex={-1} data={entries} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>{entries.map(row => <Cell fill={row.color} key={row.name}/>)}</Pie><Tooltip contentStyle={tip} formatter={(amount: number, name: string) => [value(amount) + ' · ' + number(amount / total * 100) + '%', name]}/></PieChart></ResponsiveContainer></div><p className="category-total">{t('Total')}: <strong>{value(total)}</strong></p></> : <Empty message={measurement === 'revenue' ? 'Your sales will appear here.' : 'No stock available.'}/>}
    <ul className="category-legend" aria-label={t(measurement === 'revenue' ? 'Sales by category' : 'Inventory by category')}>{entries.map(row => <li key={row.name}><i className="category-dot" style={{background: row.color}} aria-hidden="true"/><span className="category-legend-name">{row.name}</span><span className="category-legend-value">{value(row.value)}<small>{number(total ? row.value / total * 100 : 0)}%</small></span></li>)}</ul>
  </div>;
}

export function DemandChart({result, historyDays = 90}: {result: ForecastResult; historyDays?: number}) {
  const {t, formatLocale, number} = useI18n();
  const last = result.history.slice(-historyDays);
  const data = [...last.map(x => ({date: x.date, actual: x.quantity, forecast: null as number | null})), ...result.forecast.map(x => ({date: x.date, actual: null as number | null, forecast: x.quantity}))];
  if (last.length && result.forecast.length) data[last.length - 1].forecast = last[last.length - 1].quantity;
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart accessibilityLayer data={data} margin={{top: 15, right: 18, left: 0, bottom: 0}}><CartesianGrid stroke="#dfe8e2" strokeDasharray="3 4" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} tick={axis} minTickGap={42} tickFormatter={v => calendarDate(v).toLocaleDateString(formatLocale, {timeZone:'UTC', day:'numeric', month:'short'})}/><YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={number}/><Tooltip contentStyle={tip} labelFormatter={v => calendarDate(v).toLocaleDateString(formatLocale, {timeZone:'UTC'})} formatter={(v: number, name: string) => [number(v), t(name === 'actual' ? 'Actual sales' : 'Forecast demand')]}/><Area dataKey="actual" stroke="#087f6b" strokeWidth={2} fill="#e9f4ed" type="monotone" isAnimationActive={false}/><Line dataKey="forecast" stroke="#416faa" strokeWidth={2.2} strokeDasharray="6 4" dot={false} type="monotone" connectNulls={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer>;
}

export function SeasonChart({data}: {data: ForecastResult['seasonalIndices']}) {
  const {t, formatLocale, number} = useI18n();
  const shortMonth = new Intl.DateTimeFormat(formatLocale, {month:'short', timeZone:'UTC'});
  const fullMonth = new Intl.DateTimeFormat(formatLocale, {month:'long', timeZone:'UTC'});
  const monthDate = (month: number) => new Date(Date.UTC(2020, month - 1, 1));
  return <ResponsiveContainer width="100%" height="100%"><BarChart accessibilityLayer data={data} margin={{top:12, right:18, left:0, bottom:0}}><CartesianGrid vertical={false} stroke="#dfe8e2" strokeDasharray="3 4"/><XAxis dataKey="month" tickFormatter={v => shortMonth.format(monthDate(Number(v)))} axisLine={false} tickLine={false} tick={axis}/><YAxis axisLine={false} tickLine={false} tick={axis} tickFormatter={number}/><Tooltip contentStyle={tip} labelFormatter={v => fullMonth.format(monthDate(Number(v)))} formatter={(v: number) => [number(v), t('Daily demand')]}/><Bar dataKey="averageDemand" radius={[4,4,0,0]} maxBarSize={32} isAnimationActive={false}>{data.map(d => <Cell key={d.month} fill={d.index > 1.15 ? '#267e5c' : '#8fbaa2'}/>)}</Bar></BarChart></ResponsiveContainer>;
}

