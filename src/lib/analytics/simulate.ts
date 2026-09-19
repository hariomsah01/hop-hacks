import type { AnalyticsPeriod, AnalyticsRequest, AnalyticsResult } from "@/lib/contracts";

const MONTHS = [
  "Jan 2026",
  "Feb 2026",
  "Mar 2026",
  "Apr 2026",
  "May 2026",
  "Jun 2026",
  "Jul 2026",
  "Aug 2026",
  "Sep 2026",
  "Oct 2026",
  "Nov 2026",
  "Dec 2026",
];

/** First forecast month (Sep 2026). Aug 2026 is the last observed month. */
const FIRST_FORECAST_INDEX = 8;

/**
 * Placeholder series so the Analytics tab can render before the simulation
 * backend exists. Replace the body of this function; keep the return type.
 */
function series(scenario: "baseline" | "expanded") {
  const bump = scenario === "expanded" ? 1.1 : 1;
  const waste = scenario === "expanded" ? 0.88 : 1;
  const insecurityDrop = scenario === "expanded" ? 1.2 : 0;

  const periods: AnalyticsPeriod[] = MONTHS.map((label, index) => {
    const seasonal = 1 + 0.08 * Math.sin((index / 12) * Math.PI * 2);
    const forecast = index >= FIRST_FORECAST_INDEX;
    const drift = forecast ? 1 + (index - FIRST_FORECAST_INDEX + 1) * 0.02 : 1;
    return {
      label,
      kind: forecast ? "forecast" : "observed",
      foodDistributed: Math.round(42_000 * seasonal * bump * drift),
      foodReceived: Math.round(48_000 * seasonal * bump * drift),
      foodWasted: Math.round(2_800 * seasonal * waste * (forecast ? 0.97 : 1)),
      clients: Math.round(3_100 * seasonal * bump * drift),
      households: Math.round(1_200 * seasonal * bump * drift),
      staff: Math.round(84 * (scenario === "expanded" ? 1.12 : 1) * (forecast ? 1.04 : 1)),
      foodInsecurityPercent: Number(
        (18.6 - index * 0.08 - insecurityDrop - (forecast ? 0.15 : 0)).toFixed(1),
      ),
    };
  });

  return { firstForecastIndex: FIRST_FORECAST_INDEX, periods };
}

export function buildAnalyticsSimulation(
  request: AnalyticsRequest,
): AnalyticsResult {
  return {
    generatedAt: new Date().toISOString(),
    placeholder: true,
    proposed: request.proposed,
    catchmentRadiusMeters: request.catchmentRadiusMeters,
    baseline: series("baseline"),
    withNewLocation: series("expanded"),
  };
}
