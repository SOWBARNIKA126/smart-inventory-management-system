import { logout } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/errors";

export async function POST(request: Request) {
  try { assertSameOrigin(request); await logout(); return json({ success: true }); }
  catch (error) { return errorResponse(error); }
}

