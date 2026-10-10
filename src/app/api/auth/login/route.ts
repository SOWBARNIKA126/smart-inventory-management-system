import { login } from "@/lib/auth";
import { assertSameOrigin, errorResponse, json } from "@/lib/errors";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try { assertSameOrigin(request); const input = loginSchema.parse(await request.json()); return json({ user: await login(input.email, input.password, input.rememberMe) }); }
  catch (error) { return errorResponse(error); }
}

