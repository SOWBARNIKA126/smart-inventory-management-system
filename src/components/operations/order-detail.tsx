"use client";
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil, Printer, XCircle } from "lucide-react";
import { toast } from '@/lib/i18n/toast';
import { api } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataState, Field, Order, ProductAvatar, Status, useResource } from "./shared";
import OrderForm, { humanize, paymentStatuses } from "./order-form";
interface Store {
    storeName: string;
    gstin: string;
    addressLine: string;
    area: string;
    city: string;
    state: string;
    pinCode: string;
    phone: string;
}
const nextStatuses: Record<string, string[]> = { PENDING: ["CONFIRMED"], CONFIRMED: ["PROCESSING"], PROCESSING: ["SHIPPED"], SHIPPED: ["DELIVERED"], DELIVERED: [], CANCELLED: [] };
export default function OrderDetail({ id }: {
    id: string;
}) {
    const { t, currency, date } = useI18n();
    const order = useResource<Order>(`/api/orders/${id}`);
    const store = useResource<Store>("/api/settings");
    const [editing, setEditing] = useState(false);
    const [cancel, setCancel] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    async function update(values: Record<string, string>) {
        setBusy(true);
        try {
            await api(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(values) });
            toast.success(values.status === "CANCELLED" ? "Order cancelled; deducted stock has been restored" : "Order updated");
            setCancel(false);
            setStatus("");
            order.refresh();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update order");
        }
        finally {
            setBusy(false);
        }
    }
    const item = order.data;
    const customer = item?.customer;
    return <><Link href="/orders" className="operations-back no-print"><ArrowLeft size={15}/>{t("All orders")}</Link><DataState loading={order.loading} error={order.error} onRetry={order.refresh}>{item && <><div className="page-heading"><div><div className="operations-inline"><h1 className="page-title">{item.orderNumber}</h1><Status value={item.status}/></div><p className="page-subtitle">{t("Created ")}{date(item.createdAt)} · {t(item.items.length === 1 ? "{0} item" : "{0} items", [item.items.length])}</p></div><div className="operations-inline no-print"><button className="button button-secondary" onClick={() => window.print()}><Printer size={16}/>{t("Print invoice")}</button>{item.status === "PENDING" && !editing && <button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={16}/>{t("Edit order")}</button>}{!["CANCELLED", "DELIVERED"].includes(item.status) && <button className="button button-secondary operations-danger" onClick={() => setCancel(true)}><XCircle size={16}/>{t("Cancel order")}</button>}</div></div>
    {editing ? <OrderForm order={item} onSaved={() => { setEditing(false); order.refresh(); }} onCancel={() => setEditing(false)}/> : <div className="operations-two-columns"><div><div className="card operations-detail-card"><div className="operations-chart-heading"><div><h3>{store.data?.storeName || t("Tax invoice")}</h3><p className="operations-form-help">{t("GSTIN: ")}{store.data?.gstin || t("Not configured")}</p></div><span className="badge">{t("Tax invoice")}</span></div><div className="operations-detail-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}><div><p className="operations-stat-label">{t("Billed to")}</p><strong>{customer?.name || item.customerName}</strong><p className="operations-form-help">{customer?.addressLine}{customer?.area && <><br />{customer.area}</>}<br />{[customer?.city, customer?.state, customer?.pinCode].filter(Boolean).join(", ")}<br />{customer?.country || t("India")}</p>{customer?.gstin && <p className="operations-form-help">{t("GSTIN: ")}{customer.gstin}</p>}<p className="operations-form-help">{customer?.phone}<br />{customer?.email}</p></div><div><p className="operations-stat-label">{t("From")}</p><strong>{store.data?.storeName}</strong><p className="operations-form-help">{store.data?.addressLine}<br />{store.data?.area}<br />{[store.data?.city, store.data?.state, store.data?.pinCode].filter(Boolean).join(", ")}<br />{store.data?.phone}</p><p className="operations-form-help">{t("Place of supply: ")}{customer?.state || store.data?.state}</p></div></div></div>
    <div className="card operations-section"><div className="card-header"><h3 className="operations-table-title">{t("Order items")}</h3></div><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Product / HSN")}</th><th>{t("Qty")}</th><th>{t("Unit price")}</th><th>{t("GST")}</th><th>{t("Taxable")}</th><th>{t("Total")}</th></tr></thead><tbody>{item.items.map((line, index) => <tr key={line.id ?? index}><td><div className="operations-product-cell">{line.product && <ProductAvatar name={line.product.name} category={line.product.category?.name}/>}<span><strong>{line.product?.name || line.productId}</strong><small>{line.product?.sku}{t(" \u00B7 HSN ")}{line.product?.hsnCode || "—"}</small></span></div></td><td>{line.quantity}</td><td>{currency(line.unitPrice)}</td><td>{Number(line.gstPercentage)}%</td><td>{currency(line.taxableAmount)}</td><td>{currency(line.total)}</td></tr>)}</tbody></table></TableScroll></div>
    {item.notes && <div className="card operations-detail-card operations-section"><h3 className="operations-form-section-title">{t("Order notes")}</h3><p className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>{item.notes}</p></div>}
    {item.status === "CANCELLED" && <div className="operations-note operations-section">{t("This order has been cancelled. Any previously deducted inventory was returned, and its sales no longer contribute to analytics.")}</div>}</div>
    <div><div className="card operations-detail-card"><h3 className="operations-form-section-title">{t("Payment summary")}</h3>{[["Subtotal", item.subtotal], ["Discount", -Number(item.discount)], ["Taxable amount", item.taxableAmount], ["CGST", item.cgst], ["SGST", item.sgst], ["IGST", item.igst], ["Total tax", item.totalTax]].map(([label, value]) => <div className="operations-summary" key={String(label)}><span className="muted">{t(label)}</span><strong>{currency(Number(value))}</strong></div>)}<div className="operations-summary" style={{ borderTop: "1px solid #e8edef", marginTop: 10, paddingTop: 18, fontSize: 19 }}><strong>{t("Grand total")}</strong><strong>{currency(item.total)}</strong></div><div className="operations-inline" style={{ marginTop: 15 }}><Status value={item.paymentStatus}/><span className="muted" style={{ fontSize: 12 }}>{t(humanize(item.paymentMethod))}</span></div></div>
    <div className="card operations-detail-card operations-section no-print"><h3 className="operations-form-section-title">{t("Manage order")}</h3><div className="operations-dialog-form"><Field label={t("Payment status")}><select className="select" value={item.paymentStatus} disabled={busy || item.status === "CANCELLED"} onChange={event => update({ paymentStatus: event.target.value })}>{paymentStatuses.map(value => <option value={value} key={value}>{t(humanize(value))}</option>)}</select></Field>{(nextStatuses[item.status] || []).length > 0 ? <><Field label={t("Advance order status")}><select className="select" value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("Select next status")}</option>{nextStatuses[item.status].map(value => <option value={value} key={value}>{t(humanize(value))}</option>)}</select></Field><button className="button button-primary" onClick={() => update({ status })} disabled={!status || busy}><CheckCircle2 size={16}/>{busy ? t("Updating…") : t("Update status")}</button><p className="operations-form-help">{t("Confirming reserves this sale by deducting stock. Inventory updates and sale records are saved together.")}</p></> : <p className="operations-form-help">{item.status === "DELIVERED" ? t("This order has been delivered.") : t("This order is closed.")}</p>}</div></div></div></div>}
    <Dialog open={cancel} onOpenChange={setCancel}><DialogContent><DialogHeader><DialogTitle>{t("Cancel ")}{item.orderNumber}?</DialogTitle><DialogDescription>{t("Previously deducted stock will be returned and the sale removed from analytics. This action cannot be undone.")}</DialogDescription></DialogHeader><div className="operations-dialog-footer"><button className="button button-secondary" onClick={() => setCancel(false)}>{t("Keep order")}</button><button className="button button-primary" disabled={busy} onClick={() => update({ status: "CANCELLED" })}>{busy ? t("Cancelling…") : t("Cancel order")}</button></div></DialogContent></Dialog>
    </>}</DataState></>;
}

