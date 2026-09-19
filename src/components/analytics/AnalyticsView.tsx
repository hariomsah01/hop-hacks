"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { AnalyticsPeriod, AnalyticsResult, AnalyticsSeries } from "@/lib/contracts";
import type { SitePoint } from "@/components/map/MapView";
import AnalyticsChart, { type AnalyticsLine } from "./AnalyticsChart";

const FOOD_LINES: AnalyticsLine[] = [
  { dataKey: "foodDistributed", name: "Distributed", color: "#3ee0d8" },
  { dataKey: "foodReceived", name: "Received", color: "#f5d76e" },
  { dataKey: "foodWasted", name: "Discarded", color: "#ff7a45" },
];

const PEOPLE_LINES: AnalyticsLine[] = [
  { dataKey: "clients", name: "Clients", color: "#3ee0d8" },
  { dataKey: "households", name: "Households", color: "#f5d76e" },
  { dataKey: "staff", name: "Staff", color: "#ff7a45", yAxisId: "right" },
];

const INSECURITY_LINES: AnalyticsLine[] = [
  { dataKey: "foodInsecurityPercent", name: "Food insecurity", color: "#ffb000" },
];

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function Stat({
  label,
  value,
  previous,
  invert,
  unit,
}: {
  label: string;
  value: number;
  previous: number | null;
  invert?: boolean;
  unit?: "pct";
}) {
  const display = unit === "pct" ? formatPercent(value) : formatCount(value);
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
          {display}
        </span>
        {delta != null && delta !== 0 && (
          <span
            className={`text-[10px] tabular-nums ${
              good ? "text-[#3dd68c]" : "text-[#ff7a45]"
            }`}
          >
            {up ? "▲" : "▼"}
            {unit === "pct"
              ? `${Math.abs(delta).toFixed(1)}`
              : formatCount(Math.abs(delta))}
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
          />
        )}
      </div>
    </section>
  );
}

function Column({
  code,
  title,
  subtitle,
  series,
}: {
  code: string;
  title: string;
  subtitle: string;
  series: AnalyticsSeries | null;
}) {
  const periods = series?.periods ?? [];
  const firstForecastIndex = series?.firstForecastIndex ?? 0;
  const [cursorIndex, setCursorIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setCursorIndex(Math.min(firstForecastIndex, Math.max(periods.length - 1, 0)));
    setPlaying(false);
  }, [firstForecastIndex, periods.length]);

  useEffect(() => {
    if (!playing || periods.length === 0) return;
    const timer = window.setInterval(() => {
      setCursorIndex((current) => {
        if (current >= periods.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 750);
    return () => window.clearInterval(timer);
  }, [playing, periods.length]);

  const cursor = periods[cursorIndex] ?? null;
  const previous = periods[cursorIndex - 1] ?? null;
  const cursorLabel = cursor?.label ?? null;

  const onCursorIndex = (index: number) => {
    if (index >= 0 && index < periods.length) {
      setPlaying(false);
      setCursorIndex(index);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <header className="shrink-0 border-b border-[var(--at-line)] pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--at-amber)]">
              {code}  {title}
            </div>
            <p className="truncate text-[10px] text-[var(--at-muted)]">{subtitle}</p>
          </div>
          <div
            className="shrink-0 text-right"
            aria-live="polite"
          >
            <div className="text-[11px] font-semibold tracking-[0.12em] text-[var(--at-yellow)]">
              {cursorLabel ?? "—"}
            </div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--at-muted)]">
              {cursor?.kind === "forecast" ? "Forecast" : "History"}
            </div>
          </div>
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
              label="Insec"
              value={cursor.foodInsecurityPercent}
              previous={previous?.foodInsecurityPercent ?? null}
              invert
              unit="pct"
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
        syncId={`ptwn-${code}`}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatCount}
      />
      <ChartCard
        title="People"
        data={periods}
        lines={PEOPLE_LINES}
        firstForecastIndex={firstForecastIndex}
        cursorIndex={cursorIndex}
        syncId={`ptwn-${code}`}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatCount}
        rightYTickFormatter={formatCount}
      />
      <ChartCard
        title="Food insecurity"
        data={periods}
        lines={INSECURITY_LINES}
        firstForecastIndex={firstForecastIndex}
        cursorIndex={cursorIndex}
        syncId={`ptwn-${code}`}
        onCursorIndex={onCursorIndex}
        yTickFormatter={formatPercent}
      />

      <div className="flex items-center gap-2 border-t border-[var(--at-line)] pt-2">
        <button
          type="button"
          onClick={() => {
            if (cursorIndex >= periods.length - 1) {
              setCursorIndex(firstForecastIndex);
            }
            setPlaying((value) => !value);
          }}
          className="flex items-center gap-1 rounded-sm bg-[var(--at-amber)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-black hover:bg-[var(--at-yellow)]"
        >
          {playing ? <Pause size={11} aria-hidden /> : <Play size={11} aria-hidden />}
          {playing ? "Pause" : "Play fcast"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setCursorIndex(firstForecastIndex);
          }}
          className="flex items-center gap-1 rounded-sm border border-[var(--at-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--at-muted)] hover:border-[var(--at-amber)] hover:text-[var(--at-amber)]"
        >
          <RotateCcw size={11} aria-hidden />
          Reset
        </button>
        <span className="w-16 text-[10px] font-semibold tabular-nums text-[var(--at-yellow)]">
          {cursorLabel ?? "—"}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(periods.length - 1, 0)}
          value={cursorIndex}
          onChange={(event) => {
            setPlaying(false);
            setCursorIndex(Number(event.target.value));
          }}
          className="w-full"
          aria-label={`${title} month`}
        />
      </div>
      <p className="text-[9px] uppercase tracking-[0.12em] text-[var(--at-muted)]">
        Solid history · dashed forecast · hover any chart to lock the date
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
            subtitle="Simulation without a new location"
            series={result?.baseline ?? null}
          />
          <Column
            code="02"
            title="Expansion"
            subtitle="Simulation with the Map tab pin"
            series={result?.withNewLocation ?? null}
          />
        </div>
      </div>
    </div>
  );
}
