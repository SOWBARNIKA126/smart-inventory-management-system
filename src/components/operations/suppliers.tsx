"use client";
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from "next/link";
import { useState } from "react";
import { Archive, ArrowLeft, ArrowUpRight, MapPin, Pencil, Plus, Truck } from "lucide-react";
import { toast } from '@/lib/i18n/toast';
import { api } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataState, Field, Pager, PageResult, ProductAvatar, queryString, SearchField, Status, Supplier, useDebounce, useResource } from "./shared";
import { indianStates } from "./order-form";
export function SupplierEditor({ open, supplier, onOpenChange, onSaved }: {
    open: boolean;
    supplier?: Supplier;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const [busy, setBusy] = useState(false);
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true);
        try {
            await api(`/api/suppliers${supplier ? `/${supplier.id}` : ""}`, { method: supplier ? "PUT" : "POST", body: JSON.stringify({ ...data, leadTimeDays: Number(data.leadTimeDays) }) });
            toast.success(supplier ? "Supplier updated" : "Supplier added");
            onOpenChange(false);
            onSaved();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save supplier");
        }
        finally {
            setBusy(false);
        }
    }
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent style={{ maxWidth: 680 }}><DialogHeader><DialogTitle>{supplier ? t("Edit supplier") : t("Add supplier")}</DialogTitle><DialogDescription>{t("Contact details and lead times help keep your shelves stocked.")}</DialogDescription></DialogHeader><div className="operations-dialog-scroll">{open && <form onSubmit={submit} className="operations-dialog-form"><div className="form-grid"><Field label={t("Supplier name *")}><input className="input" name="name" defaultValue={supplier?.name} required minLength={2} placeholder={t("e.g. Chennai Wholesale Traders")}/></Field><Field label={t("Contact person")}><input className="input" name="contactPerson" defaultValue={supplier?.contactPerson}/></Field><Field label={t("Phone")}><input className="input" name="phone" defaultValue={supplier?.phone} placeholder={"+91 98765 43210"}/></Field><Field label={t("Email")}><input className="input" type="email" name="email" defaultValue={supplier?.email}/></Field><Field label={t("Address line")} className="operations-wide"><input className="input" name="addressLine" defaultValue={supplier?.addressLine}/></Field><Field label={t("Area / locality")}><input className="input" name="area" defaultValue={supplier?.area}/></Field><Field label={t("City")}><input className="input" name="city" defaultValue={supplier?.city}/></Field><Field label={t("State")}><select className="select" name="state" defaultValue={supplier?.state || "Tamil Nadu"}>{indianStates.map(state => <option key={state} value={state}>{t(state)}</option>)}</select></Field><Field label={t("PIN code")}><input className="input" name="pinCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={supplier?.pinCode}/></Field><Field label={t("Country")}><input className="input" name="country" defaultValue={supplier?.country || "India"}/></Field><Field label={t("GSTIN")}><input className="input" name="gstin" defaultValue={supplier?.gstin} maxLength={15} placeholder={t("15-character GSTIN")}/></Field><Field label={t("Lead time (days)")}><input className="input" type="number" name="leadTimeDays" min="0" max="365" required defaultValue={supplier?.leadTimeDays ?? 5}/></Field><Field label={t("Status")}><select className="select" name="status" defaultValue={supplier?.status || "ACTIVE"}><option value="ACTIVE">{t("Active")}</option><option value="INACTIVE">{t("Inactive")}</option></select></Field><Field label={t("Notes")} className="operations-wide"><textarea className="input" name="notes" rows={3} defaultValue={supplier?.notes}/></Field></div><div className="operations-dialog-footer"><button className="button button-secondary" type="button" onClick={() => onOpenChange(false)}>{t("Cancel")}</button><button className="button button-primary" disabled={busy}>{busy ? t("Saving…") : supplier ? t("Save changes") : t("Add supplier")}</button></div></form>}</div></DialogContent></Dialog>;
}
export default function SuppliersPage() {
    const { t } = useI18n();
    const [search, setSearch] = useState("");
    const q = useDebounce(search);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [editor, setEditor] = useState(false);
    const [selected, setSelected] = useState<Supplier>();
    const [archive, setArchive] = useState<Supplier>();
    const [busy, setBusy] = useState(false);
    const suppliers = useResource<PageResult<Supplier>>(`/api/suppliers?${queryString({ q, page, pageSize: 10, status })}`);
    async function archiveSupplier() {
        if (!archive)
            return;
        setBusy(true);
        try {
            await api(`/api/suppliers/${archive.id}`, { method: "DELETE" });
            toast.success("Supplier archived");
            setArchive(undefined);
            suppliers.refresh();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to archive supplier");
        }
        finally {
            setBusy(false);
        }
    }
    return <><div className="page-heading"><div><h1 className="page-title">{t("Suppliers")}</h1><p className="page-subtitle">{t("The partners behind your products. Keep every connection organised.")}</p></div><button className="button button-primary" onClick={() => { setSelected(undefined); setEditor(true); }}><Plus size={17}/>{t("Add supplier")}</button></div><div className="card"><div className="toolbar"><SearchField value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search suppliers, contacts or cities…")}/><div className="operations-toolbar-right"><select className="select" aria-label={t("Supplier status")} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">{t("All statuses")}</option><option value="ACTIVE">{t("Active")}</option><option value="INACTIVE">{t("Inactive")}</option></select></div></div><DataState loading={suppliers.loading} error={suppliers.error} empty={!suppliers.data?.items.length} onRetry={suppliers.refresh}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Supplier")}</th><th>{t("Contact person")}</th><th>{t("Phone / email")}</th><th>{t("Location")}</th><th>{t("Lead time")}</th><th>{t("Status")}</th><th>{t("Actions")}</th></tr></thead><tbody>{suppliers.data?.items.map(supplier => <tr key={supplier.id}><td><Link className="operations-product-cell" href={`/suppliers/${supplier.id}`}><span className="operations-product-avatar"><Truck size={18}/></span><span><strong>{supplier.name}</strong><small>{supplier.gstin || t("GSTIN not provided")}</small></span></Link></td><td>{supplier.contactPerson || "—"}</td><td><span>{supplier.phone || "—"}</span><small className="muted" style={{ display: "block", marginTop: 4 }}>{supplier.email}</small></td><td className="muted">{supplier.city || "—"}<small style={{ display: "block", marginTop: 4 }}>{supplier.state}</small></td><td><span className="badge">{supplier.leadTimeDays}{t(" days")}</span></td><td><Status value={supplier.status}/></td><td><div className="operations-actions"><Link className="operations-icon-button" href={`/suppliers/${supplier.id}`} aria-label={t("View {0}", [supplier.name])}><ArrowUpRight size={16}/></Link><button title={t("Edit {0}", [supplier.name])} className="operations-icon-button" aria-label={t("Edit {0}", [supplier.name])} onClick={() => { setSelected(supplier); setEditor(true); }}><Pencil size={15}/></button><button title={t("Archive {0}", [supplier.name])} className="operations-icon-button" aria-label={t("Archive {0}", [supplier.name])} disabled={supplier.status === "INACTIVE"} onClick={() => setArchive(supplier)}><Archive size={15}/></button></div></td></tr>)}</tbody></table></TableScroll></DataState><Pager page={page} total={suppliers.data?.total ?? 0} onChange={setPage}/></div><SupplierEditor open={editor} supplier={selected} onOpenChange={setEditor} onSaved={suppliers.refresh}/><Dialog open={!!archive} onOpenChange={open => {
            if (!open)
                setArchive(undefined);
        }}><DialogContent><DialogHeader><DialogTitle>{t("Archive ")}{archive?.name}?</DialogTitle><DialogDescription>{t("The supplier will become inactive. Existing products and purchase history will remain available.")}</DialogDescription></DialogHeader><div className="operations-dialog-footer"><button className="button button-secondary" onClick={() => setArchive(undefined)}>{t("Keep supplier")}</button><button className="button button-primary" disabled={busy} onClick={archiveSupplier}>{t("Archive supplier")}</button></div></DialogContent></Dialog></>;
}
export function SupplierDetail({ id }: {
    id: string;
}) {
    const { t, currency, date } = useI18n();
    const supplier = useResource<Supplier>(`/api/suppliers/${id}`);
    const [editing, setEditing] = useState(false);
    const item = supplier.data;
    return <><Link href="/suppliers" className="operations-back"><ArrowLeft size={15}/>{t("All suppliers")}</Link><DataState loading={supplier.loading} error={supplier.error} onRetry={supplier.refresh}>{item && <><div className="page-heading"><div><div className="operations-inline"><h1 className="page-title">{item.name}</h1><Status value={item.status}/></div><p className="page-subtitle">{item.city}, {item.state}</p></div><button className="button button-primary" onClick={() => setEditing(true)}><Pencil size={16}/>{t("Edit supplier")}</button></div><div className="operations-metric-row" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}><div className="card"><p className="operations-stat-label">{t("Products supplied")}</p><p className="operations-stat-value">{item.products?.length ?? 0}</p></div><div className="card"><p className="operations-stat-label">{t("Current inventory value")}</p><p className="operations-stat-value">{currency(item.inventoryValue ?? item.products?.reduce((sum, product) => sum + Number(product.costPrice) * (product.inventory?.currentStock ?? 0), 0) ?? 0)}</p></div><div className="card"><p className="operations-stat-label">{t("Supplier lead time")}</p><p className="operations-stat-value">{item.leadTimeDays} <span className="muted" style={{ fontSize: 14 }}>{t("days")}</span></p></div></div><div className="card operations-detail-card"><h3 className="operations-form-section-title">{t("Contact & business details")}</h3><dl className="operations-detail-grid">{[["Contact person", item.contactPerson], ["Phone", item.phone], ["Email", item.email], ["GSTIN", item.gstin], ["Address", [item.addressLine, item.area, item.city, item.state, item.pinCode, item.country].filter(Boolean).join(", ")], ["Notes", item.notes]].map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value || "—"}</dd></div>)}</dl></div><div className="card operations-section"><div className="card-header"><h3 className="operations-table-title">{t("Products supplied")}</h3><span className="badge">{item.products?.length ?? 0}</span></div><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Product")}</th><th>{t("Category")}</th><th>{t("Cost price")}</th><th>{t("Current stock")}</th><th>{t("Inventory value")}</th><th>{t("Status")}</th></tr></thead><tbody>{item.products?.map(product => <tr key={product.id}><td><Link className="operations-product-cell" href={`/products/${product.id}`}><ProductAvatar name={product.name} category={product.category?.name}/><span><strong>{product.name}</strong><small>{product.sku}</small></span></Link></td><td className="muted">{product.category?.name}</td><td>{currency(product.costPrice)}</td><td>{product.inventory?.currentStock ?? 0} {product.unit}</td><td>{currency(Number(product.costPrice) * (product.inventory?.currentStock ?? 0))}</td><td><Status value={product.status}/></td></tr>)}</tbody></table>{!item.products?.length && <div className="operations-empty-small">{t("No products assigned to this supplier yet.")}</div>}</TableScroll></div><div className="card operations-section"><div className="card-header"><h3 className="operations-table-title">{t("Recent purchase history")}</h3><MapPin size={16} className="muted"/></div><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Date")}</th><th>{t("Product")}</th><th>{t("Quantity")}</th><th>{t("Reference")}</th><th>{t("Notes")}</th></tr></thead><tbody>{item.purchaseHistory?.map(movement => <tr key={movement.id}><td>{date(movement.createdAt)}</td><td>{movement.product?.name}</td><td style={{ color: "#168461", fontWeight: 600 }}>+{movement.newStock - movement.previousStock}</td><td className="muted">{movement.reference || "—"}</td><td className="muted">{movement.notes || "—"}</td></tr>)}</tbody></table>{!item.purchaseHistory?.length && <div className="operations-empty-small">{t("No purchase receipts recorded yet.")}</div>}</TableScroll></div><SupplierEditor open={editing} supplier={item} onOpenChange={setEditing} onSaved={supplier.refresh}/></>}</DataState></>;
}
