import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {existsSync} from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const db=new PrismaClient();
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const password=process.env.DEMO_PASSWORD||'Inventory@123';
const prefix=`TEST-${Date.now()}`;
let passed=0;
const ids={products:[],suppliers:[],categories:[],orders:[],users:[],customers:[]};
function check(condition,message){assert.ok(condition,message);passed++;console.log(`PASS ${message}`)}
async function request(path,{method='GET',body,cookie,expected=200,origin=base}={}){
 const response=await fetch(`${base}/api/${path}`,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return{data,cookie:response.headers.get('set-cookie')?.split(';')[0],response};
}
async function login(email,expected=200){return request('auth/login',{method:'POST',body:{email,password},expected})}
try{
 const inventory=await db.inventory.findMany();const movements=await db.stockMovement.findMany();
 check(inventory.length>=50,'seed includes 50 inventory records');
 const deltas=new Map();for(const m of movements){assert.equal(m.previousStock+m.quantity,m.newStock,`Ledger movement ${m.id}`);assert.ok(m.newStock>=0);deltas.set(m.productId,(deltas.get(m.productId)||0)+m.quantity)}
 check(inventory.every(i=>deltas.get(i.productId)===i.currentStock),'all stock balances reconcile to the movement ledger');
 check(await db.sale.count()>=30000,'historical sales are persisted in PostgreSQL');
 await request('products',{expected:401});check(true,'anonymous API access denied');
 const deniedPage=await fetch(`${base}/products`,{redirect:'manual'});check(deniedPage.status===307&&deniedPage.headers.get('location')==='/login','protected page redirects to login');
 await request('auth/login',{method:'POST',body:{email:'admin@inventory.local',password:'WrongPassword123'},expected:401});check(true,'invalid password rejected');
 const admin=(await login('admin@inventory.local')).cookie;const staff=(await login('staff@inventory.local')).cookie;const manager=(await login('manager@inventory.local')).cookie;
 check(!!admin&&!!staff&&!!manager,'admin, manager, and staff login successfully');
 const staffDashboard=(await request('dashboard?days=7',{cookie:staff})).data;check(staffDashboard.forecastPreview.length===0,'staff dashboard does not bypass forecast authorization');
 const me=await request('auth/me',{cookie:admin});check(me.data.user.role==='ADMIN'&&!JSON.stringify(me.data).includes('passwordHash'),'session only exposes safe user fields');
 await request('users',{cookie:staff,expected:403});await request('forecasting',{cookie:staff,expected:403});await request('users',{cookie:manager,expected:403});
 await request('settings',{method:'PATCH',cookie:manager,body:{storeName:'Forbidden'},expected:403});
 await request('products',{method:'POST',cookie:staff,body:{},expected:403});check(true,'backend permissions reject staff and manager restricted actions');
 await request('products',{method:'POST',cookie:admin,origin:'https://evil.example',body:{},expected:403});check(true,'cross-site mutation rejected');
 const adminRecord=await db.user.findUnique({where:{email:'admin@inventory.local'}});
 await request(`users/${adminRecord.id}`,{method:'PATCH',cookie:admin,body:{isActive:false},expected:409});check(true,'last active administrator cannot be disabled');
 const category=(await request('categories',{method:'POST',cookie:manager,expected:201,body:{name:`${prefix} category`}})).data;ids.categories.push(category.id);
 const supplier=(await request('suppliers',{method:'POST',cookie:manager,expected:201,body:{name:`${prefix} supplier`,city:'Chennai',state:'Tamil Nadu',leadTimeDays:5}})).data;ids.suppliers.push(supplier.id);
 await request(`suppliers/${supplier.id}`,{method:'PATCH',cookie:manager,body:{contactPerson:'Test Contact'}});
 const productBody={name:`${prefix} product`,sku:prefix,categoryId:category.id,supplierId:supplier.id,costPrice:70,sellingPrice:100,gstPercentage:18,hsnCode:'1234',minStock:5,reorderPoint:20,reorderQuantity:50,initialStock:100,unit:'pcs'};
 const product=(await request('products',{method:'POST',cookie:manager,expected:201,body:productBody})).data;ids.products.push(product.id);
 check(product.inventory.currentStock===100,'product creation records opening stock');
 await request('products',{method:'POST',cookie:manager,expected:409,body:productBody});check(true,'duplicate SKU rejected');
 await request(`products/${product.id}`,{method:'PATCH',cookie:manager,body:{description:'Integration-tested product'}});
 await request('inventory',{method:'POST',cookie:staff,expected:201,body:{productId:product.id,type:'PURCHASE',quantity:20,reference:prefix}});
 await request('inventory',{method:'POST',cookie:staff,expected:403,body:{productId:product.id,type:'ADJUSTMENT',quantity:-5}});
 await request('inventory',{method:'POST',cookie:manager,expected:201,body:{productId:product.id,type:'ADJUSTMENT',quantity:-5,reference:prefix}});
 await request('inventory',{method:'POST',cookie:manager,expected:409,body:{productId:product.id,type:'SALE',quantity:1000}});
 check((await request(`inventory/${product.id}`,{cookie:admin})).data.currentStock===115,'stock receipt and adjustment work; insufficient stock cannot go negative');
 const orderBody={customer:{name:`${prefix} customer`,state:'Tamil Nadu',city:'Chennai',pinCode:'600040'},items:[{productId:product.id,quantity:2}],discount:10,paymentMethod:'UPI',paymentStatus:'PAID',status:'PENDING'};
 const order=(await request('orders',{method:'POST',cookie:staff,expected:201,body:orderBody})).data;ids.orders.push(order.id);ids.customers.push(order.customerId);
 check(order.taxableAmount===190&&order.cgst===17.1&&order.sgst===17.1&&order.igst===0&&order.total===224.2,'intra-state GST and proportional discount calculated correctly');
 check((await db.inventory.findUnique({where:{productId:product.id}})).currentStock===115,'pending order does not deduct stock');
 await request(`orders/${order.id}`,{method:'PATCH',cookie:staff,body:{status:'CONFIRMED'}});
 await request(`orders/${order.id}`,{method:'PATCH',cookie:staff,body:{status:'CONFIRMED'}});
 check((await db.inventory.findUnique({where:{productId:product.id}})).currentStock===113&&(await db.sale.count({where:{orderId:order.id}}))===1,'confirmation deducts stock and creates one sale, even when repeated');
 await request(`orders/${order.id}`,{method:'PATCH',cookie:staff,body:{status:'CANCELLED'}});await request(`orders/${order.id}`,{method:'PATCH',cookie:staff,body:{status:'CANCELLED'}});
 check((await db.inventory.findUnique({where:{productId:product.id}})).currentStock===115&&(await db.sale.count({where:{orderId:order.id,voidedAt:null}}))===0,'cancellation restores stock and voids sale once');
 const interstate=(await request('orders',{method:'POST',cookie:staff,expected:201,body:{...orderBody,customer:{...orderBody.customer,state:'Karnataka'},status:'CONFIRMED'}})).data;ids.orders.push(interstate.id);ids.customers.push(interstate.customerId);
 check(interstate.igst===34.2&&interstate.cgst===0&&interstate.sgst===0,'inter-state order calculates IGST only');
 await request('orders',{method:'POST',cookie:staff,expected:409,body:{...orderBody,items:[{productId:product.id,quantity:1000}],status:'CONFIRMED'}});
 check((await db.order.count({where:{customer:{name:orderBody.customer.name}}}))===2,'failed order creation rolls back the complete transaction');
 const limited=(await request('products',{method:'POST',cookie:manager,expected:201,body:{...productBody,sku:`${prefix}-LIMIT`,initialStock:5}})).data;ids.products.push(limited.id);
 const racing=[];for(let i=0;i<2;i++){const o=(await request('orders',{method:'POST',cookie:staff,expected:201,body:{...orderBody,items:[{productId:limited.id,quantity:4}],discount:0}})).data;ids.orders.push(o.id);ids.customers.push(o.customerId);racing.push(o)}
 const concurrent=await Promise.all(racing.map(o=>fetch(`${base}/api/orders/${o.id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Origin:base,Cookie:staff},body:JSON.stringify({status:'CONFIRMED'})})));
 check(concurrent.filter(r=>r.status===200).length===1&&concurrent.filter(r=>r.status===409).length===1,'concurrent orders cannot oversell the same stock');
 check((await db.inventory.findUnique({where:{productId:limited.id}})).currentStock===1,'concurrent stock balance remains correct');
 const alerts=(await request(`alerts?productId=${limited.id}`,{cookie:admin})).data;
 check(alerts.items.length>0,'low-stock alert created automatically');
 await request(`alerts/${alerts.items[0].id}`,{method:'PATCH',cookie:manager,body:{status:'ACKNOWLEDGED'}});check(true,'alerts can be acknowledged');
 const historical=await db.product.findFirst({where:{name:{contains:'Coca-Cola'}}})||await db.product.findFirst({where:{id:{startsWith:'demo_product'}}});
 const forecast=(await request(`forecasting?productId=${historical.id}&days=90`,{cookie:manager})).data;
 check(forecast.historyDays>=729&&forecast.forecast.length===90&&forecast.forecast.every(p=>p.quantity>=0),'forecast uses persisted history and returns nonnegative daily predictions');
 check(forecast.seasonalIndices.some(m=>m.index>1.15),'seasonal indices are learned from historical sales');
 const planner=(await request('forecasting?view=events&horizon=180',{cookie:manager})).data;
 check(planner.events.length>0&&planner.selected?.products.length>0,'event planner returns upcoming occasions and products from recorded history');
 const selected=planner.selected, occasion=selected.event, recommended=selected.products[0];
 const priorStart=new Date(`${occasion.previousStartDate}T00:00:00+05:30`);
 const priorEnd=new Date(new Date(`${occasion.previousEndDate}T00:00:00+05:30`).getTime()+86400000);
 const priorSales=await db.sale.aggregate({where:{productId:recommended.id,voidedAt:null,date:{gte:priorStart,lt:priorEnd}},_sum:{quantity:true}});
 check(recommended.previousUnits===(priorSales._sum.quantity||0),'event comparison quantities exactly match persisted non-voided sales in the IST previous-event window');
 check(selected.products.every(p=>p.previousUnits>0&&p.expectedDemand>=0&&Number.isFinite(p.expectedDemand)&&p.availableStock===Math.max(0,p.currentStock-p.reservedStock)&&p.recommendedReorder===Math.max(0,Math.ceil(p.expectedDemand+p.safetyStock-p.projectedStockAtStart-1e-9))),'event stock plan uses positive historical demand, reservations and projected stock gaps');
 check(selected.insufficientHistoryProducts.some(p=>p.id===product.id)&&!selected.products.some(p=>p.id===product.id),'new products with incomplete history are excluded from event recommendations');
 const annual=(await request('forecasting?view=events&horizon=365',{cookie:manager})).data;
 check(annual.events.length>=planner.events.length,'twelve-month horizon includes the six-month upcoming calendar');
 const festival=annual.events.find(e=>e.kind==='FESTIVAL');
 const chosen=(await request(`forecasting?view=events&horizon=365&eventId=${festival.id}`,{cookie:manager})).data;
 check(chosen.selected.event.id===festival.id&&chosen.selected.metadata.upcomingWindowDays===15,'festival selection uses its own inclusive shopping window');
 const planCsv=await fetch(`${base}/api/forecasting?view=events&horizon=180&eventId=${occasion.id}&format=csv`,{headers:{Cookie:manager}});
 const planCsvText=await planCsv.text();
 check(planCsv.status===200&&planCsv.headers.get('content-type').includes('text/csv')&&planCsvText.includes('Last year units')&&planCsvText.includes(recommended.sku),'event CSV exports the selected plan and historical quantities');
 await request('forecasting?view=events&horizon=7',{cookie:manager,expected:400});
 await request('forecasting?view=events&eventId=unknown',{cookie:manager,expected:404});
 await request('forecasting?view=events',{cookie:staff,expected:403});
 await request('forecasting?view=events&format=csv',{cookie:staff,expected:403});
 check(true,'event API validates the period and selection and enforces permissions for JSON and CSV');
 const report=(await request(`reports?type=inventory&productId=${product.id}`,{cookie:manager})).data;
 check(report.items[0].currentStock===113,'inventory report reflects live database changes');
 const csv=await fetch(`${base}/api/reports?type=inventory&productId=${product.id}&format=csv`,{headers:{Cookie:manager}});
 check(csv.status===200&&(await csv.text()).includes(prefix),'CSV export includes matching database rows');
 const dashboard=(await request('dashboard?days=7',{cookie:admin})).data;
 check(dashboard.kpis.totalProducts===(await db.product.count({where:{status:'ACTIVE'}}))&&dashboard.salesOverview.length===7,'dashboard KPIs and selected range are calculated from database');
 const user=(await request('users',{method:'POST',cookie:admin,expected:201,body:{name:`${prefix} user`,email:`${prefix.toLowerCase()}@example.test`,password,role:'STAFF'}})).data;ids.users.push(user.id);
 const testSession=(await login(user.email)).cookie;await request(`users/${user.id}`,{method:'PATCH',cookie:admin,body:{isActive:false}});await request('auth/me',{cookie:testSession,expected:401});check(true,'disabling a user revokes their sessions');
 await request(`products/${product.id}`,{method:'DELETE',cookie:manager});check((await db.product.findUnique({where:{id:product.id}})).status==='DISCONTINUED','archive preserves the product and stock history');
 for(const route of ['dashboard','products','inventory','inventory/movements','orders','orders/new','sales','forecasting','alerts','suppliers','reports','users','settings',`products/${historical.id}`,`orders/${order.id}`,`suppliers/${supplier.id}`]){const page=await fetch(`${base}/${route}`,{headers:{Cookie:admin}});assert.equal(page.status,200,`Page ${route}`)}check(true,'all requested pages render successfully');
 await request('auth/logout',{method:'POST',cookie:staff});await request('auth/me',{cookie:staff,expected:401});check(true,'logout revokes session');
 console.log(`\n${passed} integration checks passed against PostgreSQL.`);
}finally{
 await db.$transaction(async tx=>{
  await tx.sale.deleteMany({where:{productId:{in:ids.products}}});await tx.orderItem.deleteMany({where:{orderId:{in:ids.orders}}});await tx.order.deleteMany({where:{id:{in:ids.orders}}});
  await tx.stockMovement.deleteMany({where:{productId:{in:ids.products}}});await tx.alert.deleteMany({where:{productId:{in:ids.products}}});await tx.forecast.deleteMany({where:{productId:{in:ids.products}}});
  await tx.product.deleteMany({where:{id:{in:ids.products}}});await tx.supplier.deleteMany({where:{id:{in:ids.suppliers}}});await tx.category.deleteMany({where:{id:{in:ids.categories}}});await tx.customer.deleteMany({where:{id:{in:ids.customers}}});await tx.user.deleteMany({where:{id:{in:ids.users}}});
 },{timeout:30000});await db.$disconnect();
}

