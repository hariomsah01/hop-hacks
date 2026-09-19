"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Network,
  PanelRight,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  DEFAULT_OPERATING_PLAN,
  type SiteAssessmentRequest,
  type SiteAssessmentResult,
} from "@/lib/contracts";
import type { ReferencePin, SitePoint } from "@/components/map/MapView";
import AboutMenu from "@/components/AboutMenu";
import ExportMenu from "@/components/ExportMenu";
import StatusBar from "@/components/StatusBar";
import NetworkTwin from "@/components/network/NetworkTwin";
import ExplanationPanel, {
  type InspectorTab,
} from "@/components/planning/ExplanationPanel";
import FindingsPanel from "@/components/planning/FindingsPanel";

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

function PanelToggle({
  pressed,
  onClick,
  icon: Icon,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  icon: typeof PanelRight;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
        pressed
          ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
          : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
      }`}
    >
      <Icon size={12} aria-hidden />
      {label}
    </button>
  );
}

/** Site planner no longer mounts a Plan panel; analysis uses DEFAULT_OPERATING_PLAN. */
export default function PantryTwinApp() {
  const [mode, setMode] = useState<"planner" | "network">("planner");
  const [proposed, setProposed] = useState<SitePoint>(DEFAULT_PROPOSED);
  const [referenceId, setReferenceId] = useState<string | null>(null);
  const plan = DEFAULT_OPERATING_PLAN;
  const [assessment, setAssessment] = useState<SiteAssessmentResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFindings, setShowFindings] = useState(true);
  const [showAssistant, setShowAssistant] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("explanation");

  const request = useMemo<SiteAssessmentRequest>(
    () => ({ proposed, referenceServiceId: referenceId, plan }),
    [proposed, referenceId, plan],
  );

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
    if (id) setShowFindings(true);
  }, []);

  const handleReset = useCallback(() => {
    setProposed(DEFAULT_PROPOSED);
    setReferenceId(null);
  }, []);

  const openSources = useCallback(() => {
    setInspectorTab("sources");
    setShowAssistant(true);
  }, []);

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
  const planner = mode === "planner";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-panel)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin
            size={16}
            className="shrink-0 text-[var(--color-teal-600)]"
            aria-hidden
          />
          <div className="min-w-0 leading-tight">
            <h1 className="text-sm font-semibold tracking-tight text-[var(--color-navy-800)]">
              PantryTwin
            </h1>
            <p className="truncate text-[11px] text-[var(--color-navy-400)]">
              {planner
                ? "Baltimore City pantry siting"
                : "Baltimore City pantry network"}
            </p>
          </div>
        </div>

        <div
          className="flex rounded-lg border border-[var(--color-hairline)] bg-[var(--color-canvas)] p-0.5"
          role="tablist"
          aria-label="PantryTwin mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={planner}
            onClick={() => setMode("planner")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              planner
                ? "bg-white text-[var(--color-teal-700)] shadow-sm"
                : "text-[var(--color-navy-500)] hover:text-[var(--color-navy-800)]"
            }`}
          >
            <MapPin size={12} aria-hidden />
            Site planner
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!planner}
            onClick={() => setMode("network")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              !planner
                ? "bg-white text-[var(--color-reference-600)] shadow-sm"
                : "text-[var(--color-navy-500)] hover:text-[var(--color-navy-800)]"
            }`}
          >
            <Network size={12} aria-hidden />
            Network twin
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {planner && outsideCity && (
            <span className="hidden items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 sm:flex">
              <TriangleAlert size={12} aria-hidden />
              Outside city
            </span>
          )}
          {planner && error && (
            <span className="hidden max-w-48 truncate items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 md:flex">
              <TriangleAlert size={12} aria-hidden />
              {error}
            </span>
          )}
          {planner && (
            <div className="flex gap-1">
              <PanelToggle
                pressed={showFindings}
                onClick={() => setShowFindings((v) => !v)}
                icon={PanelRight}
                label="Analysis"
              />
              <PanelToggle
                pressed={showAssistant}
                onClick={() => setShowAssistant((v) => !v)}
                icon={Sparkles}
                label="Ask"
              />
            </div>
          )}
          {planner && <ExportMenu request={request} disabled={!assessment} />}
          <AboutMenu />
        </div>
      </header>

      {mode === "network" ? (
        <div className="min-h-0 flex-1">
          <NetworkTwin />
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
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
              {showAssistant && (
                <div className="h-64 shrink-0 border-t border-[var(--color-hairline)]">
                  <ExplanationPanel
                    assessment={assessment}
                    request={request}
                    tab={inspectorTab}
                    onTabChange={setInspectorTab}
                  />
                </div>
              )}
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

          <StatusBar
            lat={proposed.lat}
            lng={proposed.lng}
            catchmentRadiusMeters={plan.catchmentRadiusMeters}
            assessment={assessment}
            loading={loading}
            onOpenSources={openSources}
          />
        </>
      )}
    </div>
  );
}
