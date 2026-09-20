import {
  PLACEMENT_MODEL_VERSION,
  type PlacementScore,
  type PlacementWeights,
  type ValueStatus,
} from "@/lib/contracts";

/**
 * Vertices used by the citywide choropleth rings. The pin assessment still
 * uses the finer 128-step ring.
 */
export const PLACEMENT_CIRCLE_STEPS = 32;

/**
 * Equal planner weights. They are assumed, not fitted from pantry outcomes.
 * The index ranks tracts under these weights; it does not predict attendance.
 */
export const DEFAULT_PLACEMENT_WEIGHTS: PlacementWeights = {
  netNewReach: 1,
  povertyOnNewGround: 1,
  noVehicleOnNewGround: 1,
};

export const PLACEMENT_NOTE =
  "Estimated ranking if a pantry sat at this tract's centre: people inside the assumed straight-line ring who sit outside every listed service's ring, poverty on that new ground, and households without a vehicle, equally weighted. Not walking time, and not a prediction that a pantry would succeed.";

export function apportionUncovered(
  count: number | null,
  coveredShare: number | null,
): number | null {
  if (count === null || coveredShare === null) return null;
  return count * (1 - coveredShare);
}

function normalizeToUnit(value: number, min: number, max: number): number {
  if (max <= 0 && min <= 0) return 0;
  if (max <= min) return value > 0 ? 1 : 0;
  return (value - min) / (max - min);
}

function roundIndex(value: number): number {
  return Math.round(value * 10) / 10;
}

function boundsOf(
  values: Array<number | null>,
): { min: number; max: number } | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return {
    min: Math.min(...known),
    max: Math.max(...known),
  };
}

export interface PlacementComponents {
  geoid: string;
  coveredShare: number | null;
  netNewPeople: number | null;
  povertyOnNewGround: number | null;
  noVehicleOnNewGround: number | null;
}

function componentNote(missing: string[]): string {
  if (missing.length === 0) return PLACEMENT_NOTE;
  return `${PLACEMENT_NOTE} Missing for this tract: ${missing.join(", ")}.`;
}

export function attachPlacementIndex(
  rows: PlacementComponents[],
  weights: PlacementWeights = DEFAULT_PLACEMENT_WEIGHTS,
): PlacementScore[] {
  const peopleBounds = boundsOf(rows.map((row) => row.netNewPeople));
  const povertyBounds = boundsOf(rows.map((row) => row.povertyOnNewGround));
  const vehicleBounds = boundsOf(rows.map((row) => row.noVehicleOnNewGround));

  return rows.map((row) => {
    const missing: string[] = [];
    const parts: Array<{
      value: number;
      weight: number;
      bounds: { min: number; max: number };
    }> = [];

    if (row.netNewPeople === null || peopleBounds === null) {
      missing.push("net new people");
    } else {
      parts.push({
        value: row.netNewPeople,
        weight: weights.netNewReach,
        bounds: peopleBounds,
      });
    }

    if (row.povertyOnNewGround === null || povertyBounds === null) {
      missing.push("poverty on new ground");
    } else {
      parts.push({
        value: row.povertyOnNewGround,
        weight: weights.povertyOnNewGround,
        bounds: povertyBounds,
      });
    }

    if (row.noVehicleOnNewGround === null || vehicleBounds === null) {
      missing.push("households without a vehicle");
    } else {
      parts.push({
        value: row.noVehicleOnNewGround,
        weight: weights.noVehicleOnNewGround,
        bounds: vehicleBounds,
      });
    }

    let status: ValueStatus;
    let note: string;
    let placementIndex: number | null;

    if (parts.length === 0) {
      status = "unavailable";
      placementIndex = null;
      note =
        "Net new people, poverty, and households without a vehicle are all unpublished for this tract.";
    } else {
      const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
      const mixed =
        parts.reduce(
          (sum, part) =>
            sum +
            part.weight *
              normalizeToUnit(part.value, part.bounds.min, part.bounds.max),
          0,
        ) / weightSum;
      placementIndex = roundIndex(mixed * 100);
      status = "estimated";
      note = componentNote(missing);
    }

    return {
      geoid: row.geoid,
      coveredShare:
        row.coveredShare === null
          ? null
          : Math.round(row.coveredShare * 10000) / 10000,
      netNewPeople:
        row.netNewPeople === null ? null : Math.round(row.netNewPeople),
      povertyOnNewGround:
        row.povertyOnNewGround === null
          ? null
          : Math.round(row.povertyOnNewGround),
      noVehicleOnNewGround:
        row.noVehicleOnNewGround === null
          ? null
          : Math.round(row.noVehicleOnNewGround),
      placementIndex,
      status,
      note,
    };
  });
}

export function mergePlacementIntoCollection(
  tracts: GeoJSON.FeatureCollection,
  scores: PlacementScore[],
): GeoJSON.FeatureCollection {
  const byId = new Map(scores.map((score) => [score.geoid, score]));
  return {
    type: "FeatureCollection",
    features: tracts.features.map((feature) => {
      const geoid =
        typeof feature.properties?.geoid === "string"
          ? feature.properties.geoid
          : null;
      const score = geoid ? byId.get(geoid) : undefined;
      return {
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: {
          ...feature.properties,
          placementIndex: score?.placementIndex ?? null,
          netNewPeople: score?.netNewPeople ?? null,
          povertyOnNewGround: score?.povertyOnNewGround ?? null,
          noVehicleOnNewGround: score?.noVehicleOnNewGround ?? null,
          coveredShare: score?.coveredShare ?? null,
        },
      };
    }),
  };
}

export function placementLimitations(radiusMeters: number): string[] {
  return [
    `Each listed service is given the same ${radiusMeters} m straight-line ring because no dataset states how far a real pantry draws from.`,
    "People, poverty counts and households without a vehicle are spread evenly inside each tract. A neighbouring tract is counted for a candidate when its centre falls inside the assumed ring.",
    "Listed coverage for the choropleth unions at most eight nearby service rings per tract so the map stays interactive. A listing farther than those eight is omitted from that tract's covered share.",
    "Listed nearby services are not proof of capacity, current hours, or competition.",
    `Model ${PLACEMENT_MODEL_VERSION}. Weights are assumed and equal. Choropleth rings use ${PLACEMENT_CIRCLE_STEPS} vertices so the citywide score stays interactive; the pin assessment still uses the finer ring.`,
  ];
}
