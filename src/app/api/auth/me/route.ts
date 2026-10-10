import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse, json } from "@/lib/errors";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await requireUser();
    const [store, alertCount] = await Promise.all([db.storeSettings.findUnique({ where: { id: "default" }, select: { storeName: true, currency: true } }), db.alert.count({ where: { status: "ACTIVE" } })]);
    return json({ user, store, alertCount });
  } catch (error) { return errorResponse(error); }
}

