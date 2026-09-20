import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATING_PLAN } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import {
  answerFromAssessment,
  suggestedFollowUps,
  topic,
} from "@/lib/ai/fallback";
import { formatMeasure } from "@/lib/format";
import { loadDatasets } from "@/lib/data/datasets";

const request = {
  proposed: { lng: -76.6205, lat: 39.2986 },
  referenceServiceId: loadDatasets().services[0].id,
  plan: DEFAULT_OPERATING_PLAN,
};

describe("answerFromAssessment", () => {
  const assessment = runAssessment(request);

  it("answers the coverage question from reach figures, not a lecture", () => {
    const out = answerFromAssessment(
      "Would opening here add coverage, or duplicate what is already there?",
      assessment,
    );
    expect(out.text).not.toMatch(/AI explanation is unavailable/i);
    expect(out.text).toMatch(/### What this pin shows/);
    const people = formatMeasure(assessment.reach.proposedPopulation);
    expect(out.text).toContain(people);
    expect(out.toolCalls.some((c) => c.name === "get_reach_comparison")).toBe(
      true,
    );
  });

  it("answers a poverty-rate question with that measure", () => {
    const out = answerFromAssessment(
      "What is the poverty rate here?",
      assessment,
    );
    expect(out.text).toMatch(/poverty rate/i);
    expect(out.text).toContain(formatMeasure(assessment.proposed.povertyRate));
    expect(out.text).not.toMatch(/Ask about the numbers on this pin/i);
  });

  it("does not invent a street when asked where to site", () => {
    const out = answerFromAssessment(
      "Where should I be choosing the location, based on the data on this pin?",
      assessment,
    );
    expect(out.text).toMatch(/does not pick a street/i);
    expect(out.text).toContain(
      formatMeasure(assessment.proposed.estimatedCatchmentPopulation),
    );
  });

  it("greets without dumping the pin briefing", () => {
    const out = answerFromAssessment("hi?", assessment);
    expect(topic("hi?")).toBe("greeting");
    expect(out.text).toMatch(/help with this pin/i);
    expect(out.text).not.toMatch(/current point is/i);
    expect(out.text).not.toMatch(/### What the data/);
  });

  it("offers different follow-ups after a question is asked", () => {
    const asked =
      "Would opening here add coverage, or duplicate what is already there?";
    const next = suggestedFollowUps(asked, [asked]);
    expect(next).not.toContain(asked);
    expect(next.length).toBeGreaterThan(0);
  });

  it("leaves unavailable values as Unavailable", () => {
    const out = answerFromAssessment(
      "What does this analysis not know?",
      assessment,
    );
    expect(out.text).toMatch(/does not know who would attend/i);
    expect(out.text).not.toMatch(/success probability/i);
    expect(out.text).not.toMatch(/no reference pantry/i);
    expect(out.text).not.toMatch(/selected for comparison/i);
  });
});
