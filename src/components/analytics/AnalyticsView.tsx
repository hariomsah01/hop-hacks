"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalyticsPeriod, AnalyticsResult, AnalyticsSeries } from "@/lib/contracts";
import type { SitePoint } from "@/components/map/MapView";
import AnalyticsChart, { type AnalyticsLine } from "./AnalyticsChart";

const FOOD_LINES: AnalyticsLine[] = [
  { dataKey: "foodDistributed", name: "Distributed", color: "#3ee0d8" },
  { dataKey: "foodReceived", name: "Received", color: "#f5d76e" },
  { dataKey: "foodWasted", name: "Discarded", color: "#ff7a45", yAxisId: "right" },
];

const PEOPLE_LINES: AnalyticsLine[] = [
  { dataKey: "clients", name: "Clients", color: "#3ee0d8" },
  { dataKey: "households", name: "Households", color: "#f5d76e" },
  { dataKey: "staff", name: "Staff", color: "#ff7a45", yAxisId: "right" },
];

const ACCESS_LINES: AnalyticsLine[] = [
  { dataKey: "foodAccessGapLb", name: "Access gap", color: "#ffb000" },
];

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

/** Axis ticks for food pounds. Tooltip still uses formatCount. */
function formatCompactPounds(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const millions = value / 1_000_000;
    const text =
      Math.abs(millions) >= 10
        ? String(Math.round(millions))
        : millions.toFixed(1).replace(/\.0$/, "");
    return `${text}M`;
  }
  if (abs >= 1_000) {
    const thousands = value / 1_000;
    const text =
      Math.abs(thousands) >= 100
        ? String(Math.round(thousands))
        : thousands.toFixed(Math.abs(thousands) >= 10 ? 0 : 1).replace(/\.0$/, "");
    return `${text}k`;
  }
  return String(Math.round(value));
}

function Stat({
  label,
  value,
  previous,
  invert,
}: {
  label: string;
  value: number;
  previous: number | null;
  invert?: boolean;
}) {
  const delta = previous == null ? null : value - previous;
  const up = delta != null && delta > 0;
  const good = delta == null ? null : invert ? !up : up;
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--at-muted)]">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold tabular-nums text-[var(--at-text)]">
          {formatCount(value)}
        </span>
        {delta != null && delta !== 0 && (
          <span
            className={`text-[10px] tabular-nums ${
              good ? "text-[#3dd68c]" : "text-[#ff7a45]"
            }`}
          >
            {up ? "▲" : "▼"}
            {formatCount(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  lines,
  firstForecastIndex,
  cursorIndex,
  syncId,
  onCursorIndex,
  yTickFormatter,
  rightYTickFormatter,
  tooltipFormatter,
  yDomain,
  rightYDomain,
}: {
  title: string;
  data: AnalyticsPeriod[];
  lines: AnalyticsLine[];
  firstForecastIndex: number;
  cursorIndex: number;
  syncId: string;
  onCursorIndex: (index: number) => void;
  yTickFormatter?: (value: number) => string;
  rightYTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number) => string;
  yDomain?: [number, number];
  rightYDomain?: [number, number];
}) {
  return (
    <section className="shrink-0 overflow-hidden border border-[var(--at-line)] bg-[var(--at-panel)] px-3 py-2">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--at-yellow)]">
        {title}
      </h3>
      <div className="h-36 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-[var(--at-muted)]">
            No series yet
          </div>
        ) : (
          <AnalyticsChart
            data={data}
            lines={lines}
            firstForecastIndex={firstForecastIndex}
            cursorIndex={cursorIndex}
            syncId={syncId}
            onCursorIndex={onCursorIndex}
            yTickFormatter={yTickFormatter}
            rightYTickFormatter={rightYTickFormatter}
            tooltipFormatter={tooltipFormatter}
            yDomain={yDomain}
            rightYDomain={rightYDomain}
          />
        )}
      </div>
    </section>
  );
}

function maxMetric(
  series: Array<AnalyticsSeries | null | undefined>,
  keys: Array<keyof AnalyticsPeriod>,
) {
  let max = 0;
  for (const item of series) {
    for (const period of item?.periods ?? []) {
      for (const key of keys) {
        const value = period[key];
        if (typeof value === "number" && Number.isFinite(value) && value > max) {
          max = value;
        }
      }
    }
  }
  return max;
}

function axisDomain(max: number): [number, number] | undefined {
  if (max <= 0) return undefined;
  return [0, Math.ceil(max * 1.08)];
}

const CHART_SYNC_ID = "ptwn-analytics";

function Column({
  code,
  title,
  subtitle,
  series,
  domains,
  cursorIndex,
  onCursorIndex,
}: {
  code: string;
  title: string;
  subtitle: string;
  series: AnalyticsSeries | null;
  domains: {
    foodLeft?: [number, number];
    foodRight?: [number, number];
    peopleLeft?: [number, number];
    peopleRight?: [number, number];
    access?: [number, number];
  };
  cursorIndex: number;
  onCursorIndex: (index: number) => void;
}) {
  const periods = series?.periods ?? [];
  const firstForecastIndex = series?.firstForecastIndex ?? 0;
  const cursor = periods[cursorIndex] ?? null;
  const previous = periods[cursorIndex - 1] ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <header className="shrink-0 border-b border-[var(--at-line)] pb-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--at-amber)]">
            {code}  {title}
          </div>
          <p className="truncate text-[10px] text-[var(--at-muted)]">{subtitle}</p>
        </div>

        {cursor && (
          <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1.5">
            <Stat
              label="Dist lb"
              value={cursor.foodDistributed}
              previous={previous?.foodDistributed ?? null}
            />
            <Stat
              label="Recv lb"
              value={cursor.foodReceived}
              previous={previous?.foodReceived ?? null}
            />
            <Stat
              label="Waste lb"
              value={cursor.foodWasted}
              previous={previous?.foodWasted ?? null}
              invert
            />
            <Stat
              label="Access gap"
              value={cursor.foodAccessGapLb}
              previous={previous?.foodAccessGapLb ?? null}
              invert
            />
            <Stat
              label="Clients"
              value={cursor.clients}
              previous={previous?.clients ?? null}
            />
            <Stat
              label="HH"
              value={cursor.households}
              previous={previous?.households ?? null}
            />
            <Stat
              label="Staff"
              value={cursor.staff}
              previous={previous?.staff ?? null}
            />
          </div>
        )}
      </header>

      <ChartCard
        title="Food (lb)"
        data={periods}
        lines={FOOD_LINES}
        firstForecastIndex={firstForecastIndex}
        cursorIndex={cursorIndex}
        syncId={CHART_SYNC_ID}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatCompactPounds}
        rightYTickFormatter={formatCount}
        tooltipFormatter={formatCount}
        yDomain={domains.foodLeft}
        rightYDomain={domains.foodRight}
      />
      <ChartCard
        title="People"
        data={periods}
        lines={PEOPLE_LINES}
        firstForecastIndex={firstForecastIndex}
        cursorIndex={cursorIndex}
        syncId={CHART_SYNC_ID}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatCount}
        rightYTickFormatter={formatCount}
        yDomain={domains.peopleLeft}
        rightYDomain={domains.peopleRight}
      />
      <ChartCard
        title="Access gap"
        data={periods}
        lines={ACCESS_LINES}
        firstForecastIndex={firstForecastIndex}
        cursorIndex={cursorIndex}
        syncId={CHART_SYNC_ID}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatCount}
        yDomain={domains.access}
      />

      <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--at-muted)]">
        Solid history · dashed forecast · hover any chart to align all six
      </p>
      <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--at-muted)]">
        Access gap is this ring&apos;s share of citywide food still sitting
        on people after current listings split the load. A new pantry adds a
        listing, so the gap falls.
      </p>
    </div>
  );
}

export default function AnalyticsView({
  proposed,
  catchmentRadiusMeters,
}: {
  proposed: SitePoint;
  catchmentRadiusMeters: number;
}) {
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposed, catchmentRadiusMeters }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error ?? `Analytics failed (${response.status})`);
        }
        return response.json() as Promise<AnalyticsResult>;
      })
      .then((payload) => {
        setResult(payload);
        setError(null);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [proposed, catchmentRadiusMeters]);

  const clock = useMemo(() => {
    if (!result) return "";
    return new Date(result.generatedAt).toISOString().replace("T", " ").slice(0, 19);
  }, [result]);

  const domains = useMemo(() => {
    const series = [result?.baseline, result?.withNewLocation];
    return {
      foodLeft: axisDomain(maxMetric(series, ["foodDistributed", "foodReceived"])),
      foodRight: axisDomain(maxMetric(series, ["foodWasted"])),
      peopleLeft: axisDomain(maxMetric(series, ["clients", "households"])),
      peopleRight: axisDomain(maxMetric(series, ["staff"])),
      access: axisDomain(maxMetric(series, ["foodAccessGapLb"])),
    };
  }, [result]);

  const periodCount = result?.baseline.periods.length ?? 0;
  const firstForecastIndex = result?.baseline.firstForecastIndex ?? 0;
  const [cursorIndex, setCursorIndex] = useState(0);

  useEffect(() => {
    setCursorIndex(Math.min(firstForecastIndex, Math.max(periodCount - 1, 0)));
  }, [firstForecastIndex, periodCount, result?.generatedAt]);

  const onCursorIndex = (index: number) => {
    if (index < 0 || index >= periodCount) return;
    setCursorIndex((current) => (current === index ? current : index));
  };

  return (
    <div className="analytics-terminal flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--at-line)] bg-[var(--at-bg)] px-3 py-1.5">
        <p className="truncate text-[10px] uppercase tracking-[0.18em] text-[var(--at-muted)]">
          PTWN Analytics
          <span className="mx-2 text-[var(--at-line)]">|</span>
          Baltimore City
          <span className="mx-2 text-[var(--at-line)]">|</span>
          {proposed.lat.toFixed(4)}N {Math.abs(proposed.lng).toFixed(4)}W
          <span className="mx-2 text-[var(--at-line)]">|</span>
          {Math.round(catchmentRadiusMeters)}m ring
        </p>
        <div className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
          {result?.placeholder && (
            <span className="text-[var(--at-amber)]">Placeholder</span>
          )}
          {loading && <span className="text-[var(--at-muted)]">Loading</span>}
          {error && <span className="text-[#ff7a45]">{error}</span>}
          {clock && <span className="text-[var(--at-muted)]">{clock}Z</span>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-2 divide-x divide-[var(--at-line)]">
          <Column
            code="01"
            title="Baseline"
            subtitle="This ring without a new pantry"
            series={result?.baseline ?? null}
            domains={domains}
            cursorIndex={cursorIndex}
            onCursorIndex={onCursorIndex}
          />
          <Column
            code="02"
            title="Expansion"
            subtitle="This ring after the Map tab pin opens"
            series={result?.withNewLocation ?? null}
            domains={domains}
            cursorIndex={cursorIndex}
            onCursorIndex={onCursorIndex}
          />
        </div>
      </div>
    </div>
  );
}
