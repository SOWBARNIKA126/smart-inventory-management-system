'use client';
import {TableScroll} from '@/components/shared';

import Link from 'next/link';
import {useState} from 'react';
import {Eye, Plus, Printer, Receipt, RefreshCw} from 'lucide-react';
import {useI18n} from '@/components/language-provider';
import {PageHeading} from '@/components/shared';
import {DataState, Field, Pager, queryString, SearchField, Status, useDebounce, useResource} from '@/components/operations/shared';
import type {BillHistory} from '@/lib/billing-types';
import './billing-documents.css';

export default function BillingHistory() {
  const {t, currency, date} = useI18n();
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const history = useResource<BillHistory>(invalidRange ? null : `billing?${queryString({q, dateFrom, dateTo, page, pageSize: 10})}`);

  return <div className="billing-history">
    <PageHeading title={t('Bill history')} description={t('Search, view and print completed bills.')}>
      <button type="button" className="button button-secondary" disabled={history.loading || invalidRange} onClick={history.refresh}><RefreshCw size={16}/>{t('Refresh')}</button>
      <Link href="/billing" className="button button-primary"><Plus size={17}/>{t('New bill')}</Link>
    </PageHeading>
    <section className="card">
      <div className="billing-history-filters">
        <SearchField value={search} onChange={value => {setSearch(value); setPage(1);}} placeholder="Search invoice number, customer or phone…"/>
        <Field label="From date"><input type="date" className="input" value={dateFrom} max={dateTo || undefined} onChange={event => {setDateFrom(event.target.value); setPage(1);}}/></Field>
        <Field label="To date"><input type="date" className="input" value={dateTo} min={dateFrom || undefined} onChange={event => {setDateTo(event.target.value); setPage(1);}}/></Field>
        {(search || dateFrom || dateTo) && <button type="button" className="button button-secondary" onClick={() => {setSearch(''); setDateFrom(''); setDateTo(''); setPage(1);}}>{t('Clear')}</button>}
      </div>
      {invalidRange ? <p role="alert" className="billing-history-error">{t('Start date must be before end date')}</p> : <DataState loading={history.loading} error={history.error} empty={!history.data?.items.length} onRetry={history.refresh}>
        <TableScroll className="table-wrap"><table className="data-table billing-history-table">
          <thead><tr><th>{t('Invoice number')}</th><th>{t('Date')}</th><th>{t('Customer')}</th><th>{t('Total')}</th><th>{t('Payment method')}</th><th>{t('Status')}</th><th>{t('Cashier')}</th><th>{t('Actions')}</th></tr></thead>
          <tbody>{history.data?.items.map(bill => {
            const name = bill.customerSnapshot.name || 'Walk-in Customer';
            return <tr key={bill.id}>
              <td><Link className="operations-link billing-record-link" href={`/billing/${bill.id}`}><Receipt size={15}/>{bill.orderNumber}</Link></td>
              <td>{date(bill.createdAt)}</td>
              <td><strong>{name === 'Walk-in Customer' ? t('Walk-in Customer') : name}</strong><small>{bill.customerSnapshot.phone || '—'}</small></td>
              <td><strong>{currency(bill.total, bill.storeSnapshot?.currency || 'INR')}</strong></td>
              <td>{t(bill.paymentMethod.toLowerCase().replaceAll('_', ' '))}</td>
              <td><Status value={String(bill.status) === 'CANCELLED' ? 'CANCELLED' : bill.paymentStatus}/></td>
              <td>{bill.user?.name || '—'}</td>
              <td><div className="billing-history-actions"><Link className="button button-secondary button-small" href={`/billing/${bill.id}`} aria-label={t('View {0}', [bill.orderNumber])}><Eye size={15}/>{t('View bill')}</Link><Link className="button button-secondary button-small" href={`/billing/${bill.id}?print=1`} aria-label={t('Print {0}', [bill.orderNumber])}><Printer size={15}/>{t('Print bill')}</Link></div></td>
            </tr>;
          })}</tbody>
        </table></TableScroll>
      </DataState>}
      {!invalidRange && !history.error && <Pager page={history.data?.page ?? page} total={history.data?.total ?? 0} pageSize={history.data?.pageSize ?? 10} onChange={setPage}/>}
    </section>
  </div>;
}
