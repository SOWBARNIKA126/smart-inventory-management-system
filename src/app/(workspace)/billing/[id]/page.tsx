import BillingInvoice from '@/components/billing-invoice';

export default async function Page({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  return <BillingInvoice id={id} />;
}
