import OrderDetail from "@/components/operations/order-detail";
import {currentUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {redirect} from 'next/navigation';
export default async function Page({params}: {params: Promise<{id: string}>}) {
  if (!await currentUser()) redirect('/login');
  const {id} = await params;
  const order = await db.order.findUnique({where:{id},select:{isBill:true}});
  if (order?.isBill) redirect(`/billing/${id}`);
  return <OrderDetail id={id}/>;
}
