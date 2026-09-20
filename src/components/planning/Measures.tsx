"use client";

import type { Measure } from "@/lib/contracts";
import { STATUS_META, formatMeasure } from "@/lib/format";

/** Small provenance chip. Every number on screen carries one. */
export function StatusBadge({
  measure,
  compact = false,
}: {
  measure: Measure;
  compact?: boolean;
}) {
  const meta = STATUS_META[measure.status];
  const title = `${meta.label}. ${meta.description}${measure.sourceIds.length ? ` Sources: ${measure.sourceIds.join(", ")}.` : ""}${measure.note ? ` ${measure.note}` : ""}`;
  if (compact) {
    return (
      <span
        title={title}
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
        aria-label={meta.label}
      />
    );
  }
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.bg} ${meta.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

export function MeasureValue({
  measure,
  emphasis = false,
}: {
  measure: Measure;
  emphasis?: boolean;
}) {
  const unavailable = measure.value === null;
  if (unavailable) {
    return (
      <span className="text-sm italic text-[var(--color-status-unavailable)]">
        {formatMeasure(measure)}
      </span>
    );
  }
  return (
    <span
      className={`font-semibold tabular-nums text-[var(--color-navy-800)] ${
        emphasis ? "text-xl" : "text-sm"
      }`}
    >
      {formatMeasure(measure)}
    </span>
  );
}

/** One label plus one value. Used for everything about the proposed site. */
export function MetricRow({
  label,
  measure,
  hint,
  compact = false,
}: {
  label: string;
  measure: Measure;
  hint?: string | null;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] py-2 last:border-b-0">
        <span className="text-xs text-[var(--color-navy-600)]">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          <MeasureValue measure={measure} />
          <StatusBadge measure={measure} compact />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-hairline)] py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-navy-600)]">
          {label}
        </span>
        <StatusBadge measure={measure} />
      </div>
      <div className="mt-0.5">
        <MeasureValue measure={measure} />
      </div>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Proposed alongside reference.
 *
 * Reserved for reach, which is the only thing both sites can honestly be
 * measured on. Operating metrics have no reference column because the real
 * pantry's capacity is not published.
 */
export function SideBySideRow({
  label,
  proposed,
  reference,
  referenceName,
  hint,
}: {
  label: string;
  proposed: Measure;
  reference: Measure;
  referenceName: string | null;
  hint?: string | null;
}) {
  return (
    <div className="border-b border-[var(--color-hairline)] py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-navy-600)]">
          {label}
        </span>
        <StatusBadge
          measure={proposed.status === "unavailable" ? reference : proposed}
        />
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-[var(--color-proposed-100)] px-2 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-proposed-600)]">
            Your site
          </div>
          <MeasureValue measure={proposed} />
        </div>
        <div className="rounded-md bg-[var(--color-reference-100)] px-2 py-1.5">
          <div
            className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--color-reference-600)]"
            title={referenceName ?? undefined}
          >
            {referenceName ?? "No pantry selected"}
          </div>
          <MeasureValue measure={reference} />
        </div>
      </div>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--color-navy-400)]">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SectionTitle({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-navy-500)]">
        {children}
      </h3>
      {trailing}
    </div>
  );
}
