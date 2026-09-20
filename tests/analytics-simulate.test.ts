import { describe, expect, it } from "vitest";
import { buildAnalyticsSimulation } from "@/lib/analytics/simulate";
import { AnalyticsResultSchema } from "@/lib/contracts";

const DOWNTOWN = { lng: -76.6122, lat: 39.2904 };
/** Curtis Bay — inside the city, no listed pantry within 1.2 km. */
const SPARSE = { lng: -76.5866, lat: 39.2173 };
const WEST_BALTIMORE = { lng: -76.642, lat: 39.305 };
const RADIUS = 1200;

function lastForecast(result: ReturnType<typeof buildAnalyticsSimulation>) {
  const baseline = result.baseline.periods.filter((p) => p.kind === "forecast");
  const expansion = result.withNewLocation.periods.filter((p) => p.kind === "forecast");
  return {
    baseline: baseline[baseline.length - 1],
    expansion: expansion[expansion.length - 1],
    baselineFirst: baseline[0],
    expansionFirst: expansion[0],
  };
}

describe("buildAnalyticsSimulation", () => {
  it("returns a valid analytics payload", () => {
    const result = buildAnalyticsSimulation({
      proposed: DOWNTOWN,
      catchmentRadiusMeters: RADIUS,
    });
    expect(AnalyticsResultSchema.safeParse(result).success).toBe(true);
    expect(result.baseline.periods).toHaveLength(24);
    expect(result.withNewLocation.periods).toHaveLength(24);
  });

  it("keeps observed history identical until the pantry would open", () => {
    const result = buildAnalyticsSimulation({
      proposed: DOWNTOWN,
      catchmentRadiusMeters: RADIUS,
    });
    const baselineHistory = result.baseline.periods.filter((p) => p.kind === "observed");
    const expansionHistory = result.withNewLocation.periods.filter(
      (p) => p.kind === "observed",
    );
    expect(expansionHistory).toEqual(baselineHistory);
  });

  it("raises forecast food and clients at the selected pin", () => {
    const { baseline, expansion } = lastForecast(
      buildAnalyticsSimulation({
        proposed: DOWNTOWN,
        catchmentRadiusMeters: RADIUS,
      }),
    );
    expect(expansion.foodDistributed).toBeGreaterThan(baseline.foodDistributed * 1.08);
    expect(expansion.clients).toBeGreaterThan(baseline.clients * 1.08);
    expect(expansion.foodWasted).toBeLessThan(baseline.foodWasted);
    expect(baseline.foodAccessGapLb).toBeGreaterThan(0);
    expect(expansion.foodAccessGapLb).toBeLessThan(baseline.foodAccessGapLb);
  });

  it("ramps the expansion instead of applying a one-month jump", () => {
    const { baselineFirst, expansionFirst, baseline, expansion } = lastForecast(
      buildAnalyticsSimulation({
        proposed: WEST_BALTIMORE,
        catchmentRadiusMeters: RADIUS,
      }),
    );
    const firstGain =
      expansionFirst.foodDistributed - baselineFirst.foodDistributed;
    const lastGain = expansion.foodDistributed - baseline.foodDistributed;
    expect(firstGain).toBeGreaterThan(0);
    expect(lastGain).toBeGreaterThan(firstGain * 1.3);
  });

  it("lifts food more at a pin with no listed pantry than downtown", () => {
    const downtown = lastForecast(
      buildAnalyticsSimulation({
        proposed: DOWNTOWN,
        catchmentRadiusMeters: RADIUS,
      }),
    );
    const sparse = lastForecast(
      buildAnalyticsSimulation({
        proposed: SPARSE,
        catchmentRadiusMeters: RADIUS,
      }),
    );
    const downtownLift =
      downtown.expansion.foodDistributed / downtown.baseline.foodDistributed;
    const sparseLift =
      sparse.expansion.foodDistributed / sparse.baseline.foodDistributed;
    expect(downtownLift).toBeGreaterThan(1.08);
    expect(sparseLift).toBeGreaterThan(downtownLift + 0.35);
  });
});
