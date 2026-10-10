"use client";
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from "next/link";
import { useState } from "react";
import { Archive, ArrowUpDown, Boxes, Eye, PackagePlus, Pencil, Plus, Tag } from "lucide-react";
import { toast } from '@/lib/i18n/toast';
import { api } from '@/lib/client';
import { useSession } from "@/components/session-provider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataState, Field, Pager, PageResult, Product, ProductAvatar, queryString, SearchField, Status, useDebounce, useResource } from "./shared";
import { ProductEditor } from "./product-editor";
export default function ProductsPage() {
    const { t, currency } = useI18n();
    const { user } = useSession();
    const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
    const [search, setSearch] = useState("");
    const q = useDebounce(search);
    const [page, setPage] = useState(1);
    const [categoryId, setCategoryId] = useState("");
    const [status, setStatus] = useState("");
    const [sortOrder, setSortOrder] = useState("asc");
    const [editor, setEditor] = useState(false);
    const [selected, setSelected] = useState<Product>();
    const [archive, setArchive] = useState<Product>();
    const [busy, setBusy] = useState(false);
    const [categoryDialog, setCategoryDialog] = useState(false);
    const [categoryName, setCategoryName] = useState("");
    const products = useResource<PageResult<Product>>(`/api/products?${queryString({ q, page, pageSize: 10, categoryId, status, sortBy: "name", sortOrder })}`);
    const categories = useResource<PageResult<{
        id: string;
        name: string;
    }>>("/api/categories?pageSize=100");
    async function archiveProduct() {
        if (!archive)
            return;
        setBusy(true);
        try {
            await api(`/api/products/${archive.id}`, { method: "DELETE" });
            toast.success("Product archived");
            setArchive(undefined);
            products.refresh();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to archive product");
        }
        finally {
            setBusy(false);
        }
    }
    async function addCategory(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await api("/api/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) });
            toast.success("Category added");
            setCategoryDialog(false);
            setCategoryName("");
            categories.refresh();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to add category");
        }
        finally {
            setBusy(false);
        }
    }
    return <><div className="page-heading"><div><div className="operations-inline"><h1 className="page-title">{t("Products")}</h1>{products.data && <span className="badge">{products.data.total}{t(" products")}</span>}</div><p className="page-subtitle">{t("Your product catalogue, organised and always up to date.")}</p></div>{canManage && <div className="operations-inline"><button className="button button-secondary" onClick={() => setCategoryDialog(true)}><Tag size={16}/>{t("Add category")}</button><button className="button button-primary" onClick={() => { setSelected(undefined); setEditor(true); }}><Plus size={17}/>{t("Add product")}</button></div>}</div>
    <div className="card"><div className="toolbar"><SearchField value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search by product name, SKU or barcode…")}/><div className="operations-toolbar-right"><select className="select" aria-label={t("Filter by category")} value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }}><option value="">{t("All categories")}</option>{categories.data?.items.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select className="select" aria-label={t("Filter by status")} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">{t("All statuses")}</option><option value="ACTIVE">{t("Active")}</option><option value="INACTIVE">{t("Inactive")}</option><option value="DISCONTINUED">{t("Discontinued")}</option></select><button className="button button-secondary" onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); setPage(1); }}><ArrowUpDown size={15}/>{sortOrder === "asc" ? t("A–Z") : t("Z–A")}</button></div></div>
      <DataState loading={products.loading} error={products.error} empty={!products.data?.items.length} onRetry={products.refresh}><TableScroll className="table-wrap"><table className="data-table"><thead><tr><th>{t("Product")}</th><th>{t("Category")}</th><th>{t("Selling price")}</th><th>{t("In stock")}</th><th>{t("Supplier")}</th><th>{t("Status")}</th><th>{t("Actions")}</th></tr></thead><tbody>{products.data?.items.map(product => <tr key={product.id}><td><Link className="operations-product-cell" href={`/products/${product.id}`}><ProductAvatar name={product.name} category={product.category?.name}/><span><strong>{product.name}</strong><small>{product.sku}</small></span></Link></td><td><span className="muted">{product.category?.name}</span></td><td className="operations-number">{currency(Number(product.sellingPrice))}<small className="muted" style={{ display: "block", fontSize: 11, marginTop: 3 }}>{t("GST ")}{Number(product.gstPercentage)}%</small></td><td><span className={(product.inventory?.currentStock ?? 0) <= product.reorderPoint ? "operations-low-stock" : ""}>{product.inventory?.currentStock ?? 0}</span> <span className="muted">{product.unit}</span></td><td className="muted">{product.supplier?.name}</td><td><Status value={product.status}/></td><td><div className="operations-actions"><Link className="operations-icon-button" href={`/products/${product.id}`} aria-label={t("View {0}", [product.name])}><Eye size={16}/></Link>{canManage && <><button title={t("Edit {0}", [product.name])} className="operations-icon-button" aria-label={t("Edit {0}", [product.name])} onClick={() => { setSelected(product); setEditor(true); }}><Pencil size={15}/></button><button title={t("Archive {0}", [product.name])} className="operations-icon-button" aria-label={t("Archive {0}", [product.name])} onClick={() => setArchive(product)} disabled={product.status === "INACTIVE"}><Archive size={15}/></button></>}</div></td></tr>)}</tbody></table></TableScroll></DataState>
      <Pager page={page} total={products.data?.total ?? 0} onChange={setPage}/></div><div className="operations-note operations-section operations-inline"><Boxes size={18}/><span>{t("Stock levels update automatically when orders are confirmed. Manage stock receipts and adjustments in ")}<Link className="operations-link" href="/inventory">{t("Inventory")}</Link>.</span></div>
    <ProductEditor open={editor} product={selected} onOpenChange={setEditor} onSaved={products.refresh}/>
    <Dialog open={!!archive} onOpenChange={open => {
            if (!open)
                setArchive(undefined);
        }}><DialogContent><DialogHeader><DialogTitle>{t("Archive ")}{archive?.name}?</DialogTitle><DialogDescription>{t("This product will become inactive. Its sales and stock movement history will remain available.")}</DialogDescription></DialogHeader><div className="operations-dialog-footer"><button className="button button-secondary" onClick={() => setArchive(undefined)}>{t("Keep product")}</button><button className="button button-primary" onClick={archiveProduct} disabled={busy}>{t("Archive product")}</button></div></DialogContent></Dialog>
    <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}><DialogContent><DialogHeader><DialogTitle>{t("Add category")}</DialogTitle><DialogDescription>{t("Organise products into a useful group.")}</DialogDescription></DialogHeader><form className="operations-dialog-form" onSubmit={addCategory}><Field label={t("Category name")}><input className="input" minLength={2} required value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder={t("e.g. Organic Foods")}/></Field><div className="operations-dialog-footer"><button className="button button-secondary" type="button" onClick={() => setCategoryDialog(false)}>{t("Cancel")}</button><button className="button button-primary" disabled={busy}><PackagePlus size={16}/>{t("Add category")}</button></div></form></DialogContent></Dialog>
  </>;
}
