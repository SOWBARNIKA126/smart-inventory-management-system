'use client';

import Link from 'next/link';
import {useEffect, useRef} from 'react';
import {ArrowLeft, Plus, Printer} from 'lucide-react';
import {useI18n} from '@/components/language-provider';
import {ErrorState, Loading, PageHeading, Status} from '@/components/shared';
import {useResource} from '@/hooks/use-resource';
import type {Bill, BillCustomer, BillStore} from '@/lib/billing-types';
import './billing-documents.css';

function addressLines(address: Partial<BillCustomer | BillStore>): string[] {
  return [address.addressLine, address.area, [address.city, address.state, address.pinCode].filter(Boolean).join(', '), address.country].filter((line): line is string => Boolean(line));
}

export default function BillingInvoice({id}: {id: string}) {
  const {t, currency, number, formatLocale} = useI18n();
  const {data: bill, loading, error, refresh} = useResource<Bill>(`billing/${encodeURIComponent(id)}`);
  const printed = useRef<string | null>(null);

  useEffect(() => {
    document.body.classList.add('billing-print-view');
    return () => document.body.classList.remove('billing-print-view');
  }, []);

  useEffect(() => {
    if (loading || error || !bill || bill.id !== id || printed.current === id || new URLSearchParams(window.location.search).get('print') !== '1') return;
    let active = true;
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => {
      if (!active) return;
      requestAnimationFrame(() => {
        if (!active) return;
        printed.current = id;
        window.print();
      });
    });
    return () => {active = false;};
  }, [bill, loading, error, id]);

  const store: Partial<BillStore> = bill?.storeSnapshot ?? {};
  const customer: Partial<BillCustomer> = bill?.customerSnapshot ?? {};
  const customerName = customer.name || 'Walk-in Customer';
  const money = (value: number) => currency(value, store.currency || 'INR');
  const invoiceDate = bill ? new Intl.DateTimeFormat(formatLocale, {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'}).format(new Date(bill.createdAt)) : '';

  return <div className="billing-invoice-page">
    <div className="billing-no-print"><PageHeading title={t('Invoice')} description={bill?.orderNumber}>
      <Link className="button button-secondary" href="/billing/history"><ArrowLeft size={16}/>{t('Bill history')}</Link>
      <Link className="button button-secondary" href="/billing"><Plus size={16}/>{t('New bill')}</Link>
      <button type="button" className="button button-primary" disabled={loading || Boolean(error) || !bill} onClick={() => window.print()}><Printer size={16}/>{t('Print invoice')}</button>
    </PageHeading></div>
    {loading ? <Loading/> : error ? <ErrorState error={error} retry={refresh}/> : bill ? <article className="billing-invoice" aria-label={t('Invoice')}>
      <header className="billing-invoice-header">
        <div className="billing-invoice-store">
          <h1>{store.storeName || t('Store name')}</h1>
          <address>{addressLines(store).map((line, index) => <div key={index}>{line}</div>)}</address>
          {store.phone && <p>{t('Phone')}: {store.phone}</p>}
          {store.gstin && <p><strong>{t('GSTIN')}:</strong> {store.gstin}</p>}
        </div>
        <div className="billing-invoice-identity">
          <h2>{t('Tax invoice')}</h2>
          <dl><div><dt>{t('Invoice number')}</dt><dd>{bill.orderNumber}</dd></div><div><dt>{t('Date')}</dt><dd>{invoiceDate}</dd></div></dl>
          <Status value={String(bill.status) === 'CANCELLED' ? 'CANCELLED' : bill.paymentStatus}/>
        </div>
      </header>
      <section className="billing-invoice-parties">
        <div><h3>{t('Customer')}</h3><strong>{customerName === 'Walk-in Customer' ? t('Walk-in Customer') : customerName}</strong><address>{addressLines(customer).map((line, index) => <div key={index}>{line}</div>)}</address>{customer.phone && <p>{t('Phone')}: {customer.phone}</p>}{customer.email && <p>{t('Email')}: {customer.email}</p>}{customer.gstin && <p>{t('GSTIN')}: {customer.gstin}</p>}</div>
        <dl className="billing-invoice-payment"><div><dt>{t('Payment method')}</dt><dd>{t(bill.paymentMethod.toLowerCase().replaceAll('_', ' '))}</dd></div><div><dt>{t('Cashier')}</dt><dd>{bill.user?.name || '—'}</dd></div></dl>
      </section>
      <div className="billing-invoice-table-wrap"><table className="billing-invoice-table">
        <colgroup><col className="billing-col-product"/><col className="billing-col-quantity"/><col/><col/><col/><col/><col/></colgroup>
        <thead><tr><th>{t('Product')}</th><th>{t('Quantity')}</th><th>{t('Unit price')}</th><th>{t('Discount')}</th><th>{t('GST %')}</th><th>{t('GST amount')}</th><th>{t('Amount')}</th></tr></thead>
        <tbody>{bill.items.map(item => <tr key={item.id}>
          <td><strong>{item.productName}</strong><small>{item.sku}</small>{item.hsnCode && <small>{t('HSN code')}: {item.hsnCode}</small>}</td>
          <td>{number(item.quantity)}<small>{t(item.unit || 'pcs')}</small></td>
          <td>{money(item.unitPrice)}</td><td>{money(item.discount)}</td><td>{number(item.gstPercentage)}%</td><td>{money(item.taxAmount)}</td><td><strong>{money(item.total)}</strong></td>
        </tr>)}</tbody>
      </table></div>
      <div className="billing-invoice-bottom">
        <div className="billing-invoice-receipt">{bill.paymentMethod === 'CASH' && bill.amountReceived != null && <dl><div><dt>{t('Amount received')}</dt><dd>{money(bill.amountReceived)}</dd></div><div><dt>{t('Change')}</dt><dd>{money(bill.change ?? 0)}</dd></div></dl>}</div>
        <dl className="billing-invoice-totals">
          <div><dt>{t('Subtotal')}</dt><dd>{money(bill.subtotal)}</dd></div>
          <div><dt>{t('Discount')}</dt><dd>{money(bill.discount)}</dd></div>
          <div className="billing-total-rule"><dt>{t('Taxable amount')}</dt><dd>{money(bill.taxableAmount)}</dd></div>
          <div><dt>{t('CGST')}</dt><dd>{money(bill.cgst)}</dd></div>
          <div><dt>{t('SGST')}</dt><dd>{money(bill.sgst)}</dd></div>
          <div><dt>{t('IGST')}</dt><dd>{money(bill.igst)}</dd></div>
          <div><dt>{t('Total GST')}</dt><dd>{money(bill.totalTax)}</dd></div>
          <div className="billing-invoice-grand-total"><dt>{t('Grand total')}</dt><dd>{money(bill.total)}</dd></div>
        </dl>
      </div>
    </article> : null}
  </div>;
}
