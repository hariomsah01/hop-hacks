import type { AnalyticsPeriod, AnalyticsRequest, AnalyticsResult } from "@/lib/contracts";

const MONTHS = [
  "Jan 2025",
  "Feb 2025",
  "Mar 2025",
  "Apr 2025",
  "May 2025",
  "Jun 2025",
  "Jul 2025",
  "Aug 2025",
  "Sep 2025",
  "Oct 2025",
  "Nov 2025",
  "Dec 2025",
];

/**
 * Placeholder series so the Analytics tab can render before the simulation
 * backend exists. Replace the body of this function; keep the return type.
 *
 * `kind` is only used to make the two columns look different in the UI.
 */
function periods(kind: "baseline" | "expanded"): AnalyticsPeriod[] {
  const bump = kind === "expanded" ? 1.1 : 1;
  const waste = kind === "expanded" ? 0.88 : 1;
  const insecurityDrop = kind === "expanded" ? 1.2 : 0;

  return MONTHS.map((label, index) => {
    const seasonal = 1 + 0.08 * Math.sin((index / 12) * Math.PI * 2);
    return {
      label,
      foodDistributed: Math.round(42_000 * seasonal * bump),
      foodReceived: Math.round(48_000 * seasonal * bump),
      foodWasted: Math.round(2_800 * seasonal * waste),
      clients: Math.round(3_100 * seasonal * bump),
      households: Math.round(1_200 * seasonal * bump),
      staff: Math.round(84 * (kind === "expanded" ? 1.12 : 1)),
      foodInsecurityPercent: Number(
        (18.6 - index * 0.08 - insecurityDrop).toFixed(1),
      ),
    };
  });
}

export function buildAnalyticsSimulation(
  request: AnalyticsRequest,
): AnalyticsResult {
  return {
    generatedAt: new Date().toISOString(),
    placeholder: true,
    proposed: request.proposed,
    catchmentRadiusMeters: request.catchmentRadiusMeters,
    baseline: { periods: periods("baseline") },
    withNewLocation: { periods: periods("expanded") },
  };
}
