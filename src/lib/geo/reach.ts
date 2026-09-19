import {
  area as turfArea,
  distance as turfDistance,
  feature as turfFeature,
  featureCollection,
  intersect,
  point as turfPoint,
  union,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  estimated,
  sourced,
  unavailable,
  type GeographicAnalysis,
  type NewlyCoveredTract,
  type ReachComparison,
} from "@/lib/contracts";
import { loadDatasets, type TractRecord } from "@/lib/data/datasets";
import { buildCatchment, compareCatchments } from "@/lib/geo/analyze";

type AnyPolygon = Feature<Polygon | MultiPolygon>;

/** Below this share of a tract, a sliver of new ground is not worth listing. */
const MIN_REPORTABLE_SHARE = 0.005;

function toFeature(geometry: TractRecord["geometry"]): AnyPolygon {
  return turfFeature(geometry as Polygon | MultiPolygon);
}

function safeIntersect(a: AnyPolygon, b: AnyPolygon): AnyPolygon | null {
  try {
    return intersect(featureCollection([a, b])) as AnyPolygon | null;
  } catch {
    // A malformed publisher polygon is skipped rather than guessed at.
    return null;
  }
}

function safeIntersectArea(a: AnyPolygon | null, b: AnyPolygon): number {
  if (!a) return 0;
  const clipped = safeIntersect(a, b);
  return clipped ? turfArea(clipped) : 0;
}

/**
 * Ground inside the proposed ring that is already inside the ring of at least
 * one listed service.
 *
 * Every listed service is given the same radius as the proposed site, because
 * no dataset states how far any real pantry actually draws from. That is an
 * assumption for comparability, and it travels with the number.
 */
function listedCoverage(
  proposedRing: AnyPolygon,
  lng: number,
  lat: number,
  radiusMeters: number,
): { coverage: AnyPolygon | null; nearbyCount: number } {
  const { services } = loadDatasets();
  const centre = turfPoint([lng, lat]);

  let merged: AnyPolygon | null = null;
  let nearbyCount = 0;

  for (const service of services) {
    const metres =
      turfDistance(centre, turfPoint([service.lng, service.lat]), {
        units: "kilometers",
      }) * 1000;
    // Two rings of equal radius cannot meet beyond twice that radius.
    if (metres >= radiusMeters * 2) continue;

    nearbyCount += 1;
    const ring = buildCatchment(
      service.lng,
      service.lat,
      radiusMeters,
    ) as AnyPolygon;

    if (!merged) {
      merged = ring;
      continue;
    }
    try {
      merged = (union(featureCollection([merged, ring])) as AnyPolygon) ?? merged;
    } catch {
      // Keep what merged cleanly rather than dropping the whole calculation.
    }
  }

  return {
    coverage: merged ? safeIntersect(proposedRing, merged) : null,
    nearbyCount,
  };
}

/**
 * Compares the ground a proposed pantry would reach against the ground already
 * reached by a chosen real pantry, and by every listed service.
 *
 * Reach is geography only. These numbers say who *could* walk to a site, never
 * how many would come, and never anything about whether an existing pantry has
 * the capacity to serve the people already inside its ring.
 */
export function computeReach(
  proposed: GeographicAnalysis,
  reference: GeographicAnalysis | null,
): ReachComparison {
  const { tracts } = loadDatasets();
  const tractById = new Map(tracts.map((t) => [t.geoid, t]));

  const proposedRing = turfFeature(proposed.catchment as Polygon) as AnyPolygon;
  const referenceRing = reference
    ? (turfFeature(reference.catchment as Polygon) as AnyPolygon)
    : null;

  // Ground covered by both rings. Anyone here can already reach the existing
  // pantry, so they are not new coverage.
  const sharedRing = referenceRing
    ? safeIntersect(proposedRing, referenceRing)
    : null;

  const { coverage, nearbyCount } = listedCoverage(
    proposedRing,
    proposed.location.lng,
    proposed.location.lat,
    proposed.catchmentRadiusMeters,
  );

  let netNew = 0;
  let duplicated = 0;
  let outsideAll = 0;
  let tractsWithPopulation = 0;
  const newlyCovered: NewlyCoveredTract[] = [];

  for (const contribution of proposed.intersectingTracts) {
    const tract = tractById.get(contribution.geoid);
    if (!tract) continue;

    const tractFeature = toFeature(tract.geometry);
    const tractArea = turfArea(tractFeature);
    if (tractArea <= 0) continue;

    // Share of this tract that the proposed ring shares with the reference.
    const duplicatedShare = Math.min(
      contribution.areaShare,
      safeIntersectArea(sharedRing, tractFeature) / tractArea,
    );
    const newShare = Math.max(0, contribution.areaShare - duplicatedShare);

    const coveredShare = Math.min(
      contribution.areaShare,
      safeIntersectArea(coverage, tractFeature) / tractArea,
    );
    const outsideShare = Math.max(0, contribution.areaShare - coveredShare);

    const population = contribution.tractPopulation;
    if (population === null) continue;

    tractsWithPopulation += 1;
    const newPopulation = population * newShare;

    netNew += newPopulation;
    duplicated += population * duplicatedShare;
    outsideAll += population * outsideShare;

    if (newShare > MIN_REPORTABLE_SHARE) {
      newlyCovered.push({
        geoid: contribution.geoid,
        name: contribution.name,
        population,
        newAreaShare: newShare,
        newPopulation,
      });
    }
  }

  newlyCovered.sort((a, b) => (b.newPopulation ?? 0) - (a.newPopulation ?? 0));

  const proposedPopulation = proposed.estimatedCatchmentPopulation;
  const hasPopulation =
    proposedPopulation.value !== null && tractsWithPopulation > 0;

  const tractSources = ["tracts"];

  const netNewPopulation = !hasPopulation
    ? unavailable(
        "people",
        "No intersecting tract reports population, so new reach cannot be separated from duplicated reach",
      )
    : reference === null
      ? estimated(
          netNew,
          "people",
          tractSources,
          "No reference pantry selected, so the whole catchment is counted as new relative to nothing. Select a real pantry to see duplicated reach.",
        )
      : estimated(
          netNew,
          "people",
          tractSources,
          "People inside the proposed ring and outside the reference pantry's ring, apportioned by tract area. Reach only: it does not mean these people would attend.",
        );

  const duplicatedPopulation =
    reference === null
      ? unavailable(
          "people",
          "No reference pantry has been selected",
        )
      : !hasPopulation
        ? unavailable(
            "people",
            "No intersecting tract reports population",
          )
        : estimated(
            duplicated,
            "people",
            tractSources,
            "People who can already reach the reference pantry. They must not be counted as coverage this site would add.",
          );

  const proposedValue = proposedPopulation.value;
  const netNewShare =
    !hasPopulation || proposedValue === null || proposedValue <= 0
      ? unavailable(
          "share of proposed catchment",
          "Requires a catchment population greater than zero",
        )
      : estimated(
          netNew / proposedValue,
          "share of proposed catchment",
          tractSources,
          "Share of the proposed catchment that the reference pantry does not already reach",
        );

  return {
    proposedPopulation,
    referencePopulation:
      reference?.estimatedCatchmentPopulation ??
      unavailable("people", "No reference pantry has been selected"),
    netNewPopulation,
    duplicatedPopulation,
    netNewShare,
    populationOutsideAllListings: !hasPopulation
      ? unavailable(
          "people",
          "No intersecting tract reports population",
        )
      : estimated(
          outsideAll,
          "people",
          tractSources,
          `People inside the proposed ring and outside the ring of all ${nearbyCount} nearby listed services. Each listed service was given the same ${proposed.catchmentRadiusMeters} m radius, because no dataset states how far a real pantry draws from.`,
        ),
    nearbyListedServiceCount: sourced(
      nearbyCount,
      "listed services",
      ["pantries", "food-access"],
      "Listings close enough that their assumed ring could touch the proposed ring. Completeness of the published roster is not guaranteed.",
    ),
    newlyCoveredTracts: newlyCovered,
    overlap: reference
      ? compareCatchments(proposed, reference)
      : {
          overlapAreaSqMeters: 0,
          shareOfProposed: 0,
          shareOfReference: 0,
          sharedTractGeoids: [],
          note: "No reference pantry has been selected, so there is nothing to overlap with.",
        },
  };
}
