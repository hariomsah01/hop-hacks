import { describe, expect, it } from "vitest";
import { analyzeLocation, compareCatchments } from "@/lib/geo/analyze";
import { loadDatasets } from "@/lib/data/datasets";

// Two real Baltimore City points used across the suite.
const DOWNTOWN = { label: "proposed" as const, lng: -76.6122, lat: 39.2904 };
const WEST_BALTIMORE = {
  label: "reference" as const,
  lng: -76.642,
  lat: 39.305,
};
// Well outside Baltimore City, in open water off the Delaware coast.
const FAR_AWAY = { label: "proposed" as const, lng: -74.5, lat: 38.5 };

describe("cached datasets", () => {
  it("has ingested Baltimore tracts and service listings", () => {
    const data = loadDatasets();
    expect(data.tracts.length).toBeGreaterThan(100);
    expect(data.services.length).toBeGreaterThan(50);
    expect(data.cityBoundary).not.toBeNull();
  });

  it("keeps GEOIDs as strings so leading zeros survive", () => {
    const data = loadDatasets();
    expect(data.tracts.every((t) => typeof t.geoid === "string")).toBe(true);
  });
});

describe("analyzeLocation", () => {
  it("is deterministic: the same coordinates give the same result", () => {
    const first = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1200,
    });
    const second = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1200,
    });
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("estimates a population for a real Baltimore location", () => {
    const result = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1200,
    });
    expect(result.withinCityBoundary).toBe(true);
    expect(result.intersectingTracts.length).toBeGreaterThan(0);
    expect(result.estimatedCatchmentPopulation.value).toBeGreaterThan(0);
    expect(result.estimatedCatchmentPopulation.status).toBe("estimated");
  });

  it("gives zero estimated coverage when nothing intersects", () => {
    const result = analyzeLocation({
      location: FAR_AWAY,
      catchmentRadiusMeters: 1000,
    });
    expect(result.intersectingTracts).toHaveLength(0);
    expect(result.estimatedCatchmentPopulation.value).toBe(0);
    expect(result.withinCityBoundary).toBe(false);
    expect(result.listedServices).toHaveLength(0);
  });

  it("never counts a partly covered tract as a whole tract", () => {
    const result = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1200,
    });
    // Every contribution must be bounded by the tract's own population.
    for (const tract of result.intersectingTracts) {
      expect(tract.areaShare).toBeGreaterThan(0);
      expect(tract.areaShare).toBeLessThanOrEqual(1);
      if (tract.tractPopulation !== null) {
        expect(tract.populationInCatchment).toBeLessThanOrEqual(
          tract.tractPopulation + 1e-6,
        );
      }
    }
    // At least one tract should be only partly inside a 1.2km ring.
    expect(result.intersectingTracts.some((t) => t.areaShare < 0.999)).toBe(true);
  });

  it("scales the estimate up as the radius grows", () => {
    const small = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 800,
    });
    const large = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1600,
    });
    expect(large.estimatedCatchmentPopulation.value).toBeGreaterThan(
      small.estimatedCatchmentPopulation.value as number,
    );
  });

  it("reports unavailable rather than zero for data that was never ingested", () => {
    const result = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 1200,
    });
    // Poverty needs the keyed ACS step. Without it the value must stay null.
    if (!loadDatasets().availability.tractPoverty) {
      expect(result.povertyRate.status).toBe("unavailable");
      expect(result.povertyRate.value).toBeNull();
    } else {
      expect(result.povertyRate.status).toBe("estimated");
      expect(result.povertyRate.value).not.toBeNull();
      expect(result.povertyRate.value).toBeGreaterThanOrEqual(0);
      expect(result.povertyRate.value).toBeLessThanOrEqual(1);
      expect(result.povertyRate.sourceIds).toContain("acs");
      expect(result.noVehicleHouseholdShare.status).toBe("estimated");
      expect(result.noVehicleHouseholdShare.value).not.toBeNull();
    }
    // USDA food-access flags are explicitly out of scope for this build.
    expect(result.lowIncomeLowAccessTractCount.value).toBeNull();
  });

  it("keeps published hours separate from verification", () => {
    const result = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 2000,
    });
    for (const service of result.listedServices) {
      expect(service.verificationStatus).toBe("publisher-listed");
      expect(service.distanceMeters).toBeLessThanOrEqual(2000);
    }
  });
});

describe("compareCatchments", () => {
  it("reports overlap so the two populations are never added together", () => {
    const proposed = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 2000,
    });
    const reference = analyzeLocation({
      location: { ...DOWNTOWN, label: "reference" },
      catchmentRadiusMeters: 2000,
    });
    const overlap = compareCatchments(proposed, reference);
    // Identical rings overlap completely.
    expect(overlap.shareOfProposed).toBeGreaterThan(0.99);
    expect(overlap.sharedTractGeoids.length).toBeGreaterThan(0);
    expect(overlap.note).toMatch(/must not be added together/);
  });

  it("reports no overlap for distant rings", () => {
    const proposed = analyzeLocation({
      location: DOWNTOWN,
      catchmentRadiusMeters: 500,
    });
    const reference = analyzeLocation({
      location: WEST_BALTIMORE,
      catchmentRadiusMeters: 500,
    });
    const overlap = compareCatchments(proposed, reference);
    expect(overlap.overlapAreaSqMeters).toBe(0);
    expect(overlap.sharedTractGeoids).toHaveLength(0);
  });
});
