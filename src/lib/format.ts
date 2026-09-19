import type { Measure, ValueStatus } from "@/lib/contracts";

/** Presentation metadata for the four provenance classes. */
export const STATUS_META: Record<
  ValueStatus,
  { label: string; dot: string; text: string; bg: string; description: string }
> = {
  sourced: {
    label: "Sourced",
    dot: "bg-[var(--color-status-sourced)]",
    text: "text-[var(--color-status-sourced)]",
    bg: "bg-teal-50",
    description: "Taken directly from a public dataset listed in Sources.",
  },
  estimated: {
    label: "Estimated",
    dot: "bg-[var(--color-status-estimated)]",
    text: "text-[var(--color-status-estimated)]",
    bg: "bg-blue-50",
    description: "Calculated by our analysis functions from sourced data.",
  },
  assumed: {
    label: "Assumed",
    dot: "bg-[var(--color-status-assumed)]",
    text: "text-[var(--color-status-assumed)]",
    bg: "bg-amber-50",
    description: "A planning input you chose. Not measured from any dataset.",
  },
  unavailable: {
    label: "Unavailable",
    dot: "bg-[var(--color-status-unavailable)]",
    text: "text-[var(--color-status-unavailable)]",
    bg: "bg-gray-100",
    description: "Not known. Deliberately left blank rather than set to zero.",
  },
};

export function formatValue(value: number, unit: string): string {
  if (unit.startsWith("share")) return `${(value * 100).toFixed(1)}%`;
  if (unit === "USD") {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (unit === "USD per household") return `$${value.toFixed(2)}`;
  if (unit === "score 0-1") return value.toFixed(3);

  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 0 : abs >= 1 ? 1 : 3;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Unit suffix shown next to a formatted number, if any. */
export function unitSuffix(unit: string): string {
  if (
    unit.startsWith("share") ||
    unit.startsWith("USD") ||
    unit === "score 0-1"
  ) {
    return "";
  }
  return unit;
}

export function formatMeasure(measure: Measure): string {
  if (measure.value === null) return "Unavailable";
  const suffix = unitSuffix(measure.unit);
  return `${formatValue(measure.value, measure.unit)}${suffix ? ` ${suffix}` : ""}`;
}

export function formatDelta(
  difference: number | null,
  unit: string,
): string | null {
  if (difference === null) return null;
  if (Math.abs(difference) < 1e-9) return "no difference";
  const sign = difference > 0 ? "+" : "-";
  return `${sign}${formatValue(Math.abs(difference), unit)}${unitSuffix(unit) ? ` ${unitSuffix(unit)}` : ""}`;
}
