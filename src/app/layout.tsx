import type { Metadata } from 'next';
import {Toaster} from 'sonner';
import {SessionProvider} from '@/components/session-provider';
import {cookies} from 'next/headers';
import {LanguageProvider} from '@/components/language-provider';
import {isLocale, localeCookie} from '@/lib/i18n/config';
import './globals.css';
import '@/components/operations/operations.css';
import './ui-polish.css';
export const metadata:Metadata={title:{default:'Stockwise · Smart Inventory',template:'%s · Stockwise'},description:'Inventory, orders, and seasonal demand forecasting for Indian retail stores.'};
export default async function RootLayout({children}:{children:React.ReactNode}){const preference=(await cookies()).get(localeCookie)?.value;const locale=isLocale(preference)?preference:'en';return <html lang={locale}><body><LanguageProvider initialLocale={locale}><SessionProvider>{children}</SessionProvider><Toaster position="top-right" richColors closeButton/></LanguageProvider></body></html>}
