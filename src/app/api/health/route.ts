import { NextResponse } from "next/server";
import { GEO_MODEL_VERSION, SIM_MODEL_VERSION } from "@/lib/contracts";
import { loadDatasets } from "@/lib/data/datasets";
import { isAssistantConfigured } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for the platform health check. Reports which
 * datasets are actually loaded so a deployment with missing cached data is
 * obvious immediately rather than at demo time.
 */
export function GET() {
  const data = loadDatasets();
  const ready = data.availability.tracts && data.availability.cityBoundary;

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      uptimeSeconds: Math.round(process.uptime()),
      datasets: {
        tracts: data.tracts.length,
        services: data.services.length,
        cityBoundary: data.availability.cityBoundary,
        tractPopulation: data.availability.tractPopulation,
        tractPoverty: data.availability.tractPoverty,
      },
      assistantConfigured: isAssistantConfigured(),
      modelVersions: { geo: GEO_MODEL_VERSION, simulation: SIM_MODEL_VERSION },
    },
    { status: ready ? 200 : 503 },
  );
}
