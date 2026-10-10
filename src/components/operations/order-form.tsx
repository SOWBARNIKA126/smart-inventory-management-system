"use client";
import {TableScroll} from '@/components/shared';
import { useI18n } from '@/components/language-provider';
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, Save, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from '@/lib/i18n/toast';
import { api } from '@/lib/client';
import { Field, Order, PageResult, Product, useResource } from "./shared";
const schema = z.object({ customer: z.object({ name: z.string().min(2, "Enter the customer’s name"), phone: z.string().max(30), email: z.union([z.string().email("Enter a valid email"), z.literal("")]), addressLine: z.string(), area: z.string(), city: z.string(), state: z.string().min(1, "State is required for GST calculation"), pinCode: z.union([z.string().regex(/^\d{6}$/, "Enter a six-digit PIN"), z.literal("")]), country: z.string(), gstin: z.string() }), items: z.array(z.object({ productId: z.string().min(1, "Choose a product"), quantity: z.coerce.number().int().min(1), unitPrice: z.coerce.number().min(0), gstPercentage: z.coerce.number().min(0).max(100) })).min(1), discount: z.coerce.number().min(0), status: z.enum(["PENDING", "CONFIRMED"]), paymentMethod: z.enum(["CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER"]), paymentStatus: z.enum(["PENDING", "PAID", "PARTIALLY_PAID", "REFUNDED"]), notes: z.string() }).refine(values => values.discount <= values.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), { message: "Discount cannot exceed the subtotal", path: ["discount"] }).refine(values => new Set(values.items.map(item => item.productId)).size === values.items.length, { message: "Each product can appear only once. Update its quantity instead.", path: ["items"] });
type Values = z.infer<typeof schema>;
export const paymentMethods = ["CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER"];
export const paymentStatuses = ["PENDING", "PAID", "PARTIALLY_PAID", "REFUNDED"];
export const orderStatuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
export const humanize = (value: string) => value.toLowerCase().replaceAll("_", " ");
interface Store {
    storeName: string;
    state: string;
    gstin?: string;
    currency?: string;
    addressLine?: string;
    city?: string;
    pinCode?: string;
    phone?: string;
}
export default function OrderForm({ order, onSaved, onCancel }: {
    order?: Order;
    onSaved?: () => void;
    onCancel?: () => void;
}) {
    const { t, currency } = useI18n();
    const router = useRouter();
    const products = useResource<PageResult<Product>>("/api/products?pageSize=100&status=ACTIVE");
    const store = useResource<Store>("/api/settings");
    const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { customer: { name: order?.customer?.name ?? "", phone: order?.customer?.phone ?? "", email: order?.customer?.email ?? "", addressLine: order?.customer?.addressLine ?? "", area: order?.customer?.area ?? "", city: order?.customer?.city ?? "", state: order?.customer?.state ?? "Tamil Nadu", pinCode: order?.customer?.pinCode ?? "", country: order?.customer?.country ?? "India", gstin: order?.customer?.gstin ?? "" }, items: order?.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitPrice: Number(item.unitPrice), gstPercentage: Number(item.gstPercentage) })) ?? [{ productId: "", quantity: 1, unitPrice: 0, gstPercentage: 0 }], discount: Number(order?.discount ?? 0), status: "PENDING", paymentMethod: (order?.paymentMethod as Values["paymentMethod"]) ?? "UPI", paymentStatus: (order?.paymentStatus as Values["paymentStatus"]) ?? "PENDING", notes: order?.notes ?? "" } });
    const { fields, append, remove } = useFieldArray({ control, name: "items" });
    const values = watch();
    const subtotal = values.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const discount = Number(values.discount || 0);
    const discountRatio = subtotal > 0 ? Math.max(0, subtotal - discount) / subtotal : 0;
    const tax = values.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0) * discountRatio * Number(item.gstPercentage || 0) / 100, 0);
    const interstate = values.customer.state.trim().toLowerCase() !== (store.data?.state ?? "Tamil Nadu").trim().toLowerCase();
    async function submit(data: Values) {
        try {
            const saved = await api<Order>(`/api/orders${order ? `/${order.id}` : ""}`, { method: order ? "PUT" : "POST", body: JSON.stringify(data) });
            toast.success(order ? "Order updated" : "Order created");
            if (onSaved)
                onSaved();
            else
                router.push(`/orders/${saved.id}`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save order");
        }
    }
    return <>{!order && <><Link className="operations-back" href="/orders"><ArrowLeft size={15}/>{t("All orders")}</Link><div className="page-heading"><div><h1 className="page-title">{t("Create order")}</h1><p className="page-subtitle">{t("Add customer details and products. We\u2019ll take care of the totals.")}</p></div></div></>}<form onSubmit={handleSubmit(submit)}><div className="operations-two-columns"><div><div className="card operations-detail-card"><h3 className="operations-form-section-title">{t("Customer details")}</h3><div className="form-grid"><Field label={t("Customer name *")} error={errors.customer?.name?.message}><input className="input" placeholder={t("Full name")} {...register("customer.name")}/></Field><Field label={t("Phone")}><input className="input" placeholder={"+91 98765 43210"} {...register("customer.phone")}/></Field><Field label={t("Email")} error={errors.customer?.email?.message}><input className="input" placeholder={t("customer@example.com")} {...register("customer.email")}/></Field><Field label={t("Customer GSTIN")}><input className="input" placeholder={t("Optional, for business customers")} {...register("customer.gstin")}/></Field><Field label={t("Address line")} className="operations-wide"><input className="input" placeholder={t("House / building number and street")} {...register("customer.addressLine")}/></Field><Field label={t("Area / locality")}><input className="input" {...register("customer.area")}/></Field><Field label={t("City")}><input className="input" {...register("customer.city")}/></Field><Field label={t("State *")} error={errors.customer?.state?.message}><select className="select" {...register("customer.state")}><option value="">{t("Select state")}</option>{indianStates.map(state => <option key={state} value={state}>{t(state)}</option>)}</select></Field><Field label={t("PIN code")} error={errors.customer?.pinCode?.message}><input className="input" inputMode="numeric" maxLength={6} {...register("customer.pinCode")}/></Field><Field label={t("Country")}><input className="input" {...register("customer.country")}/></Field></div></div>
    <div className="card operations-detail-card operations-section"><div className="operations-chart-heading"><h3>{t("Order items")}</h3><span className="muted" style={{ fontSize: 12 }}>{t(fields.length === 1 ? "{0} item" : "{0} items", [fields.length])}</span></div><TableScroll className="table-wrap operations-line-items"><table className="data-table"><thead><tr><th>{t("Product")}</th><th>{t("Qty")}</th><th>{t("Price")}</th><th>{t("GST %")}</th><th>{t("Amount")}</th><th><span className="sr-only">{t("Actions")}</span></th></tr></thead><tbody>{fields.map((field, index) => <tr key={field.id}><td><select className="select" aria-label={t("Product for item {0}", [index + 1])} aria-invalid={!!errors.items?.[index]?.productId} aria-describedby={errors.items?.[index]?.productId ? `item-${index}-error` : undefined} {...register(`items.${index}.productId`)} onChange={event => {
                setValue(`items.${index}.productId`, event.target.value, { shouldValidate: true });
                const product = products.data?.items.find(item => item.id === event.target.value);
                if (product) {
                    setValue(`items.${index}.unitPrice`, Number(product.sellingPrice));
                    setValue(`items.${index}.gstPercentage`, Number(product.gstPercentage));
                }
            }}><option value="">{t("Select product")}</option>{products.data?.items.map(product => <option key={product.id} value={product.id}>{product.name} · {product.inventory?.currentStock ?? 0}{t(" available")}</option>)}{order?.items.filter(item => !products.data?.items.some(product => product.id === item.productId)).map(item => <option key={item.productId} value={item.productId}>{item.product?.name}</option>)}</select>{errors.items?.[index]?.productId && <span id={`item-${index}-error`} className="operations-field-error" role="alert">{t(errors.items[index]?.productId?.message)}</span>}</td><td><input className="input" aria-label={t("Quantity for item {0}", [index + 1])} type="number" min="1" step="1" {...register(`items.${index}.quantity`)}/></td><td><input className="input" aria-label={t("Unit price for item {0}", [index + 1])} type="number" min="0" step="0.01" {...register(`items.${index}.unitPrice`)}/></td><td><input className="input" aria-label={t("GST for item {0}", [index + 1])} type="number" min="0" max="100" step="0.01" {...register(`items.${index}.gstPercentage`)}/></td><td style={{ whiteSpace: "nowrap" }}>{currency(Number(values.items[index]?.quantity || 0) * Number(values.items[index]?.unitPrice || 0))}</td><td><button title={t("Remove item {0}", [index + 1])} type="button" className="operations-icon-button" aria-label={t("Remove item {0}", [index + 1])} onClick={() => remove(index)} disabled={fields.length === 1}><Trash2 size={16}/></button></td></tr>)}</tbody></table></TableScroll>{errors.items?.message && <p className="operations-field-error">{t(errors.items.message)}</p>}{errors.items?.root?.message && <p className="operations-field-error">{t(errors.items.root.message)}</p>}{products.error && <p className="operations-field-error">{t(products.error)}</p>}<button type="button" className="button button-secondary operations-top-gap" onClick={() => append({ productId: "", quantity: 1, unitPrice: 0, gstPercentage: 0 })}><Plus size={16}/>{t("Add item")}</button></div>
    <div className="card operations-detail-card operations-section"><Field label={t("Order notes")}><textarea className="input" rows={3} {...register("notes")} placeholder={t("Delivery instructions or an internal note…")}/></Field></div></div>
    <div><div className="card operations-detail-card"><h3 className="operations-form-section-title">{t("Order summary")}</h3><div className="operations-summary"><span className="muted">{t("Subtotal")}</span><strong>{currency(subtotal)}</strong></div><Field label={t("Discount amount")} error={errors.discount?.message}><input className="input" type="number" min="0" max={subtotal} step="0.01" {...register("discount")}/></Field><div className="operations-summary"><span className="muted">{t("Taxable amount")}</span><strong>{currency(Math.max(0, subtotal - discount))}</strong></div>{interstate ? <div className="operations-summary"><span className="muted">{t("IGST")}</span><strong>{currency(tax)}</strong></div> : <><div className="operations-summary"><span className="muted">{t("CGST")}</span><strong>{currency(tax / 2)}</strong></div><div className="operations-summary"><span className="muted">{t("SGST")}</span><strong>{currency(tax / 2)}</strong></div></>}<div className="operations-summary" style={{ borderTop: "1px solid #e9edef", marginTop: 10, paddingTop: 20, fontSize: 18 }}><strong>{t("Total")}</strong><strong>{currency(Math.max(0, subtotal - discount) + tax)}</strong></div><p className="operations-form-help">{interstate ? t("Inter-state supply: IGST applies.") : t("Intra-state supply: CGST and SGST apply.")}{t(" Final totals are calculated and rounded by the server.")}</p></div>
    <div className="card operations-detail-card operations-section"><h3 className="operations-form-section-title">{t("Payment & fulfilment")}</h3><div className="operations-dialog-form"><Field label={t("Payment method")}><select className="select" {...register("paymentMethod")}>{paymentMethods.map(method => <option key={method} value={method}>{t(humanize(method))}</option>)}</select></Field><Field label={t("Payment status")}><select className="select" {...register("paymentStatus")}>{paymentStatuses.map(status => <option key={status} value={status}>{t(humanize(status))}</option>)}</select></Field><Field label={t("Order status")}><select className="select" {...register("status")}><option value="PENDING">{t("Pending \u00B7 save without stock deduction")}</option><option value="CONFIRMED">{t("Confirmed \u00B7 deduct stock now")}</option></select></Field><div className="operations-note"><ShoppingBag size={17} style={{ marginBottom: 5 }}/><div>{t("Confirming an order deducts available inventory and records the sale in one transaction.")}</div></div><button className="button button-primary" disabled={isSubmitting || products.loading} type="submit" style={{ width: "100%" }}><Save size={16}/>{isSubmitting ? t("Saving order…") : order ? t("Save order changes") : t("Create order")}</button>{onCancel && <button className="button button-secondary" type="button" onClick={onCancel}>{t("Cancel editing")}</button>}</div></div></div></div></form></>;
}
export const indianStates = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
