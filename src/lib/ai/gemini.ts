import { GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import type {
  GeographicAnalysis,
  Measure,
  ScenarioResult,
  SiteAssessmentResult,
} from "@/lib/contracts";
import { formatMeasure } from "@/lib/format";
import { answerFromAssessment, topic } from "@/lib/ai/fallback";

/**
 * Server-side Gemini planning assistant.
 *
 * The model never computes numbers. It may only call the approved analysis
 * functions below, which read from an already-computed deterministic
 * assessment, and then explain what those functions returned. If Gemini is
 * unavailable or fails, the caller still has the full assessment and the app
 * keeps working without any narrative.
 */

export const ASSISTANT_VERSION = "pantrytwin-assistant-0.4.0";

const OVERALL_TIMEOUT_MS = 20_000;
const MAX_QUESTION_LENGTH = 1000;

// --------------------------------------------------------------- tool schemas

const SiteArgSchema = z.object({ site: z.enum(["proposed", "reference"]) });
const ScenarioArgSchema = z.object({
  scenario: z.enum(["low", "medium", "high"]),
});
const EmptyArgSchema = z.object({}).loose();

// ------------------------------------------------------------- summarisers

function measure(m: Measure) {
  return {
    display: formatMeasure(m),
    value: m.value,
    unit: m.unit,
    status: m.status,
    sourceIds: m.sourceIds,
    note: m.note,
  };
}

/** Gemini only sees formatted figures, so it cannot dump raw decimals. */
function stripRawNumbers(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripRawNumbers);
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if ("display" in rec && "status" in rec && "sourceIds" in rec) {
      return {
        display: rec.display,
        status: rec.status,
        sourceIds: rec.sourceIds,
        note: rec.note ?? null,
      };
    }
    return Object.fromEntries(
      Object.entries(rec).map(([key, value]) => [key, stripRawNumbers(value)]),
    );
  }
  return node;
}

function summariseGeography(geo: GeographicAnalysis) {
  return {
    site: geo.location.label,
    coordinates: { lng: geo.location.lng, lat: geo.location.lat },
    insideBaltimoreCity: geo.withinCityBoundary,
    catchmentRadiusMeters: geo.catchmentRadiusMeters,
    catchmentShape: "straight-line radius, not a walking or driving time area",
    estimatedCatchmentPopulation: measure(geo.estimatedCatchmentPopulation),
    povertyRate: measure(geo.povertyRate),
    noVehicleHouseholdShare: measure(geo.noVehicleHouseholdShare),
    intersectingTractCount: geo.intersectingTracts.length,
    listedServiceCount: measure(geo.listedServiceCount),
    // Only a short roster is passed through; names are data, not instructions.
    nearestListedServices: geo.listedServices.slice(0, 8).map((s) => ({
      name: s.name,
      distanceMeters: s.distanceMeters,
      publisherNotes: s.publishedHours,
      notesAreVerified: false,
      capacityKnown: false,
      sourceId: s.sourceId,
    })),
    dataCompleteness: geo.dataCompleteness,
    missingInputs: geo.missingInputs,
  };
}

function summariseScenario(result: ScenarioResult) {
  return {
    site: result.label,
    scenario: result.scenario,
    horizonDays: result.horizonDays,
    assumedWeeklyHouseholdRequests: measure(result.assumedWeeklyHouseholdRequests),
    householdsServed: measure(result.householdsServed),
    unmetRequests: measure(result.unmetRequests),
    serviceRate: measure(result.serviceRate),
    poundsDistributed: measure(result.poundsDistributed),
    poundsSpoiled: measure(result.poundsSpoiled),
    spoilageRate: measure(result.spoilageRate),
    totalCost: measure(result.totalCost),
    costPerHouseholdServed: measure(result.costPerHouseholdServed),
    bindingConstraintDays: result.bindingConstraintDays,
    keyAssumptions: result.assumptions,
    missingInputs: result.missingInputs,
    modelVersion: result.modelVersion,
  };
}

// ------------------------------------------------------------- tool dispatch

export interface ToolCallRecord {
  name: string;
  args: unknown;
  ok: boolean;
  error?: string;
}

export function dispatchAssistantTool(
  name: string,
  rawArgs: unknown,
  assessment: SiteAssessmentResult,
): unknown {
  switch (name) {
    case "get_location_evidence": {
      const { site } = SiteArgSchema.parse(rawArgs);
      if (site === "reference") {
        if (!assessment.reference) {
          throw new Error(
            "No reference pantry has been selected, so there is no reference location to describe",
          );
        }
        return summariseGeography(assessment.reference.geography);
      }
      return summariseGeography(assessment.proposed);
    }
    case "get_reference_pantry": {
      EmptyArgSchema.parse(rawArgs ?? {});
      if (!assessment.reference) {
        return {
          selected: false,
          note: "This assessment does not compare the pin to a chosen existing pantry.",
        };
      }
      const { pantry, unknowns } = assessment.reference;
      return {
        selected: true,
        // Publisher free text is data to report, never instructions to follow.
        name: pantry.name,
        address: pantry.address,
        programType: pantry.program,
        listedServices: pantry.services,
        phone: pantry.phone,
        publisherNotes: pantry.publishedNotes,
        publisherNotesCaveat:
          "Free text from the publisher. It usually states eligibility conditions rather than opening hours, and it is not verified.",
        distanceFromProposedMeters: pantry.distanceMeters,
        sourceIds: pantry.sourceIds,
        notPublished: unknowns,
        isSimulated: false,
        simulationCaveat:
          "This pantry's operations are not modelled anywhere. Nothing in this assessment says whether it is meeting need today.",
      };
    }
    case "get_reach_comparison": {
      EmptyArgSchema.parse(rawArgs ?? {});
      const { reach } = assessment;
      return {
        proposedCatchmentPopulation: measure(reach.proposedPopulation),
        referenceCatchmentPopulation: measure(reach.referencePopulation),
        netNewPopulation: measure(reach.netNewPopulation),
        duplicatedPopulation: measure(reach.duplicatedPopulation),
        netNewShareOfProposedCatchment: measure(reach.netNewShare),
        populationOutsideAllListedServiceRings: measure(
          reach.populationOutsideAllListings,
        ),
        nearbyListedServiceCount: measure(reach.nearbyListedServiceCount),
        catchmentOverlap: reach.overlap,
        newlyCoveredTracts: reach.newlyCoveredTracts.slice(0, 10),
        caution:
          "Reach is measured against the published roster, not a chosen comparison pantry. It counts who could travel to a site, not who would attend.",
      };
    }
    case "get_scenario_results": {
      const { scenario } = ScenarioArgSchema.parse(rawArgs);
      const bucket = assessment.scenarios.find((s) => s.scenario === scenario);
      if (!bucket) throw new Error(`No results for scenario ${scenario}`);
      return {
        ...summariseScenario(bucket.proposed),
        appliesTo:
          "The proposed pantry only. Listed sites are not modelled.",
      };
    }
    case "get_siting_brief": {
      EmptyArgSchema.parse(rawArgs ?? {});
      const { proposed, reach } = assessment;
      return {
        howToUse:
          "Evidence for the pin now on the map. Moving the pin recomputes every figure. This function does not pick a street, rank neighbourhoods, or say a pantry should open.",
        proposedPin: {
          lng: proposed.location.lng,
          lat: proposed.location.lat,
          insideBaltimoreCity: proposed.withinCityBoundary,
          catchmentRadiusMeters: proposed.catchmentRadiusMeters,
          catchmentShape:
            "straight-line radius, not a walking or driving time area",
        },
        peopleInThisRing: measure(proposed.estimatedCatchmentPopulation),
        povertyRate: measure(proposed.povertyRate),
        noVehicleHouseholdShare: measure(proposed.noVehicleHouseholdShare),
        listedServicesInsideThisRing: {
          count: measure(proposed.listedServiceCount),
          nearest: proposed.listedServices.slice(0, 8).map((s) => ({
            name: s.name,
            distanceMeters: s.distanceMeters,
            sourceId: s.sourceId,
            capacityKnown: false,
          })),
        },
        coverage: {
          peopleOutsideEveryListedRing: measure(
            reach.populationOutsideAllListings,
          ),
          peopleAlreadyInsideAListedRing: measure(reach.duplicatedPopulation),
          nearbyListedServiceCount: measure(reach.nearbyListedServiceCount),
          tractsThatGainCoverage: reach.newlyCoveredTracts.slice(0, 8).map(
            (tract) => ({
              name: tract.name,
              geoid: tract.geoid,
              newPopulation: tract.newPopulation,
              newAreaShare: tract.newAreaShare,
            }),
          ),
        },
        findings: assessment.consequences.filter(
          (c) => c.category === "reach" || c.category === "duplication",
        ),
        cannotDecide: [
          "A recommended street address or neighbourhood ranking",
          "Who would attend, or whether a pantry would succeed",
          "Whether a listed site is open, staffed or at capacity",
        ],
      };
    }
    case "get_consequences": {
      EmptyArgSchema.parse(rawArgs ?? {});
      return {
        consequences: assessment.consequences,
        note: "These findings were derived deterministically from the numbers. Explain them; do not add new ones.",
      };
    }
    case "summarize_limitations": {
      EmptyArgSchema.parse(rawArgs ?? {});
      return {
        limitations: assessment.limitations,
        dataCompleteness: assessment.proposed.dataCompleteness,
        evidenceGaps: assessment.consequences.filter(
          (c) =>
            c.severity === "gap" &&
            c.id !== "no-reference" &&
            c.id !== "reference-capacity-unknown",
        ),
        sources: assessment.sources.map((s) => ({
          id: s.id,
          publisher: s.publisher,
          title: s.title,
          landingUrl: s.landingUrl,
          dataVintage: s.dataVintage,
          geographicVintage: s.geographicVintage,
          retrievedAt: s.retrievedAt,
        })),
        modelVersions: assessment.modelVersions,
      };
    }
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

// ------------------------------------------------------------------ entrypoint

export interface AssistantAnswer {
  status: "ok" | "unconfigured" | "error";
  text: string;
  toolCalls: ToolCallRecord[];
  sourceIds: string[];
  model: string | null;
  assistantVersion: string;
  warning: string | null;
}

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function analysisFallback(
  question: string,
  assessment: SiteAssessmentResult,
  warning: string | null,
  extraCalls: ToolCallRecord[] = [],
): AssistantAnswer {
  const fallback = answerFromAssessment(question, assessment);
  return {
    status: "ok",
    text: fallback.text,
    toolCalls: [...extraCalls, ...fallback.toolCalls],
    sourceIds: [...new Set(assessment.sources.map((s) => s.id))],
    model: "analysis",
    assistantVersion: ASSISTANT_VERSION,
    warning,
  };
}

function isRateLimited(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /RESOURCE_EXHAUSTED|quota|rate[- ]?limit|"code":429/i.test(message);
}

function isTransientGeminiFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /UNAVAILABLE|high demand|"code":503/.test(message);
}

const unavailableModels = new Set<string>();

function overflowModels(primary: string): string[] {
  const extras = [
    process.env.GEMINI_FALLBACK_MODEL,
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
  ];
  return extras.filter(
    (name): name is string => Boolean(name) && name !== primary,
  );
}

function isRetiredModel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /NOT_FOUND|"code":404|no longer available/i.test(message);
}

function shouldRetryNonStream(err: unknown): boolean {
  return !isRateLimited(err) && !isRetiredModel(err);
}

function sanitizeGeminiError(err: unknown): string {
  return String(err instanceof Error ? err.message : err)
    .replace(/AQ\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 400);
}

export function toolsForTopic(kind: ReturnType<typeof topic>): Array<{
  name: string;
  args: Record<string, unknown>;
}> {
  switch (kind) {
    case "coverage":
      return [
        { name: "get_siting_brief", args: {} },
        { name: "get_reach_comparison", args: {} },
      ];
    case "operations":
      return [
        { name: "get_scenario_results", args: { scenario: "medium" } },
        { name: "get_consequences", args: {} },
      ];
    case "limits":
      return [{ name: "summarize_limitations", args: {} }];
    case "greeting":
      return [];
    default:
      return [{ name: "get_siting_brief", args: {} }];
  }
}

export function collectQuestionEvidence(
  question: string,
  assessment: SiteAssessmentResult,
): { evidence: unknown[]; toolCalls: ToolCallRecord[] } {
  const kind = topic(question);
  if (kind === "greeting") {
    return {
      evidence: [
        {
          function: "what_you_can_ask",
          output: {
            canAnswer: [
              "People in this straight-line ring",
              "Listed pantries near this pin",
              "Whether this ring adds coverage or sits on listed coverage",
              "What the public data does not publish",
            ],
            cannotAnswer: [
              "A recommended street",
              "Who would attend",
            ],
          },
        },
      ],
      toolCalls: [],
    };
  }

  const toolCalls: ToolCallRecord[] = [];
  const evidence = toolsForTopic(kind).map(({ name, args }) => {
    try {
      const output = dispatchAssistantTool(name, args, assessment);
      toolCalls.push({ name, args, ok: true });
      return { function: name, output: stripRawNumbers(output) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toolCalls.push({ name, args, ok: false, error: message });
      return { function: name, error: message };
    }
  });
  return { evidence, toolCalls };
}

const EXPLAIN_INSTRUCTION = `
You answer a planner's question about the pin on the PantryTwin map.

Answer the question they asked. Do not paste a full briefing for a greeting
or a one-line question.

You cannot calculate. Use only the Evidence JSON. Never invent a number,
address, URL or success probability. Copy each figure from the "display"
field exactly. If display is Unavailable, write Unavailable.

Demand figures are assumptions. Reach is geography, not attendance.
Do not pick a street. Do not compare this pin to a chosen existing pantry.

If they greet you, say what you can help with. Do not dump numbers.
If they ask for the best or ideal location, say you cannot pick a street,
then use the evidence to say what this pin shows and how moving it changes
people outside every listed ring.

Keep it short. Use ### only when a list helps. No ---, no em dashes,
no model names, no "as an AI".
`.trim();

function questionPrompt(question: string, evidence: unknown[]): Content[] {
  return [
    {
      role: "user",
      parts: [
        {
          text:
            `Answer this question. Do not substitute a different briefing.\n` +
            `Question: ${question}\n\n` +
            `Evidence JSON from the analysis on this pin:\n` +
            JSON.stringify(evidence),
        },
      ],
    },
  ];
}

export type AssistantStreamEvent =
  | { type: "token"; text: string }
  | {
      type: "done";
      status: "ok";
      text: string;
      model: string | null;
      toolCalls: ToolCallRecord[];
      sourceIds: string[];
      warning: string | null;
    };

export async function* streamAssistant(
  question: string,
  assessment: SiteAssessmentResult,
): AsyncGenerator<AssistantStreamEvent> {
  const fallback = analysisFallback(question, assessment, null);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
  const { evidence, toolCalls } = collectQuestionEvidence(trimmed, assessment);
  const sourceIds = [...new Set(assessment.sources.map((s) => s.id))];

  const finish = (
    text: string,
    usedModel: string | null,
    warning: string | null = null,
  ): AssistantStreamEvent => ({
    type: "done",
    status: "ok",
    text,
    model: usedModel,
    toolCalls: usedModel === "analysis" ? fallback.toolCalls : toolCalls,
    sourceIds,
    warning,
  });

  if (!apiKey) {
    yield { type: "token", text: fallback.text };
    yield finish(fallback.text, "analysis");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + OVERALL_TIMEOUT_MS;
  const contents = questionPrompt(trimmed, evidence);
  const modelsToTry = [model, ...overflowModels(model)].filter(
    (name, index, all) => all.indexOf(name) === index,
  );

  for (const candidate of modelsToTry) {
    if (Date.now() > deadline) break;
    if (unavailableModels.has(candidate)) continue;
    let full = "";
    let streamError: unknown = null;
    try {
      const stream = await ai.models.generateContentStream({
        model: candidate,
        contents,
        config: {
          systemInstruction: EXPLAIN_INSTRUCTION,
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(
            Math.max(1000, deadline - Date.now()),
          ),
        },
      });
      for await (const chunk of stream) {
        const piece = chunk.text ?? "";
        if (!piece) continue;
        full += piece;
        yield { type: "token", text: piece };
      }
      if (full.trim().length > 0) {
        yield finish(full.trim(), candidate);
        return;
      }
    } catch (err) {
      streamError = err;
      if (full.trim().length > 0) {
        yield finish(full.trim(), candidate);
        return;
      }
      if (isRateLimited(err) || isRetiredModel(err)) {
        unavailableModels.add(candidate);
      }
      console.warn("[assistant] stream failed", candidate, sanitizeGeminiError(err));
    }

    if (streamError && !shouldRetryNonStream(streamError)) continue;
    if (Date.now() > deadline) break;
    try {
      const response = await ai.models.generateContent({
        model: candidate,
        contents,
        config: {
          systemInstruction: EXPLAIN_INSTRUCTION,
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(
            Math.max(1000, deadline - Date.now()),
          ),
        },
      });
      const text = response.text?.trim() ?? "";
      if (text.length > 0) {
        yield { type: "token", text };
        yield finish(text, candidate);
        return;
      }
    } catch (err) {
      if (isRateLimited(err) || isRetiredModel(err)) {
        unavailableModels.add(candidate);
      }
      console.warn("[assistant] generate failed", candidate, sanitizeGeminiError(err));
    }
  }

  yield { type: "token", text: fallback.text };
  yield finish(
    fallback.text,
    "analysis",
    "Gemini could not be reached for this question, so this answer is from the numbers already computed for this pin.",
  );
}

export async function askAssistant(
  question: string,
  assessment: SiteAssessmentResult,
): Promise<AssistantAnswer> {
  let last: AssistantAnswer | null = null;
  for await (const event of streamAssistant(question, assessment)) {
    if (event.type === "done") {
      last = {
        status: event.status,
        text: event.text,
        toolCalls: event.toolCalls,
        sourceIds: event.sourceIds,
        model: event.model,
        assistantVersion: ASSISTANT_VERSION,
        warning: event.warning,
      };
    }
  }
  return (
    last ??
    analysisFallback(
      question,
      assessment,
      "Gemini is not configured. This answer is from the analysis on screen.",
    )
  );
}
