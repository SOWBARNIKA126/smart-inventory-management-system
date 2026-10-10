import { Prisma, PrismaClient, PaymentMethod, OrderStatus, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { forecastDemand } from "../src/services/forecasting";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const SEED_MARKER = "demo_seed_complete_v1";
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const categoryId = (index: number) => `demo_category_${index + 1}`;
const supplierId = (index: number) => `demo_supplier_${index + 1}`;
const productId = (index: number) => `demo_product_${String(index + 1).padStart(2, "0")}`;
type Pattern = "stable" | "summer" | "monsoon" | "winter" | "school" | "festival" | "clothing";
type ProductSpec = { name: string; category: number; supplier: number; cost: number; price: number; gst: number; hsn: string; unit: string; daily: number; pattern: Pattern };

const categories = [
  ["Groceries", "Rice, atta, pulses, oils and everyday pantry staples", "#10b981"],
  ["Beverages", "Tea, coffee, juices and refreshing summer drinks", "#3b82f6"],
  ["Snacks", "Biscuits, namkeen, sweets and ready-to-eat snacks", "#f59e0b"],
  ["Dairy", "Milk, butter, curd, paneer and frozen desserts", "#06b6d4"],
  ["Personal Care", "Daily hygiene and personal care essentials", "#ec4899"],
  ["Household", "Cleaning, laundry and household supplies", "#8b5cf6"],
  ["Stationery", "School and office stationery", "#6366f1"],
  ["Electronics", "Small appliances and electronic accessories", "#64748b"],
  ["Clothing", "Everyday, festive and winter garments", "#d946ef"],
  ["Seasonal Products", "Monsoon protection, festive gifts and decorations", "#f97316"],
];

const suppliers = [
  { name: "Sri Venkateswara FMCG Distributors", contactPerson: "R. Srinivasan", city: "Chennai", state: "Tamil Nadu", pinCode: "600001", area: "Parrys Corner", addressLine: "38 Govindappa Naicken Street", leadTimeDays: 3 },
  { name: "Bengaluru Fresh Foods", contactPerson: "Ananya Rao", city: "Bengaluru", state: "Karnataka", pinCode: "560002", area: "Chickpet", addressLine: "24 Market Road", leadTimeDays: 4 },
  { name: "Maharashtra Consumer Products", contactPerson: "Ajay Deshmukh", city: "Mumbai", state: "Maharashtra", pinCode: "400003", area: "Masjid Bunder", addressLine: "17 Narsi Natha Street", leadTimeDays: 6 },
  { name: "Deccan Dairy & Frozen Foods", contactPerson: "Farah Khan", city: "Hyderabad", state: "Telangana", pinCode: "500003", area: "Secunderabad", addressLine: "62 MG Road", leadTimeDays: 2 },
  { name: "Capital Stationery Wholesale", contactPerson: "Neeraj Gupta", city: "Delhi", state: "Delhi", pinCode: "110006", area: "Chawri Bazar", addressLine: "118 Nai Sarak", leadTimeDays: 7 },
  { name: "Sahyadri Electronics", contactPerson: "Pooja Kulkarni", city: "Pune", state: "Maharashtra", pinCode: "411002", area: "Budhwar Peth", addressLine: "49 Laxmi Road", leadTimeDays: 6 },
  { name: "Malabar Lifestyle Traders", contactPerson: "Arun Menon", city: "Kochi", state: "Kerala", pinCode: "682031", area: "Ernakulam", addressLine: "81 Broadway Market", leadTimeDays: 5 },
  { name: "Kovai Textiles & Seasonal Goods", contactPerson: "Meena Rajendran", city: "Coimbatore", state: "Tamil Nadu", pinCode: "641001", area: "Town Hall", addressLine: "56 Oppanakara Street", leadTimeDays: 4 },
];

// Prices and tax rates are editable demonstration catalog values, not a tax-rate reference.
const products: ProductSpec[] = [
  { name: "India Gate Basmati Rice 1kg", category: 0, supplier: 0, cost: 112, price: 145, gst: 5, hsn: "100630", unit: "packet", daily: 10, pattern: "stable" },
  { name: "Aashirvaad Shudh Chakki Atta 5kg", category: 0, supplier: 0, cost: 235, price: 285, gst: 5, hsn: "110100", unit: "packet", daily: 8, pattern: "stable" },
  { name: "Tata Salt 1kg", category: 0, supplier: 0, cost: 21, price: 28, gst: 0, hsn: "250100", unit: "packet", daily: 15, pattern: "stable" },
  { name: "Fortune Sunflower Oil 1L", category: 0, supplier: 0, cost: 119, price: 150, gst: 5, hsn: "151219", unit: "litre", daily: 12, pattern: "stable" },
  { name: "Tata Sampann Toor Dal 1kg", category: 0, supplier: 0, cost: 128, price: 165, gst: 5, hsn: "071360", unit: "packet", daily: 7, pattern: "stable" },
  { name: "Coca-Cola 750ml", category: 1, supplier: 1, cost: 31, price: 40, gst: 28, hsn: "220210", unit: "pcs", daily: 11, pattern: "summer" },
  { name: "Real Mango Juice 1L", category: 1, supplier: 1, cost: 82, price: 110, gst: 12, hsn: "200989", unit: "pcs", daily: 6, pattern: "summer" },
  { name: "Tata Tea Premium 500g", category: 1, supplier: 0, cost: 195, price: 245, gst: 5, hsn: "090230", unit: "packet", daily: 6, pattern: "stable" },
  { name: "Bru Instant Coffee 100g", category: 1, supplier: 2, cost: 145, price: 190, gst: 18, hsn: "210111", unit: "pcs", daily: 4, pattern: "stable" },
  { name: "Bisleri Mineral Water 1L", category: 1, supplier: 1, cost: 12, price: 20, gst: 18, hsn: "220110", unit: "pcs", daily: 18, pattern: "summer" },
  { name: "Britannia Good Day Cashew 200g", category: 2, supplier: 0, cost: 27, price: 35, gst: 18, hsn: "190531", unit: "packet", daily: 12, pattern: "stable" },
  { name: "Haldiram's Aloo Bhujia 400g", category: 2, supplier: 2, cost: 86, price: 115, gst: 12, hsn: "210690", unit: "packet", daily: 6, pattern: "stable" },
  { name: "Lay's Classic Salted 90g", category: 2, supplier: 2, cost: 31, price: 40, gst: 12, hsn: "200520", unit: "packet", daily: 10, pattern: "stable" },
  { name: "MTR Gulab Jamun Mix 200g", category: 2, supplier: 1, cost: 78, price: 105, gst: 5, hsn: "210690", unit: "packet", daily: 3, pattern: "festival" },
  { name: "Cadbury Celebrations Gift Box", category: 2, supplier: 2, cost: 132, price: 180, gst: 18, hsn: "180690", unit: "box", daily: 3, pattern: "festival" },
  { name: "Amul Butter 500g", category: 3, supplier: 3, cost: 235, price: 285, gst: 12, hsn: "040510", unit: "pcs", daily: 6, pattern: "stable" },
  { name: "Aavin Full Cream Milk 500ml", category: 3, supplier: 3, cost: 26, price: 30, gst: 0, hsn: "040120", unit: "packet", daily: 24, pattern: "stable" },
  { name: "Amul Vanilla Ice Cream 1L", category: 3, supplier: 3, cost: 155, price: 210, gst: 18, hsn: "210500", unit: "box", daily: 5, pattern: "summer" },
  { name: "Milky Mist Paneer 200g", category: 3, supplier: 3, cost: 75, price: 95, gst: 5, hsn: "040610", unit: "packet", daily: 5, pattern: "stable" },
  { name: "Hatsun Curd 500g", category: 3, supplier: 3, cost: 29, price: 40, gst: 5, hsn: "040310", unit: "pcs", daily: 12, pattern: "stable" },
  { name: "Colgate Strong Teeth 200g", category: 4, supplier: 2, cost: 79, price: 105, gst: 18, hsn: "330610", unit: "pcs", daily: 6, pattern: "stable" },
  { name: "Dove Cream Beauty Soap 100g", category: 4, supplier: 2, cost: 43, price: 60, gst: 18, hsn: "340111", unit: "pcs", daily: 8, pattern: "stable" },
  { name: "Clinic Plus Shampoo 175ml", category: 4, supplier: 2, cost: 88, price: 120, gst: 18, hsn: "330510", unit: "pcs", daily: 5, pattern: "stable" },
  { name: "Nivea Body Lotion 200ml", category: 4, supplier: 6, cost: 168, price: 230, gst: 18, hsn: "330499", unit: "pcs", daily: 3, pattern: "winter" },
  { name: "Lakme Sun Expert SPF 50 50ml", category: 4, supplier: 6, cost: 215, price: 310, gst: 18, hsn: "330499", unit: "pcs", daily: 2, pattern: "summer" },
  { name: "Surf Excel Easy Wash 1kg", category: 5, supplier: 0, cost: 96, price: 130, gst: 18, hsn: "340220", unit: "packet", daily: 8, pattern: "stable" },
  { name: "Vim Dishwash Liquid 500ml", category: 5, supplier: 0, cost: 76, price: 105, gst: 18, hsn: "340220", unit: "pcs", daily: 6, pattern: "stable" },
  { name: "Lizol Citrus Floor Cleaner 1L", category: 5, supplier: 2, cost: 138, price: 185, gst: 18, hsn: "380894", unit: "pcs", daily: 4, pattern: "stable" },
  { name: "Good Knight Liquid Refill 45ml", category: 5, supplier: 2, cost: 56, price: 80, gst: 18, hsn: "380891", unit: "pcs", daily: 5, pattern: "monsoon" },
  { name: "Scotch-Brite Scrub Pad 3 Pack", category: 5, supplier: 0, cost: 38, price: 55, gst: 18, hsn: "680530", unit: "packet", daily: 5, pattern: "stable" },
  { name: "Classmate Notebook 200 Pages", category: 6, supplier: 4, cost: 39, price: 60, gst: 12, hsn: "482020", unit: "pcs", daily: 7, pattern: "school" },
  { name: "Apsara Platinum Pencils 10 Pack", category: 6, supplier: 4, cost: 32, price: 45, gst: 12, hsn: "960910", unit: "box", daily: 4, pattern: "school" },
  { name: "Cello Butterflow Blue Pen", category: 6, supplier: 4, cost: 6, price: 10, gst: 18, hsn: "960810", unit: "pcs", daily: 10, pattern: "stable" },
  { name: "Camlin Geometry Box", category: 6, supplier: 4, cost: 96, price: 140, gst: 12, hsn: "901720", unit: "box", daily: 3, pattern: "school" },
  { name: "Faber-Castell Colour Pencils 12", category: 6, supplier: 4, cost: 65, price: 95, gst: 12, hsn: "960910", unit: "box", daily: 3, pattern: "school" },
  { name: "Usha Table Fan 400mm", category: 7, supplier: 5, cost: 1650, price: 2199, gst: 18, hsn: "841451", unit: "pcs", daily: 1.3, pattern: "summer" },
  { name: "Bajaj Personal Air Cooler 23L", category: 7, supplier: 5, cost: 4200, price: 5699, gst: 18, hsn: "847960", unit: "pcs", daily: 0.6, pattern: "summer" },
  { name: "Philips LED Bulb 9W", category: 7, supplier: 5, cost: 55, price: 90, gst: 12, hsn: "853950", unit: "pcs", daily: 4, pattern: "stable" },
  { name: "Portronics USB-C Cable 1m", category: 7, supplier: 5, cost: 89, price: 149, gst: 18, hsn: "854442", unit: "pcs", daily: 2, pattern: "stable" },
  { name: "Eveready AA Battery 4 Pack", category: 7, supplier: 5, cost: 54, price: 80, gst: 18, hsn: "850610", unit: "packet", daily: 3, pattern: "stable" },
  { name: "Cotton Crew Neck T-Shirt", category: 8, supplier: 7, cost: 179, price: 299, gst: 5, hsn: "610910", unit: "pcs", daily: 3, pattern: "stable" },
  { name: "Festive Silk Blend Kurta", category: 8, supplier: 7, cost: 580, price: 899, gst: 5, hsn: "620520", unit: "pcs", daily: 2, pattern: "clothing" },
  { name: "Traditional Cotton Saree", category: 8, supplier: 7, cost: 460, price: 749, gst: 5, hsn: "520852", unit: "pcs", daily: 2, pattern: "clothing" },
  { name: "Wool Blend Winter Sweater", category: 8, supplier: 7, cost: 450, price: 799, gst: 5, hsn: "611030", unit: "pcs", daily: 1.5, pattern: "winter" },
  { name: "Kids School Socks 3 Pair", category: 8, supplier: 7, cost: 75, price: 129, gst: 5, hsn: "611595", unit: "packet", daily: 3, pattern: "school" },
  { name: "Popy Folding Umbrella", category: 9, supplier: 6, cost: 185, price: 299, gst: 12, hsn: "660191", unit: "pcs", daily: 3, pattern: "monsoon" },
  { name: "Duckback Adult Raincoat", category: 9, supplier: 6, cost: 420, price: 699, gst: 18, hsn: "392620", unit: "pcs", daily: 1.7, pattern: "monsoon" },
  { name: "Terracotta Diya Set of 12", category: 9, supplier: 7, cost: 55, price: 99, gst: 0, hsn: "691200", unit: "box", daily: 2.5, pattern: "festival" },
  { name: "Warm White LED String Lights", category: 9, supplier: 5, cost: 88, price: 159, gst: 12, hsn: "940530", unit: "pcs", daily: 2, pattern: "festival" },
  { name: "Premium Dry Fruit Gift Box 500g", category: 9, supplier: 6, cost: 370, price: 549, gst: 12, hsn: "081350", unit: "box", daily: 2, pattern: "festival" },
];

const profiles: Record<Pattern, number[]> = {
  stable: [1.02, 0.98, 1, 1.01, 1.01, 0.98, 1, 1, 1, 1.02, 1.01, 1.02],
  summer: [0.58, 0.72, 1.8, 2.55, 2.8, 1.45, 0.9, 0.8, 0.75, 0.7, 0.6, 0.55],
  monsoon: [0.28, 0.25, 0.3, 0.38, 0.65, 2.35, 2.7, 2.5, 2.05, 0.95, 0.55, 0.35],
  winter: [2.25, 1.65, 0.7, 0.38, 0.3, 0.4, 0.5, 0.5, 0.6, 1.1, 2.1, 2.6],
  school: [1.15, 0.75, 0.8, 0.7, 1.8, 2.8, 1.75, 0.85, 0.8, 0.75, 0.7, 0.8],
  festival: [1.25, 0.55, 0.7, 0.6, 0.55, 0.6, 0.55, 1.05, 1.25, 2.7, 2.45, 1.4],
  clothing: [1.65, 0.8, 0.9, 1.2, 1.25, 0.65, 0.7, 1.1, 1.35, 2.1, 2.4, 1.6],
};

function deterministicNoise(product: number, day: number) {
  const value = Math.sin((product + 1) * 127.1 + day * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function quantityFor(product: ProductSpec, index: number, date: Date, day: number) {
  const weekend = [0, 6].includes(date.getUTCDay()) ? 1.22 : 0.96;
  const growth = 0.92 + 0.18 * day / 730;
  const payday = date.getUTCDate() <= 5 ? 1.1 : 1;
  const festivalLift = ["festival", "clothing"].includes(product.pattern) && date.getUTCMonth() === 0 && date.getUTCDate() >= 10 && date.getUTCDate() <= 16 ? 1.45 : 1;
  const raw = product.daily * profiles[product.pattern][date.getUTCMonth()] * weekend * growth * payday * festivalLift * (0.8 + deterministicNoise(index, day) * 0.4);
  // Deterministic fractional carry yields meaningful zero-sale days for slow movers.
  return Math.max(0, Math.floor(raw) + (deterministicNoise(index + 91, day) < raw % 1 ? 1 : 0));
}

async function seed() {
  const marker = await prisma.stockMovement.findUnique({ where: { id: SEED_MARKER } });
  if (marker) {
    console.log("Demo seed already completed. Existing data was preserved; no records changed.");
    return;
  }
  const counts = await Promise.all([prisma.user.count(), prisma.product.count(), prisma.category.count(), prisma.supplier.count(), prisma.customer.count(), prisma.order.count(), prisma.sale.count(), prisma.stockMovement.count(), prisma.storeSettings.count()]);
  if (counts.some((count) => count > 0)) throw new Error("Refusing to seed a non-empty database. Use a separate empty development database; this script never deletes existing records.");
  const passwordHash = await hash(process.env.DEMO_PASSWORD || "Inventory@123", 12);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDay = today - 730 * DAY;
  const firstDate = new Date(firstDay);
  const customerNames = ["Priya Sharma", "Arjun Kumar", "Lakshmi Narayanan", "Mohammed Farhan", "Sneha Iyer", "Vikram Patel", "Anjali Nair", "Karthik Subramanian", "Divya Menon", "Rahul Desai", "Meera Krishnan", "Suresh Reddy", "Pooja Shah", "Ravi Chandran", "Aisha Ahmed", "Deepak Joshi", "Kumar Stores", "Fresh Mart", "Metro Stationery", "City Electronics", "Royal Garments", "Smart Bazaar", "Ganesh General Store", "Lakshmi Catering"];
  const customers = customerNames.map((name, index) => {
    const location = suppliers[index % suppliers.length];
    return { id: `demo_customer_${index + 1}`, name, phone: `+91 9${String(876500000 + index * 173).padStart(9, "0")}`, email: `${name.toLowerCase().replaceAll(" ", ".")}@example.test`, addressLine: `${12 + index * 3} ${index % 2 ? "Gandhi Road" : "Market Street"}`, area: location.area, city: location.city, state: location.state, pinCode: location.pinCode, country: "India", createdAt: firstDate };
  });
  const sales: Prisma.SaleCreateManyInput[] = [];
  const movements: Prisma.StockMovementCreateManyInput[] = [];
  const orderMap = new Map<string, Prisma.OrderCreateManyInput>();
  const orderItems: Prisma.OrderItemCreateManyInput[] = [];
  const inventories: Prisma.InventoryCreateManyInput[] = [];
  const alerts: Prisma.AlertCreateManyInput[] = [];
  const forecasts: Prisma.ForecastCreateManyInput[] = [];
  const forecastPoints: Prisma.ForecastPointCreateManyInput[] = [];
  const paymentMethods: PaymentMethod[] = ["UPI", "CASH", "UPI", "DEBIT_CARD", "CREDIT_CARD", "BANK_TRANSFER"];
  for (const [index, product] of products.entries()) {
    const id = productId(index);
    const history = Array.from({ length: 731 }, (_, day) => {
      const date = new Date(firstDay + day * DAY);
      return { date, quantity: quantityFor(product, index, date, day) };
    });
    const recentAverage = history.slice(-30).reduce((sum, item) => sum + item.quantity, 0) / 30;
    const target = index % 19 === 0 ? 0 : index % 7 === 0 ? Math.max(2, Math.round(recentAverage * 2)) : index % 13 === 0 ? Math.round(recentAverage * 80) : Math.max(15, Math.round(recentAverage * (12 + index % 9)));
    const cycle = product.category === 3 ? 2 : 12 + index % 5 * 4;
    let stock = 0;
    for (const [day, observation] of history.entries()) {
      const isoDate = dateKey(observation.date);
      if (day % cycle === 0) {
        const block = history.slice(day, day + cycle).reduce((sum, item) => sum + item.quantity, 0);
        const purchased = block + (day === 0 ? target : 0);
        if (purchased > 0) {
          const replenished = stock + purchased;
          movements.push({ id: `demo_purchase_${index}_${day}`, productId: id, userId: "demo_manager", type: "PURCHASE", quantity: purchased, previousStock: stock, newStock: replenished, reference: `GRN-${isoDate.replaceAll("-", "")}-${index + 1}`, notes: day === 0 ? "Opening stock received from supplier for the demonstration sales ledger" : "Scheduled supplier replenishment against retail demand", createdAt: new Date(observation.date.getTime() + 2 * 3600_000) });
          stock = replenished;
        }
      }
      if (observation.quantity === 0) continue;
      const saleDate = new Date(Math.min(observation.date.getTime() + (6 + index % 7) * 3600_000, now.getTime() - 60_000));
      const basket = index % 10;
      const orderId = day >= 670 ? `demo_order_${day}_${basket}` : undefined;
      const taxableAmount = money(product.price * observation.quantity);
      const taxAmount = money(taxableAmount * product.gst / 100);
      const revenue = money(taxableAmount + taxAmount);
      if (orderId) {
        if (!orderMap.has(orderId)) {
          const customerIndex = (day + basket) % customers.length;
          const customer = customers[customerIndex];
          const status: OrderStatus = day === 730 ? ["DELIVERED", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"][basket % 5] as OrderStatus : "DELIVERED";
          orderMap.set(orderId, { id: orderId, orderNumber: `INV-${isoDate.replaceAll("-", "")}-${String(basket + 1).padStart(3, "0")}`, customerId: customer.id, userId: basket % 2 ? "demo_staff_1" : "demo_staff_2", status, paymentMethod: paymentMethods[(day + basket) % paymentMethods.length], paymentStatus: "PAID", subtotal: 0, discount: 0, taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: 0, stockDeducted: true, notes: customerIndex >= 16 ? "Retail trade account purchase" : "Store counter purchase", createdAt: saleDate });
        }
        const order = orderMap.get(orderId)!;
        const interstate = customers.find((customer) => customer.id === order.customerId)!.state !== "Tamil Nadu";
        order.subtotal = money(Number(order.subtotal) + taxableAmount);
        order.taxableAmount = money(Number(order.taxableAmount) + taxableAmount);
        order.totalTax = money(Number(order.totalTax) + taxAmount);
        if (interstate) order.igst = money(Number(order.igst) + taxAmount);
        else {
          const cgst = money(taxAmount / 2);
          order.cgst = money(Number(order.cgst) + cgst);
          order.sgst = money(Number(order.sgst) + taxAmount - cgst);
        }
        order.total = money(Number(order.total) + revenue);
        orderItems.push({ id: `demo_item_${index}_${day}`, orderId, productId: id, quantity: observation.quantity, unitPrice: product.price, gstPercentage: product.gst, taxableAmount, taxAmount, total: revenue });
      }
      sales.push({ id: `demo_sale_${index}_${day}`, productId: id, orderId, quantity: observation.quantity, sellingPrice: product.price, gstPercentage: product.gst, taxableAmount, taxAmount, revenue, date: saleDate, createdAt: saleDate });
      movements.push({ id: `demo_movement_${index}_${day}`, productId: id, userId: day % 2 ? "demo_staff_1" : "demo_staff_2", type: "SALE", quantity: -observation.quantity, previousStock: stock, newStock: stock - observation.quantity, reference: orderId ? String(orderMap.get(orderId)!.orderNumber) : `POS-${isoDate}-${index + 1}`, notes: orderId ? "Inventory deducted for paid retail order" : "Imported daily POS sales aggregate; historical order details unavailable", createdAt: saleDate });
      stock -= observation.quantity;
      if (stock < 0) throw new Error(`Seed ledger would become negative for ${product.name}`);
    }
    if (stock !== target) throw new Error(`Seed ledger mismatch for ${product.name}`);
    inventories.push({ id: `demo_inventory_${index}`, productId: id, currentStock: stock, reservedStock: 0, createdAt: firstDate });
    const result = forecastDemand({ history, days: 30, currentStock: stock, leadTimeDays: suppliers[product.supplier].leadTimeDays, safetyStockDays: 7, historyStart: firstDate, asOf: new Date(today - DAY) });
    const forecastId = `demo_forecast_${index}`;
    forecasts.push({ id: forecastId, productId: id, periodDays: 30, algorithm: result.method, confidence: result.confidence, expectedDemand: result.expectedDemand, averageDailyDemand: result.averageDailyDemand, peakDemand: result.peakDemand, safetyStock: result.safetyStock, expectedShortage: result.expectedShortage, expectedSurplus: result.expectedSurplus, recommendedReorderQuantity: result.recommendedReorder, estimatedDaysUntilStockout: result.daysUntilStockout });
    forecastPoints.push(...result.forecast.map((point, pointIndex) => ({ id: `${forecastId}_${pointIndex}`, forecastId, date: new Date(point.date), demand: point.quantity, lowerBound: point.lower, upperBound: point.upper })));
    const reorderPoint = Math.max(10, Math.ceil(product.daily * (suppliers[product.supplier].leadTimeDays + 3)));
    if (stock <= reorderPoint || result.status === "CRITICAL" || result.status === "REORDER_NOW") {
      alerts.push({ id: `demo_alert_${index}`, productId: id, currentStock: stock, reorderPoint, forecastDemand: result.expectedDemand, severity: stock === 0 || result.status === "CRITICAL" ? "CRITICAL" : "WARNING", status: "ACTIVE", message: stock === 0 ? `${product.name} is out of stock.` : `${stock} units available. Forecast recommends ordering ${result.recommendedReorder} units to cover supplier lead time and safety stock.` });
    }
  }
  // Pending and cancelled orders have no sales or stock deductions.
  for (let index = 0; index < 8; index++) {
    const id = `demo_open_order_${index}`;
    const customer = customers[index];
    let subtotal = 0;
    let totalTax = 0;
    for (let offset = 0; offset < 3; offset++) {
      const itemIndex = (index * 4 + offset + 1) % products.length;
      const item = products[itemIndex];
      const quantity = offset + 1;
      const taxableAmount = money(item.price * quantity);
      const taxAmount = money(taxableAmount * item.gst / 100);
      subtotal = money(subtotal + taxableAmount);
      totalTax = money(totalTax + taxAmount);
      orderItems.push({ id: `${id}_${offset}`, orderId: id, productId: productId(itemIndex), quantity, unitPrice: item.price, gstPercentage: item.gst, taxableAmount, taxAmount, total: money(taxableAmount + taxAmount) });
    }
    const interstate = customer.state !== "Tamil Nadu";
    orderMap.set(id, { id, orderNumber: `ORD-${dateKey(now).replaceAll("-", "")}-${String(index + 100).padStart(3, "0")}`, customerId: customer.id, userId: "demo_staff_1", status: index >= 6 ? "CANCELLED" : "PENDING", paymentMethod: paymentMethods[index % paymentMethods.length], paymentStatus: "PENDING", subtotal, discount: 0, taxableAmount: subtotal, cgst: interstate ? 0 : money(totalTax / 2), sgst: interstate ? 0 : money(totalTax - money(totalTax / 2)), igst: interstate ? totalTax : 0, totalTax, total: money(subtotal + totalTax), stockDeducted: false, notes: index >= 6 ? "Customer cancelled before confirmation; no inventory deducted" : "Awaiting staff confirmation", createdAt: new Date(now.getTime() - index * 3600_000) });
  }
  await prisma.$transaction(async (tx) => {
    // Serialize competing seeds; the complete dataset is committed atomically.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(736204821)`;
    if (await tx.user.count()) throw new Error("Database changed while seed was being prepared; refusing to overwrite existing data.");
    const userSpecs: { id: string; name: string; email: string; role: Role }[] = [
      { id: "demo_admin", name: "Sowbarnika Raman", email: "admin@inventory.local", role: "ADMIN" },
      { id: "demo_manager", name: "Karthik Narayanan", email: "manager@inventory.local", role: "MANAGER" },
      { id: "demo_staff_1", name: "Priya Selvam", email: "staff@inventory.local", role: "STAFF" },
      { id: "demo_staff_2", name: "Arjun Raj", email: "staff2@inventory.local", role: "STAFF" },
    ];
    await tx.user.createMany({ data: userSpecs.map((user) => ({ ...user, passwordHash, createdAt: firstDate })) });
    await tx.category.createMany({ data: categories.map(([name, description, color], index) => ({ id: categoryId(index), name, description, color, createdAt: firstDate })) });
    await tx.supplier.createMany({ data: suppliers.map((supplier, index) => ({ ...supplier, id: supplierId(index), phone: `+91 9${String(840001000 + index * 127).padStart(9, "0")}`, email: `orders.${index + 1}@supplier.example.test`, gstin: ["33ABCDE1234F1Z5", "29BCDEF2345G1Z6", "27CDEFG3456H1Z7", "36DEFGH4567J1Z8", "07EFGHJ5678K1Z9", "27FGHJK6789L1Z1", "32GHJKL7890M1Z2", "33HJKLM8901N1Z3"][index], notes: "Demonstration supplier account — contact details are fictional", createdAt: firstDate })) });
    await tx.product.createMany({ data: products.map((product, index) => ({ id: productId(index), sku: `SLM-${String(index + 1).padStart(4, "0")}`, barcode: `8901234${String(index + 1).padStart(6, "0")}`, name: product.name, description: `${product.name} supplied by ${suppliers[product.supplier].name}. Demonstration retail catalog; prices and GST rates can be configured.`, categoryId: categoryId(product.category), supplierId: supplierId(product.supplier), costPrice: product.cost, sellingPrice: product.price, gstPercentage: product.gst, hsnCode: product.hsn, minStock: Math.max(5, Math.ceil(product.daily * 2)), reorderPoint: Math.max(10, Math.ceil(product.daily * (suppliers[product.supplier].leadTimeDays + 3))), reorderQuantity: Math.max(20, Math.ceil(product.daily * 21)), unit: product.unit, createdAt: firstDate })) });
    await tx.inventory.createMany({ data: inventories });
    await tx.customer.createMany({ data: customers });
    await tx.storeSettings.create({ data: { id: "default", storeName: "Sri Lakshmi Supermarket", gstin: "33ABCDE1234F1Z5", addressLine: "12 Anna Nagar Main Road", area: "Anna Nagar", city: "Chennai", state: "Tamil Nadu", pinCode: "600040", country: "India", phone: "+91 98765 43210", currency: "INR", defaultReorderLevel: 20, safetyStockDays: 7, defaultForecastPeriod: 30, historicalDataDays: 730, gstRates: [0, 5, 12, 18, 28] } });
    const orderRows = [...orderMap.values()];
    for (let index = 0; index < orderRows.length; index += 500) await tx.order.createMany({ data: orderRows.slice(index, index + 500) });
    for (let index = 0; index < orderItems.length; index += 1000) await tx.orderItem.createMany({ data: orderItems.slice(index, index + 1000) });
    for (let index = 0; index < sales.length; index += 1000) await tx.sale.createMany({ data: sales.slice(index, index + 1000) });
    for (let index = 0; index < movements.length; index += 1000) await tx.stockMovement.createMany({ data: movements.slice(index, index + 1000) });
    await tx.alert.createMany({ data: alerts });
    await tx.forecast.createMany({ data: forecasts });
    for (let index = 0; index < forecastPoints.length; index += 1000) await tx.forecastPoint.createMany({ data: forecastPoints.slice(index, index + 1000) });
    // Zero-quantity audit marker records successful import without changing inventory.
    const firstStock = inventories[0].currentStock ?? 0;
    await tx.stockMovement.create({ data: { id: SEED_MARKER, productId: productId(0), userId: "demo_admin", type: "ADJUSTMENT", quantity: 0, previousStock: firstStock, newStock: firstStock, reference: "DEMO-SEED-V1", notes: "Completed demonstration data import and verified opening-to-closing inventory balances" } });
  }, { maxWait: 30_000, timeout: 180_000 });
  console.log(`Seeded 4 users, ${categories.length} categories, ${suppliers.length} suppliers, ${products.length} products, ${customers.length} customers, ${orderMap.size} orders, ${sales.length} daily sale records, ${movements.length + 1} stock movements and ${alerts.length} alerts.`);
  console.log(`Historical coverage: ${dateKey(firstDate)} to ${dateKey(now)}. Forecast snapshots were calculated from the generated history.`);
  console.log("Demo emails: admin@inventory.local, manager@inventory.local, staff@inventory.local, staff2@inventory.local. Password: DEMO_PASSWORD environment value or Inventory@123 (development only).");
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Database seed failed");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
