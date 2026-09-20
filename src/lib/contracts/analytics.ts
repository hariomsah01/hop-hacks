import { z } from "zod";

/**
 * Comparison series for the Analytics tab. One period is one x-axis tick.
 * Keep this shape stable so the UI and the simulation backend can land separately.
 */
export const AnalyticsPeriodKindSchema = z.enum(["observed", "forecast"]);
export type AnalyticsPeriodKind = z.infer<typeof AnalyticsPeriodKindSchema>;

export const AnalyticsPeriodSchema = z.object({
  label: z.string(),
  kind: AnalyticsPeriodKindSchema,
  foodDistributed: z.number(),
  foodReceived: z.number(),
  foodWasted: z.number(),
  clients: z.number(),
  households: z.number(),
  staff: z.number(),
  /** Baltimore City monthly unemployment rate, 0–100. */
  unemploymentRate: z.number(),
});
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;

export const AnalyticsSeriesSchema = z.object({
  /** Index of the first forecast month. History is everything before it. */
  firstForecastIndex: z.number().int().min(0),
  periods: z.array(AnalyticsPeriodSchema),
});
export type AnalyticsSeries = z.infer<typeof AnalyticsSeriesSchema>;

export const AnalyticsRequestSchema = z.object({
  proposed: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  catchmentRadiusMeters: z.number().min(200).max(5000),
});
export type AnalyticsRequest = z.infer<typeof AnalyticsRequestSchema>;

export const AnalyticsResultSchema = z.object({
  generatedAt: z.string(),
  /** True while this response is still the UI placeholder, not a real simulation. */
  placeholder: z.boolean(),
  proposed: z.object({
    lng: z.number(),
    lat: z.number(),
  }),
  catchmentRadiusMeters: z.number(),
  baseline: AnalyticsSeriesSchema,
  withNewLocation: AnalyticsSeriesSchema,
});
export type AnalyticsResult = z.infer<typeof AnalyticsResultSchema>;
