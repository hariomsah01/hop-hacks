import { z } from "zod";

/**
 * Comparison series for the Analytics tab. One period is one x-axis tick.
 * Keep this shape stable so the UI and the simulation backend can land separately.
 */
export const AnalyticsPeriodSchema = z.object({
  label: z.string(),
  foodDistributed: z.number(),
  foodReceived: z.number(),
  foodWasted: z.number(),
  clients: z.number(),
  households: z.number(),
  staff: z.number(),
  /** Share of people who are food-insecure, 0–100. */
  foodInsecurityPercent: z.number(),
});
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;

export const AnalyticsSeriesSchema = z.object({
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
