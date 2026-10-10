"use client";
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from "next/link";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, SlidersHorizontal } from "lucide-react";
import { toast } from '@/lib/i18n/toast';
import { api } from '@/lib/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSession } from "@/components/session-provider";
import { DataState, Field, Movement, Pager, PageResult, Product, ProductAvatar, queryString, SearchField, Status, stockStatus, useDebounce, useResource } from "./shared";
interface InventoryRow {
    id: string;
    currentStock: number;
    reservedStock: number;
    updatedAt: string;
    product: Product;
}
export function StockEditor({ open, product, mode, onOpenChange, onSaved }: {
    open: boolean;
    product?: Product;
    mode: "PURCHASE" | "SALE" | "ADJUSTMENT";
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const { user } = useSession();
    const products = useResource<PageResult<Product>>(open && !product ? "/api/products?pageSize=100&status=ACTIVE" : null);
    const [busy, setBusy] = useState(false);
    const title = mode === "PURCHASE" ? "Receive stock" : mode === "SALE" ? "Stock out" : "Adjust stock";
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        setBusy(true);
        try {
            await api("/api/inventory", { method: "POST", body: JSON.stringify({ productId: product?.id || values.get("productId"), type: values.get("type") || mode, quantity: Number(values.get("quantity")), reference: values.get("reference"), notes: values.get("notes") }) });
            toast.success("Stock updated and movement recorded");
            onOpenChange(false);
            onSaved();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update stock");
        }
        finally {
            setBusy(false);
        }
    }
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t(title)}</DialogTitle><DialogDescription>{product ? t("{0} · {1} {2} currently in stock", [product.name, product.inventory?.currentStock ?? 0, product.unit]) : t("Every stock change is saved in your movement history.")}</DialogDescription></DialogHeader><form onSubmit={submit} className="operations-dialog-form">
    {!product && <Field label={t("Product *")}><select className="select" name="productId" required defaultValue=""><option value="" disabled>{t("Select a product")}</option>{products.data?.items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}</select>{products.error && <span className="operations-field-error">{t(products.error)}</span>}</Field>}
    <div className="form-grid"><Field label={t("Movement type")}><select className="select" name="type" defaultValue={mode}>{(mode === "PURCHASE" ? ["PURCHASE", "RETURN"] : mode === "SALE" ? ["SALE", "DAMAGED"] : user?.role === "STAFF" ? ["ADJUSTMENT"] : ["ADJUSTMENT", "TRANSFER"]).map(type => <option key={type} value={type}>{t(type.toLowerCase().replaceAll("_", " "))}</option>)}</select></Field><Field label={mode === "ADJUSTMENT" ? t("Quantity change (+ / −) *") : t("Quantity *")}><input className="input" name="quantity" type="number" min={mode === "ADJUSTMENT" ? undefined : 1} step="1" required placeholder={mode === "ADJUSTMENT" ? t("e.g. -5 or 20") : t("e.g. 50")}/></Field></div>
    {mode === "ADJUSTMENT" && <p className="operations-form-help">{t("Enter the change in units: +10 adds ten units; \u221210 removes ten units. This is not a replacement stock count.")}</p>}
    <Field label={t("Reference")}><input className="input" name="reference" placeholder={t("Purchase invoice or transfer reference")}/></Field><Field label={t("Notes")}><textarea className="input" name="notes" rows={3} placeholder={t("Reason for this movement")}/></Field><div className="operations-dialog-footer"><button className="button button-secondary" type="button" onClick={() => onOpenChange(false)}>{t("Cancel")}</button><button className="button button-primary" disabled={busy || products.loading && !product}>{busy ? t("Saving…") : t("Save stock movement")}</button></div></form></DialogContent></Dialog>;
}
export default function InventoryPage() {
    const { t, currency, date } = useI18n();
    const { user } = useSession();
    const canAdjust = user?.role !== "STAFF";
    const [search, setSearch] = useState("");
    const q = useDebounce(search);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<Product>();
    const [mode, setMode] = useState<"PURCHASE" | "SALE" | "ADJUSTMENT">("PURCHASE");
    const inventory = useResource<PageResult<InventoryRow>>(`/api/inventory?${queryString({ q, page, pageSize: 10, status, categoryId })}`);
    const categories = useResource<PageResult<{
        id: string;
        name: string;
    }>>("/api/categories?pageSize=100");
    function edit(action: typeof mode, product?: Product) { setMode(action); setSelected(product); setOpen(true); }
    return <><div className="page-heading"><div><h1 className="page-title">{t("Inventory")}</h1><p className="page-subtitle">{t("A clear view of what\u2019s on your shelves, and what needs attention.")}</p></div><div className="operations-inline"><Link className="button button-secondary" href="/inventory/movements"><History size={16}/>{t("Stock history")}</Link><button className="button button-primary" onClick={() => edit("PURCHASE")}><ArrowDownToLine size={17}/>{t("Receive stock")}</button></div></div>
    <div className="card"><div className="toolbar"><SearchField value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search inventory by product or SKU…")}/><div className="operations-toolbar-right"><select className="select" value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }} aria-label={t("Category")}><option value="">{t("All categories")}</option>{categories.data?.items.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select className="select" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} aria-label={t("Stock status")}><option value="">{t("All stock levels")}</option><option value="IN_STOCK">{t("In stock")}</option><option value="LOW_STOCK">{t("Low stock")}</option><option value="OUT_OF_STOCK">{t("Out of stock")}</option><option value="OVERSTOCK">{t("Overstock")}</option></select></div></div>
    <DataState loading={inventory.loading} error={inventory.error} empty={!inventory.data?.items.length} onRetry={inventory.refresh}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Product")}</th><th>{t("Category")}</th><th>{t("On hand")}</th><th>{t("Reserved")}</th><th>{t("Available")}</th><th>{t("Reorder at")}</th><th>{t("Status")}</th><th>{t("Stock value")}</th><th>{t("Updated")}</th><th>{t("Actions")}</th></tr></thead><tbody>{inventory.data?.items.map(row => { const product = { ...row.product, inventory: { currentStock: row.currentStock, reservedStock: row.reservedStock, updatedAt: row.updatedAt } }; return <tr key={row.id}><td><Link className="operations-product-cell" href={`/products/${product.id}`}><ProductAvatar name={product.name} category={product.category?.name}/><span><strong>{product.name}</strong><small>{product.sku}</small></span></Link></td><td className="muted">{product.category?.name}</td><td>{row.currentStock}<div className="operations-stock-bar" data-low={row.currentStock <= product.reorderPoint}><span style={{ width: `${Math.min(100, row.currentStock / Math.max(1, product.reorderPoint * 3) * 100)}%` }}/></div></td><td className="muted">{row.reservedStock}</td><td><strong>{row.currentStock - row.reservedStock}</strong></td><td className="muted">{product.reorderPoint}</td><td><Status value={stockStatus(product)}/></td><td>{currency(row.currentStock * Number(product.costPrice))}</td><td className="muted" style={{ whiteSpace: "nowrap" }}>{date(row.updatedAt)}</td><td><div className="operations-actions"><button title={t("Stock in")} aria-label={t("Receive {0}", [product.name])} className="operations-icon-button" onClick={() => edit("PURCHASE", product)}><ArrowDownToLine size={16}/></button><button title={t("Stock out")} aria-label={t("Stock out {0}", [product.name])} className="operations-icon-button" onClick={() => edit("SALE", product)}><ArrowUpFromLine size={16}/></button>{canAdjust && <button title={t("Adjust stock")} aria-label={t("Adjust {0}", [product.name])} className="operations-icon-button" onClick={() => edit("ADJUSTMENT", product)}><SlidersHorizontal size={16}/></button>}<Link title={t("Stock history")} aria-label={t("History for {0}", [product.name])} className="operations-icon-button" href={`/inventory/movements?productId=${product.id}`}><History size={16}/></Link></div></td></tr>; })}</tbody></table></TableScroll></DataState><Pager page={page} total={inventory.data?.total ?? 0} onChange={setPage}/></div>
    <div className="operations-note operations-section">{t("Available stock = on-hand stock \u2212 reserved stock. Inventory value uses each product\u2019s cost price.")}</div><StockEditor open={open} product={selected} mode={mode} onOpenChange={setOpen} onSaved={inventory.refresh}/></>;
}
export function MovementsPage({ initialProductId = "" }: {
    initialProductId?: string;
}) {
    const { t, date } = useI18n();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const q = useDebounce(search);
    const [type, setType] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const movements = useResource<PageResult<Movement>>(`/api/movements?${queryString({ page, pageSize: 15, q, type, productId: initialProductId, dateFrom, dateTo })}`);
    return <><Link href="/inventory" className="operations-back">{t("\u2190 Back to inventory")}</Link><div className="page-heading"><div><h1 className="page-title">{t("Stock movements")}</h1><p className="page-subtitle">{t("A complete audit trail of every unit that comes in or goes out.")}</p></div></div><div className="card"><div className="toolbar"><SearchField value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search products or references…")}/><select className="select" aria-label={t("Movement type")} value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">{t("All movements")}</option>{["PURCHASE", "SALE", "RETURN", "ADJUSTMENT", "DAMAGED", "TRANSFER"].map(value => <option key={value} value={value}>{t(value.toLowerCase())}</option>)}</select><input className="input" type="date" aria-label={t("From date")} value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }}/><span className="muted">{t("to")}</span><input className="input" type="date" aria-label={t("To date")} min={dateFrom} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }}/></div><DataState loading={movements.loading} error={movements.error} empty={!movements.data?.items.length} onRetry={movements.refresh}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Date")}</th><th>{t("Product")}</th><th>{t("Type")}</th><th>{t("Change")}</th><th>{t("Before \u2192 After")}</th><th>{t("Reference")}</th><th>{t("Recorded by")}</th><th>{t("Notes")}</th></tr></thead><tbody>{movements.data?.items.map(movement => <tr key={movement.id}><td style={{ whiteSpace: "nowrap" }}>{date(movement.createdAt)}</td><td><Link className="operations-link" href={`/products/${movement.product.id}`}>{movement.product.name}</Link><small className="muted" style={{ display: "block" }}>{movement.product.sku}</small></td><td><Status value={movement.type}/></td><td style={{ color: movement.newStock >= movement.previousStock ? "#168461" : "#ce6561", fontWeight: 600 }}>{movement.newStock > movement.previousStock ? "+" : ""}{movement.newStock - movement.previousStock}</td><td>{movement.previousStock} <span className="muted">→</span> {movement.newStock}</td><td className="muted">{movement.reference || "—"}</td><td>{movement.user?.name || t("System")}</td><td className="muted" style={{ maxWidth: 240 }}>{movement.notes || "—"}</td></tr>)}</tbody></table></TableScroll></DataState><Pager page={page} total={movements.data?.total ?? 0} pageSize={15} onChange={setPage}/></div></>;
}
