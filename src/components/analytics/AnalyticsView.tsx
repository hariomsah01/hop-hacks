"use client";

import { useEffect, useState } from "react";
import type { AnalyticsPeriod, AnalyticsResult } from "@/lib/contracts";
import type { SitePoint } from "@/components/map/MapView";
import AnalyticsChart, { type AnalyticsLine } from "./AnalyticsChart";

const FOOD_LINES: AnalyticsLine[] = [
  { dataKey: "foodDistributed", name: "Distributed", color: "#0d8383" },
  { dataKey: "foodReceived", name: "Received", color: "#5b3bc4" },
  { dataKey: "foodWasted", name: "Discarded / wasted", color: "#c2410c" },
];

const PEOPLE_LINES: AnalyticsLine[] = [
  { dataKey: "clients", name: "Clients", color: "#0d8383" },
  { dataKey: "households", name: "Households", color: "#5b3bc4" },
  { dataKey: "staff", name: "Staff", color: "#c2410c", yAxisId: "right" },
];

const INSECURITY_LINES: AnalyticsLine[] = [
  { dataKey: "foodInsecurityPercent", name: "Food insecurity", color: "#0d8383" },
];

function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function ChartCard({
  title,
  hint,
  data,
  lines,
  yTickFormatter,
  rightYTickFormatter,
}: {
  title: string;
  hint?: string;
  data: AnalyticsPeriod[];
  lines: AnalyticsLine[];
  yTickFormatter?: (value: number) => string;
  rightYTickFormatter?: (value: number) => string;
}) {
  return (
    <section className="shrink-0 overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-white px-3 py-2">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-[var(--color-navy-800)]">{title}</h3>
        {hint && (
          <p className="text-[11px] text-[var(--color-navy-400)]">{hint}</p>
        )}
      </div>
      <div className="h-36 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-navy-400)]">
            No series yet
          </div>
        ) : (
          <AnalyticsChart
            data={data}
            lines={lines}
            yTickFormatter={yTickFormatter}
            rightYTickFormatter={rightYTickFormatter}
          />
        )}
      </div>
    </section>
  );
}

function Column({
  title,
  subtitle,
  periods,
}: {
  title: string;
  subtitle: string;
  periods: AnalyticsPeriod[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <header className="shrink-0">
        <h2 className="text-sm font-semibold text-[var(--color-navy-800)]">{title}</h2>
        <p className="truncate text-[11px] text-[var(--color-navy-400)]">{subtitle}</p>
      </header>
      <ChartCard
        title="Food (lb)"
        hint="Distributed, received, and discarded"
        data={periods}
        lines={FOOD_LINES}
        yTickFormatter={formatCount}
      />
      <ChartCard
        title="People"
        hint="Clients, households, and staff"
        data={periods}
        lines={PEOPLE_LINES}
        yTickFormatter={formatCount}
        rightYTickFormatter={formatCount}
      />
      <ChartCard
        title="Food insecurity"
        hint="Share of people who are food-insecure"
        data={periods}
        lines={INSECURITY_LINES}
        yTickFormatter={formatPercent}
      />
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

  const baseline = result?.baseline.periods ?? [];
  const withNewLocation = result?.withNewLocation.periods ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-canvas)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-hairline)] bg-white px-4 py-2">
        <p className="text-[11px] text-[var(--color-navy-500)]">
          Left is the current network. Right uses the proposed pin from the Map
          tab.
        </p>
        {result?.placeholder && (
          <span className="rounded-md bg-[var(--color-teal-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-teal-700)]">
            Placeholder series
          </span>
        )}
        {loading && (
          <span className="text-[11px] text-[var(--color-navy-400)]">
            Loading simulation…
          </span>
        )}
        {error && (
          <span className="truncate text-[11px] font-medium text-red-800">
            {error}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid grid-cols-2 divide-x divide-[var(--color-hairline)]">
          <Column
            title="Without new location"
            subtitle="Predicted baseline from historical performance"
            periods={baseline}
          />
          <Column
            title="With new location"
            subtitle={`${proposed.lat.toFixed(4)}, ${proposed.lng.toFixed(4)} · ${Math.round(catchmentRadiusMeters)} m catchment`}
            periods={withNewLocation}
          />
        </div>
      </div>
    </div>
  );
}
