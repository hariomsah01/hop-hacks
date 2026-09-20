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
import { ChevronDown, X } from "lucide-react";
import type {
  Consequence,
  ScenarioName,
  SiteAssessmentResult,
} from "@/lib/contracts";
import { formatValue } from "@/lib/format";
import { MeasureValue, MetricRow, StatusBadge } from "./Measures";

const PROPOSED_COLOUR = "#c2410c";

const HIDDEN_FINDINGS = new Set([
  "no-reference",
  "reference-capacity-unknown",
  "demand-assumed",
  "cost-per-household",
  "newly-covered-tracts",
  "service-rate",
  "binding-constraint",
  "no-binding-constraint",
]);

function formatRadiusKm(meters: number): string {
  const km = meters / 1000;
  return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;
}

function topConstraint(days: Record<string, number>): string {
  const entries = Object.entries(days).filter(
    ([key, count]) => key !== "none" && count > 0,
  );
  if (entries.length === 0) return "None";
  entries.sort((a, b) => b[1] - a[1]);
  const labels: Record<string, string> = {
    staffing: "Volunteer hours",
    supply: "Food on hand",
    delivery: "Delivery",
    demand: "Assumed demand",
  };
  const [name, count] = entries[0];
  return `${labels[name] ?? name} · ${count} of 28 days`;
}

function glanceFindings(consequences: Consequence[]): Consequence[] {
  return consequences
    .filter((item) => !HIDDEN_FINDINGS.has(item.id))
    .filter(
      (item) => item.severity !== "info" || item.id === "outside-all-listings",
    )
    .slice(0, 3);
}

function FindingRow({
  consequence,
  open,
  onToggle,
}: {
  consequence: Consequence;
  open: boolean;
  onToggle: () => void;
}) {
  const tone =
    consequence.severity === "watch"
      ? "text-amber-800"
      : consequence.severity === "gap"
        ? "text-[var(--color-navy-500)]"
        : "text-[var(--color-navy-800)]";
  return (
    <div className="border-b border-[var(--color-hairline)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 py-2 text-left"
      >
        <span className={`min-w-0 flex-1 text-xs font-medium leading-snug ${tone}`}>
          {consequence.headline}
        </span>
        <ChevronDown
          size={14}
          className={`mt-0.5 shrink-0 text-[var(--color-navy-400)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <p className="pb-2 text-[11px] leading-snug text-[var(--color-navy-500)]">
          {consequence.detail}
        </p>
      )}
    </div>
  );
}

export default function FindingsPanel({
  assessment,
  loading,
  onClose,
}: {
  assessment: SiteAssessmentResult | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [scenario, setScenario] = useState<ScenarioName>("medium");
  const [openFinding, setOpenFinding] = useState<string | null>(null);

  const radiusLabel = assessment
    ? formatRadiusKm(assessment.plan.catchmentRadiusMeters)
    : null;

  return (
    <div className="flex h-full flex-col bg-[var(--color-panel)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-4 py-3">
        <div className="min-w-0">
          <h2
            id="analysis-drawer-title"
            className="text-sm font-semibold text-[var(--color-navy-800)]"
          >
            Statistics
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-navy-400)]">
            {radiusLabel
              ? `${radiusLabel} assumed straight-line ring`
              : loading
                ? "Running…"
                : "Place the pin to read this site"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span
              className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-teal-600)] border-t-transparent"
              aria-label="Updating statistics"
            />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-navy-400)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-navy-800)]"
          >
            <X size={16} aria-hidden />
            <span className="sr-only">Close statistics</span>
          </button>
        </div>
      </header>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!assessment ? (
          <p className="text-xs text-[var(--color-navy-400)]">
            {loading
              ? "Computing coverage and the 28-day plan…"
              : "Drag the pin onto Baltimore City."}
          </p>
        ) : (
          <AnalysisBody
            assessment={assessment}
            scenario={scenario}
            onScenario={setScenario}
            openFinding={openFinding}
            onToggleFinding={(id) =>
              setOpenFinding((current) => (current === id ? null : id))
            }
          />
        )}
      </div>
    </div>
  );
}

function AnalysisBody({
  assessment,
  scenario,
  onScenario,
  openFinding,
  onToggleFinding,
}: {
  assessment: SiteAssessmentResult;
  scenario: ScenarioName;
  onScenario: (name: ScenarioName) => void;
  openFinding: string | null;
  onToggleFinding: (id: string) => void;
}) {
  const { reach } = assessment;
  const glance = glanceFindings(assessment.consequences);
  const bucket =
    assessment.scenarios.find((item) => item.scenario === scenario) ??
    assessment.scenarios[0];
  const chartData = assessment.scenarios.map((item) => ({
    scenario: `${item.scenario[0].toUpperCase()}${item.scenario.slice(1)}`,
    served: item.proposed.householdsServed.value ?? 0,
  }));
  const chartUnavailable = bucket.proposed.householdsServed.value === null;

  return (
    <div className="flex flex-col gap-5">
      {glance.length > 0 && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-navy-400)]">
            Findings
          </h3>
          <div>
            {glance.map((item) => (
              <FindingRow
                key={item.id}
                consequence={item}
                open={openFinding === item.id}
                onToggle={() => onToggleFinding(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-navy-400)]">
          Coverage
        </h3>
        <div className="rounded-lg border border-[var(--color-hairline)] px-3">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] py-2.5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-proposed-600)]">
                Outside every listed ring
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--color-navy-400)]">
                New ground, not attendance
              </p>
            </div>
            <div className="text-right">
              <MeasureValue measure={reach.populationOutsideAllListings} emphasis />
              <div className="mt-0.5 flex justify-end">
                <StatusBadge measure={reach.populationOutsideAllListings} />
              </div>
            </div>
          </div>
          <MetricRow
            compact
            label="People in this ring"
            measure={reach.proposedPopulation}
          />
          <MetricRow
            compact
            label="Already inside a listed ring"
            measure={reach.duplicatedPopulation}
          />
          <MetricRow
            compact
            label="Listed services nearby"
            measure={reach.nearbyListedServiceCount}
          />
          <MetricRow
            compact
            label="Poverty rate"
            measure={assessment.proposed.povertyRate}
          />
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-navy-400)]">
            Plan
          </h3>
          <div className="flex gap-0.5 rounded-md bg-[var(--color-canvas)] p-0.5">
            {assessment.scenarios.map((item) => (
              <button
                key={item.scenario}
                type="button"
                onClick={() => onScenario(item.scenario)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                  item.scenario === scenario
                    ? "bg-[var(--color-teal-600)] text-white"
                    : "text-[var(--color-navy-500)] hover:bg-white"
                }`}
              >
                {item.scenario}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--color-hairline)] px-3">
          <MetricRow
            compact
            label="Assumed weekly requests"
            measure={bucket.proposed.assumedWeeklyHouseholdRequests}
          />
          <MetricRow
            compact
            label="Household visits served"
            measure={bucket.proposed.householdsServed}
          />
          <MetricRow
            compact
            label="Unmet requests"
            measure={bucket.proposed.unmetRequests}
          />
          <MetricRow compact label="Service rate" measure={bucket.proposed.serviceRate} />
          <MetricRow
            compact
            label="Cost per household"
            measure={bucket.proposed.costPerHouseholdServed}
          />
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-xs text-[var(--color-navy-600)]">Limit</span>
            <span className="text-xs font-medium text-[var(--color-navy-800)]">
              {topConstraint(bucket.proposed.bindingConstraintDays)}
            </span>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-[11px] text-[var(--color-navy-400)]">
            Visits served under each assumed demand
          </p>
          {chartUnavailable ? (
            <p className="text-[11px] italic text-[var(--color-status-unavailable)]">
              Not charted: catchment population is unavailable.
            </p>
          ) : (
            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5ecf2"
                    vertical={false}
                  />
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
                    formatter={(value) =>
                      formatValue(Number(value), "households")
                    }
                  />
                  <Bar
                    dataKey="served"
                    name="Served"
                    fill={PROPOSED_COLOUR}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-[var(--color-navy-400)]">
        Demand is assumed across low, medium and high. Rings are straight-line,
        not walking time. A listing is a published location, not hours or
        capacity.
      </p>
    </div>
  );
}
