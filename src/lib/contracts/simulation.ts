import { z } from "zod";
import { MeasureSchema } from "./common";
import {
  OperatingPlanSchema,
  ScenarioNameSchema,
  SiteLabelSchema,
} from "./planning";

export const SIMULATION_HORIZON_DAYS = 28;

/** Which resource ran out first on a given day. */
export const BindingConstraintSchema = z.enum([
  "none",
  "staffing",
  "supply",
  "delivery",
  "demand",
]);
export type BindingConstraint = z.infer<typeof BindingConstraintSchema>;

export const DailyRecordSchema = z.object({
  day: z.number().int(),
  isServiceDay: z.boolean(),
  requestedHouseholds: z.number(),
  servedHouseholds: z.number(),
  unmetHouseholds: z.number(),
  poundsAccepted: z.number(),
  /** Intake turned away because storage was already full. */
  poundsNotAccepted: z.number(),
  poundsDistributed: z.number(),
  poundsSpoiled: z.number(),
  inventoryPounds: z.number(),
  bindingConstraint: BindingConstraintSchema,
});
export type DailyRecord = z.infer<typeof DailyRecordSchema>;

/** A named assumption echoed back with results so exports are self-describing. */
export const AssumptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  basis: z.string(),
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const ScenarioResultSchema = z.object({
  label: SiteLabelSchema,
  scenario: ScenarioNameSchema,
  horizonDays: z.number().int(),

  /** Demand is an assumption derived from catchment population, not a measurement. */
  assumedWeeklyHouseholdRequests: MeasureSchema,
  householdsServed: MeasureSchema,
  unmetRequests: MeasureSchema,
  serviceRate: MeasureSchema,
  poundsDistributed: MeasureSchema,
  poundsSpoiled: MeasureSchema,
  spoilageRate: MeasureSchema,
  poundsAccepted: MeasureSchema,
  poundsNotAccepted: MeasureSchema,
  endingInventoryPounds: MeasureSchema,
  totalCost: MeasureSchema,
  costPerHouseholdServed: MeasureSchema,

  bindingConstraintDays: z.record(BindingConstraintSchema, z.number()),
  daily: z.array(DailyRecordSchema),
  assumptions: z.array(AssumptionSchema),
  missingInputs: z.array(z.string()),
  modelVersion: z.string(),
});
export type ScenarioResult = z.infer<typeof ScenarioResultSchema>;

export const SimulatePlanRequestSchema = z.object({
  label: SiteLabelSchema,
  plan: OperatingPlanSchema,
  /**
   * People estimated to live inside the catchment. Null is allowed and makes
   * the demand-dependent outputs unavailable instead of zero.
   */
  catchmentPopulation: z.number().nullable(),
  scenario: ScenarioNameSchema,
});
export type SimulatePlanRequest = z.infer<typeof SimulatePlanRequestSchema>;
