'use client';
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Globe2} from 'lucide-react';
import {isLocale, intlLocale, languages, localeCookie, type Locale} from '@/lib/i18n/config';
import {translate} from '@/lib/i18n/translate';
import {formatters} from '@/lib/i18n/format';

type LanguageContext = {locale: Locale; formatLocale: string; setLocale: (locale: Locale) => void; setCurrency: (currency: string) => void; t: (message: string | number | null | undefined, values?: readonly unknown[]) => string} & ReturnType<typeof formatters>;
const Context = createContext<LanguageContext | null>(null);

export function LanguageProvider({initialLocale, children}: {initialLocale: Locale; children: React.ReactNode}) {
  const [locale, updateLocale] = useState(initialLocale);
  const [currency, setCurrency] = useState('INR');
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    document.documentElement.lang = next;
    updateLocale(next);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({locale, formatLocale: intlLocale(locale), setLocale, setCurrency, ...formatters(locale, currency), t: (message: string | number | null | undefined, values?: readonly unknown[]) => translate(locale, message, values)}), [locale, currency, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('LanguageProvider is required');
  return value;
}

export function LanguageSelector({id = 'interface-language'}: {id?: string}) {
  const {locale, setLocale, t} = useI18n();
  return <label className="language-selector" htmlFor={id}><Globe2 size={16} aria-hidden="true"/><span className="sr-only">{t('Interface language')}</span><select id={id} value={locale} onChange={event => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
    {languages.map(language => <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>)}
  </select></label>;
}
