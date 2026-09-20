"use client";

import { X } from "lucide-react";
import { STATUS_META } from "@/lib/format";
import TracksBar from "@/components/TracksBar";

export default function AboutPanel({
  onClose,
  tone = "light",
}: {
  onClose: () => void;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  return (
    <div
      className={`flex h-full flex-col ${
        dark ? "bg-[#0d1117] font-mono" : "bg-[var(--color-panel)]"
      }`}
    >
      <header
        className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 ${
          dark ? "border-[#1c2430]" : "border-[var(--color-hairline)]"
        }`}
      >
        <div>
          <h2
            id="about-drawer-title"
            className={`text-sm font-semibold ${
              dark ? "text-[#ffb000]" : "text-[var(--color-navy-800)]"
            }`}
          >
            About
          </h2>
          <p
            className={`mt-0.5 text-[11px] ${
              dark ? "text-[#7d8b9a]" : "text-[var(--color-navy-400)]"
            }`}
          >
            PantryTwin for Baltimore City
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={
            dark
              ? "rounded-md p-1 text-[#7d8b9a] hover:bg-[#11161d] hover:text-[#ffb000]"
              : "rounded-md p-1 text-[var(--color-navy-400)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-navy-800)]"
          }
        >
          <X size={16} aria-hidden />
          <span className="sr-only">Close about</span>
        </button>
      </header>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p
          className={`text-xs leading-relaxed ${
            dark ? "text-[#c5d0dc]" : "text-[var(--color-navy-600)]"
          }`}
        >
          Place a pin to explore where a food pantry could serve people. PantryTwin
          reads public Baltimore City data for that point and labels every figure
          as sourced, estimated, assumed, or unavailable so the evidence stays
          clear.
        </p>

        <h3
          className={`mt-4 text-[11px] font-semibold uppercase tracking-wider ${
            dark ? "text-[#7d8b9a]" : "text-[var(--color-navy-400)]"
          }`}
        >
          Labels
        </h3>
        <div className="mt-1 space-y-2">
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map(
            (status) => {
              const meta = STATUS_META[status];
              return (
                <div key={status} className="flex gap-2">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`}
                    aria-hidden
                  />
                  <p
                    className={`text-[11px] leading-snug ${
                      dark ? "text-[#9aa8b6]" : "text-[var(--color-navy-500)]"
                    }`}
                  >
                    <span className={`font-semibold ${meta.text}`}>
                      {meta.label}.
                    </span>{" "}
                    {status === "assumed"
                      ? "A planning input you set for this pin."
                      : status === "unavailable"
                        ? "Shown when a public source leaves this field blank."
                        : meta.description}
                  </p>
                </div>
              );
            },
          )}
        </div>

        <h3
          className={`mt-4 text-[11px] font-semibold uppercase tracking-wider ${
            dark ? "text-[#7d8b9a]" : "text-[var(--color-navy-400)]"
          }`}
        >
          Built for
        </h3>
        <div className="mt-1.5">
          <TracksBar tone={tone} />
        </div>

        <a
          href="/api/health"
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-4 inline-block text-[11px] underline ${
            dark ? "text-[#3ee0d8]" : "text-[var(--color-teal-700)]"
          }`}
        >
          System status
        </a>
      </div>
    </div>
  );
}
