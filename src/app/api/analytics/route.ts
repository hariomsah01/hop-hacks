import { NextResponse } from "next/server";
import { AnalyticsRequestSchema } from "@/lib/contracts";
import { buildAnalyticsSimulation } from "@/lib/analytics/simulate";

export const dynamic = "force-dynamic";

/**
 * Baseline vs selected-location scenario for the Analytics tab.
 * Historical organization records are joined with Baltimore unemployment and
 * forecast with ridge regression in the server-side analytics module.
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
