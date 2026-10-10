import { MovementsPage } from "@/components/operations/inventory";
export default async function Page({ searchParams }: { searchParams: Promise<{ productId?: string }> }) { const { productId } = await searchParams; return <MovementsPage initialProductId={productId} />; }
