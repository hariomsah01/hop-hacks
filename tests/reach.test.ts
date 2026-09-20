import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { loadDatasets } from "@/lib/data/datasets";
import { analyzeLocation } from "@/lib/geo/analyze";
import { computeReach } from "@/lib/geo/reach";

const DOWNTOWN = { label: "proposed" as const, lng: -76.6122, lat: 39.2904 };
const WEST_BALTIMORE = {
  label: "reference" as const,
  lng: -76.642,
  lat: 39.305,
};

const at = (
  location: typeof DOWNTOWN | typeof WEST_BALTIMORE,
  radius = 1200,
) => analyzeLocation({ location, catchmentRadiusMeters: radius });

describe("computeReach", () => {
  it("splits the catchment into new and duplicated without double counting", () => {
    const proposed = at(DOWNTOWN);
    const reference = at(WEST_BALTIMORE);
    const reach = computeReach(proposed, reference);

    const netNew = reach.netNewPopulation.value as number;
    const duplicated = reach.duplicatedPopulation.value as number;
    const total = reach.proposedPopulation.value as number;

    expect(netNew).toBeGreaterThanOrEqual(0);
    expect(duplicated).toBeGreaterThanOrEqual(0);
    // Every person in the proposed ring is either new or already covered.
    expect(netNew + duplicated).toBeCloseTo(total, 0);
  });

  it("reports no new reach when the proposal sits on top of the reference", () => {
    const proposed = at(DOWNTOWN);
    const reference = at({ ...DOWNTOWN, label: "reference" });
    const reach = computeReach(proposed, reference);

    const netNew = reach.netNewPopulation.value as number;
    const total = reach.proposedPopulation.value as number;

    // Identical rings cover identical ground, so nothing is added.
    expect(netNew / total).toBeLessThan(0.01);
    expect(reach.netNewShare.value as number).toBeLessThan(0.01);
    expect(reach.duplicatedPopulation.value as number).toBeCloseTo(total, 0);
  });

  it("counts the whole catchment as new when the rings do not touch", () => {
    const proposed = at(DOWNTOWN, 400);
    const reference = at(WEST_BALTIMORE, 400);
    const reach = computeReach(proposed, reference);

    const netNew = reach.netNewPopulation.value as number;
    const total = reach.proposedPopulation.value as number;

    expect(reach.overlap.overlapAreaSqMeters).toBe(0);
    expect(netNew).toBeCloseTo(total, 0);
    expect(reach.duplicatedPopulation.value).toBeCloseTo(0, 0);
  });

  it("never reports more people outside all listings than are in the catchment", () => {
    const proposed = at(DOWNTOWN);
    const reach = computeReach(proposed, at(WEST_BALTIMORE));

    const outside = reach.populationOutsideAllListings.value as number;
    const total = reach.proposedPopulation.value as number;

    expect(outside).toBeGreaterThanOrEqual(0);
    expect(outside).toBeLessThanOrEqual(total + 1e-6);
    // Downtown sits inside several listed rings, so some ground is covered.
    expect(outside).toBeLessThan(total);
  });

  it("counts fewer people as uncovered than as merely new to one pantry", () => {
    // Measuring against every listing is a stricter test than measuring
    // against one, so it can never return the larger number.
    const proposed = at(DOWNTOWN);
    const reach = computeReach(proposed, at(WEST_BALTIMORE));
    expect(reach.populationOutsideAllListings.value as number).toBeLessThanOrEqual(
      (reach.netNewPopulation.value as number) + 1e-6,
    );
  });

  it("measures new and duplicated reach against the listed roster when no comparison pantry is used", () => {
    const reach = computeReach(at(DOWNTOWN), null);
    const netNew = reach.netNewPopulation.value as number;
    const duplicated = reach.duplicatedPopulation.value as number;
    const outside = reach.populationOutsideAllListings.value as number;
    const total = reach.proposedPopulation.value as number;

    expect(reach.duplicatedPopulation.status).toBe("estimated");
    expect(reach.referencePopulation.status).toBe("unavailable");
    expect(netNew).toBeCloseTo(outside, 0);
    expect(netNew + duplicated).toBeCloseTo(total, 0);
    expect(reach.overlap.note).toMatch(/listed service/i);
    expect(reach.overlap.note).not.toMatch(/no reference pantry/i);
  });

  it("is deterministic", () => {
    const first = computeReach(at(DOWNTOWN), at(WEST_BALTIMORE));
    const second = computeReach(at(DOWNTOWN), at(WEST_BALTIMORE));
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });
});

describe("runAssessment", () => {
  const referenceId = loadDatasets().services[0].id;

  const request = {
    proposed: { lng: DOWNTOWN.lng, lat: DOWNTOWN.lat },
    referenceServiceId: referenceId,
    plan: DEFAULT_OPERATING_PLAN,
  };

  it("simulates the proposed pantry and never the real one", () => {
    const result = runAssessment(request);
    expect(result.scenarios).toHaveLength(3);
    for (const bucket of result.scenarios) {
      expect(bucket.proposed.label).toBe("proposed");
    }
    // There is no route by which a reference scenario could appear.
    expect(JSON.stringify(result.scenarios)).not.toMatch(/"reference"/);
  });

  it("does not attach a comparison pantry", () => {
    const result = runAssessment(request);
    expect(result.reference).toBeNull();
    expect(result.consequences.some((c) => c.id === "no-reference")).toBe(
      false,
    );
    expect(
      result.consequences.some((c) => c.id === "reference-capacity-unknown"),
    ).toBe(false);
  });

  it("always flags that attendance is assumed", () => {
    const result = runAssessment(request);
    const gaps = result.consequences.filter((c) => c.severity === "gap");
    expect(gaps.some((c) => c.id === "demand-assumed")).toBe(true);
  });

  it("never expresses a consequence as a chance of success", () => {
    const result = runAssessment(request);
    const sentences = result.consequences
      .flatMap((c) => `${c.headline}. ${c.detail}`.split(/(?<=\.)\s+/))
      // Disclaimers legitimately name the thing they are ruling out, so only
      // affirmative sentences are checked.
      .filter((s) => !/\b(no|not|never|cannot|does not)\b/i.test(s));

    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/probability|likelihood|odds of/i);
      expect(sentence).not.toMatch(/\b\d+(\.\d+)?%\s*(chance|likely)/i);
      expect(sentence).not.toMatch(/\b(will|would) (probably|likely) /i);
    }
  });

  it("still models the proposal when no pantry id is supplied", () => {
    const result = runAssessment({ ...request, referenceServiceId: null });
    expect(result.reference).toBeNull();
    expect(result.consequences.some((c) => c.id === "no-reference")).toBe(
      false,
    );
    expect(result.scenarios).toHaveLength(3);
  });

  it("ignores an unknown pantry id instead of failing", () => {
    const result = runAssessment({
      ...request,
      referenceServiceId: "svc-does-not-exist",
    });
    expect(result.reference).toBeNull();
  });

  it("is deterministic apart from its timestamp", () => {
    const strip = (r: ReturnType<typeof runAssessment>) =>
      JSON.stringify({ ...r, generatedAt: "" });
    expect(strip(runAssessment(request))).toEqual(
      strip(runAssessment(request)),
    );
  });
});
