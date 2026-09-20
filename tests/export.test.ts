import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { buildActionPlanMarkdown } from "@/lib/export/actionPlan";
import { buildActionPlanPdf } from "@/lib/export/pdf";
import { loadDatasets } from "@/lib/data/datasets";

describe("action plan export", () => {
  const assessment = runAssessment({
    proposed: { lng: -76.6205, lat: 39.2986 },
    referenceServiceId: loadDatasets().services[0].id,
    plan: DEFAULT_OPERATING_PLAN,
  });

  const markdown = buildActionPlanMarkdown(assessment);

  it("does not present a chosen existing pantry as a comparison site", () => {
    expect(assessment.reference).toBeNull();
    expect(markdown).not.toMatch(/compared against/i);
    expect(markdown).toMatch(/published roster/i);
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

  it("writes a PDF that starts with the PDF header and keeps a sourced figure", () => {
    const pdf = buildActionPlanPdf(markdown);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toMatch(/PantryTwin action plan/);
    const people = assessment.proposed.estimatedCatchmentPopulation.value;
    if (people !== null) {
      const rounded = Math.round(people).toLocaleString("en-US");
      expect(text.includes(rounded) || text.includes(String(Math.round(people)))).toBe(
        true,
      );
    }
  });

  it("lists sources with retrieval times", () => {
    expect(markdown).toContain("## 8. Sources");
    expect(assessment.sources.length).toBeGreaterThan(0);
    expect(markdown).toContain(assessment.sources[0].id);
  });
});
