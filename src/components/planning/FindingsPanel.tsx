"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CircleHelp,
  Info,
  MapPinned,
  ScrollText,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  Consequence,
  ScenarioName,
  SiteAssessmentResult,
} from "@/lib/contracts";
import { formatMeasure, formatValue } from "@/lib/format";
import {
  MeasureValue,
  MetricRow,
  SectionTitle,
  SideBySideRow,
  StatusBadge,
} from "./Measures";

const PROPOSED_COLOUR = "#c2410c";

const SEVERITY_STYLE: Record<
  Consequence["severity"],
  { wrap: string; icon: typeof Info; iconClass: string }
> = {
  info: {
    wrap: "border-[var(--color-hairline)] bg-white",
    icon: Info,
    iconClass: "text-[var(--color-teal-600)]",
  },
  watch: {
    wrap: "border-amber-200 bg-amber-50",
    icon: TriangleAlert,
    iconClass: "text-amber-600",
  },
  gap: {
    wrap: "border-slate-200 bg-slate-50",
    icon: CircleHelp,
    iconClass: "text-slate-500",
  },
};

function ConsequenceCard({ consequence }: { consequence: Consequence }) {
  const style = SEVERITY_STYLE[consequence.severity];
  const Icon = style.icon;
  return (
    <div className={`rounded-lg border p-2.5 ${style.wrap}`}>
      <div className="flex gap-2">
        <Icon size={14} className={`mt-0.5 shrink-0 ${style.iconClass}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug text-[var(--color-navy-800)]">
            {consequence.headline}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-navy-500)]">
            {consequence.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FindingsPanel({
  assessment,
  loading,
  onSelectReference,
  onClearReference,
}: {
  assessment: SiteAssessmentResult | null;
  loading: boolean;
  onSelectReference: (id: string) => void;
  onClearReference: () => void;
}) {
  const [scenario, setScenario] = useState<ScenarioName>("medium");

  if (!assessment) {
    return (
      <div className="panel-scroll h-full overflow-y-auto bg-[var(--color-panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-navy-800)]">
          Findings
        </h2>
        <p className="mt-2 text-xs text-[var(--color-navy-400)]">
          {loading
            ? "Running the analysis…"
            : "Drag the orange pin to place your pantry."}
        </p>
      </div>
    );
  }

  const { reach, reference, consequences } = assessment;
  const bucket =
    assessment.scenarios.find((s) => s.scenario === scenario) ??
    assessment.scenarios[0];
  const referenceName = reference?.pantry.name ?? null;

  const chartData = assessment.scenarios.map((s) => ({
    scenario: `${s.scenario[0].toUpperCase()}${s.scenario.slice(1)}`,
    served: s.proposed.householdsServed.value ?? 0,
  }));
  const chartUnavailable = bucket.proposed.householdsServed.value === null;

  return (
    <div className="panel-scroll h-full overflow-y-auto bg-[var(--color-panel)] p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <ScrollText size={15} className="text-[var(--color-teal-600)]" aria-hidden />
        <h2 className="text-sm font-semibold text-[var(--color-navy-800)]">
          What happens if you open here
        </h2>
        {loading && (
          <span className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-teal-600)] border-t-transparent" />
        )}
      </div>

      {/* ------------------------------------------------- reference pantry */}
      <section className="mb-4 rounded-lg border border-[var(--color-reference-600)]/30 bg-[var(--color-reference-100)]/50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-reference-600)]">
              Compared against
            </div>
            {reference ? (
              <>
                <p className="truncate text-sm font-semibold text-[var(--color-navy-800)]">
                  {reference.pantry.name}
                </p>
                <p className="text-[11px] text-[var(--color-navy-500)]">
                  {reference.pantry.address ?? "address not published"} ·{" "}
                  {reference.pantry.distanceMeters.toLocaleString()} m away
                </p>
              </>
            ) : (
              <div>
                <p className="text-xs text-[var(--color-navy-500)]">
                  Pick a real listed pantry. Click a navy dot on the map, or
                  one of the nearest listings below.
                </p>
                {assessment.proposed.listedServices.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {assessment.proposed.listedServices.slice(0, 4).map((svc) => (
                      <li key={svc.id}>
                        <button
                          type="button"
                          onClick={() => onSelectReference(svc.id)}
                          className="w-full rounded-md border border-[var(--color-hairline)] bg-white px-2 py-1.5 text-left hover:border-[var(--color-reference-600)] hover:bg-white"
                        >
                          <span className="block truncate text-[11px] font-semibold text-[var(--color-navy-800)]">
                            {svc.name}
                          </span>
                          <span className="text-[10px] text-[var(--color-navy-400)]">
                            {svc.distanceMeters.toLocaleString()} m away
                            {svc.address ? ` · ${svc.address}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {reference && (
            <button
              type="button"
              onClick={onClearReference}
              aria-label="Clear the selected pantry"
              className="shrink-0 rounded p-1 text-[var(--color-navy-400)] hover:bg-white hover:text-[var(--color-navy-800)]"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        {reference && (
          <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-[var(--color-navy-500)]">
            <CircleHelp size={12} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Its location is published. Its capacity, staffing and current
              hours are not, so its operations are never modelled here.
            </span>
          </p>
        )}
      </section>

      {/* ------------------------------------------------------ consequences */}
      <section className="mb-4">
        <SectionTitle>The report</SectionTitle>
        <div className="flex flex-col gap-1.5">
          {consequences.map((c) => (
            <ConsequenceCard key={c.id} consequence={c} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ reach */}
      <section className="mb-4">
        <SectionTitle>Reach</SectionTitle>

        <div className="mb-2 rounded-lg border border-[var(--color-proposed-600)]/30 bg-[var(--color-proposed-100)]/60 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-proposed-600)]">
              Net new reach
            </span>
            <StatusBadge measure={reach.netNewPopulation} />
          </div>
          <MeasureValue measure={reach.netNewPopulation} emphasis />
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-navy-500)]">
            People who would come into range who cannot already reach{" "}
            {referenceName ?? "an existing pantry"}. Reach is geography, not
            attendance.
          </p>
        </div>

        <SideBySideRow
          label="People in the catchment"
          proposed={reach.proposedPopulation}
          reference={reach.referencePopulation}
          referenceName={referenceName}
          hint="Area-weighted from census tracts. These two numbers overlap and must never be added together."
        />
        <MetricRow
          label="Duplicated reach"
          measure={reach.duplicatedPopulation}
          hint={reach.overlap.note}
        />
        <MetricRow
          label="Share of your catchment that is new ground"
          measure={reach.netNewShare}
        />
        <MetricRow
          label="People outside every listed pantry's ring"
          measure={reach.populationOutsideAllListings}
          hint="The strongest coverage-gap signal available. The published roster may be incomplete, and a listing is not proof a site is open."
        />

        {reach.newlyCoveredTracts.length > 0 && (
          <div className="mt-2 rounded-md bg-[var(--color-canvas)] p-2">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--color-navy-600)]">
              <MapPinned size={11} aria-hidden /> Tracts gaining coverage
            </div>
            <ul className="flex flex-col gap-0.5">
              {reach.newlyCoveredTracts.slice(0, 5).map((t) => (
                <li
                  key={t.geoid}
                  className="flex items-baseline justify-between gap-2 text-[11px] text-[var(--color-navy-500)]"
                >
                  <span className="truncate">{t.name ?? t.geoid}</span>
                  <span className="shrink-0 tabular-nums text-[var(--color-navy-800)]">
                    {t.newPopulation === null
                      ? "—"
                      : `${Math.round(t.newPopulation).toLocaleString()} people`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- scenarios */}
      <section className="mb-4">
        <SectionTitle
          trailing={
            <div className="flex gap-0.5 rounded-md bg-[var(--color-canvas)] p-0.5">
              {assessment.scenarios.map((s) => (
                <button
                  key={s.scenario}
                  type="button"
                  onClick={() => setScenario(s.scenario)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                    s.scenario === scenario
                      ? "bg-[var(--color-teal-600)] text-white"
                      : "text-[var(--color-navy-500)] hover:bg-white"
                  }`}
                >
                  {s.scenario}
                </button>
              ))}
            </div>
          }
        >
          Your pantry, 28 days
        </SectionTitle>

        <p className="mb-2 rounded-md bg-[var(--color-canvas)] px-2 py-1.5 text-[11px] leading-snug text-[var(--color-navy-500)]">
          Only your site is simulated. The existing pantry&apos;s resources are
          unknown, so modelling it would mean inventing them.
        </p>

        <MetricRow
          label="Assumed weekly requests"
          measure={bucket.proposed.assumedWeeklyHouseholdRequests}
          hint="A participation assumption applied to catchment population, not a measurement of demand."
        />
        <MetricRow
          label="Household visits served"
          measure={bucket.proposed.householdsServed}
        />
        <MetricRow
          label="Unmet requests"
          measure={bucket.proposed.unmetRequests}
        />
        <MetricRow label="Service rate" measure={bucket.proposed.serviceRate} />
        <MetricRow
          label="Pounds spoiled"
          measure={bucket.proposed.poundsSpoiled}
        />
        <MetricRow
          label="Cost per household served"
          measure={bucket.proposed.costPerHouseholdServed}
        />

        <div className="mt-2 rounded-md bg-[var(--color-canvas)] px-2 py-1.5 text-[11px] text-[var(--color-navy-500)]">
          Limiting resource on service days:{" "}
          <strong className="text-[var(--color-navy-800)]">
            {topConstraint(bucket.proposed.bindingConstraintDays)}
          </strong>
        </div>
      </section>

      {/* ----------------------------------------------------------- chart */}
      <section>
        <SectionTitle>Household visits served by scenario</SectionTitle>
        {chartUnavailable ? (
          <p className="rounded-md bg-[var(--color-canvas)] p-3 text-[11px] italic text-[var(--color-status-unavailable)]">
            Not charted: catchment population is unavailable, so served
            households cannot be estimated.
          </p>
        ) : (
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ecf2" vertical={false} />
                <XAxis
                  dataKey="scenario"
                  tick={{ fontSize: 11, fill: "#3d5a7d" }}
                  axisLine={{ stroke: "#dde5ec" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#3d5a7d" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value) => formatValue(Number(value), "households")}
                />
                <Bar
                  dataKey="served"
                  name="Household visits served"
                  fill={PROPOSED_COLOUR}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          Demand is an assumption swept across three participation rates, not a
          forecast of who would arrive. Assumed weekly requests at this setting:{" "}
          {formatMeasure(bucket.proposed.assumedWeeklyHouseholdRequests)}.
        </p>
      </section>
    </div>
  );
}

function topConstraint(days: Record<string, number>): string {
  const entries = Object.entries(days).filter(
    ([key, count]) => key !== "none" && count > 0,
  );
  if (entries.length === 0) return "none";
  entries.sort((a, b) => b[1] - a[1]);
  const [name, count] = entries[0];
  return `${name} (${count} d)`;
}
