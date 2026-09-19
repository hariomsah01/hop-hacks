import { describe, expect, it } from "vitest";

import { runNetworkComparison } from "@/lib/network/comparison";

const REQUEST = {
  proposed: {
    lng: -76.6122,
    lat: 39.2904,
  },
  catchmentRadiusMeters: 1200,
};

describe("runNetworkComparison", () => {
  it("adds exactly one proposed location in Case B", () => {
    const result = runNetworkComparison(REQUEST);

    expect(result.current.listedLocations.value).not.toBeNull();
    expect(result.expanded.listedLocations.value).toBe(
      (result.current.listedLocations.value as number) + 1,
    );
    expect(result.change.additionalListedLocations.value).toBe(1);
    expect(result.expanded.listedLocations.status).toBe("assumed");
  });

  it("conserves candidate-catchment population across the A/B cases", () => {
    const result = runNetworkComparison(REQUEST);
    const total = result.candidateCatchmentPopulation.value as number;
    const currentCovered =
      result.current.coveredPopulationInCandidateCatchment.value as number;
    const currentUncovered =
      result.current.uncoveredPopulationInCandidateCatchment.value as number;
    const expandedCovered =
      result.expanded.coveredPopulationInCandidateCatchment.value as number;

    expect(currentCovered + currentUncovered).toBeCloseTo(total, 5);
    expect(expandedCovered).toBeCloseTo(total, 5);
    expect(result.expanded.uncoveredPopulationInCandidateCatchment.value).toBe(0);
    expect(result.change.newlyCoveredPopulation.value).toBeCloseTo(
      currentUncovered,
      5,
    );
  });

  it("keeps operational performance unavailable until partner data arrives", () => {
    const result = runNetworkComparison(REQUEST);

    expect(result.current.monthlyHouseholdVisits.value).toBeNull();
    expect(result.expanded.monthlyHouseholdVisits.value).toBeNull();
    expect(result.current.capacityUtilization.value).toBeNull();
    expect(result.expanded.capacityUtilization.value).toBeNull();
  });

  it("is deterministic apart from the generation timestamp", () => {
    const stripTimestamp = (result: ReturnType<typeof runNetworkComparison>) =>
      JSON.stringify({ ...result, generatedAt: "" });

    expect(stripTimestamp(runNetworkComparison(REQUEST))).toEqual(
      stripTimestamp(runNetworkComparison(REQUEST)),
    );
  });
});
