'use client';
import { useI18n, LanguageSelector } from '@/components/language-provider';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as NavigationDialog from '@radix-ui/react-dialog';
import { Activity, ArrowUpRight, BarChart3, Bell, Boxes, LayoutDashboard, LogOut, Menu, Package, Settings, ShieldCheck, ShoppingBag, Receipt, Sparkles, Truck, Users, X } from 'lucide-react';
import { useSession } from './session-provider';
import { api } from '@/lib/client';
import { useResource } from '@/hooks/use-resource';
const navigation = [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { href: '/products', label: 'Products', icon: Package }, { href: '/inventory', label: 'Inventory', icon: Boxes }, { href: '/orders', label: 'Orders', icon: ShoppingBag }, { href: '/billing', label: 'Billing / POS', icon: Receipt }, { href: '/sales', label: 'Sales', icon: Activity, management: true }, { href: '/forecasting', label: 'Forecasting', icon: Sparkles, management: true }, { href: '/alerts', label: 'Alerts', icon: Bell, management: true }, { href: '/suppliers', label: 'Suppliers', icon: Truck, management: true }, { href: '/reports', label: 'Reports', icon: BarChart3, management: true }, { href: '/users', label: 'Users', icon: Users, admin: true }, { href: '/settings', label: 'Settings', icon: Settings, admin: true }];
export function WorkspaceShell({ children }: {
    children: React.ReactNode;
}) {
    const { t, formatLocale } = useI18n();
    const { user, loading, store, refresh } = useSession();
    const path = usePathname();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [mobile, setMobile] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 760px)');
        const update = () => { setMobile(query.matches); if (!query.matches) setOpen(false); };
        update(); query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    const { data: alerts } = useResource<{
        total: number;
    }>(user && user.role !== 'STAFF' ? 'alerts?status=ACTIVE&pageSize=1' : null);
    useEffect(() => {
        if (!loading && !user)
            router.replace('/login');
    }, [loading, user, router]);
    useEffect(() => setOpen(false), [path]);
    if (loading || !user)
        return <div className="initial-loading"><Boxes size={34}/><span>{t("Opening your store\u2026")}</span></div>;
    const selected = navigation.find(n => path.startsWith(n.href));
    if (selected && ((selected.admin && user.role !== 'ADMIN') || (selected.management && user.role === 'STAFF')))
        return <div className="initial-loading"><ShieldCheck /><p>{t("Your role does not have access to this page.")}</p><Link href="/dashboard">{t("Back to dashboard")}</Link></div>;
    const sidebar = <aside id="main-navigation" className={`sidebar ${open ? 'is-open' : ''}`}><>{mobile && <><NavigationDialog.Title className="sr-only">{t("Main navigation")}</NavigationDialog.Title><NavigationDialog.Close className="mobile-nav-close" aria-label={t("Close navigation")}><X size={20}/></NavigationDialog.Close></>}</><Link href="/dashboard" className="brand"><span className="brand-mark"><Boxes size={25}/></span><span>{t("stockwise")}<span className="brand-caption">{t("SMART INVENTORY")}</span></span></Link><div className="store-switch"><span className="store-icon"><ShoppingBag size={19}/></span><div><strong title={store.storeName}>{store.storeName}</strong><span>{t("Retail workspace")}</span></div></div><div className="nav-caption">{t("WORKSPACE")}</div><nav aria-label={t("Main navigation")}>{navigation.filter(n => (!n.admin || user.role === 'ADMIN') && (!n.management || user.role !== 'STAFF')).map(({ href, label, icon: Icon }) => <Link className={`nav-item ${path.startsWith(href) ? 'active' : ''}`} href={href} key={href} title={t(label)} aria-current={path.startsWith(href) ? 'page' : undefined}><Icon size={19}/><span>{t(label)}</span>{href === '/alerts' && !!alerts?.total && <span className="nav-count">{alerts.total}</span>}{href === '/forecasting' && <span className="nav-new">{t("SMART")}</span>}</Link>)}</nav><div className="sidebar-bottom">{user.role !== 'STAFF' && <div className="forecast-tip"><Sparkles size={20}/><strong>{t("A little foresight.")}<br />{t("A lot less overstock.")}</strong><p>{t("Plan your next purchase with seasonal demand insights.")}</p><Link href="/forecasting">{t("Explore forecasting ")}<ArrowUpRight size={15}/></Link></div>}<div className="sidebar-footer"><ShieldCheck size={16}/>{t("Your store, in sync")}</div></div></aside>;
    return <NavigationDialog.Root open={open && mobile} onOpenChange={setOpen}><div className="app-shell"><a className="skip-link" href="#main-content">{t("Skip to main content")}</a>{mobile ? <NavigationDialog.Portal><NavigationDialog.Overlay className="sidebar-backdrop"/><NavigationDialog.Content asChild aria-describedby={undefined}>{sidebar}</NavigationDialog.Content></NavigationDialog.Portal> : sidebar}<div className="workspace"><header className="topbar"><div className="breadcrumb"><NavigationDialog.Trigger asChild><button title={t("Open navigation")} className="icon-button mobile-menu" aria-label={t("Open navigation")} aria-controls="main-navigation" aria-expanded={open && mobile}><Menu size={21}/></button></NavigationDialog.Trigger><span>{t("Workspace")}</span><span className="breadcrumb-sep">/</span><strong>{t(selected?.label) || t('Overview')}</strong></div><div className="topbar-actions"><LanguageSelector /><span className="today-label">{new Intl.DateTimeFormat(formatLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())}</span>{user.role !== 'STAFF' && <Link href="/alerts" className="notification-button" aria-label={t("{0} active alerts", [alerts?.total || 0])}><Bell size={20}/>{!!alerts?.total && <i />}</Link>}<div className="profile"><span className="avatar">{user.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</span><div><strong title={user.name}>{user.name}</strong><span>{t(user.role.toLowerCase())}</span></div></div><button title={t("Sign out")} className="icon-button" onClick={async () => { await api('auth/logout', { method: 'POST' }); await refresh(); router.replace('/login'); }}><LogOut size={18}/><span className="sr-only">{t("Sign out")}</span></button></div></header><main id="main-content" tabIndex={-1} className="main-content">{children}</main><footer className="workspace-footer"><span>{t("Stockwise \u00B7 Smart Inventory Management")}</span><span>{t("Built for better retail decisions")}</span></footer></div></div></NavigationDialog.Root>;
}
