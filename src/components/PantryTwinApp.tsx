"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, PanelLeft, PanelRight, TriangleAlert } from "lucide-react";
import {
  DEFAULT_OPERATING_PLAN,
  type OperatingPlan,
  type SiteAssessmentRequest,
  type SiteAssessmentResult,
} from "@/lib/contracts";
import type { ReferencePin, SitePoint } from "@/components/map/MapView";
import ExplanationPanel from "@/components/planning/ExplanationPanel";
import FindingsPanel from "@/components/planning/FindingsPanel";
import PlanPanel from "@/components/planning/PlanPanel";

/** MapLibre touches window on import, so the map is client-only. */
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[var(--color-canvas)] text-sm text-[var(--color-navy-400)]">
      Loading map…
    </div>
  ),
});

/** Opening position: a dense central Baltimore block, near Seton Hill. */
const DEFAULT_PROPOSED: SitePoint = { lng: -76.6205, lat: 39.2986 };

export default function PantryTwinApp() {
  const [proposed, setProposed] = useState<SitePoint>(DEFAULT_PROPOSED);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const [plan, setPlan] = useState<OperatingPlan>(DEFAULT_OPERATING_PLAN);
  const [assessment, setAssessment] = useState<SiteAssessmentResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Both panels are toggleable at every width so neither can become
  // unreachable on a smaller laptop or projector.
  const [showPlan, setShowPlan] = useState(true);
  const [showFindings, setShowFindings] = useState(true);

  useEffect(() => {
    // On a narrow viewport, start with the map unobstructed.
    if (window.innerWidth < 1280) setShowPlan(false);
    if (window.innerWidth < 1024) setShowFindings(false);
  }, []);

  const request = useMemo<SiteAssessmentRequest>(
    () => ({ proposed, referenceServiceId: referenceId, plan }),
    [proposed, referenceId, plan],
  );

  // Debounce so dragging a pin or sweeping a slider issues one request.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);

    timerRef.current = setTimeout(() => {
      const id = ++requestIdRef.current;
      fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
        .then(async (res) => {
          if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            throw new Error(detail.error ?? `Analysis failed (${res.status})`);
          }
          return res.json() as Promise<SiteAssessmentResult>;
        })
        .then((result) => {
          // Ignore responses from superseded requests.
          if (id !== requestIdRef.current) return;
          setAssessment(result);
          setError(null);
        })
        .catch((err: Error) => {
          if (id !== requestIdRef.current) return;
          setError(err.message);
        })
        .finally(() => {
          if (id === requestIdRef.current) setLoading(false);
        });
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [request]);

  const handleMove = useCallback((point: SitePoint) => {
    setProposed(point);
  }, []);

  const handleSelectReference = useCallback((id: string | null) => {
    setReferenceId(id);
    // The findings only make sense once they are visible.
    if (id) setShowFindings(true);
  }, []);

  const handleReset = useCallback(() => {
    setProposed(DEFAULT_PROPOSED);
    setReferenceId(null);
  }, []);

  // The map needs coordinates for the selected pantry, which only the server
  // can resolve from an id, so the pin follows the latest assessment.
  const referencePin: ReferencePin | null = useMemo(() => {
    const pantry = assessment?.reference?.pantry;
    if (!pantry || pantry.id !== referenceId) return null;
    return {
      id: pantry.id,
      name: pantry.name,
      lng: pantry.lng,
      lat: pantry.lat,
    };
  }, [assessment, referenceId]);

  const outsideCity = assessment && !assessment.proposed.withinCityBoundary;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-panel)] px-4 py-2">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-[var(--color-teal-600)]" aria-hidden />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[var(--color-navy-800)]">
              PantryTwin
              <span className="ml-1.5 font-normal text-[var(--color-navy-400)]">
                Would a new Baltimore pantry here add coverage?
              </span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              aria-pressed={showPlan}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                showPlan
                  ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
                  : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
              }`}
            >
              <PanelLeft size={12} aria-hidden /> Plan
            </button>
            <button
              type="button"
              onClick={() => setShowFindings((v) => !v)}
              aria-pressed={showFindings}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                showFindings
                  ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
                  : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
              }`}
            >
              <PanelRight size={12} aria-hidden /> Findings
            </button>
          </div>
          {outsideCity && (
            <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
              <TriangleAlert size={12} aria-hidden />
              Your pin is outside Baltimore City
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
              <TriangleAlert size={12} aria-hidden />
              {error}
            </span>
          )}
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

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${showPlan ? "block" : "hidden"} w-72 shrink-0 border-r border-[var(--color-hairline)]`}
        >
          <PlanPanel
            plan={plan}
            onChange={setPlan}
            proposed={proposed}
            referenceName={assessment?.reference?.pantry.name ?? null}
            onResetPlan={() => setPlan(DEFAULT_OPERATING_PLAN)}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <MapView
              proposed={proposed}
              reference={referencePin}
              catchmentRadiusMeters={plan.catchmentRadiusMeters}
              onMoveProposed={handleMove}
              onSelectReference={handleSelectReference}
              onReset={handleReset}
            />
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
            onClearReference={() => setReferenceId(null)}
          />
        </aside>
      </div>
    </div>
  );
}
