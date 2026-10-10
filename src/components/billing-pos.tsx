'use client';
import {TableScroll} from '@/components/shared';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Banknote, CheckCircle2, History, Minus, Plus, Receipt, RefreshCw, ShoppingBasket, Trash2, UserRound} from 'lucide-react';
import {useI18n} from './language-provider';
import {PageHeading, Panel, Empty, ErrorState, Loading, Status} from './shared';
import {Pager, Product, SearchField} from './operations/shared';
import {indianStates, paymentMethods} from './operations/order-form';
import {useResource} from '@/hooks/use-resource';
import {api} from '@/lib/client';
import {previewBill} from '@/lib/billing-preview';
import './billing-pos.css';

type CartLine = {product: Product; quantity: number; discount: number};
type Customer = {name: string; phone: string; email: string; gstin: string; addressLine: string; city: string; state: string; pinCode: string};
const blankCustomer: Customer = {name:'',phone:'',email:'',gstin:'',addressLine:'',city:'',state:'',pinCode:''};
const available = (product: Product) => Math.max(0, (product.inventory?.currentStock || 0) - (product.inventory?.reservedStock || 0));

export default function BillingPos() {
  const {t, currency, number} = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer>({...blankCustomer});
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const checkoutKey = useRef('');
  const products = useResource<{items: Product[]; total: number}>(`products?status=ACTIVE&sortBy=name&sortOrder=asc&pageSize=6&page=${page}&q=${encodeURIComponent(query)}`);
  const settings = useResource<{state: string; currency: string}>('settings');
  useEffect(() => {const timer = setTimeout(() => {setQuery(search); setPage(1);}, 200); return () => clearTimeout(timer);}, [search]);
  const state = customer.state || settings.data?.state || 'Tamil Nadu';
  const intraState = state.trim().toLowerCase() === (settings.data?.state || 'Tamil Nadu').trim().toLowerCase();
  const currentCart = cart.map(line => ({...line, product: products.data?.items.find(p => p.id === line.product.id) || line.product}));
  let preview = previewBill([], 0, intraState);
  let validation = '';
  try {preview = previewBill(currentCart.map(line => ({productId:line.product.id, quantity:line.quantity, unitPrice:Number(line.product.sellingPrice), gstPercentage:Number(line.product.gstPercentage), discount:line.discount})), discount, intraState);}
  catch (e) {validation = e instanceof Error ? e.message : 'Enter a valid amount';}
  if (currentCart.some(line => line.quantity > available(line.product) || line.product.status !== 'ACTIVE')) validation = 'Insufficient available stock';
  const cashEnough = paymentMethod !== 'CASH' || (received !== '' && Number.isFinite(Number(received)) && Number(received) >= preview.total);
  const cashChange = paymentMethod === 'CASH' && received !== '' ? Math.max(0, Math.round((Number(received) - preview.total) * 100) / 100) : 0;

  function add(product: Product) {
    setError('');
    setCart(previous => {
      const line = previous.find(item => item.product.id === product.id);
      if ((line?.quantity || 0) >= available(product)) return previous;
      return line ? previous.map(item => item.product.id === product.id ? {...item, product, quantity:item.quantity + 1} : item) : [...previous, {product, quantity:1, discount:0}];
    });
  }
  function update(id: string, values: Partial<CartLine>) {setError(''); setCart(previous => previous.map(line => line.product.id === id ? {...line,...values} : line));}
  async function completeSale() {
    if (submitting.current || !cart.length || validation || !cashEnough || !settings.data) return;
    submitting.current = true; setBusy(true); setError('');
    if (!checkoutKey.current) checkoutKey.current = crypto.randomUUID();
    try {
      const bill = await api<{id:string}>('billing', {method:'POST', body:JSON.stringify({checkoutKey:checkoutKey.current, items:currentCart.map(line => ({productId:line.product.id,quantity:line.quantity,discount:line.discount})), discount, paymentMethod, ...(paymentMethod === 'CASH' ? {amountReceived:Number(received)} : {}), customer:{...customer, state}})});
      router.push(`/billing/${bill.id}`);
      // Keep checkout disabled until navigation unmounts this cart.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete this request.');
      products.refresh(); setBusy(false); submitting.current = false;
    }
  }

  return <>
    <PageHeading title={t('Billing / POS')} description={t('Create bills and update stock with every completed sale.')}><Link href="/billing/history" className="button button-secondary"><History size={16}/>{t('Bill history')}</Link></PageHeading>
    <fieldset disabled={busy} className="billing-fieldset"><div className="billing-pos-layout"><div className="billing-workbench">
      <Panel title={t('Products')} action={<button className="icon-button" onClick={products.refresh} title={t('Refresh')} disabled={products.loading}><RefreshCw size={16}/></button>}>
        <div className="billing-search"><SearchField value={search} onChange={setSearch} placeholder="Search by name, SKU or barcode"/></div>
        {products.loading ? <Loading/> : products.error ? <ErrorState error={products.error} retry={products.refresh}/> : !products.data?.items.length ? <Empty message={t('No products found')}/> : <>
          <div className="billing-product-grid">{products.data.items.map(product => {
            const inCart = cart.find(line => line.product.id === product.id)?.quantity || 0;
            const stock = available(product);
            return <button key={product.id} className="billing-product" onClick={() => add(product)} disabled={stock <= inCart || cart.length >= 100 && !inCart} aria-label={t('Add {0} to bill', [product.name])}>
              <span className="billing-product-top"><span><strong>{product.name}</strong><small>{product.sku}</small></span><span className="billing-add"><Plus size={16}/></span></span>
              <span className="billing-product-price">{currency(product.sellingPrice, settings.data?.currency || 'INR')}<small>{t('GST')}: {number(product.gstPercentage)}%</small></span>
              <span className="billing-product-stock">{stock === 0 ? <Status value="OUT_OF_STOCK"/> : <span>{t('Available stock')}: <strong>{number(stock)}</strong> {t(product.unit)}</span>}<small>{t('Current stock')}: {number(product.inventory?.currentStock || 0)}</small></span>
            </button>;
          })}</div><Pager page={page} total={products.data.total} pageSize={6} onChange={setPage}/>
        </>}
      </Panel>
      <Panel title={t('Current bill')} description={t('{0} items', [number(cart.length)])} action={cart.length > 0 && <button className="button button-ghost" onClick={() => {setCart([]); setDiscount(0); setReceived(''); setError('');}}><Trash2 size={14}/>{t('Clear bill')}</button>}>
        {!cart.length ? <div className="billing-empty"><ShoppingBasket size={35}/><strong>{t('Add products to start a bill')}</strong><p>{t('Search by name, SKU or barcode')}</p></div> : <TableScroll className="table-wrap"><table className="data-table billing-cart"><thead><tr>{['Product','Qty','Unit price','GST %','Discount','Amount'].map(label => <th key={label}>{t(label)}</th>)}<th><span className="sr-only">{t("Actions")}</span></th></tr></thead><tbody>{currentCart.map((line, index) => <tr key={line.product.id}>
          <td><strong>{line.product.name}</strong><small>{line.product.sku}</small><small>{t('Available stock')}: {number(available(line.product))}</small></td>
          <td><div className="billing-quantity"><button title={t('Decrease quantity for {0}', [line.product.name])} className="icon-button" aria-label={t('Decrease quantity for {0}', [line.product.name])} disabled={line.quantity <= 1} onClick={() => update(line.product.id,{quantity:line.quantity-1})}><Minus size={12}/></button><input className="input" type="number" min={1} max={available(line.product)} step={1} value={line.quantity || ''} aria-label={t('Quantity for {0}', [line.product.name])} onChange={e => update(line.product.id,{quantity:Number(e.target.value)})}/><button title={t('Increase quantity for {0}', [line.product.name])} className="icon-button" aria-label={t('Increase quantity for {0}', [line.product.name])} disabled={line.quantity >= available(line.product)} onClick={() => update(line.product.id,{quantity:line.quantity+1})}><Plus size={12}/></button></div></td>
          <td>{currency(line.product.sellingPrice, settings.data?.currency || 'INR')}</td><td>{number(line.product.gstPercentage)}%</td>
          <td><input className="input billing-discount-input" type="number" min={0} step="0.01" max={line.quantity * Number(line.product.sellingPrice)} aria-label={t('Discount for {0}', [line.product.name])} value={line.discount || ''} placeholder="0" onChange={e => update(line.product.id,{discount:Number(e.target.value)})}/></td>
          <td><strong>{validation ? '—' : currency(preview.items[index]?.total || 0, settings.data?.currency || 'INR')}</strong></td>
          <td><button title={t('Remove {0}', [line.product.name])} className="icon-button" aria-label={t('Remove {0}', [line.product.name])} onClick={() => {setCart(previous => previous.filter(item => item.product.id !== line.product.id)); setError('');}}><Trash2 size={15}/></button></td>
        </tr>)}</tbody></table></TableScroll>}
      </Panel>
    </div><aside className="billing-checkout">
      <div className="card billing-payment"><h2><Receipt size={18}/>{t('Bill summary')}</h2>
        <details className="billing-customer"><summary><UserRound size={15}/>{t('Customer details')}<small>{t('Optional')}</small></summary><p>{t('Walk-in Customer')}</p><div className="billing-customer-fields">
          {(['name','phone','email','gstin','addressLine','city','pinCode'] as const).map(key => <label className="field" key={key}>{t(({name:'Customer name',phone:'Phone',email:'Email',gstin:'Customer GSTIN',addressLine:'Address line',city:'City',pinCode:'PIN code'})[key])}<input className="input" type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} maxLength={key === 'gstin' ? 15 : key === 'pinCode' ? 6 : 250} value={customer[key]} onChange={e => setCustomer(previous => ({...previous,[key]:e.target.value}))}/></label>)}
        </div></details>
        <label className="field billing-supply">{t('Place of supply')}<select className="select" value={state} onChange={e => setCustomer(previous => ({...previous,state:e.target.value}))}>{indianStates.map(item => <option key={item} value={item}>{t(item)}</option>)}</select></label>
        {settings.error && <ErrorState error={settings.error} retry={settings.refresh}/>}
        <label className="field">{t('Bill discount')}<input className="input" type="number" min={0} step="0.01" value={discount || ''} placeholder="0" onChange={e => setDiscount(Number(e.target.value))}/></label>
        <div className="billing-totals">{(['subtotal','discount','taxableAmount','cgst','sgst','igst','totalTax'] as const).map(key => <div key={key}><span>{t(({subtotal:'Subtotal',discount:'Discount',taxableAmount:'Taxable amount',cgst:'CGST',sgst:'SGST',igst:'IGST',totalTax:'Total GST'})[key])}</span><strong>{validation ? '—' : currency(key === 'discount' ? -preview[key] : preview[key], settings.data?.currency || 'INR')}</strong></div>)}</div>
        <div className="billing-grand-total"><span>{t('Grand total')}</span><strong>{validation ? '—' : currency(preview.total, settings.data?.currency || 'INR')}</strong></div>
        <label className="field">{t('Payment method')}<select className="select" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>{paymentMethods.map(method => <option key={method} value={method}>{t(method)}</option>)}</select></label>
        {paymentMethod === 'CASH' && <div className="billing-cash"><label className="field">{t('Amount received')}<input className="input" inputMode="decimal" type="number" step="0.01" min={0} value={received} onChange={e => setReceived(e.target.value)}/></label><div><span>{t('Change')}</span><strong>{currency(cashChange, settings.data?.currency || 'INR')}</strong></div><button className="button button-ghost" onClick={() => setReceived(preview.total.toFixed(2))} disabled={!!validation || !cart.length}><Banknote size={15}/>{t('Exact amount')}</button></div>}
        {(error || validation) && <div className="form-error" role="alert">{t(error || validation)}</div>}
        <button className="button button-primary billing-complete" onClick={completeSale} disabled={!cart.length || !!validation || !cashEnough || !settings.data || busy}><CheckCircle2 size={18}/>{t(busy ? 'Completing sale…' : 'Complete sale')}</button>
        <p className="billing-checkout-note">{t('Completing a sale creates the invoice and deducts stock automatically.')}</p>
      </div>
    </aside></div></fieldset>
  </>;
}
