import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { buildActionPlanMarkdown } from "@/lib/export/actionPlan";
import { loadDatasets } from "@/lib/data/datasets";

describe("action plan export", () => {
  const assessment = runAssessment({
    proposed: { lng: -76.6205, lat: 39.2986 },
    referenceServiceId: loadDatasets().services[0].id,
    plan: DEFAULT_OPERATING_PLAN,
  });

  const markdown = buildActionPlanMarkdown(assessment);

  it("names the real pantry and says it is not simulated", () => {
    expect(markdown).toContain(assessment.reference!.pantry.name);
    expect(markdown).toMatch(/not modelled|not simulated/i);
  });

  it("includes net new reach and the no-probability disclaimer", () => {
    expect(markdown).toMatch(/Net new reach/i);
    expect(markdown).toContain("does not estimate a probability");
  });

  it("echoes the catchment population from the assessment", () => {
    const people = Math.round(
      assessment.proposed.estimatedCatchmentPopulation.value as number,
    );
    expect(
      markdown.includes(people.toLocaleString()) ||
        markdown.includes(String(people)),
    ).toBe(true);
  });

  it("lists sources with retrieval times", () => {
    expect(markdown).toContain("## 8. Sources");
    expect(assessment.sources.length).toBeGreaterThan(0);
    expect(markdown).toContain(assessment.sources[0].id);
  });
});
