export const languages = [
  {code: 'en', name: 'English'},
  {code: 'hi', name: 'हिन्दी'},
  {code: 'ta', name: 'தமிழ்'},
  {code: 'te', name: 'తెలుగు'},
  {code: 'kn', name: 'ಕನ್ನಡ'},
  {code: 'ml', name: 'മലയാളം'},
  {code: 'mr', name: 'मराठी'},
  {code: 'bn', name: 'বাংলা'},
  {code: 'gu', name: 'ગુજરાતી'},
] as const;

export type Locale = typeof languages[number]['code'];
export const localeCookie = 'stockwise_language';
export function isLocale(value: unknown): value is Locale {
  return languages.some(language => language.code === value);
}
export function intlLocale(locale: Locale) { return `${locale}-IN`; }
export function browserLocale(): Locale {
  if (typeof document === 'undefined') return 'en';
  const value = document.cookie.split('; ').find(cookie => cookie.startsWith(`${localeCookie}=`))?.split('=')[1];
  return isLocale(value) ? value : 'en';
}
