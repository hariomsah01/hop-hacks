import {
  area as turfArea,
  booleanPointInPolygon,
  circle,
  distance as turfDistance,
  feature as turfFeature,
  featureCollection,
  intersect,
  point as turfPoint,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  GEO_MODEL_VERSION,
  estimated,
  sourced,
  unavailable,
  type AnalyzeLocationRequest,
  type CatchmentOverlap,
  type DataCompleteness,
  type GeographicAnalysis,
  type PolygonGeometry,
  type ServiceListing,
  type TractContribution,
} from "@/lib/contracts";
import { loadDatasets, sourcesFor, type TractRecord } from "@/lib/data/datasets";
import { tractLabel } from "@/lib/geo/tractName";

/** Fixed vertex count keeps the same coordinates yielding the same geometry. */
const CIRCLE_STEPS = 128;

function toFeature(
  geometry: TractRecord["geometry"],
): Feature<Polygon | MultiPolygon> {
  return turfFeature(geometry as Polygon | MultiPolygon);
}

/** Builds the straight-line catchment ring around a candidate site. */
export function buildCatchment(
  lng: number,
  lat: number,
  radiusMeters: number,
): Feature<Polygon> {
  return circle([lng, lat], radiusMeters / 1000, {
    steps: CIRCLE_STEPS,
    units: "kilometers",
  });
}

/**
 * Areal interpolation of one tract attribute.
 *
 * Returns null when the tract does not report the attribute, so that missing
 * data propagates as missing instead of silently contributing zero.
 */
function apportion(value: number | null, areaShare: number): number | null {
  if (value === null) return null;
  return value * areaShare;
}

export function analyzeLocation(
  request: AnalyzeLocationRequest,
): GeographicAnalysis {
  const { location, catchmentRadiusMeters } = request;
  const data = loadDatasets();

  const catchment = buildCatchment(
    location.lng,
    location.lat,
    catchmentRadiusMeters,
  );
  const catchmentArea = turfArea(catchment);
  const sitePoint = turfPoint([location.lng, location.lat]);

  const withinCityBoundary = data.cityBoundary
    ? booleanPointInPolygon(
        sitePoint,
        data.cityBoundary as Polygon | MultiPolygon,
      )
    : false;

  // ------------------------------------------------------------- tract overlap
  const contributions: TractContribution[] = [];
  for (const tract of data.tracts) {
    const tractFeature = toFeature(tract.geometry);
    const tractArea = turfArea(tractFeature);
    if (tractArea <= 0) continue;

    let overlapArea = 0;
    try {
      const clipped = intersect(featureCollection([catchment, tractFeature]));
      overlapArea = clipped ? turfArea(clipped) : 0;
    } catch {
      // A malformed publisher polygon is skipped rather than guessed at.
      continue;
    }
    if (overlapArea <= 0) continue;

    // Share of the tract's own area that falls inside the ring. Population is
    // apportioned by this share, which assumes people are spread evenly across
    // the tract; the limitation is surfaced to the user.
    const areaShare = Math.min(1, overlapArea / tractArea);

    contributions.push({
      geoid: tract.geoid,
      name: tractLabel(tract.geoid, tract.name),
      areaShare,
      tractPopulation: tract.population,
      populationInCatchment: apportion(tract.population, areaShare),
      povertyCount: apportion(tract.povertyCount, areaShare),
      povertyUniverse: apportion(tract.povertyUniverse, areaShare),
      noVehicleHouseholds: apportion(tract.noVehicleHouseholds, areaShare),
      totalHouseholds: apportion(tract.households, areaShare),
      lowIncomeLowAccess: null,
    });
  }

  contributions.sort((a, b) => b.areaShare - a.areaShare);

  const tractSourceIds = ["tracts"];
  const limitations: string[] = [];
  const missingInputs: string[] = [];

  // --------------------------------------------------------------- population
  const populationParts = contributions
    .map((c) => c.populationInCatchment)
    .filter((v): v is number => v !== null);
  const tractsMissingPopulation = contributions.filter(
    (c) => c.tractPopulation === null,
  ).length;

  let estimatedCatchmentPopulation;
  if (contributions.length === 0) {
    // A genuine zero: the ring overlaps no tract, so coverage really is zero.
    estimatedCatchmentPopulation = estimated(
      0,
      "people",
      tractSourceIds,
      "The catchment does not intersect any Baltimore City tract",
    );
  } else if (populationParts.length === 0) {
    estimatedCatchmentPopulation = unavailable(
      "people",
      "No intersecting tract reports population",
    );
    missingInputs.push("Tract population is unavailable for this catchment");
  } else {
    estimatedCatchmentPopulation = estimated(
      populationParts.reduce((a, b) => a + b, 0),
      "people",
      tractSourceIds,
      tractsMissingPopulation > 0
        ? `${tractsMissingPopulation} of ${contributions.length} intersecting tracts report no population and are excluded`
        : `Area-weighted across ${contributions.length} intersecting tracts`,
    );
  }

  const peopleValue = estimatedCatchmentPopulation.value;

  // ---------------------------------------------------------------- rates
  // Rates are rebuilt from apportioned counts. Averaging tract-level
  // percentages would weight a 400-person tract like a 4,000-person one.
  const povertyNumerator = contributions
    .map((c) => c.povertyCount)
    .filter((v): v is number => v !== null);
  const povertyDenominator = contributions
    .map((c) => c.povertyUniverse)
    .filter((v): v is number => v !== null);

  const povertyRate =
    povertyNumerator.length > 0 &&
    povertyDenominator.length > 0 &&
    povertyDenominator.reduce((a, b) => a + b, 0) > 0
      ? estimated(
          povertyNumerator.reduce((a, b) => a + b, 0) /
            povertyDenominator.reduce((a, b) => a + b, 0),
          "share of population",
          ["acs"],
          "Aggregated from apportioned counts, not averaged across tract percentages",
        )
      : unavailable(
          "share of population",
          "Poverty counts require the Census ACS enrichment step (CENSUS_API_KEY)",
        );
  if (povertyRate.status === "unavailable") {
    missingInputs.push("Poverty rate is unavailable: ACS enrichment was not run");
  }

  const vehicleNumerator = contributions
    .map((c) => c.noVehicleHouseholds)
    .filter((v): v is number => v !== null);
  const householdDenominator = contributions
    .map((c) => c.totalHouseholds)
    .filter((v): v is number => v !== null);

  const noVehicleHouseholdShare =
    vehicleNumerator.length > 0 &&
    householdDenominator.length > 0 &&
    householdDenominator.reduce((a, b) => a + b, 0) > 0
      ? estimated(
          vehicleNumerator.reduce((a, b) => a + b, 0) /
            householdDenominator.reduce((a, b) => a + b, 0),
          "share of households",
          ["acs"],
          "Aggregated from apportioned household counts",
        )
      : unavailable(
          "share of households",
          "Vehicle access counts require the Census ACS enrichment step (CENSUS_API_KEY)",
        );
  if (noVehicleHouseholdShare.status === "unavailable") {
    missingInputs.push(
      "Vehicle access is unavailable: ACS enrichment was not run",
    );
  }

  const lowIncomeLowAccessTractCount = unavailable(
    "tracts",
    "USDA Food Access Research Atlas flags are not part of this build; the Baltimore Food_Access layer is a point roster, not a tract index",
  );

  // ------------------------------------------------------------- services
  const listedServices: ServiceListing[] = data.services
    .map((service) => {
      const metres =
        turfDistance(sitePoint, turfPoint([service.lng, service.lat]), {
          units: "kilometers",
        }) * 1000;
      return { service, metres };
    })
    .filter(({ metres }) => metres <= catchmentRadiusMeters)
    .map(({ service, metres }) => ({
      id: service.id,
      name: service.name,
      address: service.address,
      lng: service.lng,
      lat: service.lat,
      publishedHours: service.publishedHours,
      verificationStatus: "publisher-listed" as const,
      sourceId: service.sourceIds[0] ?? "services",
      distanceMeters: Math.round(metres),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const servicesWithHours = listedServices.filter(
    (s) => s.publishedHours !== null,
  ).length;

  // ----------------------------------------------------------- completeness
  const dataCompleteness: DataCompleteness[] = [
    {
      dataset: "Census tracts with population",
      expected: contributions.length,
      available: contributions.filter((c) => c.tractPopulation !== null).length,
      note: "Population is apportioned by the share of each tract inside the ring",
    },
    {
      dataset: "Listed services with published hours",
      expected: listedServices.length,
      available: servicesWithHours,
      note: "Published hours are not verified and capacity is not published at all",
    },
    {
      dataset: "Poverty and vehicle access (ACS)",
      expected: contributions.length,
      available: contributions.filter((c) => c.povertyUniverse !== null).length,
      note: "Requires CENSUS_API_KEY during ingestion",
    },
  ];

  // ------------------------------------------------------------ limitations
  limitations.push(
    "The catchment is a straight-line radius, not a walking-time or drive-time area. Streets, water and transit are not modelled.",
    "Catchment population assumes people are distributed evenly within each tract. A tract that is half inside the ring contributes half its population.",
  );
  if (listedServices.length > 0) {
    limitations.push(
      `${listedServices.length} listed service${listedServices.length === 1 ? "" : ""} fall inside this catchment. Nearby services are not automatically competition: they may be complementary, and their capacity and current hours are unknown (${servicesWithHours} of ${listedServices.length} publish any hours text).`,
    );
  }
  if (!withinCityBoundary) {
    limitations.push(
      "This point is outside the Baltimore City boundary. The datasets in this build cover Baltimore City only, so counts will be understated.",
    );
  }
  if (tractsMissingPopulation > 0) {
    limitations.push(
      `${tractsMissingPopulation} intersecting tract(s) report no population and are excluded from the estimate rather than counted as zero.`,
    );
  }
  if (!data.availability.tracts) {
    limitations.push(
      "No tract dataset is cached. Run `npm run ingest` to populate data/processed.",
    );
  }

  const estimatedCatchmentHouseholds =
    peopleValue === null
      ? unavailable(
          "households",
          "Depends on catchment population, which is unavailable",
        )
      : estimated(
          peopleValue,
          "people awaiting household conversion",
          tractSourceIds,
          "Converted to households by the simulation using the stated people-per-household assumption",
        );

  return {
    location,
    catchmentRadiusMeters,
    catchment: catchment.geometry as PolygonGeometry,
    withinCityBoundary,
    intersectingTracts: contributions,
    estimatedCatchmentPopulation,
    estimatedCatchmentHouseholds,
    povertyRate,
    noVehicleHouseholdShare,
    lowIncomeLowAccessTractCount,
    listedServices,
    listedServiceCount: sourced(
      listedServices.length,
      "listed services",
      ["pantries", "food-access"],
      "Count of published listings inside the ring; completeness of the roster is not guaranteed",
    ),
    dataCompleteness,
    limitations,
    missingInputs,
    sources: sourcesFor([...tractSourceIds, "pantries", "food-access", "acs"]),
    geoModelVersion: GEO_MODEL_VERSION,
  };
}

/**
 * Measures how much of the two catchments is the same ground, so the two
 * populations are never added together as unique coverage.
 */
export function compareCatchments(
  proposed: GeographicAnalysis,
  reference: GeographicAnalysis,
): CatchmentOverlap {
  const proposedRing = turfFeature(proposed.catchment as Polygon);
  const referenceRing = turfFeature(reference.catchment as Polygon);
  const proposedArea = turfArea(proposedRing);
  const referenceArea = turfArea(referenceRing);

  let overlapArea = 0;
  try {
    const shared = intersect(featureCollection([proposedRing, referenceRing]));
    overlapArea = shared ? turfArea(shared) : 0;
  } catch {
    overlapArea = 0;
  }

  const proposedGeoids = new Set(
    proposed.intersectingTracts.map((t) => t.geoid),
  );
  const sharedTractGeoids = reference.intersectingTracts
    .map((t) => t.geoid)
    .filter((geoid) => proposedGeoids.has(geoid));

  const shareOfProposed = proposedArea > 0 ? overlapArea / proposedArea : 0;
  const shareOfReference = referenceArea > 0 ? overlapArea / referenceArea : 0;

  const note =
    overlapArea <= 0
      ? "The two catchments do not overlap, so the proposed site would reach ground the reference pantry does not."
      : `The rings share ${(shareOfProposed * 100).toFixed(0)}% of the proposed catchment and ${(shareOfReference * 100).toFixed(0)}% of the reference pantry's, across ${sharedTractGeoids.length} shared tract(s). People in the shared area can already reach the existing pantry, so the two populations must not be added together.`;

  return {
    overlapAreaSqMeters: Math.round(overlapArea),
    shareOfProposed,
    shareOfReference,
    sharedTractGeoids,
    note,
  };
}
