"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileJson } from "lucide-react";
import type { SiteAssessmentRequest } from "@/lib/contracts";
import { downloadAssessment } from "@/lib/export/clientDownload";

export default function ExportMenu({
  request,
  disabled,
}: {
  request: SiteAssessmentRequest;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"markdown" | "json" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  async function run(format: "markdown" | "json") {
    setBusy(format);
    try {
      await downloadAssessment(request, format);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md bg-[var(--color-teal-600)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--color-teal-700)] disabled:opacity-40"
      >
        <Download size={12} aria-hidden />
        {busy ? "Preparing…" : "Export"}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-48 rounded-md border border-[var(--color-hairline)] bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => void run("markdown")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-navy-700)] hover:bg-[var(--color-teal-50)]"
          >
            <Download size={12} aria-hidden />
            Action plan (Markdown)
          </button>
          <button
            type="button"
            onClick={() => void run("json")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-navy-700)] hover:bg-[var(--color-teal-50)]"
          >
            <FileJson size={12} aria-hidden />
            Assessment JSON
          </button>
        </div>
      )}
    </div>
  );
}
