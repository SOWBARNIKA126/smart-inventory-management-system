import { SupplierDetail } from "@/components/operations/suppliers";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SupplierDetail id={id} />; }
