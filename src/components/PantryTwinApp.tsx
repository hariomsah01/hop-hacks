"use client";

import dynamic from "next/dynamic";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  MapPin,
  Network,
  PanelLeft,
  PanelRight,
  TriangleAlert,
} from "lucide-react";

import {
  DEFAULT_OPERATING_PLAN,
  type OperatingPlan,
  type SiteAssessmentRequest,
  type SiteAssessmentResult,
} from "@/lib/contracts";

import type {
  ReferencePin,
  SitePoint,
} from "@/components/map/MapView";

import ExplanationPanel from "@/components/planning/ExplanationPanel";
import FindingsPanel from "@/components/planning/FindingsPanel";
import PlanPanel from "@/components/planning/PlanPanel";
import NetworkTwin from "@/components/network/NetworkTwin";
import SourcesBar from "@/components/SourcesBar";
import TracksBar from "@/components/TracksBar";

/*
 * MapLibre uses browser APIs, so the map
 * must be loaded only in the browser.
 */
const MapView = dynamic(
  () =>
    import(
      "@/components/map/MapView"
    ),
  {
    ssr: false,

    loading: () => (
      <div className="flex h-full items-center justify-center bg-[var(--color-canvas)] text-sm text-[var(--color-navy-400)]">
        Loading map…
      </div>
    ),
  },
);

const DEFAULT_PROPOSED: SitePoint = {
  lng: -76.6205,
  lat: 39.2986,
};

export default function PantryTwinApp() {
  /*
   * planner = original location-planning interface
   * network = monthly digital-twin interface
   */
  const [mode, setMode] = useState<
    "planner" | "network"
  >("planner");

  const [proposed, setProposed] =
    useState<SitePoint>(
      DEFAULT_PROPOSED,
    );

  const [
    referenceId,
    setReferenceId,
  ] = useState<string | null>(
    null,
  );

  const [plan, setPlan] =
    useState<OperatingPlan>(
      DEFAULT_OPERATING_PLAN,
    );

  const [
    assessment,
    setAssessment,
  ] =
    useState<SiteAssessmentResult | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [showPlan, setShowPlan] =
    useState(true);

  const [
    showFindings,
    setShowFindings,
  ] = useState(true);

  /*
   * On smaller screens, begin with
   * the main map unobstructed.
   */
  useEffect(() => {
    if (
      window.innerWidth < 1280
    ) {
      setShowPlan(false);
    }

    if (
      window.innerWidth < 1024
    ) {
      setShowFindings(false);
    }
  }, []);

  const request =
    useMemo<SiteAssessmentRequest>(
      () => ({
        proposed,
        referenceServiceId:
          referenceId,
        plan,
      }),

      [
        proposed,
        referenceId,
        plan,
      ],
    );

  const timerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const requestIdRef =
    useRef(0);

  /*
   * Run the existing site-planning
   * assessment whenever the location
   * or operating assumptions change.
   */
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(
        timerRef.current,
      );
    }

    setLoading(true);

    timerRef.current =
      setTimeout(() => {
        const id =
          ++requestIdRef.current;

        fetch("/api/assess", {
          method: "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body: JSON.stringify(
            request,
          ),
        })
          .then(
            async (response) => {
              if (!response.ok) {
                const detail =
                  await response
                    .json()
                    .catch(
                      () => ({}),
                    );

                throw new Error(
                  detail.error ??
                    `Analysis failed (${response.status})`,
                );
              }

              return response.json() as Promise<SiteAssessmentResult>;
            },
          )
          .then((result) => {
            if (
              id !==
              requestIdRef.current
            ) {
              return;
            }

            setAssessment(result);
            setError(null);
          })
          .catch(
            (reason: Error) => {
              if (
                id !==
                requestIdRef.current
              ) {
                return;
              }

              setError(
                reason.message,
              );
            },
          )
          .finally(() => {
            if (
              id ===
              requestIdRef.current
            ) {
              setLoading(false);
            }
          });
      }, 250);

    return () => {
      if (timerRef.current) {
        clearTimeout(
          timerRef.current,
        );
      }
    };
  }, [request]);

  const handleMove =
    useCallback(
      (point: SitePoint) => {
        setProposed(point);
      },
      [],
    );

  const handleSelectReference =
    useCallback(
      (id: string | null) => {
        setReferenceId(id);

        if (id) {
          setShowFindings(true);
        }
      },
      [],
    );

  const handleReset =
    useCallback(() => {
      setProposed(
        DEFAULT_PROPOSED,
      );

      setReferenceId(null);
    }, []);

  const referencePin:
    | ReferencePin
    | null = useMemo(() => {
    const pantry =
      assessment?.reference
        ?.pantry;

    if (
      !pantry ||
      pantry.id !== referenceId
    ) {
      return null;
    }

    return {
      id: pantry.id,
      name: pantry.name,
      lng: pantry.lng,
      lat: pantry.lat,
    };
  }, [
    assessment,
    referenceId,
  ]);

  const outsideCity =
    assessment &&
    !assessment.proposed
      .withinCityBoundary;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* HEADER */}

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-panel)] px-4 py-2">
        {/* LOGO AND TITLE */}

        <div className="flex items-center gap-2">
          <MapPin
            size={18}
            className="text-[var(--color-teal-600)]"
            aria-hidden
          />

          <h1 className="text-sm font-bold tracking-tight text-[var(--color-navy-800)]">
            PantryTwin

            <span className="ml-1.5 hidden font-normal text-[var(--color-navy-400)] md:inline">
              {mode === "planner"
                ? "Would a new Baltimore pantry here add coverage?"
                : "How will Baltimore’s existing pantry network change by month?"}
            </span>
          </h1>
        </div>

        {/* MODE SWITCH */}

        <div
          className="flex rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5"
          role="tablist"
          aria-label="PantryTwin mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              mode === "planner"
            }
            onClick={() =>
              setMode("planner")
            }
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "planner"
                ? "bg-white text-[var(--color-teal-700)] shadow-sm"
                : "text-[var(--color-navy-500)] hover:text-[var(--color-navy-800)]"
            }`}
          >
            <MapPin
              size={13}
              aria-hidden
            />

            Site planner
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              mode === "network"
            }
            onClick={() =>
              setMode("network")
            }
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "network"
                ? "bg-white text-[var(--color-reference-600)] shadow-sm"
                : "text-[var(--color-navy-500)] hover:text-[var(--color-navy-800)]"
            }`}
          >
            <Network
              size={13}
              aria-hidden
            />

            Network twin
          </button>
      <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-hairline)] bg-[var(--color-panel)] px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin size={18} className="mt-0.5 shrink-0 text-[var(--color-teal-600)]" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-[var(--color-navy-800)]">
              PantryTwin
              <span className="ml-1.5 font-normal text-[var(--color-navy-400)]">
                Would a new Baltimore pantry here add coverage?
              </span>
            </h1>
            <div className="mt-1 flex flex-col gap-1">
              <TracksBar />
              <SourcesBar />
            </div>
          </div>
        </div>

        {/* RIGHT-SIDE HEADER CONTROLS */}

        <div className="flex items-center gap-3">
          {mode === "planner" && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setShowPlan(
                    (value) =>
                      !value,
                  )
                }
                aria-pressed={
                  showPlan
                }
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                  showPlan
                    ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
                    : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
                }`}
              >
                <PanelLeft
                  size={12}
                  aria-hidden
                />

                Plan
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowFindings(
                    (value) =>
                      !value,
                  )
                }
                aria-pressed={
                  showFindings
                }
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                  showFindings
                    ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
                    : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
                }`}
              >
                <PanelRight
                  size={12}
                  aria-hidden
                />

                Findings
              </button>
            </div>
          )}

          {mode === "planner" &&
            outsideCity && (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
                <TriangleAlert
                  size={12}
                  aria-hidden
                />

                Your pin is outside
                Baltimore City
              </span>
            )}

          {mode === "planner" &&
            error && (
              <span className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
                <TriangleAlert
                  size={12}
                  aria-hidden
                />

                {error}
              </span>
            )}

          <a
            href="/api/sources"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--color-navy-400)] underline hover:text-[var(--color-teal-700)]"
          >
            Sources
          </a>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--color-navy-400)] underline hover:text-[var(--color-teal-700)]"
          >
            Health
          </a>
        </div>
      </header>

      {/* NETWORK DIGITAL TWIN */}

      {mode === "network" ? (
        <div className="min-h-0 flex-1">
          <NetworkTwin />
        </div>
      ) : (
        /* ORIGINAL SITE-PLANNING SCREEN */

        <div className="flex min-h-0 flex-1">
          <aside
            className={`${
              showPlan
                ? "block"
                : "hidden"
            } w-72 shrink-0 border-r border-[var(--color-hairline)]`}
          >
            <PlanPanel
              plan={plan}
              onChange={setPlan}
              proposed={
                proposed
              }
              referenceName={
                assessment
                  ?.reference
                  ?.pantry.name ??
                null
              }
              onResetPlan={() =>
                setPlan(
                  DEFAULT_OPERATING_PLAN,
                )
              }
            />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <MapView
                proposed={
                  proposed
                }
                reference={
                  referencePin
                }
                catchmentRadiusMeters={
                  plan.catchmentRadiusMeters
                }
                onMoveProposed={
                  handleMove
                }
                onSelectReference={
                  handleSelectReference
                }
                onReset={
                  handleReset
                }
              />
            </div>

            <div className="h-56 shrink-0 border-t border-[var(--color-hairline)]">
              <ExplanationPanel
                assessment={
                  assessment
                }
                request={request}
              />
            </div>
          </main>

          <aside
            className={`${
              showFindings
                ? "block"
                : "hidden"
            } w-80 shrink-0 border-l border-[var(--color-hairline)]`}
          >
            <FindingsPanel
              assessment={
                assessment
              }
              loading={
                loading
              }
              onClearReference={() =>
                setReferenceId(
                  null,
                )
              }
            />
          </aside>
        </div>
      )}
          </div>
          <div className="h-56 shrink-0 border-t border-[var(--color-hairline)]">
            <ExplanationPanel assessment={assessment} request={request} />
          </div>
        </main>

        <aside
          className={`${showFindings ? "block" : "hidden"} w-80 shrink-0 border-l border-[var(--color-hairline)]`}
        >
          <FindingsPanel
            assessment={assessment}
            loading={loading}
            onSelectReference={(id) => handleSelectReference(id)}
            onClearReference={() => setReferenceId(null)}
          />
        </aside>
      </div>
    </div>
  );
}