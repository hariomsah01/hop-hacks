import { z } from "zod";

/**
 * Which of the two sites a value belongs to.
 *
 * `proposed` is the hypothetical pantry whose variables the planner controls.
 * `reference` is a real pantry taken from a public listing: its location is
 * known, its operating capacity is not.
 */
export const SiteLabelSchema = z.enum(["proposed", "reference"]);
export type SiteLabel = z.infer<typeof SiteLabelSchema>;

export const LocationSchema = z.object({
  label: SiteLabelSchema,
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type Location = z.infer<typeof LocationSchema>;

/** Demand scenarios are run as a paired low / medium / high set. */
export const ScenarioNameSchema = z.enum(["low", "medium", "high"]);
export type ScenarioName = z.infer<typeof ScenarioNameSchema>;

/**
 * The operating plan for the *proposed* pantry. Every field is a planner
 * assumption, never a measurement, and is labeled as such in the UI.
 *
 * It is deliberately not applied to the reference pantry. No public dataset
 * states an existing pantry's staffing, food volume, storage or budget, so
 * modelling its operations would mean inventing them. The reference site
 * contributes its real location only.
 */
export const OperatingPlanSchema = z.object({
  /**
   * Straight-line radius used to build the catchment ring. This is a
   * geometric buffer, not a walking-time or drive-time isochrone.
   */
  catchmentRadiusMeters: z.number().min(200).max(5000),

  serviceDaysPerWeek: z.number().int().min(1).max(7),
  volunteerHoursPerWeek: z.number().min(0).max(2000),
  volunteerMinutesPerHousehold: z.number().min(1).max(240),

  foodIntakePoundsPerWeek: z.number().min(0).max(500_000),
  poundsPerHousehold: z.number().min(1).max(500),
  storageCapacityPounds: z.number().min(0).max(1_000_000),

  /** Share of incoming food that is perishable, expressed 0-1. */
  perishableShare: z.number().min(0).max(1),
  perishableShelfLifeDays: z.number().int().min(1).max(60),
  shelfStableShelfLifeDays: z.number().int().min(1).max(720),

  /** Households reachable per week by delivery, on top of walk-in service. */
  deliveryCapacityHouseholdsPerWeek: z.number().min(0).max(10_000),

  fixedCostPerMonth: z.number().min(0).max(1_000_000),
  variableCostPerHousehold: z.number().min(0).max(1000),

  /**
   * Conversion assumption. Catchment population is measured in people, while
   * pantry operations are measured in household visits. This is the divisor,
   * and it is displayed next to any number that depends on it.
   */
  peoplePerHousehold: z.number().min(1).max(10),

  /**
   * Assumed share of catchment households that request food in a given week,
   * per scenario. Geographic reach is not observed demand, so this stays an
   * explicit assumption and is swept across three values.
   */
  weeklyParticipationRate: z.object({
    low: z.number().min(0).max(1),
    medium: z.number().min(0).max(1),
    high: z.number().min(0).max(1),
  }),
});
export type OperatingPlan = z.infer<typeof OperatingPlanSchema>;

/**
 * Starting values for the planner panel. These are editable defaults chosen to
 * be plausible for a small urban pantry; they are not measurements of any real
 * Baltimore organization and are labeled "assumed" everywhere they appear.
 */
export const DEFAULT_OPERATING_PLAN: OperatingPlan = {
  catchmentRadiusMeters: 1200,
  serviceDaysPerWeek: 3,
  volunteerHoursPerWeek: 90,
  volunteerMinutesPerHousehold: 12,
  foodIntakePoundsPerWeek: 9000,
  poundsPerHousehold: 30,
  storageCapacityPounds: 12000,
  perishableShare: 0.4,
  perishableShelfLifeDays: 5,
  shelfStableShelfLifeDays: 180,
  deliveryCapacityHouseholdsPerWeek: 40,
  fixedCostPerMonth: 6500,
  variableCostPerHousehold: 9,
  peoplePerHousehold: 2.4,
  weeklyParticipationRate: {
    low: 0.02,
    medium: 0.05,
    high: 0.09,
  },
};

/** Baltimore City approximate bounding box, used only to frame the map view. */
export const BALTIMORE_CITY_BBOX: [number, number, number, number] = [
  -76.7115, 39.1972, -76.5294, 39.3721,
];

export const BALTIMORE_CITY_CENTER: [number, number] = [-76.6122, 39.2904];
