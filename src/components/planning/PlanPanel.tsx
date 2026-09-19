"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { DEFAULT_OPERATING_PLAN, type OperatingPlan } from "@/lib/contracts";
import { SectionTitle } from "./Measures";

interface PlanPanelProps {
  plan: OperatingPlan;
  onChange: (plan: OperatingPlan) => void;
  proposed: { lng: number; lat: number };
  referenceName: string | null;
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
          {value.toLocaleString()}
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
  proposed,
  referenceName,
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

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
        <p className="text-[11px] leading-snug text-amber-900">
          Every value here is an <strong>assumption you choose</strong> for your
          proposed pantry, not a measurement. None of it is applied to the
          existing pantry: what that site can actually do is not published.
        </p>
      </div>

      <section className="mb-4">
        <SectionTitle>Sites</SectionTitle>
        <div className="grid gap-2">
          <div className="rounded-md bg-[var(--color-proposed-100)] px-2 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-proposed-600)]">
              Your proposed pantry
            </div>
            <div className="font-mono text-[11px] tabular-nums text-[var(--color-navy-600)]">
              {proposed.lat.toFixed(4)}, {proposed.lng.toFixed(4)}
            </div>
          </div>
          <div className="rounded-md bg-[var(--color-reference-100)] px-2 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-reference-600)]">
              Existing pantry, for comparison
            </div>
            <div className="text-[11px] text-[var(--color-navy-600)]">
              {referenceName ?? "None selected — click a dot on the map"}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <SectionTitle>Catchment</SectionTitle>
        <Field
          label="Catchment radius"
          value={plan.catchmentRadiusMeters}
          min={200}
          max={5000}
          step={100}
          unit=" m"
          hint="Straight-line radius. Not a walking or driving time area."
          onChange={set("catchmentRadiusMeters")}
        />
        <Field
          label="People per household"
          value={plan.peoplePerHousehold}
          min={1}
          max={6}
          step={0.1}
          unit=""
          hint="Converts catchment population into households. All household figures scale with this."
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
          hint="Volunteer time to serve one household visit."
          onChange={set("volunteerMinutesPerHousehold")}
        />
        <Field
          label="Delivery capacity"
          value={plan.deliveryCapacityHouseholdsPerWeek}
          min={0}
          max={500}
          step={5}
          unit=" hh/wk"
          hint="Households reached by delivery, drawing on the same stock."
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
          hint="Intake above remaining storage is refused, not silently absorbed."
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
        <Field
          label="Fixed cost"
          value={plan.fixedCostPerMonth}
          min={0}
          max={50000}
          step={250}
          unit=" $/mo"
          hint="Rent and overhead are inputs. They are never inferred from the location."
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
        <SectionTitle>Assumed weekly participation</SectionTitle>
        <p className="mb-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          Share of catchment households requesting food in a week. Nothing in
          this build measures real participation, so all three values are run.
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
