import { NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, json } from "@/lib/errors";
import { deleteResource, getResource, updateResource } from "@/services/resources";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string; id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try { const { resource, id } = await context.params; return json(await getResource(resource, id, request.nextUrl.searchParams)); }
  catch (error) { return errorResponse(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { assertSameOrigin(request); const { resource, id } = await context.params; return json(await updateResource(resource, id, await request.json())); }
  catch (error) { return errorResponse(error); }
}
export const PUT = PATCH;
export async function DELETE(request: NextRequest, context: Context) {
  try { assertSameOrigin(request); const { resource, id } = await context.params; return json(await deleteResource(resource, id)); }
  catch (error) { return errorResponse(error); }
}

