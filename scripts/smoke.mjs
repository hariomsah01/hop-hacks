/**
 * End-to-end smoke check against a running server.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Verifies the deterministic assessment path works and that provenance rules
 * hold in the actual HTTP response, not just in unit tests.
 */
const base = process.argv[2] ?? "http://localhost:3000";

const plan = {
  catchmentRadiusMeters: 1200,
  serviceDaysPerWeek: 3,
  volunteerHoursPerWeek: 90,
  volunteerMinutesPerHousehold: 12,
  foodIntakePoundsPerWeek: 9000,
  poundsPerHousehold: 30,
  storageCapacityPounds: 12000,
  perishableShare: 0.4,
  perishableShelfLifeDays: 5,
  shelfStableShelfLifeDays: 180,
  deliveryCapacityHouseholdsPerWeek: 40,
  fixedCostPerMonth: 6500,
  variableCostPerHousehold: 9,
  peoplePerHousehold: 2.4,
  weeklyParticipationRate: { low: 0.02, medium: 0.05, high: 0.09 },
};

let failures = 0;
function check(name, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const post = async (path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res;
};

// ------------------------------------------------------- maplibre worker
// Without these the map renders empty with nothing logged, so the build step
// that copies them is checked explicitly.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  const res = await fetch(`${base}/maplibre/${file}`);
  check(`maplibre worker: ${file} is served`, res.status === 200, `status ${res.status}`);
}

// ------------------------------------------------------------------- layers
const layers = await (await fetch(`${base}/api/layers`)).json();
check("layers: tracts returned", layers.tracts.features.length > 100,
  `${layers.tracts.features.length} tracts`);
check("layers: services returned", layers.services.features.length > 50,
  `${layers.services.features.length} services`);
check("layers: city boundary present", layers.boundary !== null);
check("layers: services carry an id so one can be clicked as the reference",
  layers.services.features.every((f) => typeof f.properties.id === "string"));

// A real listing is the comparison point, so it comes from the live roster.
const referenceServiceId = layers.services.features[0].properties.id;
const request = {
  proposed: { lng: -76.6205, lat: 39.2986 },
  referenceServiceId,
  plan,
};

// ------------------------------------------------------------- assessment
const res = await post("/api/assess", request);
check("assess: HTTP 200", res.status === 200, `status ${res.status}`);
const assessment = await res.json();

const proposedPop = assessment.proposed.estimatedCatchmentPopulation;
check("assess: proposed population estimated",
  proposedPop.value > 0 && proposedPop.status === "estimated",
  `${Math.round(proposedPop.value)} people`);
check("assess: three scenarios returned", assessment.scenarios.length === 3);
check("assess: sources attached", assessment.sources.length >= 3,
  `${assessment.sources.length} sources`);
check("assess: limitations surfaced", assessment.limitations.length >= 3,
  `${assessment.limitations.length} limitations`);

const medium = assessment.scenarios.find((s) => s.scenario === "medium");
check("assess: served households computed for the proposal",
  medium.proposed.householdsServed.value > 0,
  `${Math.round(medium.proposed.householdsServed.value)} visits`);

// ----------------------------------------------- the real pantry stays real
check("reference: a real listing was resolved",
  assessment.reference && assessment.reference.pantry.id === referenceServiceId,
  assessment.reference?.pantry.name);
check("reference: its unknowns are stated explicitly",
  assessment.reference.unknowns.length > 0,
  `${assessment.reference.unknowns.length} unknowns`);
check("reference: it is never simulated",
  assessment.scenarios.every((s) => s.proposed.label === "proposed") &&
  !JSON.stringify(assessment.scenarios).includes('"reference"'));

// ------------------------------------------------------------------- reach
const reach = assessment.reach;
const netNew = reach.netNewPopulation.value;
const duplicated = reach.duplicatedPopulation.value;
check("reach: net new plus duplicated equals the catchment",
  Math.abs(netNew + duplicated - proposedPop.value) < 1,
  `${Math.round(netNew)} new + ${Math.round(duplicated)} duplicated`);
check("reach: overlap is reported rather than double counted",
  typeof reach.overlap.note === "string" && reach.overlap.note.length > 0);
check("reach: coverage gap measured against every listing",
  reach.populationOutsideAllListings.value !== null &&
  reach.populationOutsideAllListings.value <= proposedPop.value + 1e-6,
  `${Math.round(reach.populationOutsideAllListings.value)} people`);

// ------------------------------------------------------------ consequences
check("consequences: a report was produced",
  Array.isArray(assessment.consequences) && assessment.consequences.length >= 4,
  `${assessment.consequences.length} findings`);
check("consequences: the incumbent's unknown capacity is always flagged",
  assessment.consequences.some((c) => c.id === "reference-capacity-unknown"));
check("consequences: demand is always declared an assumption",
  assessment.consequences.some((c) => c.id === "demand-assumed"));

// Provenance rules that must survive serialisation.
const poverty = assessment.proposed.povertyRate;
check("provenance: unavailable stays null, never zero",
  poverty.value === null ? poverty.status === "unavailable" : true,
  `povertyRate=${poverty.value}`);

const flat = JSON.stringify(assessment);
check("safety: no probability-of-success language",
  !/probability of success|chance of success|likelihood of success/i.test(flat));
check("safety: no claim about whether the existing pantry meets need",
  !/(already|adequately) (meets|meeting|serves|serving) (the )?need/i.test(flat) ||
  /cannot tell you whether/i.test(flat));

// Determinism across two identical HTTP requests.
const second = await (await post("/api/assess", request)).json();
const strip = (o) => { const c = structuredClone(o); delete c.generatedAt; return JSON.stringify(c); };
check("determinism: identical request gives identical analysis",
  strip(second) === strip(assessment));

// ------------------------------------------------------------------ export
const exportRes = await post("/api/export", { request, format: "markdown" });
const markdown = await exportRes.text();
check("export: markdown returned", exportRes.status === 200 && markdown.startsWith("# PantryTwin"));
check("export: includes sources section", markdown.includes("## 8. Sources"));
check("export: includes the no-probability statement",
  markdown.includes("does not estimate a probability"));
check("export: names the pantry being compared against",
  markdown.includes(assessment.reference.pantry.name));
check("export: states that the existing pantry is not simulated",
  /not simulated|not modelled/i.test(markdown));
check("export: numbers match the display",
  markdown.includes(Math.round(proposedPop.value).toLocaleString()) ||
  markdown.includes(String(Math.round(proposedPop.value))),
  "catchment population appears in the report");

// ----------------------------------------------------------------- sources
const sourcesRes = await fetch(`${base}/api/sources`);
check("sources: HTTP 200", sourcesRes.status === 200, `status ${sourcesRes.status}`);
const sourceCatalog = await sourcesRes.json();
check("sources: manifest has entries", Array.isArray(sourceCatalog.sources) &&
  sourceCatalog.sources.length >= 3, `${sourceCatalog.sources?.length ?? 0} sources`);
check("sources: every ingested dataset has a publisher landing URL",
  sourceCatalog.sources.every((s) => typeof s.landingUrl === "string" &&
    /^https?:\/\//.test(s.landingUrl)));
check("sources: blocked entries still name a publisher page",
  !Array.isArray(sourceCatalog.validation?.blocked) ||
  sourceCatalog.validation.blocked.every((b) =>
    typeof b.landingUrl === "string" && /^https?:\/\//.test(b.landingUrl)));

// --------------------------------------------------------------- assistant
const assistant = await post("/api/assistant", {
  question: "Would opening here add coverage or duplicate what exists?",
  request,
});
const answer = await assistant.json();
check("assistant: degrades gracefully without an API key",
  assistant.status === 200 && typeof answer.text === "string" && answer.text.length > 0,
  `status=${answer.status}`);

// --------------------------------------------- reach-only, no pantry chosen
const soloRes = await post("/api/assess", { ...request, referenceServiceId: null });
const solo = await soloRes.json();
check("no reference: still returns a full analysis", soloRes.status === 200 &&
  solo.reference === null && solo.scenarios.length === 3);
check("no reference: duplication is unavailable, not zero",
  solo.reach.duplicatedPopulation.value === null &&
  solo.reach.duplicatedPopulation.status === "unavailable");

// ------------------------------------------------------------------ invalid
const bad = await post("/api/assess", { proposed: { lng: 999 } });
check("validation: malformed request rejected", bad.status === 400, `status ${bad.status}`);

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
