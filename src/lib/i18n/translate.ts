import en from './messages/en.json';
import hi from './messages/hi.json';
import ta from './messages/ta.json';
import te from './messages/te.json';
import kn from './messages/kn.json';
import ml from './messages/ml.json';
import mr from './messages/mr.json';
import bn from './messages/bn.json';
import gu from './messages/gu.json';
import {intlLocale, type Locale} from './config';
import {forecastWords} from './forecast-words';

export const catalogs: Record<Locale, Record<string, string>> = {en, hi, ta, te, kn, ml, mr, bn, gu};
const normalize = (text: string) => text.replaceAll('_', ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const keys = new Map(Object.keys(en).map(key => [normalize(key), key]));
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.keys(en).filter(key => /\{\d+\}/.test(key)).map(key => {
  const slots = [...key.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
  const expression = key.split(/\{\d+\}/).map(escapeRegex).join('(.+?)');
  return {key, slots, regex: new RegExp(`^${expression}$`, 'i'), weight: key.replace(/\{\d+\}/g, '').length};
}).sort((a, b) => b.weight - a.weight);

function interpolate(message: string, values: readonly unknown[]) {
  return message.replace(/\{(\d+)\}/g, (slot, index) => values[Number(index)] == null ? slot : String(values[Number(index)]));
}

function forecastSlots(locale: Locale, key: string, values: readonly unknown[]) {
  const result = [...values];
  const month = (value: unknown) => String(value).split('–').map(part => translate(locale, part)).join('–');
  if (key.includes('has the highest observed daily demand')) { result[0] = month(result[0]); result[3] = forecastWords[locale][String(result[3])] || result[3]; }
  if (key.startsWith('Demand during ')) result[0] = month(result[0]);
  if (key.startsWith('Demand in the latest 90 days')) result[1] = forecastWords[locale][String(result[1])] || result[1];
  if (/highest observed daily demand|^Demand during |^Demand in the latest 90 days|^Order \{0\} units|^Limited history/.test(key)) {
    return result.map(value => /^\d+(\.\d+)?$/.test(String(value)) ? new Intl.NumberFormat(intlLocale(locale), {maximumFractionDigits: 2}).format(Number(value)) : value);
  }
  return result;
}

/** Translate interface messages only. Keep user-entered data out of this function. */
export function translate(locale: Locale, message: string | number | null | undefined, values: readonly unknown[] = []): string {
  if (message == null) return '';
  const original = String(message);
  if (locale === 'en') return interpolate(original, values);
  const clean = original.replace(/\s+/g, ' ').trim();
  const key = keys.get(normalize(clean));
  let result: string | undefined;
  if (key) result = interpolate(catalogs[locale][key] || key, forecastSlots(locale, key, values));
  else {
    // Legacy API messages and computed hints use the same catalog templates.
    for (const pattern of patterns) {
      const match = clean.match(pattern.regex);
      if (!match) continue;
      const slots: string[] = [];
      pattern.slots.forEach((slot, index) => { slots[slot] = match[index + 1]; });
      result = interpolate(catalogs[locale][pattern.key] || pattern.key, forecastSlots(locale, pattern.key, slots));
      break;
    }
  }
  if (!result) return interpolate(original, values);
  return `${original.match(/^\s*/)?.[0] || ''}${result}${original.match(/\s*$/)?.[0] || ''}`;
}
