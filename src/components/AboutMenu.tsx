"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import { STATUS_META } from "@/lib/format";
import TracksBar from "@/components/TracksBar";

export default function AboutMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-navy-600)] hover:bg-[var(--color-teal-50)]"
      >
        <CircleHelp size={12} aria-hidden />
        About
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="About PantryTwin"
          className="absolute right-0 z-40 mt-1 w-80 rounded-md border border-[var(--color-hairline)] bg-white p-3 shadow-lg"
        >
          <p className="text-xs leading-snug text-[var(--color-navy-600)]">
            Compare a proposed Baltimore City pantry against a listed site using
            public data. Every number is labeled sourced, estimated, assumed, or
            unavailable.
          </p>
          <div className="mt-3 space-y-1.5">
            {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map(
              (status) => {
                const meta = STATUS_META[status];
                return (
                  <div key={status} className="flex gap-2">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
                      aria-hidden
                    />
                    <p className="text-[11px] leading-snug text-[var(--color-navy-500)]">
                      <span className={`font-semibold ${meta.text}`}>
                        {meta.label}.
                      </span>{" "}
                      {meta.description}
                    </p>
                  </div>
                );
              },
            )}
          </div>
          <div className="mt-3 border-t border-[var(--color-hairline)] pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)]">
              Built for
            </p>
            <TracksBar />
          </div>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[11px] text-[var(--color-teal-700)] underline"
          >
            System status
          </a>
        </div>
      )}
    </div>
  );
}
