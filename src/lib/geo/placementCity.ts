import {
  area as turfArea,
  bbox as turfBbox,
  centroid as turfCentroid,
  circle,
  distance as turfDistance,
  feature as turfFeature,
  featureCollection,
  intersect,
  union,
} from "@turf/turf";
import type { BBox, Feature, MultiPolygon, Polygon } from "geojson";
import type { PlacementScore, PlacementWeights } from "@/lib/contracts";
import { loadDatasets, type ServiceRecord, type TractRecord } from "@/lib/data/datasets";
import {
  DEFAULT_PLACEMENT_WEIGHTS,
  PLACEMENT_CIRCLE_STEPS,
  apportionUncovered,
  attachPlacementIndex,
  type PlacementComponents,
} from "@/lib/geo/placement";

type AnyPolygon = Feature<Polygon | MultiPolygon>;

function placementCatchment(
  lng: number,
  lat: number,
  radiusMeters: number,
): Feature<Polygon> {
  return circle([lng, lat], radiusMeters / 1000, {
    steps: PLACEMENT_CIRCLE_STEPS,
    units: "kilometers",
  });
}

function toFeature(
  geometry: TractRecord["geometry"],
): AnyPolygon {
  return turfFeature(geometry as Polygon | MultiPolygon);
}

function safeIntersect(a: AnyPolygon, b: AnyPolygon): AnyPolygon | null {
  try {
    return intersect(featureCollection([a, b])) as AnyPolygon | null;
  } catch {
    return null;
  }
}

function safeUnion(a: AnyPolygon, b: AnyPolygon): AnyPolygon | null {
  try {
    return (union(featureCollection([a, b])) as AnyPolygon | null) ?? null;
  } catch {
    return null;
  }
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function tractCentre(
  geometry: TractRecord["geometry"],
): { lng: number; lat: number } | null {
  try {
    const point = turfCentroid(toFeature(geometry));
    const [lng, lat] = point.geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
  } catch {
    return null;
  }
}

/**
 * Share of a tract already inside at least one listed service's assumed ring.
 * An empty roster is treated as no listed coverage (share 0). A computed
 * zero is a tract whose polygon sits entirely outside every ring.
 */
export function listedCoverageShare(
  geometry: TractRecord["geometry"],
  services: Pick<ServiceRecord, "lng" | "lat">[],
  radiusMeters: number,
): number | null {
  const feature = toFeature(geometry);
  const area = turfArea(feature);
  if (area <= 0) return null;
  if (radiusMeters <= 0) return null;
  if (services.length === 0) return 0;

  const tractBbox = turfBbox(feature) as BBox;
  let merged: AnyPolygon | null = null;

  for (const service of services) {
    const ring = placementCatchment(service.lng, service.lat, radiusMeters);
    if (!bboxesOverlap(tractBbox, turfBbox(ring) as BBox)) continue;
    const piece = safeIntersect(feature, ring as AnyPolygon);
    if (!piece) continue;
    if (!merged) {
      merged = piece;
      continue;
    }
    const next = safeUnion(merged, piece);
    if (next) merged = next;
  }

  if (!merged) return 0;
  return Math.min(1, turfArea(merged) / area);
}

interface PreparedTract {
  geoid: string;
  area: number;
  centre: { lng: number; lat: number } | null;
  coveredShare: number | null;
  uncoveredPeople: number | null;
  uncoveredPoverty: number | null;
  uncoveredNoVehicle: number | null;
}

function sumRingAround(
  lng: number,
  lat: number,
  radiusMeters: number,
  tracts: PreparedTract[],
): {
  netNewPeople: number | null;
  povertyOnNewGround: number | null;
  noVehicleOnNewGround: number | null;
} {
  let people = 0;
  let poverty = 0;
  let noVehicle = 0;
  let peopleKnown = false;
  let povertyKnown = false;
  let noVehicleKnown = false;
  const origin: [number, number] = [lng, lat];

  for (const tract of tracts) {
    if (!tract.centre) continue;
    const metres =
      turfDistance(origin, [tract.centre.lng, tract.centre.lat], {
        units: "kilometers",
      }) * 1000;
    if (metres > radiusMeters) continue;

    if (tract.uncoveredPeople !== null) {
      people += tract.uncoveredPeople;
      peopleKnown = true;
    }
    if (tract.uncoveredPoverty !== null) {
      poverty += tract.uncoveredPoverty;
      povertyKnown = true;
    }
    if (tract.uncoveredNoVehicle !== null) {
      noVehicle += tract.uncoveredNoVehicle;
      noVehicleKnown = true;
    }
  }

  return {
    netNewPeople: peopleKnown ? people : null,
    povertyOnNewGround: povertyKnown ? poverty : null,
    noVehicleOnNewGround: noVehicleKnown ? noVehicle : null,
  };
}

const scoreCache = new Map<string, PlacementScore[]>();

function cacheKey(
  radiusMeters: number,
  weights: PlacementWeights,
): string {
  return `${radiusMeters}:${weights.netNewReach}:${weights.povertyOnNewGround}:${weights.noVehicleOnNewGround}`;
}

/**
 * Scores every Baltimore tract as a candidate site at its centroid.
 *
 * Listed coverage is measured per tract polygon. Neighbouring tracts are
 * counted when their centre falls inside the assumed ring. That is a
 * coarser rule than the pin assessment's area-weighted overlap, and is
 * labelled as such.
 */
export function scoreCityPlacement(
  radiusMeters: number,
  weights: PlacementWeights = DEFAULT_PLACEMENT_WEIGHTS,
): PlacementScore[] {
  const key = cacheKey(radiusMeters, weights);
  const cached = scoreCache.get(key);
  if (cached) return cached;
  const { tracts, services } = loadDatasets();

  const serviceRings = services.map((service) => {
    const ring = placementCatchment(service.lng, service.lat, radiusMeters);
    return {
      lng: service.lng,
      lat: service.lat,
      ring: ring as AnyPolygon,
      bbox: turfBbox(ring) as BBox,
    };
  });

  const prepared: PreparedTract[] = tracts.map((tract) => {
    const feature = toFeature(tract.geometry);
    const area = turfArea(feature);
    const tractBbox = turfBbox(feature) as BBox;
    const centre = tractCentre(tract.geometry);
    let coveredShare: number | null = null;
    if (area > 0 && radiusMeters > 0) {
      if (serviceRings.length === 0) {
        coveredShare = 0;
      } else {
        const nearby = serviceRings
          .filter((service) => bboxesOverlap(tractBbox, service.bbox))
          .map((service) => {
            const metres = centre
              ? turfDistance(
                  [centre.lng, centre.lat],
                  [service.lng, service.lat],
                  { units: "kilometers" },
                ) * 1000
              : Number.POSITIVE_INFINITY;
            return { service, metres };
          })
          .sort((a, b) => a.metres - b.metres)
          .slice(0, 8);

        let merged: AnyPolygon | null = null;
        for (const { service } of nearby) {
          const piece = safeIntersect(feature, service.ring);
          if (!piece) continue;
          if (!merged) {
            merged = piece;
            continue;
          }
          const next = safeUnion(merged, piece);
          if (next) merged = next;
        }
        coveredShare = merged ? Math.min(1, turfArea(merged) / area) : 0;
      }
    }

    return {
      geoid: tract.geoid,
      area,
      centre,
      coveredShare,
      uncoveredPeople: apportionUncovered(tract.population, coveredShare),
      uncoveredPoverty: apportionUncovered(tract.povertyCount, coveredShare),
      uncoveredNoVehicle: apportionUncovered(
        tract.noVehicleHouseholds,
        coveredShare,
      ),
    };
  });

  const components: PlacementComponents[] = prepared.map((candidate) => {
    if (!candidate.centre || candidate.area <= 0) {
      return {
        geoid: candidate.geoid,
        coveredShare: candidate.coveredShare,
        netNewPeople: null,
        povertyOnNewGround: null,
        noVehicleOnNewGround: null,
      };
    }

    const totals = sumRingAround(
      candidate.centre.lng,
      candidate.centre.lat,
      radiusMeters,
      prepared,
    );
    return {
      geoid: candidate.geoid,
      coveredShare: candidate.coveredShare,
      ...totals,
    };
  });

  const scored = attachPlacementIndex(components, weights);
  scoreCache.set(key, scored);
  return scored;
}
