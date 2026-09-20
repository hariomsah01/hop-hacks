import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import {
  collectQuestionEvidence,
  dispatchAssistantTool,
} from "@/lib/ai/gemini";
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

  it("does not treat a listed pantry as a comparison site", () => {
    const out = dispatchAssistantTool(
      "get_reference_pantry",
      {},
      assessment,
    ) as { selected: boolean; note: string };
    expect(out.selected).toBe(false);
    expect(out.note).toMatch(/does not compare/i);
    expect(assessment.reference).toBeNull();
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

  it("packages this pin's evidence without picking an address", () => {
    const out = dispatchAssistantTool("get_siting_brief", {}, assessment) as {
      howToUse: string;
      peopleInThisRing: { value: number | null; status: string };
      coverage: {
        peopleOutsideEveryListedRing: { status: string };
      };
      cannotDecide: string[];
    };
    expect(out.howToUse).toMatch(/does not pick a street/i);
    expect(out.peopleInThisRing.status).toBe("estimated");
    expect(out.peopleInThisRing.value).not.toBeNull();
    expect(["sourced", "estimated", "assumed", "unavailable"]).toContain(
      out.coverage.peopleOutsideEveryListedRing.status,
    );
    expect(out.cannotDecide.some((item) => /street address/i.test(item))).toBe(
      true,
    );
  });

  it("preloads evidence for a coverage question without inventing people", () => {
    const { evidence, toolCalls } = collectQuestionEvidence(
      "Would opening here add coverage, or duplicate what is already there?",
      assessment,
    );
    expect(toolCalls.map((c) => c.name)).toEqual([
      "get_siting_brief",
      "get_reach_comparison",
    ]);
    const reach = evidence.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "function" in item &&
        item.function === "get_reach_comparison",
    ) as { output: { proposedCatchmentPopulation: { status: string } } };
    expect(reach.output.proposedCatchmentPopulation.status).toBe("estimated");
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
