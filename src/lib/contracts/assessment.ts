import { z } from "zod";
import { MeasureSchema, SourceRecordSchema } from "./common";
import { CatchmentOverlapSchema, GeographicAnalysisSchema } from "./geo";
import { OperatingPlanSchema, ScenarioNameSchema } from "./planning";
import { ScenarioResultSchema } from "./simulation";

/**
 * A real pantry taken from a public listing, used as the reference point for a
 * proposed site.
 *
 * Its location is sourced. Its capacity, staffing, budget and current opening
 * hours are published nowhere, so they are absent here by design rather than
 * estimated. `publishedNotes` is free text from the publisher: in practice it
 * usually carries eligibility conditions rather than opening hours, and it is
 * never treated as verified.
 */
export const ReferencePantrySchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  program: z.string().nullable(),
  services: z.string().nullable(),
  phone: z.string().nullable(),
  publishedNotes: z.string().nullable(),
  lng: z.number(),
  lat: z.number(),
  sourceIds: z.array(z.string()),
  /** Straight-line distance from the proposed site. */
  distanceMeters: z.number(),
});
export type ReferencePantry = z.infer<typeof ReferencePantrySchema>;

/** One census tract the proposed site would newly bring into reach. */
export const NewlyCoveredTractSchema = z.object({
  geoid: z.string(),
  name: z.string().nullable(),
  population: z.number().nullable(),
  /** Share of this tract inside the proposed catchment but not the reference. */
  newAreaShare: z.number(),
  newPopulation: z.number().nullable(),
});
export type NewlyCoveredTract = z.infer<typeof NewlyCoveredTractSchema>;

/**
 * How the proposed catchment relates to what is already listed.
 *
 * Reach is geography, not demand: it counts who could get to a site, never who
 * would turn up. Net new reach is the decision-relevant figure because adding
 * a site inside an existing catchment mostly duplicates coverage.
 */
export const ReachComparisonSchema = z.object({
  proposedPopulation: MeasureSchema,
  referencePopulation: MeasureSchema,
  /** In the proposed catchment and not in the reference catchment. */
  netNewPopulation: MeasureSchema,
  /** In both catchments; reachable from either site. */
  duplicatedPopulation: MeasureSchema,
  /** Net new as a share of the proposed catchment. */
  netNewShare: MeasureSchema,
  /**
   * In the proposed catchment and outside the catchment of *every* listed
   * service, not just the chosen reference.
   */
  populationOutsideAllListings: MeasureSchema,
  nearbyListedServiceCount: MeasureSchema,
  newlyCoveredTracts: z.array(NewlyCoveredTractSchema),
  overlap: CatchmentOverlapSchema,
});
export type ReachComparison = z.infer<typeof ReachComparisonSchema>;

/**
 * A deterministic finding derived from the numbers, not written by the AI.
 *
 * `category` groups findings; `severity` flags whether something needs
 * attention. `gap` marks a genuine hole in the evidence, never a prediction.
 */
export const ConsequenceSchema = z.object({
  id: z.string(),
  category: z.enum([
    "reach",
    "duplication",
    "operations",
    "cost",
    "unknown",
  ]),
  severity: z.enum(["info", "watch", "gap"]),
  headline: z.string(),
  detail: z.string(),
});
export type Consequence = z.infer<typeof ConsequenceSchema>;

export const SiteAssessmentRequestSchema = z.object({
  /** The hypothetical pantry. Every operating variable is under your control. */
  proposed: z.object({ lng: z.number(), lat: z.number() }),
  /** Id of a real listing from the ingested roster, or null for reach-only. */
  referenceServiceId: z.string().nullable(),
  plan: OperatingPlanSchema,
});
export type SiteAssessmentRequest = z.infer<typeof SiteAssessmentRequestSchema>;

export const SiteAssessmentResultSchema = z.object({
  generatedAt: z.string(),
  plan: OperatingPlanSchema,

  proposed: GeographicAnalysisSchema,

  /** Null when no reference pantry has been chosen yet. */
  reference: z
    .object({
      pantry: ReferencePantrySchema,
      geography: GeographicAnalysisSchema,
      /** Everything the public data cannot tell us about this real site. */
      unknowns: z.array(z.string()),
    })
    .nullable(),

  reach: ReachComparisonSchema,

  /**
   * Only the proposed pantry is simulated. The reference pantry's resources
   * are unknown, so modelling its operations would mean inventing them.
   */
  scenarios: z.array(
    z.object({
      scenario: ScenarioNameSchema,
      proposed: ScenarioResultSchema,
    }),
  ),

  consequences: z.array(ConsequenceSchema),
  limitations: z.array(z.string()),
  sources: z.array(SourceRecordSchema),
  modelVersions: z.object({ geo: z.string(), simulation: z.string() }),
});
export type SiteAssessmentResult = z.infer<typeof SiteAssessmentResultSchema>;
