import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { dispatchAssistantTool } from "@/lib/ai/gemini";
import { loadDatasets } from "@/lib/data/datasets";

const request = {
  proposed: { lng: -76.6205, lat: 39.2986 },
  referenceServiceId: loadDatasets().services[0].id,
  plan: DEFAULT_OPERATING_PLAN,
};

describe("dispatchAssistantTool", () => {
  const assessment = runAssessment(request);

  it("returns proposed geography without inventing a population", () => {
    const out = dispatchAssistantTool(
      "get_location_evidence",
      { site: "proposed" },
      assessment,
    ) as { estimatedCatchmentPopulation: { value: number | null; status: string } };
    expect(out.estimatedCatchmentPopulation.status).toBe("estimated");
    expect(out.estimatedCatchmentPopulation.value).toBeGreaterThan(0);
  });

  it("describes the real pantry and states it is not simulated", () => {
    const out = dispatchAssistantTool(
      "get_reference_pantry",
      {},
      assessment,
    ) as { selected: boolean; isSimulated: boolean; name: string };
    expect(out.selected).toBe(true);
    expect(out.isSimulated).toBe(false);
    expect(out.name).toBe(assessment.reference?.pantry.name);
  });

  it("rejects reference geography when no pantry is selected", () => {
    const solo = runAssessment({ ...request, referenceServiceId: null });
    expect(() =>
      dispatchAssistantTool("get_location_evidence", { site: "reference" }, solo),
    ).toThrow(/no reference pantry/i);
  });

  it("reports net-new reach that conserves the catchment", () => {
    const out = dispatchAssistantTool(
      "get_reach_comparison",
      {},
      assessment,
    ) as {
      proposedCatchmentPopulation: { value: number };
      netNewPopulation: { value: number };
      duplicatedPopulation: { value: number };
    };
    expect(
      out.netNewPopulation.value + out.duplicatedPopulation.value,
    ).toBeCloseTo(out.proposedCatchmentPopulation.value, 0);
  });

  it("only returns proposed-site operations", () => {
    const out = dispatchAssistantTool(
      "get_scenario_results",
      { scenario: "medium" },
      assessment,
    ) as { site: string; appliesTo: string };
    expect(out.site).toBe("proposed");
    expect(out.appliesTo).toMatch(/proposed pantry only/i);
  });

  it("rejects unknown tools instead of guessing", () => {
    expect(() =>
      dispatchAssistantTool("invent_success_probability", {}, assessment),
    ).toThrow(/unknown function/i);
  });

  it("returns publisher landing URLs from the manifest, not invented pages", () => {
    const out = dispatchAssistantTool(
      "summarize_limitations",
      {},
      assessment,
    ) as {
      sources: Array<{ id: string; landingUrl: string }>;
    };
    expect(out.sources.length).toBeGreaterThan(0);
    for (const source of out.sources) {
      expect(source.landingUrl).toMatch(/^https?:\/\//);
    }
  });
});
