"use client";
import { useI18n } from '@/components/language-provider';
import { useForm } from "react-hook-form";
import { useEffect } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from '@/lib/i18n/toast';
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from '@/lib/client';
import { Field, PageResult, Product, Supplier, useResource } from "./shared";
const schema = z.object({ name: z.string().min(2, "Enter a product name"), sku: z.string().min(2, "Enter a unique SKU"), barcode: z.string().optional(), description: z.string().optional(), categoryId: z.string().min(1, "Choose a category"), supplierId: z.string().min(1, "Choose a supplier"), costPrice: z.coerce.number().min(0), sellingPrice: z.coerce.number().min(0), gstPercentage: z.coerce.number().min(0).max(100), hsnCode: z.string().optional(), minStock: z.coerce.number().int().min(0), reorderPoint: z.coerce.number().int().min(0), reorderQuantity: z.coerce.number().int().min(0), initialStock: z.coerce.number().int().min(0), unit: z.string().min(1), status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]) });
type Values = z.infer<typeof schema>;
function ProductForm({ product, onSaved, onCancel }: {
    product?: Product;
    onSaved: () => void;
    onCancel: () => void;
}) {
    const { t } = useI18n();
    const categories = useResource<PageResult<{
        id: string;
        name: string;
    }>>("/api/categories?pageSize=100");
    const suppliers = useResource<PageResult<Supplier>>("/api/suppliers?pageSize=100&status=ACTIVE");
    const settings = useResource<{
        defaultReorderLevel: number;
        gstRates: number[];
    }>('/api/settings');
    const { register, handleSubmit, setValue, getFieldState, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: product?.name ?? "", sku: product?.sku ?? "", barcode: product?.barcode ?? "", description: product?.description ?? "", categoryId: product?.categoryId ?? "", supplierId: product?.supplierId ?? "", costPrice: Number(product?.costPrice ?? 0), sellingPrice: Number(product?.sellingPrice ?? 0), gstPercentage: Number(product?.gstPercentage ?? 0), hsnCode: product?.hsnCode ?? "", minStock: product?.minStock ?? 10, reorderPoint: product?.reorderPoint ?? 20, reorderQuantity: product?.reorderQuantity ?? 50, initialStock: 0, unit: product?.unit ?? "pcs", status: (product?.status as Values["status"]) ?? "ACTIVE" } });
    useEffect(() => {
        if (!product && settings.data && !getFieldState('reorderPoint').isDirty)
            setValue('reorderPoint', settings.data.defaultReorderLevel);
    }, [product, settings.data, setValue, getFieldState]);
    async function submit(values: Values) {
        try {
            await api(`/api/products${product ? `/${product.id}` : ""}`, { method: product ? "PUT" : "POST", body: JSON.stringify(values) });
            toast.success(product ? "Product updated" : "Product added");
            onSaved();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save product");
        }
    }
    return <form onSubmit={handleSubmit(submit)} className="operations-dialog-form"><div className="form-grid">
    <Field label={t("Product name *")} error={errors.name?.message}><input className="input" placeholder={t("e.g. Amul Butter 500g")} {...register("name")}/></Field>
    <Field label={t("SKU *")} error={errors.sku?.message}><input className="input" placeholder={t("e.g. DAIRY-001")} {...register("sku")}/></Field>
    <Field label={t("Category *")} error={errors.categoryId?.message}><select className="select" {...register("categoryId")}><option value="">{t("Select category")}</option>{categories.data?.items.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
    <Field label={t("Supplier *")} error={errors.supplierId?.message}><select className="select" {...register("supplierId")}><option value="">{t("Select supplier")}</option>{suppliers.data?.items.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
    <Field label={t("Cost price (excl. GST)")} error={errors.costPrice?.message}><input className="input" type="number" min="0" step="0.01" {...register("costPrice")}/></Field>
    <Field label={t("Selling price (excl. GST)")} error={errors.sellingPrice?.message}><input className="input" type="number" min="0" step="0.01" {...register("sellingPrice")}/></Field>
    <Field label={t("GST (%)")} error={errors.gstPercentage?.message}><input className="input" type="number" min="0" max="100" step="0.01" list="gst-rates" {...register("gstPercentage")}/><datalist id="gst-rates">{(settings.data?.gstRates || []).map(rate => <option key={rate} value={rate}/>)}</datalist></Field>
    <Field label={t("HSN / SAC code")}><input className="input" {...register("hsnCode")}/></Field>
    <Field label={t("Barcode")}><input className="input" {...register("barcode")}/></Field>
    <Field label={t("Unit")}><select className="select" {...register("unit")}>{["pcs", "kg", "g", "litre", "ml", "packet", "box"].map(unit => <option key={unit} value={unit}>{t(unit)}</option>)}</select></Field>
    <Field label={t("Minimum stock")} error={errors.minStock?.message}><input className="input" type="number" min="0" {...register("minStock")}/></Field>
    <Field label={t("Reorder point")} error={errors.reorderPoint?.message}><input className="input" type="number" min="0" {...register("reorderPoint")}/></Field>
    <Field label={t("Reorder quantity")} error={errors.reorderQuantity?.message}><input className="input" type="number" min="0" {...register("reorderQuantity")}/></Field>
    {!product && <Field label={t("Opening stock")} error={errors.initialStock?.message}><input className="input" type="number" min="0" {...register("initialStock")}/></Field>}
    <Field label={t("Status")}><select className="select" {...register("status")}><option value="ACTIVE">{t("Active")}</option><option value="INACTIVE">{t("Inactive")}</option><option value="DISCONTINUED">{t("Discontinued")}</option></select></Field>
    <Field label={t("Description")} className="operations-wide"><textarea className="input" rows={3} placeholder={t("A little more about this product…")} {...register("description")}/></Field>
  </div>{(categories.error || suppliers.error) && <p className="operations-field-error">{t(categories.error || suppliers.error)}</p>}<div className="operations-dialog-footer"><button type="button" className="button button-secondary" onClick={onCancel}>{t("Cancel")}</button><button type="submit" className="button button-primary" disabled={isSubmitting}>{isSubmitting && <Loader2 size={16} className="animate-spin"/>}{product ? t("Save changes") : t("Add product")}</button></div></form>;
}
export function ProductEditor({ open, product, onOpenChange, onSaved }: {
    open: boolean;
    product?: Product;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent style={{ maxWidth: 700 }}><DialogHeader><DialogTitle>{product ? t("Edit product") : t("Add a new product")}</DialogTitle><DialogDescription>{t("Keep your catalogue, prices and stock thresholds up to date.")}</DialogDescription></DialogHeader><div className="operations-dialog-scroll">{open && <ProductForm product={product} onSaved={() => { onOpenChange(false); onSaved(); }} onCancel={() => onOpenChange(false)}/>}</div></DialogContent></Dialog>;
}
