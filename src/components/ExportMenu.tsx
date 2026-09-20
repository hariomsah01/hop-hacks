"use client";

import { useState } from "react";
import { Download, FileJson, FileText, X } from "lucide-react";
import type { SiteAssessmentRequest } from "@/lib/contracts";
import {
  downloadAssessment,
  type ExportFormat,
} from "@/lib/export/clientDownload";

const OPTIONS: Array<{
  format: ExportFormat;
  label: string;
  detail: string;
  icon: typeof Download;
}> = [
  {
    format: "pdf",
    label: "PDF",
    detail: "Action plan for this pin",
    icon: FileText,
  },
  {
    format: "markdown",
    label: "Markdown",
    detail: "Same plan as plain text",
    icon: Download,
  },
  {
    format: "json",
    label: "JSON",
    detail: "Full labeled assessment",
    icon: FileJson,
  },
];

export default function ExportPanel({
  request,
  disabled,
  onClose,
}: {
  request: SiteAssessmentRequest;
  disabled: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: ExportFormat) {
    if (disabled || busy) return;
    setBusy(format);
    setError(null);
    try {
      await downloadAssessment(request, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-panel)]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-4 py-3">
        <div>
          <h2
            id="export-drawer-title"
            className="text-sm font-semibold text-[var(--color-navy-800)]"
          >
            Export
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-navy-400)]">
            Same numbers as Statistics, ready to download.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--color-navy-400)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-navy-800)]"
        >
          <X size={16} aria-hidden />
          <span className="sr-only">Close export</span>
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {disabled ? (
          <p className="text-xs text-[var(--color-navy-400)]">
            Wait for this pin&apos;s analysis to finish, then download.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = busy === option.format;
              return (
                <li key={option.format}>
                  <button
                    type="button"
                    onClick={() => void run(option.format)}
                    disabled={busy !== null}
                    className="flex w-full items-center gap-3 rounded-lg border border-[var(--color-hairline)] px-3 py-2.5 text-left hover:border-[var(--color-teal-600)] hover:bg-[var(--color-teal-50)] disabled:opacity-50"
                  >
                    <Icon
                      size={16}
                      className="shrink-0 text-[var(--color-teal-700)]"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-[var(--color-navy-800)]">
                        {active ? "Preparing…" : option.label}
                      </span>
                      <span className="block text-[11px] text-[var(--color-navy-400)]">
                        {option.detail}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p className="mt-3 text-[11px] text-red-700">{error}</p>
        )}
      </div>
    </div>
  );
}
