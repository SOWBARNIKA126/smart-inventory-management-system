import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';

// Run against the local app after applying the billing migration. Only records
// owned by this run are removed; existing products and store settings are read-only.
if (existsSync('.env')) process.loadEnvFile('.env');
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const password = process.env.DEMO_PASSWORD || 'Inventory@123';
const prefix = `BILL-TEST-${randomUUID()}`;
const productIds = [];
const checkoutKeys = [];
const cookies = [];
let passed = 0;
let categoryId;
let supplierId;
let existingCustomerIds = new Set();

function check(condition, message) {
  assert.ok(condition, message);
  passed++;
  console.log(`PASS ${message}`);
}

function money(value) { return Math.round(Number(value) * 100); }
function day(value = new Date()) { return new Date(value.getTime() + 330 * 60000).toISOString().slice(0, 10); }
function key() { const value = randomUUID(); checkoutKeys.push(value); return value; }
function bill(product, quantity = 1, overrides = {}) {
  return {checkoutKey: key(), items: [{productId: product.id, quantity}], paymentMethod: 'UPI', ...overrides};
}

async function request(path, {method = 'GET', body, cookie, expected = 200} = {}) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {'Content-Type': 'application/json', Origin: base, ...(cookie ? {Cookie: cookie} : {})},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(statuses.includes(response.status), `${method} ${path}: expected ${statuses.join('/')}, got ${response.status}: ${JSON.stringify(data)}`);
  return {data, status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0]};
}

async function login(email) {
  const result = await request('auth/login', {method: 'POST', body: {email, password}});
  assert.ok(result.cookie, `No session cookie for ${email}`);
  cookies.push(result.cookie);
  return result.cookie;
}

async function checkout(body, cookie, expected = [200, 201]) {
  return (await request('billing', {method: 'POST', body, cookie, expected})).data;
}

async function fixture(tx, label, {stock = 10, reserved = 0, price = 100, gst = 5, status = 'ACTIVE', reorderPoint = 2} = {}) {
  const id = `${prefix}-${label}`;
  productIds.push(id);
  return tx.product.create({data: {
    id, name: `${prefix} ${label}`, sku: id, barcode: `BARCODE-${id}`, categoryId, supplierId,
    costPrice: 20, sellingPrice: price, gstPercentage: gst, hsnCode: '0401', status,
    minStock: 1, reorderPoint, reorderQuantity: 20, unit: 'pcs',
    inventory: {create: {currentStock: stock, reservedStock: reserved}},
    movements: {create: {type: 'ADJUSTMENT', quantity: stock, previousStock: 0, newStock: stock, reference: prefix}},
  }});
}

// A failed checkout must leave all participating data and timestamps unchanged.
// Scope checks to this run so another user's records are never test fixtures.
async function snapshot() {
  const productWhere = {productId: {in: productIds}};
  const [inventory, movements, sales, orders, customers, alerts] = await Promise.all([
    db.inventory.findMany({where: productWhere, orderBy: {id: 'asc'}}),
    db.stockMovement.findMany({where: productWhere, orderBy: {id: 'asc'}}),
    db.sale.findMany({where: productWhere, orderBy: {id: 'asc'}}),
    db.order.findMany({where: {OR: [{checkoutKey: {in: checkoutKeys}}, {items: {some: productWhere}}]}, include: {items: {orderBy: {id: 'asc'}}}, orderBy: {id: 'asc'}}),
    db.customer.findMany({where: {name: {startsWith: prefix}}, orderBy: {id: 'asc'}}),
    db.alert.findMany({where: productWhere, orderBy: {id: 'asc'}}),
  ]);
  return JSON.stringify({inventory, movements, sales, orders, customers, alerts});
}

async function rejectWithoutWrites(body, cookie, expected, description) {
  const before = await snapshot();
  await checkout(body, cookie, expected);
  assert.equal(await snapshot(), before, description);
  check(true, description);
}

try {
  await request('billing', {expected: 401});
  await request('billing', {method: 'POST', body: {}, expected: 401});
  check(true, 'anonymous users cannot read invoices or complete sales');

  const [admin, manager, staff] = await Promise.all([
    login('admin@inventory.local'), login('manager@inventory.local'), login('staff@inventory.local'),
  ]);
  const settings = await db.storeSettings.findUniqueOrThrow({where: {id: 'default'}});
  const otherState = settings.state === 'Karnataka' ? 'Tamil Nadu' : 'Karnataka';
  existingCustomerIds = new Set((await db.customer.findMany({select: {id: true}})).map(customer => customer.id));
  const products = await db.$transaction(async tx => {
    categoryId = `${prefix}-category`;
    supplierId = `${prefix}-supplier`;
    await tx.category.create({data: {id: categoryId, name: `${prefix} category`}});
    await tx.supplier.create({data: {id: supplierId, name: `${prefix} supplier`, leadTimeDays: 5}});
    return {
      milk: await fixture(tx, 'milk', {stock: 50, reorderPoint: 47}),
      scarce: await fixture(tx, 'scarce', {stock: 2}),
      empty: await fixture(tx, 'empty', {stock: 0}),
      inactive: await fixture(tx, 'inactive', {stock: 4, status: 'INACTIVE'}),
      reserved: await fixture(tx, 'reserved', {stock: 5, reserved: 4}),
      race: await fixture(tx, 'race', {stock: 1}),
      repeat: await fixture(tx, 'repeat', {stock: 10}),
      first: await fixture(tx, 'first-line', {stock: 8}),
      lowGst: await fixture(tx, 'mixed-5', {stock: 20}),
      highGst: await fixture(tx, 'mixed-18', {stock: 20, price: 200, gst: 18}),
      cash: await fixture(tx, 'cash', {stock: 3}),
      snapshot: await fixture(tx, 'snapshot', {stock: 4, price: 33.33, gst: 18}),
    };
  }, {timeout: 30000});

  const beforeDashboard = (await request('dashboard?days=7', {cookie: staff})).data;
  const firstPayload = bill(products.milk, 3, {
    paymentMethod: 'CASH', amountReceived: 500,
    // These untrusted fields must never replace prices or tax from PostgreSQL.
    items: [{productId: products.milk.id, quantity: 3, unitPrice: 0.01, sellingPrice: 0.01, gstPercentage: 0, currentStock: 9999, total: 1}],
    subtotal: 1, taxableAmount: 1, cgst: 0, sgst: 0, igst: 0, totalTax: 0, total: 1,
  });
  const first = await checkout(firstPayload, staff);
  check(first.isBill && first.orderNumber.startsWith('INV-') && first.stockDeducted && first.paymentStatus === 'PAID', 'staff checkout creates a paid, stock-deducted invoice with a unique INV number');
  check(first.customerSnapshot.name === 'Walk-in Customer', 'customer details are optional and default to Walk-in Customer');
  check(money(first.subtotal) === 30000 && money(first.totalTax) === 1500 && money(first.total) === 31500, 'server ignores tampered stock, price, GST and totals and recalculates the bill');
  check(money(first.amountReceived) === 50000 && money(first.change) === 18500, 'cash receipt persists the correct amount received and change');
  const milkInventory = await db.inventory.findUniqueOrThrow({where: {productId: products.milk.id}});
  check(milkInventory.currentStock === 47, 'exact required flow: selling 3 units reduces stock from 50 to 47');
  const milkMovements = await db.stockMovement.findMany({where: {productId: products.milk.id, type: 'SALE'}});
  check(milkMovements.length === 1 && milkMovements[0].quantity === -3 && milkMovements[0].previousStock === 50 && milkMovements[0].newStock === 47 && milkMovements[0].reference === first.orderNumber, 'checkout records one SALE movement of -3 with previous 50, new 47 and the invoice reference');
  const milkSales = await db.sale.findMany({where: {productId: products.milk.id}});
  check(milkSales.length === 1 && milkSales[0].orderId === first.id && milkSales[0].quantity === 3 && milkSales[0].voidedAt === null && money(milkSales[0].revenue) === 31500, 'checkout records exactly one shared Sale with 3 units and the invoice revenue');
  const afterDashboard = (await request('dashboard?days=7', {cookie: staff})).data;
  check(money(afterDashboard.kpis.todaySales) - money(beforeDashboard.kpis.todaySales) === money(first.total), 'existing dashboard revenue increases by the completed bill total');
  const sales = (await request(`sales?productId=${products.milk.id}`, {cookie: manager})).data;
  check(sales.total === 1 && sales.items[0].quantity === 3 && sales.items[0].order.id === first.id && sales.summary.unitsSold === 3, 'existing Sales section contains the completed bill without duplicate quantities');
  const forecast = (await request(`forecasting?productId=${products.milk.id}&days=30`, {cookie: manager})).data;
  check(forecast.todaySales.date === day(new Date(milkSales[0].date)) && forecast.todaySales.quantity === 3 && !forecast.history.some(point => point.date === forecast.todaySales.date), 'forecast sees today’s 3 billing units in shared sales while excluding the incomplete day from training');
  const lowAlerts = await db.alert.findMany({where: {productId: products.milk.id, status: {in: ['ACTIVE', 'ACKNOWLEDGED']}}});
  check(lowAlerts.length === 1 && lowAlerts[0].currentStock === 47 && lowAlerts[0].reorderPoint === 47, 'crossing the reorder point creates the existing low-stock alert');

  await rejectWithoutWrites(bill(products.scarce, 3, {customer: {name: `${prefix} rejected customer`}}), staff, 409, 'stock 2 / quantity 3 fails with no invoice, customer, stock, movement, sale or alert changes');
  await rejectWithoutWrites(bill(products.cash, 1, {paymentMethod: 'CASH', amountReceived: 104.99, customer: {name: `${prefix} short cash`}}), staff, 400, 'insufficient cash fails without writing any sale data');
  await rejectWithoutWrites(bill(products.empty), staff, 409, 'out-of-stock products cannot be sold');
  await rejectWithoutWrites(bill(products.inactive), staff, 409, 'inactive products cannot be sold');
  await rejectWithoutWrites(bill(products.reserved, 2), staff, 409, 'reserved inventory is excluded from stock available to a cashier');
  await rejectWithoutWrites(bill(products.first, 0), staff, 400, 'zero quantities fail server validation without writes');
  await rejectWithoutWrites(bill(products.first, 1.5), staff, 400, 'fractional unit quantities fail server validation without writes');
  await rejectWithoutWrites(bill({id: `${prefix}-does-not-exist`}), staff, 404, 'missing product IDs fail without creating partial records');
  await rejectWithoutWrites(bill(products.first, 1, {
    items: [{productId: products.first.id, quantity: 2}, {productId: products.scarce.id, quantity: 3}],
    customer: {name: `${prefix} multi-item rollback`},
  }), staff, 409, 'multi-product checkout rolls back all lines when a later product has insufficient stock');

  const mixedPayload = bill(products.lowGst, 2, {
    items: [{productId: products.lowGst.id, quantity: 2, discount: 20}, {productId: products.highGst.id, quantity: 1, discount: 10}],
    discount: 37, customer: {name: `${prefix} local buyer`, state: settings.state},
  });
  const mixed = await checkout(mixedPayload, staff);
  check(money(mixed.subtotal) === 40000 && money(mixed.discount) === 6700 && money(mixed.taxableAmount) === 33300 && money(mixed.totalTax) === 3888 && money(mixed.total) === 37188 && money(mixed.cgst) === 1944 && money(mixed.sgst) === 1944 && money(mixed.igst) === 0, 'mixed 5%/18% GST correctly allocates line discounts and the bill discount before intra-state tax');
  const byId = new Map(mixed.items.map(item => [item.productId, item]));
  check(money(byId.get(products.lowGst.id).discount) === 3800 && money(byId.get(products.lowGst.id).taxableAmount) === 16200 && money(byId.get(products.lowGst.id).taxAmount) === 810 && money(byId.get(products.highGst.id).discount) === 2900 && money(byId.get(products.highGst.id).taxableAmount) === 17100 && money(byId.get(products.highGst.id).taxAmount) === 3078, 'proportional bill discount and GST reconcile exactly for each item');
  const mixedSales = await db.sale.findMany({where: {orderId: mixed.id}});
  check(mixedSales.length === 2 && mixedSales.reduce((sum, sale) => sum + money(sale.revenue), 0) === money(mixed.total), 'mixed-rate shared Sale revenue reconciles to the invoice grand total');
  const interstate = await checkout({...mixedPayload, checkoutKey: key(), customer: {name: `${prefix} interstate buyer`, state: otherState}}, staff);
  check(money(interstate.igst) === 3888 && money(interstate.cgst) === 0 && money(interstate.sgst) === 0 && money(interstate.total) === 37188, 'an interstate customer receives IGST only with the same discounted grand total');

  const repeatPayload = bill(products.repeat, 3);
  const repeated = await Promise.all([checkout(repeatPayload, staff), checkout(repeatPayload, staff)]);
  check(repeated[0].id === repeated[1].id && repeated[0].orderNumber === repeated[1].orderNumber && (await db.inventory.findUniqueOrThrow({where: {productId: products.repeat.id}})).currentStock === 7 && await db.sale.count({where: {productId: products.repeat.id}}) === 1 && await db.stockMovement.count({where: {productId: products.repeat.id, type: 'SALE'}}) === 1, 'simultaneous retries with the same checkout key create one invoice and deduct stock once');
  const replay = await checkout(repeatPayload, staff);
  check(replay.id === repeated[0].id && await db.order.count({where: {checkoutKey: repeatPayload.checkoutKey}}) === 1, 'retrying an already-completed checkout returns the original invoice');
  await rejectWithoutWrites({...repeatPayload, items: [{productId: products.repeat.id, quantity: 2}]}, staff, 409, 'reusing a checkout key with a changed cart returns a conflict without writes');
  await rejectWithoutWrites(repeatPayload, admin, 409, 'another cashier cannot replay a checkout key belonging to the original cashier');

  const racing = await Promise.all([bill(products.race), bill(products.race)].map(body => request('billing', {method: 'POST', body, cookie: staff, expected: [200, 201, 409]})));
  check(racing.filter(result => result.status === 200 || result.status === 201).length === 1 && racing.filter(result => result.status === 409).length === 1 && (await db.inventory.findUniqueOrThrow({where: {productId: products.race.id}})).currentStock === 0 && await db.sale.count({where: {productId: products.race.id}}) === 1, 'two simultaneous bills competing for stock 1 allow one sale and never oversell');
  const emptyInventory = (await request(`inventory/${products.race.id}`, {cookie: staff})).data;
  const outOfStock = (await request(`inventory?productId=${products.race.id}&stockStatus=OUT_OF_STOCK`, {cookie: staff})).data;
  const emptyAlert = await db.alert.findFirst({where: {productId: products.race.id, status: 'ACTIVE'}});
  check(emptyInventory.currentStock === 0 && outOfStock.items.length === 1 && outOfStock.items[0].stockStatus === 'OUT_OF_STOCK' && emptyAlert?.currentStock === 0 && emptyAlert.severity === 'CRITICAL', 'selling the final unit updates out-of-stock inventory and the existing critical alert');

  for (const search of [products.snapshot.name, products.snapshot.sku, products.snapshot.barcode]) {
    const found = (await request(`products?status=ACTIVE&q=${encodeURIComponent(search)}`, {cookie: staff})).data;
    assert.ok(found.items.some(product => product.id === products.snapshot.id && money(product.sellingPrice) === 3333 && Number(product.gstPercentage) === 18 && product.inventory.currentStock === 4));
  }
  check(true, 'cashier product lookup searches name, SKU and existing barcode and returns current price, stock and GST');
  const snap = await checkout(bill(products.snapshot, 1, {customer: {name: `${prefix} snapshot buyer`, state: settings.state}}), staff);
  await db.product.update({where: {id: products.snapshot.id}, data: {name: `${prefix} renamed after invoice`, sku: `${prefix}-renamed-sku`, sellingPrice: 999, gstPercentage: 28, hsnCode: '9999'}});
  const storedSnap = (await request(`billing/${snap.id}`, {cookie: staff})).data;
  check(storedSnap.items[0].productName === products.snapshot.name && storedSnap.items[0].sku === products.snapshot.sku && storedSnap.items[0].hsnCode === '0401' && money(storedSnap.items[0].unitPrice) === 3333 && Number(storedSnap.items[0].gstPercentage) === 18 && storedSnap.storeSnapshot.storeName === settings.storeName && storedSnap.customerSnapshot.name === `${prefix} snapshot buyer`, 'invoice keeps product, HSN, customer and store snapshots after catalog changes');
  await rejectWithoutWrites(bill(products.snapshot, 1, {discount: 1000}), staff, 400, 'discounts greater than the sale subtotal fail server validation without writes');

  const invoiceDay = day(new Date(first.createdAt));
  const history = (await request(`billing?q=${encodeURIComponent(first.orderNumber)}&dateFrom=${invoiceDay}&dateTo=${invoiceDay}`, {cookie: staff})).data;
  check(history.total === 1 && history.items[0].id === first.id && history.items[0].user?.name && history.items[0].paymentMethod === 'CASH' && history.items[0].paymentStatus === 'PAID', 'bill history searches invoice number and its India business date with cashier and payment details');
  const customerHistory = (await request(`billing?q=${encodeURIComponent(`${prefix} snapshot buyer`)}`, {cookie: staff})).data;
  check(customerHistory.total === 1 && customerHistory.items[0].id === snap.id, 'bill history searches customer names');
  const futureDay = day(new Date(new Date(first.createdAt).getTime() + 86400000));
  const excluded = (await request(`billing?q=${encodeURIComponent(first.orderNumber)}&dateFrom=${futureDay}`, {cookie: staff})).data;
  check(excluded.total === 0, 'bill history date filters exclude invoices outside the selected period');
  await request(`orders/${first.id}`, {method: 'PATCH', cookie: staff, body: {status: 'CANCELLED'}, expected: 409});
  check((await db.inventory.findUniqueOrThrow({where: {productId: products.milk.id}})).currentStock === 47 && await db.sale.count({where: {orderId: first.id, voidedAt: null}}) === 1, 'generic order editing cannot cancel a completed bill or accidentally restore billed stock');
  await checkout(bill(products.milk), staff);
  const refreshedAlerts = await db.alert.findMany({where: {productId: products.milk.id, status: {in: ['ACTIVE', 'ACKNOWLEDGED']}}});
  check(refreshedAlerts.length === 1 && refreshedAlerts[0].id === lowAlerts[0].id && refreshedAlerts[0].currentStock === 46, 'a subsequent bill refreshes the existing low-stock alert instead of duplicating it');
  for (const paymentMethod of ['DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER']) {
    const paid = await checkout(bill(products.repeat, 1, {paymentMethod, amountReceived: 999}), staff);
    assert.equal(paid.paymentMethod, paymentMethod);
    assert.equal(paid.paymentStatus, 'PAID');
    assert.equal(paid.amountReceived, null);
    assert.equal(paid.change, null);
  }
  check(true, 'debit card, credit card and bank transfer complete paid sales without persisting cash-only amounts');
  for (const route of ['billing', 'billing/history', `billing/${first.id}`]) {
    const response = await fetch(`${base}/${route}`, {headers: {Cookie: staff}});
    assert.equal(response.status, 200, `Staff page ${route}`);
  }
  check(true, 'billing, history and invoice pages render for a staff cashier');

  const allInventory = await db.inventory.findMany({where: {productId: {in: productIds}}});
  const allMovements = await db.stockMovement.findMany({where: {productId: {in: productIds}}});
  const ledger = new Map();
  for (const movement of allMovements) {
    assert.equal(movement.previousStock + movement.quantity, movement.newStock);
    assert.ok(movement.newStock >= 0);
    ledger.set(movement.productId, (ledger.get(movement.productId) || 0) + movement.quantity);
  }
  check(allInventory.every(inventory => ledger.get(inventory.productId) === inventory.currentStock), 'every billing fixture stock balance reconciles with its stock movement ledger after successes and failures');
  console.log(`\n${passed} billing integration checks passed against PostgreSQL.`);
} finally {
  await db.$transaction(async tx => {
    const orders = await tx.order.findMany({where: {OR: [{checkoutKey: {in: checkoutKeys}}, {items: {some: {productId: {in: productIds}}}}]}, select: {id: true, customerId: true}});
    const orderIds = orders.map(order => order.id);
    const customerIds = orders.map(order => order.customerId).filter(id => !existingCustomerIds.has(id));
    await tx.sale.deleteMany({where: {productId: {in: productIds}}});
    await tx.order.deleteMany({where: {id: {in: orderIds}}});
    await tx.stockMovement.deleteMany({where: {productId: {in: productIds}}});
    await tx.alert.deleteMany({where: {productId: {in: productIds}}});
    await tx.forecast.deleteMany({where: {productId: {in: productIds}}});
    await tx.product.deleteMany({where: {id: {in: productIds}}});
    if (supplierId) await tx.supplier.deleteMany({where: {id: supplierId}});
    if (categoryId) await tx.category.deleteMany({where: {id: categoryId}});
    await tx.customer.deleteMany({where: {OR: [{id: {in: customerIds}}, {name: {startsWith: prefix}}], orders: {none: {}}}});
  }, {timeout: 30000});
  for (const cookie of cookies) {
    try { await request('auth/logout', {method: 'POST', cookie}); } catch { /* Cleanup must still disconnect if the server stopped. */ }
  }
  await db.$disconnect();
}
