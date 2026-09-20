"use client";

import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  LoaderCircle,
  Send,
} from "lucide-react";
import type {
  SiteAssessmentRequest,
  SiteAssessmentResult,
  SourceRecord,
} from "@/lib/contracts";
import {
  STARTER_QUESTIONS,
  suggestedFollowUps,
} from "@/lib/ai/fallback";
import AssistantMarkdown from "./AssistantMarkdown";

interface AssistantAnswer {
  status: "ok" | "unconfigured" | "error";
  text: string;
  toolCalls: Array<{ name: string; ok: boolean; error?: string }>;
  model: string | null;
  warning: string | null;
}

export type InspectorTab = "explanation" | "sources" | "limitations";


const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Calendar date from an ISO timestamp. The raw string is kept if it is not a date. */
function formatRetrievedDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function SourceRow({ source }: { source: SourceRecord }) {
  const retrieved = formatRetrievedDate(source.retrievedAt);
  return (
    <li className="border-b border-[var(--color-hairline)] py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug text-[var(--color-navy-800)]">
            {source.title}
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--color-navy-500)]">
            {source.publisher}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={source.landingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-navy-600)] hover:border-[var(--color-teal-600)] hover:bg-[var(--color-teal-50)] hover:text-[var(--color-teal-700)]"
          >
            Open
            <ExternalLink size={10} aria-hidden />
          </a>
          {source.downloadUrl && (
            <a
              href={source.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-hairline)] px-2 py-1 text-[11px] font-medium text-[var(--color-navy-600)] hover:border-[var(--color-teal-600)] hover:bg-[var(--color-teal-50)] hover:text-[var(--color-teal-700)]"
            >
              Download
              <ExternalLink size={10} aria-hidden />
            </a>
          )}
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)]">
            Vintage
          </dt>
          <dd className="mt-0.5 text-[11px] leading-snug text-[var(--color-navy-600)]">
            {source.dataVintage}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)]">
            Geography
          </dt>
          <dd className="mt-0.5 text-[11px] leading-snug text-[var(--color-navy-600)]">
            {source.geographicVintage}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-navy-400)]">
            Retrieved
          </dt>
          <dd className="mt-0.5 text-[11px] tabular-nums text-[var(--color-navy-600)]">
            {retrieved}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export default function ExplanationPanel({
  assessment,
  request,
  tab,
  onTabChange,
}: {
  assessment: SiteAssessmentResult | null;
  request: SiteAssessmentRequest;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
}) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [askedHistory, setAskedHistory] = useState<string[]>([]);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [asked, asking, answer]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2 || asking) return;
    setAsking(true);
    setAsked(trimmed);
    setAskedHistory((prev) => [...prev, trimmed]);
    setQuestion("");
    setAnswer({
      status: "ok",
      text: "",
      toolCalls: [],
      model: null,
      warning: null,
    });
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, request }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        setAnswer((await res.json()) as AssistantAnswer);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("The explanation stream did not start.");
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part
            .split("\n")
            .filter((row) => row.startsWith("data:"))
            .map((row) => row.slice(5).trim())
            .join("");
          if (!line) continue;
          const event = JSON.parse(line) as {
            type: string;
            text?: string;
            status?: AssistantAnswer["status"];
            model?: string | null;
            toolCalls?: AssistantAnswer["toolCalls"];
            warning?: string | null;
          };
          if (event.type === "token" && event.text) {
            assembled += event.text;
            setAnswer({
              status: "ok",
              text: assembled,
              toolCalls: [],
              model: null,
              warning: null,
            });
          }
          if (event.type === "done" && event.text) {
            assembled = event.text;
            setAnswer({
              status: event.status ?? "ok",
              text: event.text,
              toolCalls: event.toolCalls ?? [],
              model: event.model ?? null,
              warning: event.warning ?? null,
            });
          }
        }
      }
    } catch (err) {
      setAnswer({
        status: "error",
        text: "The explanation request did not complete. The analysis is unaffected.",
        toolCalls: [],
        model: null,
        warning: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAsking(false);
    }
  }

  const tabs: Array<[InspectorTab, string]> = [
    ["explanation", "Ask"],
    ["sources", "Sources"],
  ];

  const ready = Boolean(assessment) && !asking;
  const chips = asked
    ? suggestedFollowUps(asked, askedHistory)
    : STARTER_QUESTIONS;

  return (
    <div className="flex h-full flex-col bg-[var(--color-panel)]">
      <div className="flex items-center border-b border-[var(--color-hairline)] px-3">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`border-b-2 px-3 py-2 text-xs font-medium transition ${
              tab === key
                ? "border-[var(--color-teal-600)] text-[var(--color-teal-700)]"
                : "border-transparent text-[var(--color-navy-400)] hover:text-[var(--color-navy-600)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "explanation" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={threadRef}
            className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            {!asked && !asking && (
              <div className="mb-3 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2.5">
                <p className="text-xs font-medium text-[var(--color-navy-800)]">
                  Ask about this pin
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--color-navy-500)]">
                  Ask about people in this ring, listed pantries nearby, or what
                  the public data does not publish.
                </p>
              </div>
            )}

            {asked && (
              <div className="mb-3 flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-navy-800)] px-3 py-2 text-xs leading-relaxed text-white">
                  {asked}
                </p>
              </div>
            )}

            {asking && !answer?.text && (
              <div className="rounded-lg border border-[var(--color-hairline)] bg-white px-3.5 py-3">
                <p className="flex items-center gap-2 text-[11px] text-[var(--color-navy-500)]">
                  <LoaderCircle
                    size={12}
                    className="animate-spin text-[var(--color-teal-600)]"
                    aria-hidden
                  />
                  Reading this pin…
                </p>
              </div>
            )}

            {answer?.text && (
              <div className="rounded-lg border border-[var(--color-hairline)] bg-white px-3.5 py-3">
                <AssistantMarkdown text={answer.text} />
                {asking && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-navy-400)]">
                    <LoaderCircle
                      size={11}
                      className="animate-spin text-[var(--color-teal-600)]"
                      aria-hidden
                    />
                    Still writing…
                  </p>
                )}
                {!asking && answer.warning && (
                  <p className="mt-2 text-[11px] leading-snug text-[var(--color-navy-400)]">
                    {answer.warning}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--color-hairline)] bg-[var(--color-panel)] px-3 py-2.5">
            {chips.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {chips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      void ask(s);
                    }}
                    disabled={!ready}
                    className="rounded-full border border-[var(--color-hairline)] px-2.5 py-1 text-[11px] text-[var(--color-navy-500)] hover:border-[var(--color-teal-600)] hover:bg-[var(--color-teal-50)] hover:text-[var(--color-teal-700)] disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="flex items-end gap-2"
            >
              <label className="sr-only" htmlFor="assistant-question">
                Ask a question about this assessment
              </label>
              <textarea
                id="assistant-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                placeholder="Ask about this site, the data, or how to use the pin…"
                rows={2}
                maxLength={1000}
                className="min-h-10 flex-1 resize-none rounded-xl border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-xs leading-relaxed outline-none focus:border-[var(--color-teal-600)] focus:bg-white focus:ring-1 focus:ring-[var(--color-teal-600)]"
              />
              <button
                type="submit"
                disabled={!ready || question.trim().length < 2}
                className="flex h-10 items-center gap-1.5 rounded-xl bg-[var(--color-navy-800)] px-3.5 text-xs font-semibold text-white hover:bg-[var(--color-navy-600)] disabled:opacity-40"
              >
                <Send size={13} aria-hidden />
                {asking ? "Sending" : "Ask"}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="panel-scroll flex-1 overflow-y-auto px-5 py-4 pb-6">
          {tab === "sources" && (
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-[var(--color-navy-800)]">
                  Datasets in this assessment
                </p>
                {assessment && assessment.sources.length > 0 && (
                  <p className="text-[11px] tabular-nums text-[var(--color-navy-400)]">
                    {assessment.sources.length} sources
                  </p>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-navy-500)]">
                Public records used for this pin. A field the publisher does not
                report is shown as Unavailable.
              </p>
              {assessment && assessment.sources.length > 0 ? (
                <ul className="mt-3">
                  {assessment.sources.map((source) => (
                    <SourceRow key={source.id} source={source} />
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-[11px] text-[var(--color-navy-400)]">
                  No source catalog is loaded.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
