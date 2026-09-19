"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { SourceRecord } from "@/lib/contracts";

interface SourcesPayload {
  sources?: SourceRecord[];
  validation?: {
    blocked?: Array<{ id: string; message: string; landingUrl: string }>;
  } | null;
}

/**
 * Publisher landing links from the ingested manifest. URLs are never
 * hardcoded here: a missing manifest renders as unavailable.
 */
export default function SourcesBar() {
  const [sources, setSources] = useState<SourceRecord[] | null>(null);
  const [blocked, setBlocked] = useState<
    Array<{ id: string; message: string; landingUrl: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sources")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Source list failed (${res.status})`);
        return res.json() as Promise<SourcesPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setSources(payload.sources ?? []);
        setBlocked(payload.validation?.blocked ?? []);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setSources(null);
        setBlocked([]);
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-[10px] text-[var(--color-navy-400)]">
        Data source list unavailable.
      </p>
    );
  }

  if (sources === null) {
    return (
      <p className="text-[10px] text-[var(--color-navy-400)]">
        Loading data sources…
      </p>
    );
  }

  if (sources.length === 0 && blocked.length === 0) {
    return (
      <p className="text-[10px] italic text-[var(--color-navy-400)]">
        No source manifest found. Run <code>npm run ingest</code>.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)]">
        Data from
      </span>
      {sources.map((source) => (
        <a
          key={source.id}
          href={source.landingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`${source.title}. ${source.publisher}. Retrieved ${source.retrievedAt}.`}
          className="inline-flex items-center gap-0.5 rounded-full border border-[var(--color-hairline)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--color-navy-700)] hover:border-[var(--color-teal-600)] hover:text-[var(--color-teal-700)]"
        >
          {source.id}
          <ExternalLink size={9} aria-hidden />
          <span className="sr-only">
            {source.title} landing page, opens in a new tab
          </span>
        </a>
      ))}
      {blocked.map((item) => (
        <a
          key={`blocked-${item.id}`}
          href={item.landingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={item.message}
          className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:border-amber-400"
        >
          {item.id} unavailable
          <ExternalLink size={9} aria-hidden />
          <span className="sr-only">
            {item.id} was not ingested. Opens the publisher page in a new tab.
          </span>
        </a>
      ))}
    </div>
  );
}
