import { z } from "zod";
import {
  DataCompletenessSchema,
  MeasureSchema,
  SourceRecordSchema,
  ValueStatusSchema,
} from "./common";
import { LocationSchema } from "./planning";

export const PolygonGeometrySchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.array(z.number()))),
});
export type PolygonGeometry = z.infer<typeof PolygonGeometrySchema>;

/**
 * One census tract that overlaps a catchment ring, together with the share of
 * its area that falls inside. `areaShare` drives the areal-interpolation
 * estimate and is surfaced so a reviewer can see partial tracts were not
 * counted whole.
 */
export const TractContributionSchema = z.object({
  geoid: z.string(),
  name: z.string().nullable(),
  areaShare: z.number().min(0).max(1),
  tractPopulation: z.number().nullable(),
  populationInCatchment: z.number().nullable(),
  povertyCount: z.number().nullable(),
  povertyUniverse: z.number().nullable(),
  noVehicleHouseholds: z.number().nullable(),
  totalHouseholds: z.number().nullable(),
  lowIncomeLowAccess: z.boolean().nullable(),
});
export type TractContribution = z.infer<typeof TractContributionSchema>;

/**
 * A pantry published by a public listing. Hours are kept separate from
 * verification status because a published hour string is not evidence that the
 * site is currently open.
 */
export const ServiceListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  lng: z.number(),
  lat: z.number(),
  publishedHours: z.string().nullable(),
  verificationStatus: z.enum(["unverified", "publisher-listed"]),
  sourceId: z.string(),
  distanceMeters: z.number(),
});
export type ServiceListing = z.infer<typeof ServiceListingSchema>;

export const GeographicAnalysisSchema = z.object({
  location: LocationSchema,
  catchmentRadiusMeters: z.number(),
  catchment: PolygonGeometrySchema,
  withinCityBoundary: z.boolean(),

  intersectingTracts: z.array(TractContributionSchema),
  estimatedCatchmentPopulation: MeasureSchema,
  estimatedCatchmentHouseholds: MeasureSchema,
  povertyRate: MeasureSchema,
  noVehicleHouseholdShare: MeasureSchema,
  lowIncomeLowAccessTractCount: MeasureSchema,

  listedServices: z.array(ServiceListingSchema),
  listedServiceCount: MeasureSchema,

  dataCompleteness: z.array(DataCompletenessSchema),
  limitations: z.array(z.string()),
  missingInputs: z.array(z.string()),
  sources: z.array(SourceRecordSchema),
  geoModelVersion: z.string(),
});
export type GeographicAnalysis = z.infer<typeof GeographicAnalysisSchema>;

export const AnalyzeLocationRequestSchema = z.object({
  location: LocationSchema,
  catchmentRadiusMeters: z.number().min(200).max(5000),
  dataVersion: z.string().optional(),
});
export type AnalyzeLocationRequest = z.infer<
  typeof AnalyzeLocationRequestSchema
>;

/**
 * Overlap between the proposed catchment and the reference pantry's catchment.
 * Shared area is reported so the two populations are never added together as
 * unique coverage.
 */
export const CatchmentOverlapSchema = z.object({
  overlapAreaSqMeters: z.number(),
  shareOfProposed: z.number(),
  shareOfReference: z.number(),
  sharedTractGeoids: z.array(z.string()),
  note: z.string(),
});
export type CatchmentOverlap = z.infer<typeof CatchmentOverlapSchema>;

/**
 * Rank of a census tract as a candidate pantry site. Estimated from net new
 * reach, poverty on that new ground, and households without a vehicle.
 * It is not a probability that a pantry would succeed.
 */
export const PlacementWeightsSchema = z.object({
  netNewReach: z.number(),
  povertyOnNewGround: z.number(),
  noVehicleOnNewGround: z.number(),
});
export type PlacementWeights = z.infer<typeof PlacementWeightsSchema>;

export const PlacementScoreSchema = z.object({
  geoid: z.string(),
  coveredShare: z.number().nullable(),
  netNewPeople: z.number().nullable(),
  povertyOnNewGround: z.number().nullable(),
  noVehicleOnNewGround: z.number().nullable(),
  placementIndex: z.number().nullable(),
  status: ValueStatusSchema,
  note: z.string(),
});
export type PlacementScore = z.infer<typeof PlacementScoreSchema>;

export const PlacementIndexRequestSchema = z.object({
  catchmentRadiusMeters: z.coerce.number().min(200).max(5000),
});
export type PlacementIndexRequest = z.infer<typeof PlacementIndexRequestSchema>;

export const PlacementIndexResultSchema = z.object({
  catchmentRadiusMeters: z.number(),
  modelVersion: z.string(),
  weights: PlacementWeightsSchema,
  tracts: z.array(PlacementScoreSchema),
  limitations: z.array(z.string()),
});
export type PlacementIndexResult = z.infer<typeof PlacementIndexResultSchema>;
