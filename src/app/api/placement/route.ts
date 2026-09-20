import { NextResponse } from "next/server";
import {
  PLACEMENT_MODEL_VERSION,
  PlacementIndexRequestSchema,
  type PlacementIndexResult,
} from "@/lib/contracts";
import {
  DEFAULT_PLACEMENT_WEIGHTS,
  placementLimitations,
} from "@/lib/geo/placement";
import { scoreCityPlacement } from "@/lib/geo/placementCity";

export const dynamic = "force-dynamic";

const cache = new Map<number, PlacementIndexResult>();

/**
 * Citywide placement scores for the map choropleth. Cached per assumed ring
 * so moving the radius slider does not recompute a radius already seen.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = PlacementIndexRequestSchema.safeParse({
    catchmentRadiusMeters: url.searchParams.get("catchmentRadiusMeters"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid placement request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { catchmentRadiusMeters } = parsed.data;
  const cached = cache.get(catchmentRadiusMeters);
  if (cached) return NextResponse.json(cached);

  const result: PlacementIndexResult = {
    catchmentRadiusMeters,
    modelVersion: PLACEMENT_MODEL_VERSION,
    weights: DEFAULT_PLACEMENT_WEIGHTS,
    tracts: scoreCityPlacement(catchmentRadiusMeters),
    limitations: placementLimitations(catchmentRadiusMeters),
  };
  cache.set(catchmentRadiusMeters, result);
  return NextResponse.json(result);
}
