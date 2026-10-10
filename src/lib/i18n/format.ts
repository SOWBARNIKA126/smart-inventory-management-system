import {intlLocale, type Locale} from './config';

export function formatters(locale: Locale, defaultCurrency = 'INR') {
  const language = intlLocale(locale);
  return {
    currency: (value: number | string | null | undefined, code = defaultCurrency) => new Intl.NumberFormat(language, {style: 'currency', currency: code, maximumFractionDigits: 2}).format(Number(value || 0)),
    number: (value: number | string | null | undefined) => new Intl.NumberFormat(language, {maximumFractionDigits: 1}).format(Number(value || 0)),
    date: (value: string | Date) => new Intl.DateTimeFormat(language, {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'}).format(new Date(value)),
  };
}
