import { describe, expect, it } from "vitest";
import { loadDatasets } from "@/lib/data/datasets";
import {
  applyPressureToCollection,
  coverageGap,
  indexFromRaw,
  rawPressure,
  tractPovertyRate,
} from "@/lib/geo/pressure";
import {
  nearestListedMeters,
  tractCentre,
} from "@/lib/geo/pressureAnnotate";

describe("coverage pressure maths", () => {
  it("is deterministic for the same inputs", () => {
    const first = rawPressure({
      population: 2000,
      povertyRate: 0.25,
      gap: 0.4,
    });
    const second = rawPressure({
      population: 2000,
      povertyRate: 0.25,
      gap: 0.4,
    });
    expect(first).toBe(200);
    expect(second).toBe(first);
  });

  it("leaves missing population or poverty as unavailable, not zero", () => {
    expect(
      rawPressure({ population: null, povertyRate: 0.2, gap: 1 }),
    ).toBeNull();
    expect(
      rawPressure({ population: 1000, povertyRate: null, gap: 1 }),
    ).toBeNull();
    expect(tractPovertyRate(null, 1000)).toBeNull();
    expect(tractPovertyRate(10, 0)).toBeNull();
    expect(indexFromRaw(null, 50)).toBeNull();
  });

  it("keeps a computed zero when a listing sits on the tract centre", () => {
    expect(coverageGap(0, 1200)).toBe(0);
    expect(
      rawPressure({ population: 1800, povertyRate: 0.3, gap: 0 }),
    ).toBe(0);
    expect(indexFromRaw(0, 90)).toBe(0);
  });

  it("treats an empty roster as fully outside every listed ring", () => {
    expect(coverageGap(null, 1200)).toBe(1);
    expect(nearestListedMeters(-76.62, 39.3, [])).toBeNull();
  });

  it("caps the gap at one assumed ring", () => {
    expect(coverageGap(600, 1200)).toBe(0.5);
    expect(coverageGap(4000, 1200)).toBe(1);
  });

  it("does not invent a poverty rate from counts that the source omitted", () => {
    expect(tractPovertyRate(null, null)).toBeNull();
    expect(tractPovertyRate(40, 200)).toBeCloseTo(0.2);
  });
});

describe("Baltimore pressure annotation", () => {
  it("places a real tract centre and a nearest listing", () => {
    const { tracts, services } = loadDatasets();
    const tract = tracts[0];
    const centre = tractCentre(tract.geometry);
    expect(centre).not.toBeNull();
    const nearest = nearestListedMeters(centre!.lng, centre!.lat, services);
    expect(nearest).not.toBeNull();
    expect(nearest!).toBeGreaterThanOrEqual(0);
  });

  it("scores the city the same way twice and keeps unavailable cells null", () => {
    const { tracts, services } = loadDatasets();
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tracts.map((tract) => {
        const centre = tractCentre(tract.geometry);
        return {
          type: "Feature" as const,
          geometry: tract.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
          properties: {
            geoid: tract.geoid,
            population: tract.population,
            povertyRate: tractPovertyRate(
              tract.povertyCount,
              tract.povertyUniverse,
            ),
            nearestListedMeters: centre
              ? nearestListedMeters(centre.lng, centre.lat, services)
              : null,
          },
        };
      }),
    };

    const first = applyPressureToCollection(collection, 1200);
    const second = applyPressureToCollection(collection, 1200);
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));

    const scored = first.features.map(
      (feature) => feature.properties as { pressureIndex: number | null },
    );
    expect(scored.some((row) => row.pressureIndex !== null)).toBe(true);
    expect(
      scored.every(
        (row) => row.pressureIndex === null || row.pressureIndex >= 0,
      ),
    ).toBe(true);
  });
});
