import type { ValueStatus } from "@/lib/contracts";

/**
 * Coverage pressure is estimated, not sourced. It is geography plus published
 * counts. It does not say where a pantry should open, who would attend, or
 * whether a listed site is open or at capacity.
 */

export const PRESSURE_NOTE =
  "Estimated people × poverty rate × how far the tract centre sits from the nearest listed pantry, relative to this assumed straight-line ring. Not walking or drive time, and not a prediction that a pantry would succeed.";

export function tractPovertyRate(
  povertyCount: number | null,
  povertyUniverse: number | null,
): number | null {
  if (povertyCount === null || povertyUniverse === null) return null;
  if (povertyUniverse <= 0) return null;
  return povertyCount / povertyUniverse;
}

/**
 * Share of one assumed ring between a tract centre and the nearest listing.
 * 0 = a listed pantry sits on the centre. 1 = the nearest listing is at least
 * one assumed ring away. Null nearest (empty roster) is treated as fully
 * outside every listed ring.
 */
export function coverageGap(
  nearestListedMeters: number | null,
  radiusMeters: number,
): number | null {
  if (radiusMeters <= 0) return null;
  if (nearestListedMeters === null) return 1;
  if (nearestListedMeters < 0) return null;
  return Math.min(1, nearestListedMeters / radiusMeters);
}

export function rawPressure(input: {
  population: number | null;
  povertyRate: number | null;
  gap: number | null;
}): number | null {
  if (
    input.population === null ||
    input.povertyRate === null ||
    input.gap === null
  ) {
    return null;
  }
  return input.population * input.povertyRate * input.gap;
}

export function indexFromRaw(
  raw: number | null,
  maxRaw: number,
): number | null {
  if (raw === null) return null;
  if (maxRaw <= 0) return 0;
  return Math.round((raw / maxRaw) * 1000) / 10;
}

export function pressureStatus(
  population: number | null,
  povertyRate: number | null,
  gap: number | null,
): { status: ValueStatus; note: string } {
  if (population === null) {
    return {
      status: "unavailable",
      note: "Population is not published for this tract.",
    };
  }
  if (povertyRate === null) {
    return {
      status: "unavailable",
      note: "Poverty is not published for this tract.",
    };
  }
  if (gap === null) {
    return {
      status: "unavailable",
      note: "The assumed ring is not usable for this tract.",
    };
  }
  return { status: "estimated", note: PRESSURE_NOTE };
}

export type PressureProperties = {
  population: number | null;
  povertyRate: number | null;
  nearestListedMeters: number | null;
  gap: number | null;
  pressureRaw: number | null;
  pressureIndex: number | null;
};

export function scorePressureProperties(
  input: {
    population: number | null;
    povertyRate: number | null;
    nearestListedMeters: number | null;
  },
  radiusMeters: number,
): Omit<PressureProperties, "pressureIndex"> {
  const gap = coverageGap(input.nearestListedMeters, radiusMeters);
  return {
    population: input.population,
    povertyRate: input.povertyRate,
    nearestListedMeters: input.nearestListedMeters,
    gap,
    pressureRaw: rawPressure({
      population: input.population,
      povertyRate: input.povertyRate,
      gap,
    }),
  };
}

/**
 * Writes gap, raw pressure, and a 0-100 index onto tract features.
 * Missing population or poverty stays null. A computed zero (a tract whose
 * centre sits on a listing) is left as 0.
 */
export function applyPressureToCollection(
  tracts: GeoJSON.FeatureCollection,
  radiusMeters: number,
): GeoJSON.FeatureCollection {
  const prepared = tracts.features.map((feature) => {
    const props = feature.properties ?? {};
    const scored = scorePressureProperties(
      {
        population:
          typeof props.population === "number" ? props.population : null,
        povertyRate:
          typeof props.povertyRate === "number" ? props.povertyRate : null,
        nearestListedMeters:
          typeof props.nearestListedMeters === "number"
            ? props.nearestListedMeters
            : null,
      },
      radiusMeters,
    );
    return {
      feature,
      scored,
    };
  });

  let maxRaw = 0;
  for (const row of prepared) {
    if (row.scored.pressureRaw !== null && row.scored.pressureRaw > maxRaw) {
      maxRaw = row.scored.pressureRaw;
    }
  }

  return {
    type: "FeatureCollection",
    features: prepared.map(({ feature, scored }) => ({
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        ...scored,
        pressureIndex: indexFromRaw(scored.pressureRaw, maxRaw),
      },
    })),
  };
}
