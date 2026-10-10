import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function serialize(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
}

export function json(value: unknown, status = 200) {
  return NextResponse.json(serialize(value), { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: error.issues.map(i => `${i.path.join(".") || "Input"}: ${i.message}`).join("; ") }, 400);
  if (error instanceof SyntaxError) return json({ error: "Invalid JSON request body" }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return json({ error: "A record with that unique value already exists" }, 409);
    if (error.code === "P2025") return json({ error: "Record not found" }, 404);
    if (error.code === "P2003") return json({ error: "The selected related record does not exist or is still in use" }, 400);
    if (error.code === "P2034") return json({ error: "Concurrent update detected. Please retry." }, 409);
  }
  console.error("Request failed:", error instanceof Error ? error.name : "Unknown error");
  return json({ error: "Unable to complete this request. Please try again." }, 500);
}

export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("Cross-site requests are not permitted", 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json") && request.method !== "DELETE") {
    throw new AppError("Use application/json for this request", 415);
  }
}

