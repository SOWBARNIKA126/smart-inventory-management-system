import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/errors";
import { getBill } from "@/services/billing";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try { await requireUser("billing"); return json(await getBill((await context.params).id)); }
  catch (error) { return errorResponse(error); }
}
