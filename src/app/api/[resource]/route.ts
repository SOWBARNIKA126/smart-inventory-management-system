import { NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, json } from "@/lib/errors";
import { createResource, exportReport, listResource, updateResource } from "@/services/resources";
import {requireUser} from '@/lib/auth';
import {eventPlanCsv, getEventPlanning} from '@/services/event-planning';
import {AppError} from '@/lib/errors';

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params;
    if (resource === 'forecasting' && request.nextUrl.searchParams.get('view') === 'events' && request.nextUrl.searchParams.get('format') === 'csv') {
      await requireUser('forecasting');
      const result = await getEventPlanning(request.nextUrl.searchParams);
      if (!result.selected) throw new AppError('No upcoming events in this period.', 404);
      return new Response(eventPlanCsv(result.selected), {headers: {'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=event-stock-plan.csv','Cache-Control':'no-store'}});
    }
    if (resource === "reports" && request.nextUrl.searchParams.get("format") === "csv") {
      return new Response(await exportReport(request.nextUrl.searchParams), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=inventory-report.csv", "Cache-Control": "no-store" } });
    }
    return json(await listResource(resource, request.nextUrl.searchParams));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try { assertSameOrigin(request); return json(await createResource((await context.params).resource, await request.json()), 201); }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { resource } = await context.params;
    if (resource !== "settings") return json({ error: "Include the record ID in the URL" }, 400);
    return json(await updateResource(resource, "default", await request.json()));
  } catch (error) { return errorResponse(error); }
}
export const PUT = PATCH;
