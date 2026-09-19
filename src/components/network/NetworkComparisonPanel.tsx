"use client";

import {
  AlertTriangle,
  CheckCircle2,
  MapPinned,
} from "lucide-react";

import type {
  Measure,
  NetworkComparisonResult,
} from "@/lib/contracts";
import { StatusBadge } from "@/components/planning/Measures";
import {
  formatDelta,
  formatMeasure,
} from "@/lib/format";

interface ComparisonRow {
  label: string;
  current: Measure;
  expanded: Measure;
  favourableDirection: "up" | "down" | "neutral";
}

function deltaFor(row: ComparisonRow): number | null {
  if (
    row.current.value === null ||
    row.expanded.value === null
  ) {
    return null;
  }

  return row.expanded.value - row.current.value;
}

function deltaClass(
  delta: number | null,
  direction: ComparisonRow["favourableDirection"],
): string {
  if (delta === null || Math.abs(delta) < 1e-9 || direction === "neutral") {
    return "text-[var(--color-navy-400)]";
  }

  const improves =
    direction === "up" ? delta > 0 : delta < 0;

  return improves ? "text-emerald-700" : "text-red-700";
}

export default function NetworkComparisonPanel({
  comparison,
  loading,
  error,
}: {
  comparison: NetworkComparisonResult | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !comparison) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--color-hairline)] p-4 text-sm text-[var(--color-navy-500)]">
        Calculating the Baltimore A/B coverage comparison…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        {error}
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-violet-300 bg-violet-50 p-4 text-sm text-violet-900">
        Click a point on the Baltimore map to create Case B.
      </div>
    );
  }

  const rows: ComparisonRow[] = [
    {
      label: "Listed locations",
      current: comparison.current.listedLocations,
      expanded: comparison.expanded.listedLocations,
      favourableDirection: "neutral",
    },
    {
      label: "People with geographic coverage",
      current: comparison.current.coveredPopulationInCandidateCatchment,
      expanded: comparison.expanded.coveredPopulationInCandidateCatchment,
      favourableDirection: "up",
    },
    {
      label: "People outside listed pantry rings",
      current: comparison.current.uncoveredPopulationInCandidateCatchment,
      expanded: comparison.expanded.uncoveredPopulationInCandidateCatchment,
      favourableDirection: "down",
    },
    {
      label: "Monthly household visits",
      current: comparison.current.monthlyHouseholdVisits,
      expanded: comparison.expanded.monthlyHouseholdVisits,
      favourableDirection: "up",
    },
    {
      label: "Capacity utilization",
      current: comparison.current.capacityUtilization,
      expanded: comparison.expanded.capacityUtilization,
      favourableDirection: "neutral",
    },
  ];

  return (
    <div className="mt-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
        <div className="flex items-start gap-2">
          <MapPinned
            size={16}
            className="mt-0.5 shrink-0 text-violet-700"
            aria-hidden
          />
          <div>
            <h3 className="text-sm font-semibold text-violet-950">
              Proposed Baltimore location
            </h3>
            <p className="mt-0.5 text-xs text-violet-800">
              {comparison.proposed.lat.toFixed(5)}, {comparison.proposed.lng.toFixed(5)} ·{" "}
              {(comparison.proposed.catchmentRadiusMeters / 1000).toFixed(1)} km straight-line ring
            </p>
          </div>
        </div>

        {!comparison.proposed.withinCityBoundary && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-900">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            The point is outside Baltimore City, so this comparison is incomplete.
          </p>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--color-hairline)]">
        <div className="grid grid-cols-[1.35fr_1fr_1fr_.8fr] bg-[var(--color-canvas)] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-500)]">
          <span>Metric</span>
          <span>Case A</span>
          <span>Case B</span>
          <span>Change</span>
        </div>

        {rows.map((row) => {
          const delta = deltaFor(row);
          const statusMeasure =
            row.expanded.status === "unavailable"
              ? row.expanded
              : row.current;

          return (
            <div
              key={row.label}
              className="grid grid-cols-[1.35fr_1fr_1fr_.8fr] items-center gap-1 border-t border-[var(--color-hairline)] px-2 py-2 text-[11px]"
            >
              <div className="pr-1">
                <p className="font-medium leading-tight text-[var(--color-navy-700)]">
                  {row.label}
                </p>
                <div className="mt-1">
                  <StatusBadge measure={statusMeasure} />
                </div>
              </div>
              <span className="tabular-nums text-[var(--color-navy-700)]">
                {formatMeasure(row.current)}
              </span>
              <span className="font-semibold tabular-nums text-[var(--color-navy-900)]">
                {formatMeasure(row.expanded)}
              </span>
              <span
                className={`font-semibold tabular-nums ${deltaClass(
                  delta,
                  row.favourableDirection,
                )}`}
              >
                {delta === null
                  ? "—"
                  : formatDelta(delta, row.expanded.unit)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <CheckCircle2 size={15} aria-hidden />
          Geographic change
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums">
          {formatMeasure(comparison.change.newlyCoveredPopulation)}
        </p>
        <p className="text-xs leading-4">
          would newly enter an equal-radius listed pantry ring in Case B. This estimates reach, not attendance.
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-[var(--color-canvas)] p-2">
          <dt className="text-[var(--color-navy-400)]">Candidate catchment</dt>
          <dd className="mt-0.5 font-semibold">
            {formatMeasure(comparison.candidateCatchmentPopulation)}
          </dd>
        </div>
        <div className="rounded-md bg-[var(--color-canvas)] p-2">
          <dt className="text-[var(--color-navy-400)]">Nearby listings</dt>
          <dd className="mt-0.5 font-semibold">
            {formatMeasure(comparison.nearbyListedServices)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <AlertTriangle size={15} aria-hidden />
          Operational performance awaits partner data
        </div>
        <p className="mt-1 text-xs leading-4">
          Visits and utilization remain unavailable rather than being invented. They will populate when monthly pantry records and capacity are connected.
        </p>
      </div>
    </div>
  );
}
