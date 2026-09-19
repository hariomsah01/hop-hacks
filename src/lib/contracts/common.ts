import { z } from "zod";

/**
 * Version stamps are returned with every analysis result so a saved or exported
 * comparison can be traced back to the code that produced it.
 */
export const GEO_MODEL_VERSION = "pantrytwin-geo-0.1.0";
export const SIM_MODEL_VERSION = "pantrytwin-sim-0.1.0";

/**
 * Provenance class of a single number shown in the UI.
 *
 * sourced      - copied from a public dataset, traceable to a SourceRecord
 * estimated    - derived from sourced data by a documented calculation
 * assumed      - supplied by the planner as an operating assumption
 * unavailable  - not known; stays null and is never coerced to zero
 */
export const ValueStatusSchema = z.enum([
  "sourced",
  "estimated",
  "assumed",
  "unavailable",
]);
export type ValueStatus = z.infer<typeof ValueStatusSchema>;

/** Citation metadata for one public dataset. */
export const SourceRecordSchema = z.object({
  id: z.string(),
  publisher: z.string(),
  title: z.string(),
  landingUrl: z.string(),
  downloadUrl: z.string().nullable(),
  retrievedAt: z.string(),
  dataVintage: z.string(),
  geographicVintage: z.string(),
  terms: z.string(),
  checksum: z.string().nullable(),
  notes: z.string().nullable(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

/**
 * A single quantity plus the evidence behind it. `value` is nullable on
 * purpose: an unknown quantity must stay unknown all the way to the screen.
 */
export const MeasureSchema = z.object({
  value: z.number().nullable(),
  unit: z.string(),
  status: ValueStatusSchema,
  sourceIds: z.array(z.string()),
  note: z.string().nullable(),
});
export type Measure = z.infer<typeof MeasureSchema>;

export function sourced(
  value: number | null,
  unit: string,
  sourceIds: string[],
  note: string | null = null,
): Measure {
  if (value === null) return unavailable(unit, note ?? "Not reported by source");
  return { value, unit, status: "sourced", sourceIds, note };
}

export function estimated(
  value: number | null,
  unit: string,
  sourceIds: string[],
  note: string | null = null,
): Measure {
  if (value === null) return unavailable(unit, note ?? "Inputs missing");
  return { value, unit, status: "estimated", sourceIds, note };
}

export function assumed(
  value: number,
  unit: string,
  note: string | null = null,
): Measure {
  return { value, unit, status: "assumed", sourceIds: [], note };
}

export function unavailable(unit: string, note: string | null = null): Measure {
  return { value: null, unit, status: "unavailable", sourceIds: [], note };
}

/**
 * Sums measures while preserving unknowns. If every input is unavailable the
 * result is unavailable rather than 0; if some are present the total is
 * returned with a note naming how many inputs were missing.
 */
export function sumMeasures(
  measures: Measure[],
  unit: string,
  sourceIds: string[],
): Measure {
  const known = measures.filter((m) => m.value !== null);
  if (known.length === 0) {
    return unavailable(unit, "No contributing values were reported");
  }
  const missing = measures.length - known.length;
  const total = known.reduce((acc, m) => acc + (m.value as number), 0);
  return estimated(
    total,
    unit,
    sourceIds,
    missing > 0
      ? `${missing} of ${measures.length} contributing values were not reported and are excluded`
      : null,
  );
}

/** How much of a dataset was actually available for one analysis. */
export const DataCompletenessSchema = z.object({
  dataset: z.string(),
  expected: z.number(),
  available: z.number(),
  note: z.string().nullable(),
});
export type DataCompleteness = z.infer<typeof DataCompletenessSchema>;
