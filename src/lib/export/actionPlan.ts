import type {
  Consequence,
  GeographicAnalysis,
  Measure,
  ScenarioResult,
  SiteAssessmentResult,
} from "@/lib/contracts";

/**
 * Renders an assessment as a self-contained Markdown action plan.
 *
 * The export is generated from the same analysis objects that drive the
 * on-screen cards, so a downloaded report always matches what was displayed.
 * No AI prose is included in the numbers.
 */

function fmtNumber(value: number, unit: string): string {
  const abs = Math.abs(value);
  if (unit.startsWith("share")) return `${(value * 100).toFixed(1)}%`;
  if (unit === "USD") return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (unit === "USD per household") return `$${value.toFixed(2)}`;
  const digits = abs >= 100 ? 0 : abs >= 1 ? 1 : 3;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function fmtMeasure(m: Measure): string {
  if (m.value === null) {
    return `unavailable${m.note ? ` (${m.note})` : ""}`;
  }
  const bare =
    m.unit.startsWith("share") || m.unit.startsWith("USD")
      ? ""
      : ` ${m.unit}`;
  return `${fmtNumber(m.value, m.unit)}${bare} _[${m.status}${m.sourceIds.length ? `: ${m.sourceIds.join(", ")}` : ""}]_`;
}

const SEVERITY_PREFIX: Record<Consequence["severity"], string> = {
  info: "",
  watch: "Worth checking: ",
  gap: "Evidence gap: ",
};

function consequenceSection(consequences: Consequence[]): string {
  return consequences
    .map((c) => `- **${SEVERITY_PREFIX[c.severity]}${c.headline}**\n  ${c.detail}`)
    .join("\n\n");
}

function geographySection(geo: GeographicAnalysis, title: string): string {
  const services = geo.listedServices
    .slice(0, 10)
    .map(
      (s) =>
        `  - ${s.name} — ${s.distanceMeters} m away; publisher notes: ${s.publishedHours ?? "none published"} (not verified) [${s.sourceId}]`,
    )
    .join("\n");

  return [
    `### ${title}`,
    "",
    `- Coordinates: ${geo.location.lng.toFixed(5)}, ${geo.location.lat.toFixed(5)}`,
    `- Inside Baltimore City boundary: ${geo.withinCityBoundary ? "yes" : "no"}`,
    `- Catchment: ${geo.catchmentRadiusMeters} m straight-line radius (not a walking or driving time area)`,
    `- Estimated catchment population: ${fmtMeasure(geo.estimatedCatchmentPopulation)}`,
    `- Intersecting census tracts: ${geo.intersectingTracts.length}`,
    `- Poverty rate: ${fmtMeasure(geo.povertyRate)}`,
    `- Households without a vehicle: ${fmtMeasure(geo.noVehicleHouseholdShare)}`,
    `- Listed food services in catchment: ${fmtMeasure(geo.listedServiceCount)}`,
    services ? `\n  Nearest listings:\n${services}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function scenarioSection(result: ScenarioResult): string {
  const row = (label: string, m: Measure) => `| ${label} | ${fmtMeasure(m)} |`;

  return [
    `### ${result.scenario[0].toUpperCase()}${result.scenario.slice(1)} demand scenario`,
    "",
    "| Metric | Proposed pantry |",
    "| --- | --- |",
    row("Assumed weekly requests", result.assumedWeeklyHouseholdRequests),
    row("Household visits served (28 days)", result.householdsServed),
    row("Unmet requests", result.unmetRequests),
    row("Service rate", result.serviceRate),
    row("Pounds distributed", result.poundsDistributed),
    row("Pounds spoiled", result.poundsSpoiled),
    row("Spoilage rate", result.spoilageRate),
    row("Intake refused for lack of storage", result.poundsNotAccepted),
    row("Total modelled cost", result.totalCost),
    row("Cost per household served", result.costPerHouseholdServed),
    "",
    `Binding constraint days: ${JSON.stringify(result.bindingConstraintDays)}`,
  ].join("\n");
}

export function buildActionPlanMarkdown(
  assessment: SiteAssessmentResult,
): string {
  const { plan, proposed, reach, scenarios, consequences } = assessment;

  const planRows = [
    `| Catchment radius | ${plan.catchmentRadiusMeters} m |`,
    `| Service days per week | ${plan.serviceDaysPerWeek} |`,
    `| Volunteer hours per week | ${plan.volunteerHoursPerWeek} |`,
    `| Minutes per household | ${plan.volunteerMinutesPerHousehold} |`,
    `| Food intake per week | ${plan.foodIntakePoundsPerWeek.toLocaleString()} lb |`,
    `| Pounds per household visit | ${plan.poundsPerHousehold} |`,
    `| Storage capacity | ${plan.storageCapacityPounds.toLocaleString()} lb |`,
    `| Perishable share | ${(plan.perishableShare * 100).toFixed(0)}% |`,
    `| Perishable shelf life | ${plan.perishableShelfLifeDays} days |`,
    `| Shelf-stable shelf life | ${plan.shelfStableShelfLifeDays} days |`,
    `| Delivery capacity | ${plan.deliveryCapacityHouseholdsPerWeek} households/week |`,
    `| Fixed cost | $${plan.fixedCostPerMonth.toLocaleString()}/month |`,
    `| Variable cost | $${plan.variableCostPerHousehold}/household |`,
    `| People per household | ${plan.peoplePerHousehold} |`,
    `| Weekly participation (low/medium/high) | ${(plan.weeklyParticipationRate.low * 100).toFixed(1)}% / ${(plan.weeklyParticipationRate.medium * 100).toFixed(1)}% / ${(plan.weeklyParticipationRate.high * 100).toFixed(1)}% |`,
  ].join("\n");

  const listedRosterNote =
    "Listed services are a published roster used to measure whether this ring covers new ground. They are not a selected comparison site, and a listing is not proof a site is open.";

  const newTracts = reach.newlyCoveredTracts
    .slice(0, 15)
    .map(
      (t) =>
        `| ${t.name ?? t.geoid} | ${t.newPopulation === null ? "unavailable" : Math.round(t.newPopulation).toLocaleString()} | ${(t.newAreaShare * 100).toFixed(0)}% |`,
    )
    .join("\n");

  const completeness = proposed.dataCompleteness
    .map((c) => `| ${c.dataset} | ${c.available} of ${c.expected} | ${c.note ?? ""} |`)
    .join("\n");

  const sources = assessment.sources
    .map((s) =>
      [
        `#### ${s.id} — ${s.title}`,
        `- Publisher: ${s.publisher}`,
        `- Landing page: ${s.landingUrl}`,
        `- Download: ${s.downloadUrl ?? "n/a"}`,
        `- Retrieved: ${s.retrievedAt}`,
        `- Data vintage: ${s.dataVintage}`,
        `- Geographic vintage: ${s.geographicVintage}`,
        `- Terms: ${s.terms}`,
        `- Checksum (sha256): ${s.checksum ?? "n/a"}`,
        s.notes ? `- Notes: ${s.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return `# PantryTwin action plan

Generated ${assessment.generatedAt}
Models: geography ${assessment.modelVersions.geo}, simulation ${assessment.modelVersions.simulation}

> This report analyses a **proposed** pantry at the pin you placed. It reports
> modelled geography and an assumed 28-day plan. It does not estimate a
> probability that a pantry will succeed, and it does not compare this pin to
> a chosen existing pantry.

## 1. What this report concluded

${consequenceSection(consequences)}

## 2. Listed services on the map

${listedRosterNote}

${reach.nearbyListedServiceCount.value === null
  ? "Listed services near this point: Unavailable."
  : `${reach.nearbyListedServiceCount.value} listed services sit near enough that their assumed ring could touch this one.`}

## 3. Reach: who this site would add

| Measure | Value |
| --- | --- |
| People in the proposed catchment | ${fmtMeasure(reach.proposedPopulation)} |
| **Net new reach** (outside every listed ring) | ${fmtMeasure(reach.netNewPopulation)} |
| Already inside a listed ring | ${fmtMeasure(reach.duplicatedPopulation)} |
| Net new as a share of the proposed catchment | ${fmtMeasure(reach.netNewShare)} |
| People outside **every** listed service's ring | ${fmtMeasure(reach.populationOutsideAllListings)} |
| Listed services near enough to overlap | ${fmtMeasure(reach.nearbyListedServiceCount)} |

${reach.overlap.note}

${
  newTracts
    ? `### Census tracts that would gain coverage\n\n| Tract | People newly in reach | Share of tract |\n| --- | --- | --- |\n${newTracts}`
    : "_No tract gains a meaningful share of new coverage._"
}

## 4. The proposal, as you configured it

Every row below is your assumption, not a measurement.

| Setting | Value |
| --- | --- |
${planRows}

${geographySection(proposed, "Proposed site")}

## 5. Modelled operations over 28 days (proposed site only)

Listed sites are absent from this section on purpose: their staffing, food
supply, storage and budget are not published, so modelling them would mean
inventing them.

${scenarios.map((s) => scenarioSection(s.proposed)).join("\n\n")}

## 6. Data completeness

| Dataset | Available | Note |
| --- | --- | --- |
${completeness}

## 7. Limitations

${assessment.limitations.map((l) => `- ${l}`).join("\n")}

## 8. Sources

${sources || "_No source manifest was found. Run \`npm run ingest\`._"}
`;
}
