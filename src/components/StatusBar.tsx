"use client";

import type { SiteAssessmentResult } from "@/lib/contracts";

function formatRetrieved(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

export default function StatusBar({
  lat,
  lng,
  catchmentRadiusMeters,
  assessment,
  loading,
  onOpenSources,
}: {
  lat: number;
  lng: number;
  catchmentRadiusMeters: number;
  assessment: SiteAssessmentResult | null;
  loading: boolean;
  onOpenSources: () => void;
}) {
  const sourceCount = assessment?.sources.length ?? 0;
  const retrieved = assessment?.sources[0]?.retrievedAt;
  const vintage = retrieved ? formatRetrieved(retrieved) : null;
  const km = catchmentRadiusMeters / 1000;
  const radiusLabel =
    Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;

  return (
    <div className="flex min-h-7 shrink-0 items-center gap-3 overflow-x-auto border-t border-[var(--color-hairline)] bg-[var(--color-panel)] px-3 py-1 text-[11px] text-[var(--color-navy-500)]">
      <span className="shrink-0 font-mono tabular-nums text-[var(--color-navy-700)]">
        {formatCoord(lat, lng)}
      </span>
      <span className="h-3 w-px shrink-0 bg-[var(--color-hairline)]" aria-hidden />
      <span className="shrink-0">
        {radiusLabel} straight-line catchment
      </span>
      <span className="h-3 w-px shrink-0 bg-[var(--color-hairline)]" aria-hidden />
      <button
        type="button"
        onClick={onOpenSources}
        className="shrink-0 text-[var(--color-teal-700)] hover:underline"
      >
        {sourceCount > 0 ? `${sourceCount} sources` : "Sources"}
      </button>
      {vintage && <span className="shrink-0 text-[var(--color-navy-400)]">as of {vintage}</span>}
      <span className="ml-auto shrink-0 tabular-nums">
        {loading ? "Updating…" : "Baltimore City"}
      </span>
    </div>
  );
}
