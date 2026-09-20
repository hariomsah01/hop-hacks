import {
  GEO_MODEL_VERSION,
  SIM_MODEL_VERSION,
  type Consequence,
  type GeographicAnalysis,
  type Measure,
  type ReachComparison,
  type ReferencePantry,
  type ScenarioName,
  type ScenarioResult,
  type SiteAssessmentRequest,
  type SiteAssessmentResult,
} from "@/lib/contracts";
import { loadDatasets } from "@/lib/data/datasets";
import { analyzeLocation } from "@/lib/geo/analyze";
import { computeReach } from "@/lib/geo/reach";
import { simulatePlan } from "@/lib/simulation/engine";

const SCENARIOS: ScenarioName[] = ["low", "medium", "high"];

function people(value: number | null): string {
  if (value === null) return "an unknown number of";
  return Math.round(value).toLocaleString("en-US");
}

function percent(value: number | null): string {
  if (value === null) return "an unknown share";
  return `${Math.round(value * 100)}%`;
}

function money(value: number | null): string {
  if (value === null) return "an unknown amount";
  return `$${value.toFixed(2)}`;
}

function pounds(value: number | null): string {
  if (value === null) return "an unknown weight of";
  return `${Math.round(value).toLocaleString("en-US")} lb`;
}

function measure(m: Measure): number | null {
  return m.value;
}

/**
 * Turns the computed numbers into plain findings.
 *
 * Every sentence here is derived from a value already on the result, so the
 * narrative cannot drift from the maths. Nothing in this function predicts an
 * outcome or scores a site: it reports what the model produced and flags where
 * the evidence stops.
 */
function buildConsequences(
  reach: ReachComparison,
  reference: { pantry: ReferencePantry } | null,
  scenarios: Array<{ scenario: ScenarioName; proposed: ScenarioResult }>,
  proposed: GeographicAnalysis,
): Consequence[] {
  const out: Consequence[] = [];
  const name = reference?.pantry.name ?? "the reference pantry";
  const radiusKm = (proposed.catchmentRadiusMeters / 1000).toFixed(1);

  // ------------------------------------------------------------------ reach
  const netNew = measure(reach.netNewPopulation);
  const duplicated = measure(reach.duplicatedPopulation);
  const share = measure(reach.netNewShare);

  if (reference) {
    out.push({
      id: "net-new-reach",
      category: "reach",
      severity: "info",
      headline: `${people(netNew)} people would come into reach who cannot already reach ${name}`,
      detail: `Within a ${radiusKm} km straight-line ring, ${people(netNew)} people live inside the proposed catchment and outside ${name}'s. This is the coverage the new site would add. It counts who could get there, not who would come.`,
    });

    if (share !== null && share < 0.35) {
      out.push({
        id: "high-duplication",
        category: "duplication",
        severity: "watch",
        headline: `Only ${percent(share)} of this catchment is new ground`,
        detail: `${people(duplicated)} of the people in the proposed catchment can already reach ${name}. Opening here would mostly serve a population that already has a listed option nearby. Whether that is wasteful depends on ${name}'s capacity, which is not published.`,
      });
    } else if (share !== null) {
      out.push({
        id: "low-duplication",
        category: "duplication",
        severity: "info",
        headline: `${percent(share)} of this catchment is new ground`,
        detail: `${people(duplicated)} people sit inside both rings and can already reach ${name}. The remaining ${percent(share)} of the catchment is ground ${name} does not cover.`,
      });
    }
  }

  const outsideAll = measure(reach.populationOutsideAllListings);
  const nearby = measure(reach.nearbyListedServiceCount);
  if (outsideAll !== null) {
    const nearbyCount = nearby === null ? "nearby" : String(Math.round(nearby));
    const covered = outsideAll < 1;
    out.push({
      id: "outside-all-listings",
      category: "reach",
      severity: covered ? "watch" : "info",
      headline: covered
        ? `Everyone in this catchment already has a listed pantry within ${radiusKm} km`
        : `${people(outsideAll)} people here have no listed pantry within ${radiusKm} km`,
      detail: covered
        ? `Measured against ${nearbyCount} listed services given the same ${radiusKm} km ring. Opening here would not extend coverage. Capacity at those listings is unpublished.`
        : `${people(outsideAll)} people have no listed option within that ${radiusKm} km ring. That is geography, not a count of who would attend.`,
    });
  }

  if (reach.newlyCoveredTracts.length > 0) {
    const top = reach.newlyCoveredTracts.slice(0, 3);
    out.push({
      id: "newly-covered-tracts",
      category: "reach",
      severity: "info",
      headline: `${reach.newlyCoveredTracts.length} census tract(s) would gain coverage`,
      detail: `Largest additions: ${top
        .map(
          (t) =>
            `${t.name ?? t.geoid} (${people(t.newPopulation)} people, ${percent(t.newAreaShare)} of the tract)`,
        )
        .join("; ")}.`,
    });
  }

  if (!proposed.withinCityBoundary) {
    out.push({
      id: "outside-city",
      category: "unknown",
      severity: "gap",
      headline: "The proposed point is outside the Baltimore City boundary",
      detail:
        "This build holds Baltimore City data only, so population and listings beyond the city line are missing. Every count here is understated.",
    });
  }

  // ------------------------------------------------------------- operations
  const medium = scenarios.find((s) => s.scenario === "medium")?.proposed;
  const low = scenarios.find((s) => s.scenario === "low")?.proposed;
  const high = scenarios.find((s) => s.scenario === "high")?.proposed;

  if (medium) {
    const served = measure(medium.householdsServed);
    const unmet = measure(medium.unmetRequests);
    const rate = measure(medium.serviceRate);

    out.push({
      id: "service-rate",
      category: "operations",
      severity: rate !== null && rate < 0.8 ? "watch" : "info",
      headline:
        rate === null
          ? "Service rate could not be modelled"
          : `Your plan meets ${percent(rate)} of assumed requests under medium demand`,
      detail:
        served === null
          ? "The catchment population is unavailable, so household demand cannot be derived."
          : `Over 28 days the plan serves ${people(served)} household visits and leaves ${people(unmet)} unmet, under the assumed medium participation rate. Participation is an assumption, not a measurement.`,
    });

    // Name whichever resource actually ran out, so the planner knows which
    // slider to move.
    const constraints = Object.entries(medium.bindingConstraintDays)
      .filter(([key, days]) => key !== "none" && key !== "demand" && days > 0)
      .sort((a, b) => b[1] - a[1]);

    if (constraints.length > 0) {
      const [worst, days] = constraints[0];
      const labels: Record<string, string> = {
        staffing: "volunteer hours",
        supply: "food on hand",
        delivery: "delivery capacity",
      };
      out.push({
        id: "binding-constraint",
        category: "operations",
        severity: "watch",
        headline: `${labels[worst] ?? worst} is the limiting factor on ${days} of ${medium.horizonDays} days`,
        detail: `On those days the plan turned households away because ${labels[worst] ?? worst} ran out first, not because demand was absent. Raising that one input is what changes the outcome.`,
      });
    } else {
      out.push({
        id: "no-binding-constraint",
        category: "operations",
        severity: "info",
        headline: "No resource runs out under medium demand",
        detail: `Across ${medium.horizonDays} days the plan meets assumed demand without exhausting staffing, supply or delivery capacity.`,
      });
    }

    const spoiled = measure(medium.poundsSpoiled);
    const spoilRate = measure(medium.spoilageRate);
    if (spoiled !== null && spoiled > 0) {
      out.push({
        id: "spoilage",
        category: "operations",
        severity: spoilRate !== null && spoilRate > 0.1 ? "watch" : "info",
        headline: `${pounds(spoiled)} spoils over ${medium.horizonDays} days (${percent(spoilRate)} of intake)`,
        detail: `Food arrives faster than this plan distributes it, and perishable stock passes its assumed ${medium.horizonDays}-day window. Shelf life and perishable share are both planner assumptions.`,
      });
    }

    const notAccepted = measure(medium.poundsNotAccepted);
    if (notAccepted !== null && notAccepted > 0) {
      out.push({
        id: "storage-limit",
        category: "operations",
        severity: "watch",
        headline: `${pounds(notAccepted)} of donated food could not be accepted`,
        detail:
          "Storage was already full when deliveries arrived. More storage, or more frequent service days, would let the site take this food in.",
      });
    }

    const cost = measure(medium.costPerHouseholdServed);
    if (cost !== null) {
      const lowCost = low ? measure(low.costPerHouseholdServed) : null;
      const highCost = high ? measure(high.costPerHouseholdServed) : null;
      out.push({
        id: "cost-per-household",
        category: "cost",
        severity: "info",
        headline: `${money(cost)} per household served under medium demand`,
        detail:
          lowCost !== null && highCost !== null
            ? `Across the demand sweep this ranges from ${money(highCost)} at high demand to ${money(lowCost)} at low demand. Fixed costs are spread over fewer households when demand is low, which is why the low scenario costs more per household.`
            : "Derived from the fixed and variable costs you entered. These are your assumptions, not observed budgets.",
      });
    }
  }

  // ------------------------------------------------------------ known gaps
  if (reference) {
    out.push({
      id: "reference-capacity-unknown",
      category: "unknown",
      severity: "gap",
      headline: `${name}'s capacity is not published anywhere`,
      detail: `We know where ${name} is, and nothing about how much it can serve. This report therefore cannot tell you whether the ${people(duplicated)} people in the shared area are already adequately served, nor whether ${name} is turning people away today. Answering that needs a phone call, not a dataset.`,
    });
  }

  out.push({
    id: "demand-assumed",
    category: "unknown",
    severity: "gap",
    headline: "Nothing here measures how many households would actually arrive",
    detail:
      "Demand is swept across low, medium and high participation rates that you set. The model reports what happens under each. It does not estimate attendance and produces no probability that this pantry would succeed.",
  });

  return out;
}

export function runAssessment(
  request: SiteAssessmentRequest,
): SiteAssessmentResult {
  const { plan } = request;
  const data = loadDatasets();

  const proposed = analyzeLocation({
    location: { label: "proposed", ...request.proposed },
    catchmentRadiusMeters: plan.catchmentRadiusMeters,
  });

  // This product analyses the proposed pin only. Listed services stay on the
  // map as a published roster. They are not a selected comparison site.
  const reference = null;
  const reach = computeReach(proposed, null);

  // Only the proposed pantry is simulated. Modelling the reference site would
  // require inventing its staffing, food supply and budget.
  const scenarios = SCENARIOS.map((scenario) => ({
    scenario,
    proposed: simulatePlan({
      label: "proposed",
      plan,
      scenario,
      catchmentPopulation: proposed.estimatedCatchmentPopulation.value,
    }),
  }));

  const consequences = buildConsequences(reach, reference, scenarios, proposed);

  const limitations = [
    ...new Set([
      ...proposed.limitations,
      reach.overlap.note,
      "Only the proposed pantry is simulated. Listed sites are locations on the published roster; their staffing, food volume, storage and budget are unpublished and are not modelled.",
      "Every listed service is given the same catchment radius as the proposed site. Real service areas are not published and will differ.",
      "Demand is an assumption swept across three participation rates. Nothing in this build measures how many households would actually arrive.",
      "This tool reports modelled outcomes under stated assumptions. It does not estimate a probability that a pantry will succeed.",
    ]),
  ];

  return {
    generatedAt: new Date().toISOString(),
    plan,
    proposed,
    reference,
    reach,
    scenarios,
    consequences,
    limitations,
    sources: data.sources,
    modelVersions: { geo: GEO_MODEL_VERSION, simulation: SIM_MODEL_VERSION },
  };
}
