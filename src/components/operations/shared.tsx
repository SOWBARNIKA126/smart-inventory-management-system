"use client";
import { useI18n } from '@/components/language-provider';
import { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { api } from '@/lib/client';
export interface PageResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
export interface Supplier {
    id: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    addressLine: string;
    area?: string;
    city: string;
    state: string;
    pinCode: string;
    country?: string;
    gstin: string;
    leadTimeDays: number;
    status: string;
    notes: string;
    products?: Product[];
    inventoryValue?: number;
    purchaseHistory?: Movement[];
}
export interface Product {
    id: string;
    name: string;
    sku: string;
    barcode?: string;
    description?: string;
    categoryId: string;
    supplierId: string;
    category?: {
        id: string;
        name: string;
    };
    supplier?: Supplier;
    costPrice: number;
    sellingPrice: number;
    gstPercentage: number;
    hsnCode: string;
    minStock: number;
    reorderPoint: number;
    reorderQuantity: number;
    unit: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    inventory?: {
        currentStock: number;
        reservedStock: number;
        updatedAt?: string;
    };
}
export interface Movement {
    id: string;
    product: Product;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    createdAt: string;
    user?: {
        name: string;
    };
    reference?: string;
    notes?: string;
}
export interface OrderItem {
    id?: string;
    productId: string;
    product?: Product;
    quantity: number;
    price?: number;
    unitPrice?: number;
    gstPercentage?: number;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    total?: number;
}
export interface Order {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    customerAddress?: string;
    customerCity?: string;
    customerState?: string;
    customerPinCode?: string;
    customerGstin?: string;
    customer?: {
        name: string;
        phone?: string;
        email?: string;
        addressLine?: string;
        area?: string;
        city?: string;
        state?: string;
        pinCode?: string;
        country?: string;
        gstin?: string;
    };
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    createdAt: string;
    orderDate?: string;
    subtotal: number;
    discount: number;
    taxableAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    total: number;
    finalAmount?: number;
    notes?: string;
    items: OrderItem[];
}
export function useResource<T>(path: string | null) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(value => value + 1), []);
    useEffect(() => {
        if (!path) {
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        api<T>(path).then(result => {
            if (active)
                setData(result);
        }).catch((reason: unknown) => {
            if (active)
                setError(reason instanceof Error ? reason.message : "Unable to load this information.");
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, [path, version]);
    return { data, loading, error, refresh };
}
export function queryString(values: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
        if (value !== undefined && value !== "")
            params.set(key, String(value));
    });
    return params.toString();
}
export function useDebounce(value: string, delay = 250) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => { const timeout = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timeout); }, [value, delay]);
    return debounced;
}
export function DataState({ loading, error, empty, onRetry, children }: {
    loading: boolean;
    error: string | null;
    empty?: boolean;
    onRetry?: () => void;
    children: React.ReactNode;
}) {
    const { t } = useI18n();
    if (loading)
        return <div className="empty-state" role="status" style={{ minHeight: 240 }}><Loader2 className="animate-spin" size={26}/><p>{t("Loading your store data\u2026")}</p></div>;
    if (error)
        return <div className="empty-state" role="alert"><AlertCircle size={28}/><h3>{t("We couldn\u2019t load this data")}</h3><p>{t(error)}</p>{onRetry && <button className="button button-secondary" onClick={onRetry}>{t("Try again")}</button>}</div>;
    if (empty)
        return <div className="empty-state"><Search size={28}/><h3>{t("No results found")}</h3><p className="muted">{t("Try another search or adjust your filters.")}</p></div>;
    return <>{children}</>;
}
export function Pager({ page, total, pageSize = 10, onChange }: {
    page: number;
    total: number;
    pageSize?: number;
    onChange: (page: number) => void;
}) {
    const { t, number } = useI18n();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return <div className="operations-pagination"><span className="muted">{t('{0}–{1} of {2} results', [number(total ? (page - 1) * pageSize + 1 : 0), number(Math.min(page * pageSize, total)), number(total)])}</span><div className="operations-inline"><button className="button button-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t("Previous page")}><ChevronLeft size={16}/></button><span>{t('Page {0} of {1}', [number(page), number(pages)])}</span><button className="button button-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t("Next page")}><ChevronRight size={16}/></button></div></div>;
}
export function SearchField({ value, onChange, placeholder = "Search…" }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const { t } = useI18n();
    return <div className="operations-search"><Search size={17}/><input className="input" value={value} onChange={event => onChange(event.target.value)} placeholder={t(placeholder)} aria-label={t(placeholder)}/></div>;
}
export function Field({ label, error, children, className = "" }: {
    label: string;
    error?: string;
    children: React.ReactNode;
    className?: string;
}) {
    const { t } = useI18n();
    const errorId = useId();
    const controls = Children.map(children, child => {
        if (!isValidElement<React.InputHTMLAttributes<HTMLInputElement>>(child) || !['input', 'select', 'textarea'].includes(String(child.type))) return child;
        return cloneElement(child, {
            'aria-invalid': error ? true : child.props['aria-invalid'],
            'aria-describedby': [child.props['aria-describedby'], error ? errorId : undefined].filter(Boolean).join(' ') || undefined,
        });
    });
    return <label className={`field ${className}`}><span>{t(label)}</span>{controls}{error && <span id={errorId} className="operations-field-error" role="alert">{t(error)}</span>}</label>;
}
export function Status({ value }: {
    value: string | undefined;
}) {
    const { t } = useI18n();
    const status = value || "UNKNOWN";
    const tone = ["ACTIVE", "IN_STOCK", "PAID", "DELIVERED", "CONFIRMED", "PURCHASE", "RETURN"].includes(status) ? "green" : ["CANCELLED", "CRITICAL", "OUT_OF_STOCK", "DISCONTINUED", "DAMAGED", "INACTIVE"].includes(status) ? "red" : ["PENDING", "LOW_STOCK", "PARTIALLY_PAID", "PROCESSING", "WARNING"].includes(status) ? "amber" : "blue";
    return <span className={`badge operations-badge-${tone}`}><span className="operations-status-dot"/>{t(status.toLowerCase().replaceAll("_", " "))}</span>;
}
export function stockStatus(product: Product) {
    const current = product.inventory?.currentStock ?? 0;
    return current <= 0 ? "OUT_OF_STOCK" : current <= product.reorderPoint ? "LOW_STOCK" : current > Math.max(product.reorderQuantity * 2, product.reorderPoint * 3) ? "OVERSTOCK" : "IN_STOCK";
}
export function ProductAvatar({ name, category }: {
    name: string;
    category?: string;
}) {
    useI18n();
    const palette: Record<string, string> = { Groceries: "#ecf4e9", Beverages: "#e5f2fa", Dairy: "#fff0df", Electronics: "#ebedf8", Clothing: "#f4e9f5", Stationery: "#fdf3d7" };
    return <span className="operations-product-avatar" style={{ background: palette[category || ""] || "#edf3f1" }}>{name.split(" ").slice(0, 2).map(word => word[0]).join("").toUpperCase()}</span>;
}
export function ErrorMessage({ error }: {
    error: unknown;
}) {
    const { t } = useI18n();
    return <p role="alert" className="operations-field-error">{error instanceof Error ? t(error.message) : String(error)}</p>;
}
