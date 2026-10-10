import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/errors";
import { completeBill, listBills } from "@/services/billing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try { await requireUser("billing"); return json(await listBills(request.nextUrl.searchParams)); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireUser("billing");
    return json(await completeBill(await request.json(), user.id), 201);
  } catch (error) { return errorResponse(error); }
}
