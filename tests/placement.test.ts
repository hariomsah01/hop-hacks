import { describe, expect, it } from "vitest";
import { loadDatasets } from "@/lib/data/datasets";
import {
  apportionUncovered,
  attachPlacementIndex,
  mergePlacementIntoCollection,
} from "@/lib/geo/placement";
import {
  listedCoverageShare,
  scoreCityPlacement,
  tractCentre,
} from "@/lib/geo/placementCity";

const SQUARE: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-76.63, 39.29],
      [-76.61, 39.29],
      [-76.61, 39.31],
      [-76.63, 39.31],
      [-76.63, 39.29],
    ],
  ],
};

describe("placement score maths", () => {
  it("keeps missing counts unavailable instead of turning them into zero", () => {
    expect(apportionUncovered(null, 0.4)).toBeNull();
    expect(apportionUncovered(1000, null)).toBeNull();
    expect(apportionUncovered(1000, 0.25)).toBe(750);
    expect(apportionUncovered(800, 1)).toBe(0);
  });

  it("treats an empty roster as fully new ground", () => {
    expect(listedCoverageShare(SQUARE, [], 1200)).toBe(0);
  });

  it("covers a tract when a listing sits on it, and not when the listing is far away", () => {
    const onTop = listedCoverageShare(
      SQUARE,
      [{ lng: -76.62, lat: 39.3 }],
      5000,
    );
    const far = listedCoverageShare(
      SQUARE,
      [{ lng: -76.4, lat: 39.1 }],
      200,
    );
    expect(onTop).toBeGreaterThan(0.99);
    expect(far).toBe(0);
  });

  it("blends available components and leaves a fully missing tract unavailable", () => {
    const scored = attachPlacementIndex([
      {
        geoid: "high",
        coveredShare: 0,
        netNewPeople: 900,
        povertyOnNewGround: 300,
        noVehicleOnNewGround: 120,
      },
      {
        geoid: "low",
        coveredShare: 0.8,
        netNewPeople: 100,
        povertyOnNewGround: 20,
        noVehicleOnNewGround: 10,
      },
      {
        geoid: "gap",
        coveredShare: 0,
        netNewPeople: 500,
        povertyOnNewGround: null,
        noVehicleOnNewGround: 80,
      },
      {
        geoid: "empty",
        coveredShare: null,
        netNewPeople: null,
        povertyOnNewGround: null,
        noVehicleOnNewGround: null,
      },
    ]);

    const byId = Object.fromEntries(scored.map((row) => [row.geoid, row]));
    expect(byId.high.placementIndex).toBe(100);
    expect(byId.low.placementIndex).toBe(0);
    expect(byId.gap.placementIndex).not.toBeNull();
    expect(byId.gap.status).toBe("estimated");
    expect(byId.gap.note).toMatch(/poverty on new ground/);
    expect(byId.empty.placementIndex).toBeNull();
    expect(byId.empty.status).toBe("unavailable");
  });

  it("is deterministic for the same component rows", () => {
    const rows = [
      {
        geoid: "a",
        coveredShare: 0.1,
        netNewPeople: 400,
        povertyOnNewGround: 80,
        noVehicleOnNewGround: 30,
      },
      {
        geoid: "b",
        coveredShare: 0.6,
        netNewPeople: 120,
        povertyOnNewGround: 15,
        noVehicleOnNewGround: 8,
      },
    ];
    expect(attachPlacementIndex(rows)).toEqual(attachPlacementIndex(rows));
  });
});

describe("Baltimore placement annotation", () => {
  it("places a real tract centre", () => {
    const { tracts } = loadDatasets();
    const centre = tractCentre(tracts[0].geometry);
    expect(centre).not.toBeNull();
  });

  it("scores the city and keeps unavailable cells null", () => {
    const first = scoreCityPlacement(1200);
    expect(first.some((row) => row.placementIndex !== null)).toBe(true);
    expect(
      first.every(
        (row) =>
          row.placementIndex === null ||
          (row.placementIndex >= 0 && row.placementIndex <= 100),
      ),
    ).toBe(true);

    const { tracts } = loadDatasets();
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tracts.map((tract) => ({
        type: "Feature" as const,
        geometry: tract.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
        properties: { geoid: tract.geoid },
      })),
    };
    const merged = mergePlacementIntoCollection(collection, first);
    const props = merged.features[0].properties as {
      placementIndex: number | null;
    };
    expect("placementIndex" in props).toBe(true);
  }, 60_000);
});
