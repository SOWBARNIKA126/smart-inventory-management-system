import {describe,expect,it} from 'vitest';
import {previewBill} from '../src/lib/billing-preview';
import {calculateBillTotals} from '../src/services/billing-business';

describe('cashier preview matches authoritative invoice arithmetic', () => {
  for (const intraState of [true,false]) for (const [name, lines, discount] of [
    ['mixed GST and discounts',[{productId:'b',quantity:3,unitPrice:33.33,gstPercentage:18,discount:3.01},{productId:'a',quantity:2,unitPrice:100,gstPercentage:5,discount:10}],25.01],
    ['penny allocation ties',Array.from({length:100},(_,i)=>({productId:`p-${100-i}`,quantity:1,unitPrice:1,gstPercentage:i%2?5:18,discount:0})),0.59],
    ['zero taxable value',[{productId:'a',quantity:3,unitPrice:0.01,gstPercentage:18,discount:0.03}],0],
  ] as const) it(`${name}, ${intraState ? 'CGST/SGST' : 'IGST'}`, () => {
    const mutable=[...lines];
    const preview=previewBill(mutable,discount,intraState);
    const server=calculateBillTotals(mutable,discount,intraState);
    for(const key of ['subtotal','discount','taxableAmount','cgst','sgst','igst','totalTax','total'] as const) expect(preview[key]).toBe(server[key].toNumber());
    for(const item of preview.items){const saved=server.items.find(line=>line.productId===item.productId)!;expect(item.total).toBe(saved.total.toNumber());expect(item.discount).toBe(saved.discount.toNumber());}
  });
});
