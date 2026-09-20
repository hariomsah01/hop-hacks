import type { Measure, SiteAssessmentResult } from "@/lib/contracts";
import { formatMeasure } from "@/lib/format";
import type { ToolCallRecord } from "@/lib/ai/gemini";

export type FallbackAnswer = {
  text: string;
  toolCalls: ToolCallRecord[];
};

const CONSTRAINT_LABEL: Record<string, string> = {
  none: "none",
  staffing: "staffing",
  supply: "food on hand",
  delivery: "delivery",
  demand: "assumed demand",
};

function cite(measure: Measure): string {
  return measure.sourceIds.length > 0
    ? ` [${measure.sourceIds.join(", ")}]`
    : "";
}

function line(label: string, measure: Measure): string {
  if (measure.value === null) {
    const reason = measure.note ? `; ${measure.note}` : "";
    return `- ${label}: Unavailable${reason}${cite(measure)}`;
  }
  return `- ${label}: ${formatMeasure(measure)}${cite(measure)}`;
}

function used(name: string, args: unknown = {}): ToolCallRecord {
  return { name, args, ok: true };
}

function coverageLead(outside: Measure, nearby: Measure): string {
  if (outside.value === null) {
    return "**Whether this pin adds coverage cannot be stated. People outside every listed ring are Unavailable.**";
  }
  if (outside.value === 0) {
    const count =
      nearby.value === null
        ? "listed services"
        : `${nearby.value} listed services`;
    return `**Opening here would duplicate listed coverage, not add new ground.** Everyone in this straight-line ring is already inside a listed service's ring (${count}).`;
  }
  return `**Opening here would bring people into range who sit outside every listed service's ring.** That is geography, not a count of who would attend.`;
}

function coverageAnswer(assessment: SiteAssessmentResult): FallbackAnswer {
  const metres = assessment.proposed.catchmentRadiusMeters;
  const reach = assessment.reach;

  const lines = [
    coverageLead(
      reach.populationOutsideAllListings,
      reach.nearbyListedServiceCount,
    ),
    "",
    "### What this pin shows",
    line(`People in this ${metres} m ring`, reach.proposedPopulation),
    line("People outside every listed ring", reach.populationOutsideAllListings),
    line("Already inside a listed ring", reach.duplicatedPopulation),
    line("Listed services near this point", reach.nearbyListedServiceCount),
    "",
    "### How to use this",
    "- Drag the pin to a tract that sits outside listed rings if you want new coverage.",
    "- Listed dots are a published roster, not a comparison site.",
    "",
    "### Limits",
    "- Catchments are straight-line radii, not walking or drive-time areas.",
    "- Listed capacity, hours and staffing are unpublished, so they are not modelled.",
  ];

  return {
    text: lines.join("\n"),
    toolCalls: [used("get_siting_brief"), used("get_reach_comparison")],
  };
}

function operationsAnswer(assessment: SiteAssessmentResult): FallbackAnswer {
  const medium = assessment.scenarios.find((s) => s.scenario === "medium")?.proposed;
  if (!medium) {
    return {
      text: "**The 28-day plan for medium demand is Unavailable.**",
      toolCalls: [used("get_scenario_results", { scenario: "medium" })],
    };
  }

  const binding = Object.entries(medium.bindingConstraintDays)
    .filter(([name, days]) => name !== "none" && days > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = binding[0];
  const topLabel = top ? (CONSTRAINT_LABEL[top[0]] ?? top[0]) : null;

  const lead = topLabel
    ? `**Under the assumed medium demand, ${topLabel} is the binding limit on ${top[1]} of 28 days.** Demand figures are assumptions, not measurements.`
    : "**The 28-day plan reports modelled visits under assumed demand. It does not estimate who would arrive.**";

  const lines = [
    lead,
    "",
    "### Medium-demand plan (assumed)",
    line("Household visits served", medium.householdsServed),
    line("Unmet requests", medium.unmetRequests),
    line("Share of assumed requests served", medium.serviceRate),
    "",
    "### Binding days",
    ...binding.map(
      ([name, days]) =>
        `- ${CONSTRAINT_LABEL[name] ?? name}: ${days} of 28 days`,
    ),
    binding.length === 0 ? "- No binding constraint days were recorded." : "",
    "",
    "### Limits",
    "- These figures apply to the proposed pantry only. Listed sites are not modelled.",
    "- Changing assumed participation, food on hand or staffing is what changes these figures.",
  ];

  return {
    text: lines.filter(Boolean).join("\n"),
    toolCalls: [used("get_scenario_results", { scenario: "medium" })],
  };
}

function limitsAnswer(assessment: SiteAssessmentResult): FallbackAnswer {
  const comparisonTalk =
    /reference pantry has been selected|compared against|existing pantry selected|click one of the listed|click a listing to compare/i;
  const limits = assessment.limitations
    .filter((item) => !comparisonTalk.test(item))
    .slice(0, 6);
  const gaps = assessment.consequences.filter(
    (c) =>
      c.severity === "gap" &&
      c.id !== "no-reference" &&
      c.id !== "reference-capacity-unknown",
  );
  const lines = [
    "**This analysis reports modelled geography and an assumed 28-day plan. It does not know who would attend, or whether a listed pantry is open or at capacity.**",
    "",
    "### What is not known",
    ...limits.map((item) => `- ${item}`),
    "",
    gaps.length > 0 ? "### Evidence gaps" : "",
    ...gaps.slice(0, 4).map((gap) => `- ${gap.headline}`),
  ];

  return {
    text: lines.filter(Boolean).join("\n"),
    toolCalls: [used("summarize_limitations")],
  };
}

function greetingAnswer(): FallbackAnswer {
  return {
    text: [
      "**I can help with this pin.** Ask about people in the ring, listed pantries nearby, or what the public data does not publish.",
      "",
      "I do not pick a street or guess who would attend.",
    ].join("\n"),
    toolCalls: [],
  };
}

function askedMeasure(
  question: string,
  assessment: SiteAssessmentResult,
): FallbackAnswer | null {
  const q = question.toLowerCase();
  const geo = assessment.proposed;
  const reach = assessment.reach;
  const matches: Array<[RegExp, string, Measure]> = [
    [/poverty/, "Poverty rate in this ring", geo.povertyRate],
    [
      /vehicle/,
      "Households without a vehicle",
      geo.noVehicleHouseholdShare,
    ],
    [
      /how many people|people live|people in this|population/,
      "People in this ring",
      geo.estimatedCatchmentPopulation,
    ],
    [
      /listed pantry|listed service|how many listed/,
      "Listed services near this point",
      reach.nearbyListedServiceCount,
    ],
    [
      /outside every listed|new ground|outside.*ring/,
      "People outside every listed ring",
      reach.populationOutsideAllListings,
    ],
  ];
  for (const [pattern, label, measure] of matches) {
    if (!pattern.test(q)) continue;
    const figure =
      measure.value === null ? "Unavailable" : formatMeasure(measure);
    const bits = [
      `**${label}: ${figure}.**`,
      measure.note,
      measure.sourceIds.length > 0
        ? `Source: ${measure.sourceIds.join(", ")}.`
        : null,
    ].filter(Boolean);
    return {
      text: bits.join(" "),
      toolCalls: [used("get_siting_brief")],
    };
  }
  return null;
}

function generalAnswer(assessment: SiteAssessmentResult): FallbackAnswer {
  const geo = assessment.proposed;
  const lines = [
    "**Ask about the numbers on this pin.** I can read people in the ring, listed pantries nearby, and what the data does not publish.",
    "",
    line("People in this ring", geo.estimatedCatchmentPopulation),
    line("Poverty rate in this ring", geo.povertyRate),
    line("Listed services near this point", assessment.reach.nearbyListedServiceCount),
    line("People outside every listed ring", assessment.reach.populationOutsideAllListings),
  ];
  return {
    text: lines.join("\n"),
    toolCalls: [used("get_siting_brief")],
  };
}

function sitingAnswer(assessment: SiteAssessmentResult): FallbackAnswer {
  const geo = assessment.proposed;
  const pin = geo.location;
  const city = geo.withinCityBoundary
    ? "inside Baltimore City"
    : "outside the Baltimore City boundary";

  const lines = [
    `**Use this pin as a test. The tool does not pick a street.** The current point is ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)} (${city}).`,
    "",
    "### What the data on this pin shows",
    line(`People in this ${geo.catchmentRadiusMeters} m ring`, geo.estimatedCatchmentPopulation),
    line("Poverty rate in the ring", geo.povertyRate),
    line("Households with no vehicle", geo.noVehicleHouseholdShare),
    line(
      "People outside every listed ring",
      assessment.reach.populationOutsideAllListings,
    ),
    line("Listed services near this point", assessment.reach.nearbyListedServiceCount),
    "",
    "### How to choose a location with this data",
    "- Drag the pin and read whether people outside every listed ring goes up.",
    "- Stay inside the city boundary if the site has to be in Baltimore City.",
    "",
    "### Limits",
    "- This is not a recommended address and not a prediction of attendance.",
    "- Listed hours and capacity are unpublished.",
  ];

  return {
    text: lines.join("\n"),
    toolCalls: [used("get_siting_brief")],
  };
}

export type AssistantTopic =
  | "coverage"
  | "operations"
  | "limits"
  | "siting"
  | "greeting"
  | "general";

export const STARTER_QUESTIONS = [
  "Would opening here add coverage, or duplicate what is already there?",
  "How many listed pantries are near this pin?",
  "What does this analysis not know?",
];

const FOLLOW_UP_POOL: Record<AssistantTopic, string[]> = {
  greeting: STARTER_QUESTIONS,
  general: STARTER_QUESTIONS,
  coverage: [
    "How many people live in this ring?",
    "What is the poverty rate here?",
    "What does this analysis not know?",
  ],
  siting: [
    "Would opening here add coverage, or duplicate what is already there?",
    "How many listed pantries are near this pin?",
    "What is the poverty rate here?",
  ],
  limits: [
    "Would opening here add coverage, or duplicate what is already there?",
    "How many people live in this ring?",
    "How many listed pantries are near this pin?",
  ],
  operations: [
    "Would opening here add coverage, or duplicate what is already there?",
    "How many people live in this ring?",
    "What does this analysis not know?",
  ],
};

export function topic(question: string): AssistantTopic {
  const q = question.toLowerCase().trim();
  if (
    /^(hi|hey|hello|howdy|yo|sup|thanks|thank you|ok|okay|hola)([\s!?.]*)$/.test(
      q,
    )
  ) {
    return "greeting";
  }
  if (
    /not know|cannot tell|missing|limitation|what does this analysis not|gaps?/.test(
      q,
    )
  ) {
    return "limits";
  }
  if (
    /household|serve|constraint|food on hand|staff|budget|28-day|28 day/.test(q)
  ) {
    return "operations";
  }
  if (
    /coverage|duplicate|overlap|unserved|new reach|listed service|listed pantry/.test(
      q,
    )
  ) {
    return "coverage";
  }
  if (
    /ideal|best (place|location|spot|site)|where should|recommend|which (area|neighbourhood|neighborhood)/.test(
      q,
    )
  ) {
    return "siting";
  }
  return "general";
}

/** Follow-up chips after a reply. Never repeats the question just asked. */
export function suggestedFollowUps(
  question: string,
  alreadyAsked: string[] = [],
): string[] {
  const asked = new Set(
    [question, ...alreadyAsked].map((item) => item.trim().toLowerCase()),
  );
  const pool = [
    ...FOLLOW_UP_POOL[topic(question)],
    ...STARTER_QUESTIONS,
  ];
  const unique: string[] = [];
  for (const item of pool) {
    if (asked.has(item.toLowerCase())) continue;
    if (unique.includes(item)) continue;
    unique.push(item);
    if (unique.length === 3) break;
  }
  return unique;
}

/**
 * Answers from the same assessment Gemini is allowed to read.
 * Used when Gemini is rate-limited, unconfigured or otherwise unavailable.
 * Does not invent numbers.
 */
export function answerFromAssessment(
  question: string,
  assessment: SiteAssessmentResult,
): FallbackAnswer {
  if (topic(question) !== "greeting") {
    const exact = askedMeasure(question, assessment);
    if (exact) return exact;
  }
  switch (topic(question)) {
    case "coverage":
      return coverageAnswer(assessment);
    case "operations":
      return operationsAnswer(assessment);
    case "limits":
      return limitsAnswer(assessment);
    case "greeting":
      return greetingAnswer();
    case "siting":
      return sitingAnswer(assessment);
    default:
      return generalAnswer(assessment);
  }
}
