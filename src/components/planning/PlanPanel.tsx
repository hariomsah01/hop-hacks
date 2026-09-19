"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_OPERATING_PLAN, type OperatingPlan } from "@/lib/contracts";
import { SectionTitle } from "./Measures";

interface PlanPanelProps {
  plan: OperatingPlan;
  onChange: (plan: OperatingPlan) => void;
  onResetPlan: () => void;
}

type NumericPlanKey = {
  [K in keyof OperatingPlan]: OperatingPlan[K] extends number ? K : never;
}[keyof OperatingPlan];

function Field({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  const id = `plan-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-[var(--color-navy-600)]">
          {label}
        </label>
        <span className="text-xs font-semibold tabular-nums text-[var(--color-navy-800)]">
          {value.toLocaleString("en-US")}
          <span className="ml-0.5 font-normal text-[var(--color-navy-400)]">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[11px] leading-snug text-[var(--color-navy-400)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export default function PlanPanel({
  plan,
  onChange,
  onResetPlan,
}: PlanPanelProps) {
  const set = (key: NumericPlanKey) => (value: number) =>
    onChange({ ...plan, [key]: value });

  const setParticipation =
    (key: keyof OperatingPlan["weeklyParticipationRate"]) => (value: number) =>
      onChange({
        ...plan,
        weeklyParticipationRate: {
          ...plan.weeklyParticipationRate,
          [key]: value / 100,
        },
      });

  const isDefault =
    JSON.stringify(plan) === JSON.stringify(DEFAULT_OPERATING_PLAN);

  return (
    <div className="panel-scroll h-full overflow-y-auto bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={15} className="text-[var(--color-teal-600)]" aria-hidden />
          <h2 className="text-sm font-semibold text-[var(--color-navy-800)]">
            Operating plan
          </h2>
        </div>
        <button
          type="button"
          onClick={onResetPlan}
          disabled={isDefault}
          className="flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw size={11} aria-hidden /> Defaults
        </button>
      </div>

      <p className="mb-3 text-[11px] leading-snug text-[var(--color-navy-400)]">
        Assumptions for the proposed site. Each is labeled assumed in the
        analysis.
      </p>

      <section className="mb-4">
        <SectionTitle>Catchment</SectionTitle>
        <Field
          label="Catchment radius"
          value={plan.catchmentRadiusMeters}
          min={200}
          max={5000}
          step={100}
          unit=" m"
          hint="Straight-line radius, not travel time."
          onChange={set("catchmentRadiusMeters")}
        />
        <Field
          label="People per household"
          value={plan.peoplePerHousehold}
          min={1}
          max={6}
          step={0.1}
          unit=""
          onChange={set("peoplePerHousehold")}
        />
      </section>

      <section className="mb-4">
        <SectionTitle>Staffing and schedule</SectionTitle>
        <Field
          label="Service days per week"
          value={plan.serviceDaysPerWeek}
          min={1}
          max={7}
          step={1}
          unit=" days"
          onChange={set("serviceDaysPerWeek")}
        />
        <Field
          label="Volunteer hours per week"
          value={plan.volunteerHoursPerWeek}
          min={0}
          max={400}
          step={5}
          unit=" h"
          onChange={set("volunteerHoursPerWeek")}
        />
        <Field
          label="Minutes per household"
          value={plan.volunteerMinutesPerHousehold}
          min={2}
          max={60}
          step={1}
          unit=" min"
          onChange={set("volunteerMinutesPerHousehold")}
        />
        <Field
          label="Delivery capacity"
          value={plan.deliveryCapacityHouseholdsPerWeek}
          min={0}
          max={500}
          step={5}
          unit=" hh/wk"
          onChange={set("deliveryCapacityHouseholdsPerWeek")}
        />
      </section>

      <section className="mb-4">
        <SectionTitle>Food supply</SectionTitle>
        <Field
          label="Food intake per week"
          value={plan.foodIntakePoundsPerWeek}
          min={0}
          max={60000}
          step={500}
          unit=" lb"
          onChange={set("foodIntakePoundsPerWeek")}
        />
        <Field
          label="Pounds per household"
          value={plan.poundsPerHousehold}
          min={5}
          max={120}
          step={1}
          unit=" lb"
          onChange={set("poundsPerHousehold")}
        />
        <Field
          label="Storage capacity"
          value={plan.storageCapacityPounds}
          min={0}
          max={120000}
          step={1000}
          unit=" lb"
          onChange={set("storageCapacityPounds")}
        />
        <Field
          label="Perishable share"
          value={Math.round(plan.perishableShare * 100)}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(value) => onChange({ ...plan, perishableShare: value / 100 })}
        />
        <Field
          label="Perishable shelf life"
          value={plan.perishableShelfLifeDays}
          min={1}
          max={30}
          step={1}
          unit=" days"
          onChange={set("perishableShelfLifeDays")}
        />
      </section>

      <section className="mb-4">
        <SectionTitle>Budget</SectionTitle>
        <p className="mb-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          Costs are inputs. They are not inferred from the pin.
        </p>
        <Field
          label="Fixed cost"
          value={plan.fixedCostPerMonth}
          min={0}
          max={50000}
          step={250}
          unit=" $/mo"
          onChange={set("fixedCostPerMonth")}
        />
        <Field
          label="Variable cost"
          value={plan.variableCostPerHousehold}
          min={0}
          max={100}
          step={1}
          unit=" $/hh"
          onChange={set("variableCostPerHousehold")}
        />
      </section>

      <section>
        <SectionTitle>Weekly participation sweep</SectionTitle>
        <p className="mb-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          Share of catchment households requesting food. All three rates are
          run; none is observed demand.
        </p>
        {(["low", "medium", "high"] as const).map((key) => (
          <Field
            key={key}
            label={`${key[0].toUpperCase()}${key.slice(1)} demand`}
            value={Number((plan.weeklyParticipationRate[key] * 100).toFixed(1))}
            min={0}
            max={40}
            step={0.5}
            unit="%"
            onChange={setParticipation(key)}
          />
        ))}
      </section>
    </div>
  );
}
