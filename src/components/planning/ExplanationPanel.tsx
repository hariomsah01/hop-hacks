"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Send,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type {
  SiteAssessmentRequest,
  SiteAssessmentResult,
} from "@/lib/contracts";

interface AssistantAnswer {
  status: "ok" | "unconfigured" | "error";
  text: string;
  toolCalls: Array<{ name: string; ok: boolean; error?: string }>;
  model: string | null;
  warning: string | null;
}

export type InspectorTab = "explanation" | "sources" | "limitations";

const SUGGESTED = [
  "Would opening here add coverage, or duplicate what is already there?",
  "What limits how many households my plan can serve?",
  "What does this analysis not know?",
];

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
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed, request }),
      });
      setAnswer((await res.json()) as AssistantAnswer);
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
    ["limitations", "Limits"],
  ];

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

      <div className="panel-scroll flex-1 overflow-y-auto px-3 py-2.5">
        {tab === "explanation" && (
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
              className="flex gap-1.5"
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about this site…"
                aria-label="Ask a question about this assessment"
                maxLength={1000}
                className="flex-1 rounded-md border border-[var(--color-hairline)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-teal-600)] focus:ring-1 focus:ring-[var(--color-teal-600)]"
              />
              <button
                type="submit"
                disabled={asking || !assessment || question.trim().length < 3}
                className="flex items-center gap-1 rounded-md bg-[var(--color-navy-800)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-navy-600)] disabled:opacity-40"
              >
                <Send size={12} aria-hidden />
                {asking ? "Thinking…" : "Ask"}
              </button>
            </form>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQuestion(s);
                    void ask(s);
                  }}
                  disabled={asking || !assessment}
                  className="rounded-full border border-[var(--color-hairline)] px-2 py-0.5 text-[11px] text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)] disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>

            {answer && (
              <div className="mt-3">
                {answer.status !== "ok" && (
                  <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      {answer.status === "unconfigured"
                        ? "No Gemini API key is configured. The analysis still runs."
                        : `The assistant could not answer. ${answer.warning ?? ""}`}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Sparkles
                    size={14}
                    className="mt-0.5 shrink-0 text-[var(--color-teal-600)]"
                    aria-hidden
                  />
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-navy-800)]">
                    {answer.text}
                  </p>
                </div>
                {answer.toolCalls.length > 0 && (
                  <p className="mt-2 text-[11px] text-[var(--color-navy-400)]">
                    Evidence: {answer.toolCalls.map((c) => c.name).join(", ")}
                    {answer.model ? ` · ${answer.model}` : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "sources" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {assessment?.sources.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-[var(--color-hairline)] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <code className="rounded bg-[var(--color-teal-50)] px-1 py-0.5 text-[10px] font-semibold text-[var(--color-teal-700)]">
                    {s.id}
                  </code>
                  <span className="text-[11px] font-semibold text-[var(--color-navy-800)]">
                    {s.title}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-[var(--color-navy-500)]">
                  <div>{s.publisher}</div>
                  <div>{s.dataVintage}</div>
                  <div>Retrieved {s.retrievedAt}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                    <a
                      href={s.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[var(--color-teal-700)] underline"
                    >
                      Publisher page
                      <ExternalLink size={9} aria-hidden />
                    </a>
                    {s.downloadUrl && (
                      <a
                        href={s.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[var(--color-teal-700)] underline"
                      >
                        Direct download
                        <ExternalLink size={9} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!assessment || assessment.sources.length === 0) && (
              <p className="text-[11px] italic text-[var(--color-navy-400)]">
                No source catalog is loaded.
              </p>
            )}
          </div>
        )}

        {tab === "limitations" && (
          <ul className="space-y-1.5">
            {assessment?.limitations.map((l) => (
              <li
                key={l}
                className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-navy-600)]"
              >
                <AlertTriangle
                  size={12}
                  className="mt-0.5 shrink-0 text-[var(--color-status-assumed)]"
                  aria-hidden
                />
                {l}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
