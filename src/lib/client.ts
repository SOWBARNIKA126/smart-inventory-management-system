import {browserLocale, intlLocale} from './i18n/config';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path.startsWith('/api/') ? path : `/api/${path.replace(/^\//,'')}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({error:'The server returned an unexpected response.'}));
  if (!response.ok) throw new Error(data.error || 'Unable to complete this request.');
  return data as T;
}
let displayCurrency = 'INR';
export function setDisplayCurrency(code:string){displayCurrency=code}
export function currency(value: number | string | null | undefined, code = displayCurrency) { return new Intl.NumberFormat(intlLocale(browserLocale()),{style:'currency',currency:code,maximumFractionDigits:2}).format(Number(value || 0)); }
export function number(value: number | string | null | undefined) { return new Intl.NumberFormat(intlLocale(browserLocale()),{maximumFractionDigits:1}).format(Number(value || 0)); }
export function date(value: string | Date) { return new Intl.DateTimeFormat(intlLocale(browserLocale()),{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(value)); }
