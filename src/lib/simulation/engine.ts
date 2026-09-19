import {
  SIMULATION_HORIZON_DAYS,
  SIM_MODEL_VERSION,
  assumed,
  estimated,
  unavailable,
  type Assumption,
  type BindingConstraint,
  type DailyRecord,
  type Measure,
  type OperatingPlan,
  type ScenarioResult,
  type SimulatePlanRequest,
} from "@/lib/contracts";

/**
 * Deterministic 28-day pantry operations model.
 *
 * The model is pure: identical inputs always produce identical output, with no
 * randomness, clock reads or I/O. It consumes an assumed demand level and a
 * resource plan, and reports what that plan could serve. It does not predict
 * attendance, infer rent or score a site's chance of success.
 */

/** Average month length used to prorate a monthly fixed cost onto days. */
const DAYS_PER_MONTH = 365 / 12;

interface Batch {
  pounds: number;
  expiresOnDay: number;
  perishable: boolean;
}

/** Spreads weekly service evenly across the chosen days of each week. */
function isServiceDay(day: number, serviceDaysPerWeek: number): boolean {
  return day % 7 < serviceDaysPerWeek;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function buildAssumptions(
  plan: OperatingPlan,
  scenario: SimulatePlanRequest["scenario"],
  catchmentPopulation: number | null,
): Assumption[] {
  const rate = plan.weeklyParticipationRate[scenario];
  return [
    {
      label: "Demand basis",
      value:
        catchmentPopulation === null
          ? "Unavailable"
          : `${Math.round(catchmentPopulation).toLocaleString()} people in catchment`,
      basis:
        "Area-weighted tract population inside the straight-line catchment. Geographic reach, not observed demand.",
    },
    {
      label: "People per household",
      value: `${plan.peoplePerHousehold}`,
      basis:
        "Planner assumption used to convert catchment population into households. All household figures scale inversely with it.",
    },
    {
      label: `Weekly participation rate (${scenario})`,
      value: `${(rate * 100).toFixed(1)}% of catchment households per week`,
      basis:
        "Planner assumption. Swept across low, medium and high because participation is not measured anywhere in this build.",
    },
    {
      label: "Service pattern",
      value: `${plan.serviceDaysPerWeek} day(s) per week, requests spread evenly`,
      basis:
        "Requests are assumed to arrive only on service days and are not carried over to the next opening.",
    },
    {
      label: "Volunteer throughput",
      value: `${plan.volunteerHoursPerWeek} h/week at ${plan.volunteerMinutesPerHousehold} min per household`,
      basis: "Planner assumption converted into households served per service day.",
    },
    {
      label: "Food intake",
      value: `${plan.foodIntakePoundsPerWeek.toLocaleString()} lb/week, ${(plan.perishableShare * 100).toFixed(0)}% perishable`,
      basis: `Delivered once weekly. Perishable stock expires after ${plan.perishableShelfLifeDays} days, shelf-stable after ${plan.shelfStableShelfLifeDays}.`,
    },
    {
      label: "Household parcel",
      value: `${plan.poundsPerHousehold} lb per household visit`,
      basis: "Planner assumption linking inventory to households served.",
    },
    {
      label: "Storage capacity",
      value: `${plan.storageCapacityPounds.toLocaleString()} lb`,
      basis: "Intake above remaining storage is refused at the door, not silently absorbed.",
    },
    {
      label: "Delivery channel",
      value: `${plan.deliveryCapacityHouseholdsPerWeek} households/week`,
      basis: "Additional households reachable by delivery, drawing on the same inventory.",
    },
    {
      label: "Cost model",
      value: `$${plan.fixedCostPerMonth.toLocaleString()}/month fixed + $${plan.variableCostPerHousehold} per household`,
      basis: `Fixed cost prorated at ${DAYS_PER_MONTH.toFixed(2)} days per month. Rent is an input, never inferred from location.`,
    },
  ];
}

export function simulatePlan(request: SimulatePlanRequest): ScenarioResult {
  const { plan, scenario, label, catchmentPopulation } = request;
  const assumptions = buildAssumptions(plan, scenario, catchmentPopulation);
  const missingInputs: string[] = [];

  const emptyConstraintDays: Record<BindingConstraint, number> = {
    none: 0,
    staffing: 0,
    supply: 0,
    delivery: 0,
    demand: 0,
  };

  // Without a catchment population there is no demand basis. Every
  // demand-dependent output stays unavailable instead of collapsing to zero.
  if (catchmentPopulation === null) {
    missingInputs.push(
      "Catchment population is unavailable, so demand, service and cost-per-household cannot be estimated.",
    );
    const blocked = (unit: string) =>
      unavailable(unit, "Requires an estimated catchment population");
    return {
      label,
      scenario,
      horizonDays: SIMULATION_HORIZON_DAYS,
      assumedWeeklyHouseholdRequests: blocked("households/week"),
      householdsServed: blocked("household visits"),
      unmetRequests: blocked("household visits"),
      serviceRate: blocked("share of requests"),
      poundsDistributed: blocked("pounds"),
      poundsSpoiled: blocked("pounds"),
      spoilageRate: blocked("share of intake"),
      poundsAccepted: blocked("pounds"),
      poundsNotAccepted: blocked("pounds"),
      endingInventoryPounds: blocked("pounds"),
      totalCost: blocked("USD"),
      costPerHouseholdServed: blocked("USD per household"),
      bindingConstraintDays: emptyConstraintDays,
      daily: [],
      assumptions,
      missingInputs,
      modelVersion: SIM_MODEL_VERSION,
    };
  }

  // ------------------------------------------------------------------ demand
  const households = catchmentPopulation / plan.peoplePerHousehold;
  const weeklyRequests = households * plan.weeklyParticipationRate[scenario];
  const requestsPerServiceDay = weeklyRequests / plan.serviceDaysPerWeek;

  // ---------------------------------------------------------------- capacity
  const staffingPerServiceDay =
    (plan.volunteerHoursPerWeek * 60) /
    plan.volunteerMinutesPerHousehold /
    plan.serviceDaysPerWeek;
  const deliveryPerServiceDay =
    plan.deliveryCapacityHouseholdsPerWeek / plan.serviceDaysPerWeek;

  // ------------------------------------------------------------------- state
  let inventory: Batch[] = [];
  const daily: DailyRecord[] = [];
  const constraintDays: Record<BindingConstraint, number> = {
    ...emptyConstraintDays,
  };

  let totalAccepted = 0;
  let totalNotAccepted = 0;
  let totalDistributed = 0;
  let totalSpoiled = 0;
  let totalServed = 0;
  let totalRequested = 0;

  const inventoryPounds = () => inventory.reduce((sum, b) => sum + b.pounds, 0);

  for (let day = 0; day < SIMULATION_HORIZON_DAYS; day += 1) {
    let acceptedToday = 0;
    let notAcceptedToday = 0;

    // 1. Weekly delivery arrives, limited by remaining storage.
    if (day % 7 === 0) {
      const room = Math.max(0, plan.storageCapacityPounds - inventoryPounds());
      acceptedToday = Math.min(plan.foodIntakePoundsPerWeek, room);
      notAcceptedToday = plan.foodIntakePoundsPerWeek - acceptedToday;

      const perishablePounds = acceptedToday * plan.perishableShare;
      const stablePounds = acceptedToday - perishablePounds;
      if (perishablePounds > 0) {
        inventory.push({
          pounds: perishablePounds,
          expiresOnDay: day + plan.perishableShelfLifeDays,
          perishable: true,
        });
      }
      if (stablePounds > 0) {
        inventory.push({
          pounds: stablePounds,
          expiresOnDay: day + plan.shelfStableShelfLifeDays,
          perishable: false,
        });
      }
    }

    // 2. Stock that reached its expiry date is discarded before service.
    let spoiledToday = 0;
    inventory = inventory.filter((batch) => {
      if (batch.expiresOnDay <= day) {
        spoiledToday += batch.pounds;
        return false;
      }
      return true;
    });

    // 3. Service, limited by whichever resource runs out first.
    const serviceDay = isServiceDay(day, plan.serviceDaysPerWeek);
    let requested = 0;
    let served = 0;
    let distributed = 0;
    let binding: BindingConstraint = "none";

    if (serviceDay) {
      requested = requestsPerServiceDay;
      const labourCapacity = staffingPerServiceDay + deliveryPerServiceDay;
      const supplyCapacity = inventoryPounds() / plan.poundsPerHousehold;

      served = Math.min(requested, labourCapacity, supplyCapacity);
      distributed = served * plan.poundsPerHousehold;

      // Attribute the shortfall to the tightest resource.
      if (served >= requested - 1e-9) {
        binding = "demand";
      } else if (supplyCapacity <= labourCapacity) {
        binding = "supply";
      } else if (deliveryPerServiceDay > staffingPerServiceDay) {
        binding = "delivery";
      } else {
        binding = "staffing";
      }

      // Draw stock first-expiring-first so avoidable spoilage is not created.
      let remaining = distributed;
      inventory.sort((a, b) => a.expiresOnDay - b.expiresOnDay);
      for (const batch of inventory) {
        if (remaining <= 1e-9) break;
        const take = Math.min(batch.pounds, remaining);
        batch.pounds -= take;
        remaining -= take;
      }
      inventory = inventory.filter((batch) => batch.pounds > 1e-9);
    }

    constraintDays[binding] += 1;
    totalAccepted += acceptedToday;
    totalNotAccepted += notAcceptedToday;
    totalSpoiled += spoiledToday;
    totalDistributed += distributed;
    totalServed += served;
    totalRequested += requested;

    daily.push({
      day: day + 1,
      isServiceDay: serviceDay,
      requestedHouseholds: round(requested),
      servedHouseholds: round(served),
      unmetHouseholds: round(Math.max(0, requested - served)),
      poundsAccepted: round(acceptedToday),
      poundsNotAccepted: round(notAcceptedToday),
      poundsDistributed: round(distributed),
      poundsSpoiled: round(spoiledToday),
      inventoryPounds: round(inventoryPounds()),
      bindingConstraint: binding,
    });
  }

  // -------------------------------------------------------------------- cost
  const fixedCost = (plan.fixedCostPerMonth / DAYS_PER_MONTH) * SIMULATION_HORIZON_DAYS;
  const variableCost = totalServed * plan.variableCostPerHousehold;
  const totalCost = fixedCost + variableCost;

  const simSources: string[] = [];
  const derived = (value: number, unit: string, note: string): Measure =>
    estimated(round(value), unit, simSources, note);

  const endingInventory = inventoryPounds();

  return {
    label,
    scenario,
    horizonDays: SIMULATION_HORIZON_DAYS,
    assumedWeeklyHouseholdRequests: assumed(
      round(weeklyRequests),
      "households/week",
      `Catchment population / ${plan.peoplePerHousehold} people per household, multiplied by the ${(plan.weeklyParticipationRate[scenario] * 100).toFixed(1)}% ${scenario} participation assumption`,
    ),
    householdsServed: derived(
      totalServed,
      "household visits",
      `Over ${SIMULATION_HORIZON_DAYS} days, limited by staffing, stock and delivery capacity`,
    ),
    unmetRequests: derived(
      Math.max(0, totalRequested - totalServed),
      "household visits",
      "Requests arriving on a service day that the plan could not serve. Not carried over to the next opening.",
    ),
    serviceRate:
      totalRequested > 0
        ? derived(
            totalServed / totalRequested,
            "share of requests",
            "Served divided by assumed requests",
          )
        : unavailable("share of requests", "No requests were assumed"),
    poundsDistributed: derived(totalDistributed, "pounds", "Stock handed out"),
    poundsSpoiled: derived(
      totalSpoiled,
      "pounds",
      "Stock that reached its expiry date before it could be distributed",
    ),
    spoilageRate:
      totalAccepted > 0
        ? derived(
            totalSpoiled / totalAccepted,
            "share of intake",
            "Spoiled pounds divided by accepted intake",
          )
        : unavailable("share of intake", "No intake was accepted"),
    poundsAccepted: derived(totalAccepted, "pounds", "Intake that fitted into storage"),
    poundsNotAccepted: derived(
      totalNotAccepted,
      "pounds",
      "Intake refused because storage was already full",
    ),
    endingInventoryPounds: derived(
      endingInventory,
      "pounds",
      `Stock still on hand at the end of day ${SIMULATION_HORIZON_DAYS}`,
    ),
    totalCost: derived(
      totalCost,
      "USD",
      `${SIMULATION_HORIZON_DAYS} days of prorated fixed cost plus per-household variable cost`,
    ),
    costPerHouseholdServed:
      totalServed > 0
        ? derived(
            totalCost / totalServed,
            "USD per household",
            "Total modelled cost divided by household visits served",
          )
        : unavailable(
            "USD per household",
            "No households were served, so cost per household is undefined rather than zero",
          ),
    bindingConstraintDays: constraintDays,
    daily,
    assumptions,
    missingInputs,
    modelVersion: SIM_MODEL_VERSION,
  };
}
