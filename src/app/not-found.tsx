'use client';
import { useI18n } from '@/components/language-provider';
import Link from 'next/link';
export default function NotFound() {
    const { t } = useI18n();
    return <main className="initial-loading"><h1>{t("Page not found")}</h1><p>{t("This page may have moved or the record is no longer available.")}</p><Link className="button button-primary" href="/dashboard">{t("Back to dashboard")}</Link></main>;
}
