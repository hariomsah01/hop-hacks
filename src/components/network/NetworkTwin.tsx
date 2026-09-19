"use client";

import dynamic from "next/dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarRange,
  GitCompareArrows,
  MapPinned,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  NetworkTwinResult,
} from "@/lib/network/twin";
import type {
  NetworkComparisonResult,
} from "@/lib/contracts";
import NetworkComparisonPanel from "./NetworkComparisonPanel";

interface ProposedPoint {
  lng: number;
  lat: number;
}

/*
 * The map must load in the browser because
 * MapLibre uses window and other browser APIs.
 */
const NetworkTwinMap = dynamic(
  () => import("./NetworkTwinMap"),
  {
    ssr: false,

    loading: () => (
      <div className="flex h-full items-center justify-center bg-[var(--color-canvas)] text-sm text-[var(--color-navy-400)]">
        Loading network map…
      </div>
    ),
  },
);

function formatNumber(
  value: number | null,
): string {
  if (value === null) {
    return "Unavailable";
  }

  return Math.round(
    value,
  ).toLocaleString("en-US");
}

function pressureLabel(
  value: number,
): string {
  if (value >= 115) {
    return "High";
  }

  if (value >= 100) {
    return "Elevated";
  }

  return "Below baseline";
}

function pressureStyle(
  value: number,
): string {
  if (value >= 115) {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }

  if (value >= 100) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-[var(--color-teal-100)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]";
}

export default function NetworkTwin() {
  const [data, setData] =
    useState<NetworkTwinResult | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [monthIndex, setMonthIndex] =
    useState(0);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [playing, setPlaying] =
    useState(false);

  const [comparisonMode, setComparisonMode] =
    useState(false);

  const [proposed, setProposed] =
    useState<ProposedPoint | null>(null);

  const [catchmentRadiusMeters, setCatchmentRadiusMeters] =
    useState(1200);

  const [comparison, setComparison] =
    useState<NetworkComparisonResult | null>(null);

  const [comparisonLoading, setComparisonLoading] =
    useState(false);

  const [comparisonError, setComparisonError] =
    useState<string | null>(null);

  /*
   * Load the digital-twin simulation
   * from the backend API.
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/network-twin")
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Network simulation failed (${response.status})`,
          );
        }

        return response.json() as Promise<NetworkTwinResult>;
      })
      .then((result) => {
        if (cancelled) return;

        setData(result);

        /*
         * Start the screen at the first
         * future forecast month.
         */
        setMonthIndex(
          result.firstForecastIndex,
        );

        setSelectedId(
          result.pantries[0]?.id ??
            null,
        );
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setError(reason.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Automatically move the simulation
   * forward one month at a time.
   */
  useEffect(() => {
    if (!playing || !data) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setMonthIndex(
          (currentIndex) => {
            if (
              currentIndex >=
              data.months.length - 1
            ) {
              setPlaying(false);
              return currentIndex;
            }

            return currentIndex + 1;
          },
        );
      }, 900);

    return () => {
      window.clearInterval(timer);
    };
  }, [playing, data]);

  /*
   * Case B is calculated only after the planner places a candidate. The API
   * reuses the same deterministic Baltimore catchment functions as the site
   * planner; it never infers attendance or capacity.
   */
  useEffect(() => {
    if (!comparisonMode || !proposed) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/network-comparison", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        proposed,
        catchmentRadiusMeters,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(
            detail.error ?? `Comparison failed (${response.status})`,
          );
        }

        return response.json() as Promise<NetworkComparisonResult>;
      })
      .then(setComparison)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setComparisonError(reason.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setComparisonLoading(false);
        }
      });

    return () => controller.abort();
  }, [comparisonMode, proposed, catchmentRadiusMeters]);

  const selectedPantry = useMemo(
    () =>
      data?.pantries.find(
        (pantry) =>
          pantry.id === selectedId,
      ) ?? null,
    [data, selectedId],
  );

  const currentMonth =
    data?.months[monthIndex] ?? null;

  const selectedPressure =
    selectedPantry
      ?.pressureByMonth[
        monthIndex
      ] ?? null;

  /*
   * Prepare the values used by
   * the Recharts timeline.
   */
  const chartData = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.months.map(
      (month, index) => ({
        label: month.label,

        observed:
          month.kind ===
          "observed-input"
            ? month.networkPressureIndex
            : null,

        forecast:
          month.kind === "forecast"
            ? month.networkPressureIndex
            : null,

        selected:
          selectedPantry
            ?.pressureByMonth[
              index
            ] ?? null,

        forecastRange:
          month.kind === "forecast"
            ? [
                month.pressureLow,
                month.pressureHigh,
              ]
            : null,
      }),
    );
  }, [data, selectedPantry]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <p className="font-semibold">
            The network twin could not load
          </p>

          <p className="mt-1 text-sm">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data || !currentMonth) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-navy-500)]">
        Preparing Baltimore’s monthly network simulation…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--color-canvas)] xl:flex-row xl:overflow-hidden">
      {/* LEFT PANEL */}

      <aside className="panel-scroll w-full shrink-0 overflow-y-auto border-b border-[var(--color-hairline)] bg-white p-4 xl:w-72 xl:border-b-0 xl:border-r">
        <div className="flex items-center gap-2">
          <CalendarRange
            size={17}
            className="text-[var(--color-teal-600)]"
            aria-hidden
          />

          <h2 className="font-semibold text-[var(--color-navy-800)]">
            Current network
          </h2>
        </div>

        <p className="mt-2 text-sm leading-5 text-[var(--color-navy-500)]">
          No new location is added. The
          twin simulates Baltimore’s
          existing listed pantry network
          month by month.
        </p>

        <div className="mt-5 rounded-lg border border-[var(--color-teal-100)] bg-[var(--color-teal-50)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-teal-700)]">
            Simulation month
          </p>

          <p className="mt-1 text-xl font-bold text-[var(--color-navy-800)]">
            {currentMonth.label}
          </p>

          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
              currentMonth.kind ===
              "forecast"
                ? "border-violet-200 bg-violet-50 text-violet-800"
                : "border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            {currentMonth.kind ===
            "forecast"
              ? "Forecast"
              : "Observed BLS input"}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-navy-500)]">
                Baltimore pressure
              </span>

              <strong>
                {currentMonth.networkPressureIndex.toFixed(
                  1,
                )}
              </strong>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--color-teal-600)]"
                style={{
                  width: `${Math.min(
                    100,
                    currentMonth.networkPressureIndex /
                      1.35,
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-hairline)] pt-3 text-sm">
            <span className="text-[var(--color-navy-500)]">
              Unemployment input
            </span>

            <strong>
              {currentMonth.unemploymentRate.toFixed(
                1,
              )}
              %
            </strong>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--color-navy-500)]">
              Listed locations
            </span>

            <strong>
              {
                data.network
                  .listedPantries
              }
            </strong>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--color-hairline)] pt-4">
          <div className="flex items-center gap-1.5">
            <GitCompareArrows size={15} aria-hidden />
            <h3 className="text-sm font-semibold">A/B network case</h3>
          </div>

          <p className="mt-1.5 text-xs leading-4 text-[var(--color-navy-500)]">
            Compare today&apos;s listed network with the same network plus one proposed Baltimore pantry.
          </p>

          {!comparisonMode ? (
            <button
              type="button"
              onClick={() => {
                setComparisonMode(true);
                setPlaying(false);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600"
            >
              <MapPinned size={14} aria-hidden />
              Add proposed location
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs font-semibold text-violet-950">
                {proposed
                  ? "Case B location selected"
                  : "Click an empty point on the map"}
              </p>

              <label className="mt-3 block text-[11px] font-medium text-violet-900">
                Straight-line service radius
                <select
                  value={catchmentRadiusMeters}
                  onChange={(event) => {
                    setCatchmentRadiusMeters(Number(event.target.value));
                    if (proposed) {
                      setComparisonLoading(true);
                      setComparisonError(null);
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-xs text-[var(--color-navy-800)]"
                >
                  <option value={800}>0.8 km</option>
                  <option value={1200}>1.2 km</option>
                  <option value={2000}>2.0 km</option>
                  <option value={3200}>3.2 km</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  setComparisonMode(false);
                  setProposed(null);
                  setComparison(null);
                  setComparisonLoading(false);
                  setComparisonError(null);
                }}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                <X size={13} aria-hidden />
                Clear comparison
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--color-hairline)] pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity
              size={15}
              aria-hidden
            />

            How the forecast is made
          </h3>

          <ol className="mt-2 space-y-2 text-xs leading-5 text-[var(--color-navy-500)]">
            {data.methodology.map(
              (item, index) => (
                <li
                  key={item}
                  className="flex gap-2"
                >
                  <span className="font-semibold text-[var(--color-teal-700)]">
                    {index + 1}
                  </span>

                  <span>{item}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      </aside>

      {/* CENTER MAP AND TIMELINE */}

      <main className="flex min-h-[720px] min-w-0 flex-1 flex-col xl:min-h-0">
        <div className="min-h-0 flex-1">
          <NetworkTwinMap
            pantries={data.pantries}
            monthIndex={monthIndex}
            monthLabel={
              currentMonth.label
            }
            selectedId={comparisonMode ? null : selectedId}
            onSelect={setSelectedId}
            comparisonMode={comparisonMode}
            proposed={proposed}
            catchmentRadiusMeters={catchmentRadiusMeters}
            onPropose={(point) => {
              setProposed(point);
              setComparisonLoading(true);
              setComparisonError(null);
            }}
          />
        </div>

        <section
          className="h-64 shrink-0 border-t border-[var(--color-hairline)] bg-white px-4 py-3"
          aria-label="Monthly simulation timeline"
        >
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold">
                Monthly demand-pressure timeline
              </h3>

              <p className="text-xs text-[var(--color-navy-400)]">
                Solid values use
                published BLS inputs.
                Dashed values show the
                12-month forecast.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (
                    monthIndex >=
                    data.months
                      .length -
                      1
                  ) {
                    setMonthIndex(
                      data.firstForecastIndex,
                    );
                  }

                  setPlaying(
                    (value) => !value,
                  );
                }}
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-teal-700)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-teal-600)]"
              >
                {playing ? (
                  <Pause
                    size={13}
                    aria-hidden
                  />
                ) : (
                  <Play
                    size={13}
                    aria-hidden
                  />
                )}

                {playing
                  ? "Pause"
                  : "Play forecast"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPlaying(false);

                  setMonthIndex(
                    data.firstForecastIndex,
                  );
                }}
                className="flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-teal-50)]"
              >
                <RotateCcw
                  size={13}
                  aria-hidden
                />

                Reset
              </button>
            </div>
          </div>

          <div className="h-36">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <ComposedChart
                data={chartData}
                margin={{
                  top: 6,
                  right: 18,
                  bottom: 0,
                  left: 0,
                }}
              >
                <CartesianGrid
                  stroke="#e7edf2"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  interval={3}
                  tick={{
                    fontSize: 11,
                    fill: "#64809f",
                  }}
                />

                <YAxis
                  domain={[
                    70,
                    "auto",
                  ]}
                  width={34}
                  tick={{
                    fontSize: 11,
                    fill: "#64809f",
                  }}
                />

                <Tooltip />

                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                  }}
                />

                <Area
                  dataKey="forecastRange"
                  name="Forecast interval"
                  fill="#ddd6fe"
                  stroke="none"
                  connectNulls
                />

                <Line
                  dataKey="observed"
                  name="Baltimore observed-input index"
                  stroke="#0d8383"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />

                <Line
                  dataKey="forecast"
                  name="Baltimore forecast"
                  stroke="#0d8383"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />

                <Line
                  dataKey="selected"
                  name="Selected pantry exposure"
                  stroke="#5b3bc4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />

                <ReferenceLine
                  x={currentMonth.label}
                  stroke="#c2410c"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-20 text-xs font-semibold text-[var(--color-navy-500)]">
              {currentMonth.label}
            </span>

            <input
              type="range"
              min={0}
              max={
                data.months.length -
                1
              }
              value={monthIndex}
              onChange={(event) => {
                setPlaying(false);

                setMonthIndex(
                  Number(
                    event.target.value,
                  ),
                );
              }}
              className="w-full"
              aria-label="Simulation month"
            />
          </div>
        </section>
      </main>

      {/* RIGHT PANEL */}

      <aside
        className={`panel-scroll w-full shrink-0 overflow-y-auto border-t border-[var(--color-hairline)] bg-white p-4 xl:border-l xl:border-t-0 ${
          comparisonMode ? "xl:w-[28rem]" : "xl:w-80"
        }`}
      >
        <div className="flex items-center gap-2">
          {comparisonMode ? (
            <GitCompareArrows
              size={17}
              className="text-violet-700"
              aria-hidden
            />
          ) : (
            <Building2
              size={17}
              className="text-[var(--color-reference-600)]"
              aria-hidden
            />
          )}

          <h2 className="font-semibold">
            {comparisonMode ? "Current vs proposed network" : "Location and network"}
          </h2>
        </div>

        {comparisonMode ? (
          <NetworkComparisonPanel
            comparison={comparison}
            loading={comparisonLoading}
            error={comparisonError}
          />
        ) : (
          <>
        {selectedPantry ? (
          <div className="mt-4 rounded-lg border border-[var(--color-hairline)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-reference-600)]">
              Selected pantry
            </p>

            <h3 className="mt-1 font-semibold leading-5">
              {selectedPantry.name}
            </h3>

            <p className="mt-1 text-xs leading-4 text-[var(--color-navy-400)]">
              {selectedPantry.address ??
                "Address not published"}
            </p>

            {selectedPressure !==
              null && (
              <div
                className={`mt-3 rounded-md border p-3 ${pressureStyle(
                  selectedPressure,
                )}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    Local pressure
                  </span>

                  <strong className="text-lg">
                    {selectedPressure.toFixed(
                      1,
                    )}
                  </strong>
                </div>

                <p className="mt-0.5 text-xs">
                  {pressureLabel(
                    selectedPressure,
                  )}{" "}
                  for{" "}
                  {currentMonth.label}
                </p>
              </div>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--color-navy-400)]">
                  Tract population
                </dt>

                <dd className="font-semibold">
                  {formatNumber(
                    selectedPantry.localPopulation,
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[var(--color-navy-400)]">
                  Tract households
                </dt>

                <dd className="font-semibold">
                  {formatNumber(
                    selectedPantry.localHouseholds,
                  )}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-xs leading-4 text-[var(--color-navy-500)]">
              Local values describe the
              surrounding census tract.
              They are not this pantry’s
              attendance or capacity.
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-[var(--color-hairline)] p-3 text-sm text-[var(--color-navy-500)]">
            Click a pantry on the map
            to inspect its timeline.
          </p>
        )}

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle
              size={15}
              aria-hidden
            />

            Operations remain unknown
          </div>

          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt>Pantry capacity</dt>
              <dd className="font-semibold">
                Unavailable
              </dd>
            </div>

            <div className="flex justify-between">
              <dt>Unmet visits</dt>
              <dd className="font-semibold">
                Unavailable
              </dd>
            </div>

            <div className="flex justify-between">
              <dt>Inventory</dt>
              <dd className="font-semibold">
                Unavailable
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-xs leading-4">
            These values require
            monthly operational records
            from pantry partners. The
            twin does not invent them.
          </p>
        </div>
          </>
        )}

        <div className="mt-5 border-t border-[var(--color-hairline)] pt-4">
          <h3 className="text-sm font-semibold">
            Limitations
          </h3>

          <ul className="mt-2 space-y-2 text-xs leading-4 text-[var(--color-navy-500)]">
            {(comparisonMode && comparison
              ? comparison.limitations
              : data.limitations
            ).map(
              (limitation) => (
                <li key={limitation}>
                  • {limitation}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="mt-5 border-t border-[var(--color-hairline)] pt-4">
          <h3 className="text-sm font-semibold">
            Sources
          </h3>

          <ul className="mt-2 space-y-2 text-xs">
            {(comparisonMode && comparison
              ? comparison.sources
              : data.sources
            ).map(
              (source) => (
                <li key={source.id}>
                  <a
                    href={
                      source.landingUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[var(--color-teal-700)] underline"
                  >
                    {source.publisher}:{" "}
                    {source.title}
                  </a>
                </li>
              ),
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
