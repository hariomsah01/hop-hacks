"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartColumn,
  CircleHelp,
  Download,
  MapPin,
  PanelRight,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  DEFAULT_OPERATING_PLAN,
  type SiteAssessmentRequest,
  type SiteAssessmentResult,
} from "@/lib/contracts";
import type { SitePoint } from "@/components/map/MapView";
import AboutPanel from "@/components/AboutMenu";
import AnalyticsView from "@/components/analytics/AnalyticsView";
import ExportPanel from "@/components/ExportMenu";
import StatusBar from "@/components/StatusBar";
import ExplanationPanel, {
  type InspectorTab,
} from "@/components/planning/ExplanationPanel";
import FindingsPanel from "@/components/planning/FindingsPanel";

type AppView = "map" | "analytics";
type SidePanel = "analysis" | "export" | "about" | null;

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
  tone = "light",
}: {
  pressed: boolean;
  onClick: () => void;
  icon: typeof PanelRight;
  label: string;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition ${
        dark
          ? pressed
            ? "border-[#ffb000] bg-[#ffb000] text-black"
            : "border-[#2a3340] text-[#c5d0dc] hover:border-[#ffb000] hover:text-[#ffb000]"
          : pressed
            ? "border-[var(--color-teal-600)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
            : "border-[var(--color-hairline)] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)]"
      }`}
    >
      <Icon size={12} aria-hidden />
      {label}
    </button>
  );
}

/** Analysis uses DEFAULT_OPERATING_PLAN; the Plan panel is not mounted. */
export default function PantryTwinApp() {
  const [view, setView] = useState<AppView>("map");
  const [proposed, setProposed] = useState<SitePoint>(DEFAULT_PROPOSED);
  const [radiusMeters, setRadiusMeters] = useState(
    DEFAULT_OPERATING_PLAN.catchmentRadiusMeters,
  );
  const plan = useMemo(
    () => ({
      ...DEFAULT_OPERATING_PLAN,
      catchmentRadiusMeters: radiusMeters,
    }),
    [radiusMeters],
  );
  const [assessment, setAssessment] = useState<SiteAssessmentResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("explanation");

  const toggleSide = useCallback((panel: Exclude<SidePanel, null>) => {
    setSidePanel((current) => (current === panel ? null : panel));
  }, []);

  const request = useMemo<SiteAssessmentRequest>(
    () => ({ proposed, referenceServiceId: null, plan }),
    [proposed, plan],
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

  const handleReset = useCallback(() => {
    setProposed(DEFAULT_PROPOSED);
    setRadiusMeters(DEFAULT_OPERATING_PLAN.catchmentRadiusMeters);
  }, []);

  useEffect(() => {
    if (!sidePanel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidePanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidePanel]);

  const openSources = useCallback(() => {
    setInspectorTab("sources");
    setShowAssistant(true);
  }, []);

  const outsideCity = assessment && !assessment.proposed.withinCityBoundary;
  const onMap = view === "map";

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${onMap ? "" : "analytics-shell"}`}>
      <header
        className={`z-20 flex h-12 shrink-0 items-center gap-3 border-b px-3 ${
          onMap
            ? "border-[var(--color-hairline)] bg-[var(--color-panel)]"
            : "border-[#1c2430] bg-[#07090d]"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MapPin
            size={16}
            className={`shrink-0 ${onMap ? "text-[var(--color-teal-600)]" : "text-[#ffb000]"}`}
            aria-hidden
          />
          <div className="min-w-0 leading-tight">
            <h1
              className={`text-sm font-semibold tracking-tight ${
                onMap ? "text-[var(--color-navy-800)]" : "font-mono text-[#ffb000]"
              }`}
            >
              PantryTwin
            </h1>
            {!onMap && (
              <p className="truncate font-mono text-[11px] text-[#7d8b9a]">
                Predicted baseline and new-location scenarios
              </p>
            )}
          </div>
        </div>

        <div
          className={`flex rounded-lg border p-0.5 ${
            onMap
              ? "border-[var(--color-hairline)] bg-[var(--color-canvas)]"
              : "border-[#2a3340] bg-[#0d1117]"
          }`}
          role="tablist"
          aria-label="PantryTwin views"
        >
          <button
            type="button"
            role="tab"
            id="view-tab-map"
            aria-selected={onMap}
            aria-controls="view-panel-map"
            onClick={() => setView("map")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              onMap
                ? "bg-white text-[var(--color-teal-700)] shadow-sm"
                : "text-[#7d8b9a] hover:text-[#ffb000]"
            }`}
          >
            <MapPin size={12} aria-hidden />
            Map
          </button>
          <button
            type="button"
            role="tab"
            id="view-tab-analytics"
            aria-selected={!onMap}
            aria-controls="view-panel-analytics"
            onClick={() => setView("analytics")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              !onMap
                ? "bg-[#ffb000] text-black"
                : "text-[var(--color-navy-500)] hover:text-[var(--color-navy-800)]"
            }`}
          >
            <ChartColumn size={12} aria-hidden />
            Analytics
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {onMap && outsideCity && (
            <span className="hidden items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 sm:flex">
              <TriangleAlert size={12} aria-hidden />
              Outside city
            </span>
          )}
          {onMap && error && (
            <span className="hidden max-w-48 truncate items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800 md:flex">
              <TriangleAlert size={12} aria-hidden />
              {error}
            </span>
          )}
          <div className="flex gap-1">
            {onMap && (
              <>
                <PanelToggle
                  pressed={sidePanel === "analysis"}
                  onClick={() => toggleSide("analysis")}
                  icon={PanelRight}
                  label="Statistics"
                />
                <PanelToggle
                  pressed={showAssistant}
                  onClick={() => setShowAssistant((v) => !v)}
                  icon={Sparkles}
                  label="Ask"
                />
                <PanelToggle
                  pressed={sidePanel === "export"}
                  onClick={() => toggleSide("export")}
                  icon={Download}
                  label="Export"
                />
              </>
            )}
            <PanelToggle
              pressed={sidePanel === "about"}
              onClick={() => toggleSide("about")}
              icon={CircleHelp}
              label="About"
              tone={onMap ? "light" : "dark"}
            />
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {onMap ? (
          <div
            id="view-panel-map"
            role="tabpanel"
            aria-labelledby="view-tab-map"
            className="flex h-full min-h-0 flex-col"
          >
            <div className="flex min-h-0 flex-1">
              <main className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <MapView
                    proposed={proposed}
                    catchmentRadiusMeters={plan.catchmentRadiusMeters}
                    onMoveProposed={handleMove}
                    onChangeRadius={setRadiusMeters}
                    onReset={handleReset}
                  />
                </div>
                {showAssistant && (
                  <div className="relative z-30 h-[min(32rem,54vh)] shrink-0 overflow-hidden border-t border-[var(--color-hairline)] bg-[var(--color-panel)]">
                    <ExplanationPanel
                      assessment={assessment}
                      request={request}
                      tab={inspectorTab}
                      onTabChange={setInspectorTab}
                    />
                  </div>
                )}
              </main>
            </div>
            <StatusBar
              lat={proposed.lat}
              lng={proposed.lng}
              catchmentRadiusMeters={plan.catchmentRadiusMeters}
              assessment={assessment}
              loading={loading}
              onOpenSources={openSources}
            />
          </div>
        ) : (
          <div
            id="view-panel-analytics"
            role="tabpanel"
            aria-labelledby="view-tab-analytics"
            className="h-full min-h-0"
          >
            <AnalyticsView
              proposed={proposed}
              catchmentRadiusMeters={plan.catchmentRadiusMeters}
            />
          </div>
        )}

        <aside
          id="side-drawer"
          role="dialog"
          aria-modal="false"
          aria-labelledby={
            sidePanel === "export"
              ? "export-drawer-title"
              : sidePanel === "about"
                ? "about-drawer-title"
                : "analysis-drawer-title"
          }
          aria-hidden={!sidePanel}
          inert={!sidePanel}
          className={`absolute inset-y-0 right-0 z-20 flex w-[22.5rem] max-w-full flex-col border-l transition-transform duration-300 ease-out motion-reduce:transition-none ${
            onMap
              ? "border-[var(--color-hairline)] bg-[var(--color-panel)] shadow-[-12px_0_32px_rgb(15_37_64_/_0.12)]"
              : "border-[#1c2430] bg-[#0d1117] shadow-[-12px_0_32px_rgb(0_0_0_/_0.45)]"
          } ${
            sidePanel
              ? "translate-x-0 pointer-events-auto"
              : "translate-x-full pointer-events-none"
          }`}
        >
          {sidePanel === "export" ? (
            <ExportPanel
              request={request}
              disabled={!assessment}
              onClose={() => setSidePanel(null)}
            />
          ) : sidePanel === "about" ? (
            <AboutPanel
              onClose={() => setSidePanel(null)}
              tone={onMap ? "light" : "dark"}
            />
          ) : (
            <FindingsPanel
              assessment={assessment}
              loading={loading}
              onClose={() => setSidePanel(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
