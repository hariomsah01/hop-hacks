import { NextResponse } from "next/server";
import { AnalyticsRequestSchema } from "@/lib/contracts";
import { buildAnalyticsSimulation } from "@/lib/analytics/simulate";

export const dynamic = "force-dynamic";

/**
 * Baseline vs selected-location scenario for the Analytics tab.
 * Organization history is forecast with ridge regression, then attributed to
 * the Map-tab catchment. Expansion adds one site's throughput at that pin,
 * scaled by crowding, poverty, and people with no nearby listing.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = AnalyticsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid analytics request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return NextResponse.json(buildAnalyticsSimulation(parsed.data));
}
