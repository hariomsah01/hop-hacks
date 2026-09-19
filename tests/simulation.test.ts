import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATING_PLAN,
  SIMULATION_HORIZON_DAYS,
  type OperatingPlan,
} from "@/lib/contracts";
import { simulatePlan } from "@/lib/simulation/engine";

const plan = DEFAULT_OPERATING_PLAN;
const base = {
  label: "proposed" as const,
  plan,
  scenario: "medium" as const,
  catchmentPopulation: 12_000,
};

describe("simulatePlan", () => {
  it("is reproducible for identical inputs", () => {
    const first = simulatePlan(base);
    const second = simulatePlan(base);
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("conserves inventory: accepted = distributed + spoiled + ending stock", () => {
    const result = simulatePlan(base);
    const accepted = result.poundsAccepted.value as number;
    const distributed = result.poundsDistributed.value as number;
    const spoiled = result.poundsSpoiled.value as number;
    const ending = result.endingInventoryPounds.value as number;
    expect(accepted).toBeGreaterThan(0);
    expect(distributed + spoiled + ending).toBeCloseTo(accepted, 1);
  });

  it("never accepts more stock than storage allows", () => {
    const result = simulatePlan(base);
    for (const day of result.daily) {
      expect(day.inventoryPounds).toBeLessThanOrEqual(
        plan.storageCapacityPounds + 1e-6,
      );
    }
  });

  it("never serves more households than staffing plus delivery allows", () => {
    const result = simulatePlan(base);
    const perServiceDay =
      (plan.volunteerHoursPerWeek * 60) /
        plan.volunteerMinutesPerHousehold /
        plan.serviceDaysPerWeek +
      plan.deliveryCapacityHouseholdsPerWeek / plan.serviceDaysPerWeek;
    for (const day of result.daily) {
      expect(day.servedHouseholds).toBeLessThanOrEqual(perServiceDay + 1e-6);
      expect(day.servedHouseholds).toBeLessThanOrEqual(
        day.requestedHouseholds + 1e-6,
      );
    }
  });

  it("runs exactly the stated horizon and opens only on service days", () => {
    const result = simulatePlan(base);
    expect(result.daily).toHaveLength(SIMULATION_HORIZON_DAYS);
    expect(result.horizonDays).toBe(SIMULATION_HORIZON_DAYS);
    const serviceDays = result.daily.filter((d) => d.isServiceDay).length;
    expect(serviceDays).toBe((SIMULATION_HORIZON_DAYS / 7) * plan.serviceDaysPerWeek);
    for (const day of result.daily) {
      if (!day.isServiceDay) {
        expect(day.servedHouseholds).toBe(0);
        expect(day.poundsDistributed).toBe(0);
      }
    }
  });

  it("leaves demand-dependent output unavailable when population is unknown", () => {
    const result = simulatePlan({ ...base, catchmentPopulation: null });
    expect(result.householdsServed.status).toBe("unavailable");
    expect(result.householdsServed.value).toBeNull();
    expect(result.costPerHouseholdServed.value).toBeNull();
    expect(result.daily).toHaveLength(0);
    expect(result.missingInputs.length).toBeGreaterThan(0);
  });

  it("returns undefined rather than zero cost per household when nobody is served", () => {
    const starved: OperatingPlan = { ...plan, foodIntakePoundsPerWeek: 0 };
    const result = simulatePlan({ ...base, plan: starved });
    expect(result.householdsServed.value).toBe(0);
    expect(result.costPerHouseholdServed.value).toBeNull();
    expect(result.costPerHouseholdServed.status).toBe("unavailable");
  });

  it("raises assumed demand monotonically across the three scenarios", () => {
    const low = simulatePlan({ ...base, scenario: "low" });
    const medium = simulatePlan({ ...base, scenario: "medium" });
    const high = simulatePlan({ ...base, scenario: "high" });
    const requests = (r: typeof low) =>
      r.assumedWeeklyHouseholdRequests.value as number;
    expect(requests(low)).toBeLessThan(requests(medium));
    expect(requests(medium)).toBeLessThan(requests(high));
  });

  it("labels demand as an assumption, not a measurement", () => {
    const result = simulatePlan(base);
    expect(result.assumedWeeklyHouseholdRequests.status).toBe("assumed");
    expect(result.assumptions.some((a) => /participation/i.test(a.label))).toBe(
      true,
    );
    expect(result.modelVersion).toMatch(/pantrytwin-sim/);
  });

  it("identifies supply as the binding constraint when stock runs short", () => {
    const tightSupply: OperatingPlan = {
      ...plan,
      foodIntakePoundsPerWeek: 300,
      storageCapacityPounds: 300,
    };
    const result = simulatePlan({ ...base, plan: tightSupply });
    expect(result.bindingConstraintDays.supply).toBeGreaterThan(0);
  });

  it("spoils perishable stock that outlives its shelf life", () => {
    const oversupplied: OperatingPlan = {
      ...plan,
      foodIntakePoundsPerWeek: 40_000,
      storageCapacityPounds: 80_000,
      volunteerHoursPerWeek: 4,
      deliveryCapacityHouseholdsPerWeek: 0,
      perishableShare: 0.9,
      perishableShelfLifeDays: 3,
    };
    const result = simulatePlan({ ...base, plan: oversupplied });
    expect(result.poundsSpoiled.value as number).toBeGreaterThan(0);
    expect(result.spoilageRate.value as number).toBeGreaterThan(0);
  });
});
