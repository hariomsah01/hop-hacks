import {
  NETWORK_COMPARISON_MODEL_VERSION,
  assumed,
  estimated,
  sourced,
  unavailable,
  type Measure,
  type NetworkComparisonRequest,
  type NetworkComparisonResult,
} from "@/lib/contracts";
import { loadDatasets, sourcesFor } from "@/lib/data/datasets";
import { analyzeLocation } from "@/lib/geo/analyze";
import { computeReach } from "@/lib/geo/reach";

function difference(
  total: Measure,
  part: Measure,
  note: string,
): Measure {
  if (total.value === null || part.value === null) {
    return unavailable(
      "people",
      "Catchment population or existing-network coverage is unavailable",
    );
  }

  return estimated(
    Math.max(0, total.value - part.value),
    "people",
    [...new Set([...total.sourceIds, ...part.sourceIds])],
    note,
  );
}

/**
 * Compares the current listed Baltimore network with the same network plus one
 * planner-selected candidate. This is a geographic coverage comparison only;
 * no attendance, capacity or utilization is inferred.
 */
export function runNetworkComparison(
  request: NetworkComparisonRequest,
): NetworkComparisonResult {
  const data = loadDatasets();
  const proposed = analyzeLocation({
    location: {
      label: "proposed",
      ...request.proposed,
    },
    catchmentRadiusMeters: request.catchmentRadiusMeters,
  });
  const reach = computeReach(proposed, null);

  const catchmentPopulation = proposed.estimatedCatchmentPopulation;
  const newlyCovered = reach.populationOutsideAllListings;
  const alreadyCovered = difference(
    catchmentPopulation,
    newlyCovered,
    "People inside the candidate catchment who are already inside the equal-radius ring of at least one listed service",
  );

  const expandedCovered =
    catchmentPopulation.value === null
      ? unavailable(
          "people",
          "Candidate catchment population is unavailable",
        )
      : estimated(
          catchmentPopulation.value,
          "people",
          catchmentPopulation.sourceIds,
          "Everyone inside the candidate's stated straight-line catchment is geographically in range of the proposed site; this is not attendance",
        );

  const expandedUncovered =
    catchmentPopulation.value === null
      ? unavailable(
          "people",
          "Candidate catchment population is unavailable",
        )
      : estimated(
          0,
          "people",
          catchmentPopulation.sourceIds,
          "Within the candidate catchment, the proposed pantry supplies geographic coverage by definition; operations and capacity remain unknown",
        );

  const unavailableVisits = unavailable(
    "household visits per month",
    "Requires pantry-level monthly attendance records",
  );
  const unavailableUtilization = unavailable(
    "share of capacity",
    "Requires pantry capacity and attendance records",
  );

  return {
    generatedAt: new Date().toISOString(),
    proposed: {
      ...request.proposed,
      catchmentRadiusMeters: request.catchmentRadiusMeters,
      withinCityBoundary: proposed.withinCityBoundary,
    },
    candidateCatchmentPopulation: catchmentPopulation,
    nearbyListedServices: reach.nearbyListedServiceCount,
    current: {
      listedLocations: sourced(
        data.services.length,
        "listed locations",
        ["pantries", "food-access"],
        "Count of deduplicated public listings; it is not proof every site is currently open",
      ),
      coveredPopulationInCandidateCatchment: alreadyCovered,
      uncoveredPopulationInCandidateCatchment: newlyCovered,
      monthlyHouseholdVisits: unavailableVisits,
      capacityUtilization: unavailableUtilization,
    },
    expanded: {
      listedLocations: assumed(
        data.services.length + 1,
        "listed locations",
        "Current public roster plus the one planner-selected candidate",
      ),
      coveredPopulationInCandidateCatchment: expandedCovered,
      uncoveredPopulationInCandidateCatchment: expandedUncovered,
      monthlyHouseholdVisits: unavailableVisits,
      capacityUtilization: unavailableUtilization,
    },
    change: {
      additionalListedLocations: assumed(
        1,
        "proposed location",
        "The comparison adds exactly one hypothetical pantry",
      ),
      newlyCoveredPopulation: newlyCovered,
    },
    limitations: [
      ...new Set([
        ...proposed.limitations,
        "Case A and Case B compare geographic reach inside the proposed catchment. They do not compare observed pantry performance.",
        "Every existing listing receives the same catchment radius as the proposed pantry because real service areas are not published.",
        "A public listing is not proof that a pantry is currently open, and nearby services may complement rather than compete with the proposal.",
        "Monthly visits, inventory, capacity and utilization remain unavailable until partner operational records are supplied.",
      ]),
    ],
    sources: sourcesFor(["tracts", "pantries", "food-access"]),
    modelVersion: NETWORK_COMPARISON_MODEL_VERSION,
  };
}
