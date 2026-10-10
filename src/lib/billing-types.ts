export type BillingPaymentMethod = "CASH" | "UPI" | "DEBIT_CARD" | "CREDIT_CARD" | "BANK_TRANSFER";

export type BillCustomer = {
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  addressLine: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  country: string;
};

export type BillStore = {
  storeName: string;
  currency: string;
  gstin: string | null;
  addressLine: string | null;
  area: string | null;
  city: string;
  state: string;
  pinCode: string | null;
  country: string;
  phone: string | null;
};

export type BillingInput = {
  checkoutKey: string;
  items: { productId: string; quantity: number; discount?: number }[];
  discount?: number;
  paymentMethod: BillingPaymentMethod;
  amountReceived?: number;
  customer?: Partial<Omit<BillCustomer, "area" | "country">>;
};

export type BillItem = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  hsnCode: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  gstPercentage: number;
  /** Total line discount, including the allocated bill-wide discount. */
  discount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
};

export type Bill = {
  id: string;
  orderNumber: string;
  customerId: string;
  userId: string | null;
  isBill: true;
  status: "DELIVERED";
  paymentStatus: "PAID";
  stockDeducted: true;
  paymentMethod: BillingPaymentMethod;
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
  amountReceived: number | null;
  change: number | null;
  createdAt: string;
  updatedAt: string;
  storeSnapshot: BillStore;
  customerSnapshot: BillCustomer;
  customer: BillCustomer & { id: string };
  user: { id: string; name: string } | null;
  items: BillItem[];
};

export type BillHistory = { items: Bill[]; total: number; page: number; pageSize: number };
