import { z } from "zod";

import {
  MeasureSchema,
  SourceRecordSchema,
} from "./common";

export const NETWORK_COMPARISON_MODEL_VERSION =
  "pantrytwin-network-comparison-0.1.0";

export const NetworkComparisonRequestSchema = z.object({
  proposed: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  catchmentRadiusMeters: z.number().min(200).max(5000),
});
export type NetworkComparisonRequest = z.infer<
  typeof NetworkComparisonRequestSchema
>;

const NetworkCaseSchema = z.object({
  listedLocations: MeasureSchema,
  coveredPopulationInCandidateCatchment: MeasureSchema,
  uncoveredPopulationInCandidateCatchment: MeasureSchema,
  monthlyHouseholdVisits: MeasureSchema,
  capacityUtilization: MeasureSchema,
});

export const NetworkComparisonResultSchema = z.object({
  generatedAt: z.string(),
  proposed: z.object({
    lng: z.number(),
    lat: z.number(),
    catchmentRadiusMeters: z.number(),
    withinCityBoundary: z.boolean(),
  }),
  candidateCatchmentPopulation: MeasureSchema,
  nearbyListedServices: MeasureSchema,
  current: NetworkCaseSchema,
  expanded: NetworkCaseSchema,
  change: z.object({
    additionalListedLocations: MeasureSchema,
    newlyCoveredPopulation: MeasureSchema,
  }),
  limitations: z.array(z.string()),
  sources: z.array(SourceRecordSchema),
  modelVersion: z.string(),
});
export type NetworkComparisonResult = z.infer<
  typeof NetworkComparisonResultSchema
>;
