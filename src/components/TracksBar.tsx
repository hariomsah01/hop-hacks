/**
 * Prize targets for HopHacks Fall 2026.
 *
 * One track only (Bloomberg philanthropy). Branded prizes are listed only when
 * the app actually uses that sponsor. ElevenLabs, Backboard and GoDaddy stay
 * off this list until those features exist.
 */
export const TARGETED_PRIZES = [
  {
    id: "bloomberg",
    kind: "track" as const,
    label: "Bloomberg Philanthropy",
    detail: "Most Philanthropic Hack — our only track",
  },
  {
    id: "gemini",
    kind: "prize" as const,
    label: "Gemini API",
    detail: "Sourced AI explanation of the assessment",
  },
  {
    id: "auctor",
    kind: "prize" as const,
    label: "Auctor",
    detail: "Conversation to a downloadable action plan",
  },
  {
    id: "digitalocean",
    kind: "prize" as const,
    label: "DigitalOcean",
    detail: "Host the running app",
  },
] as const;

export default function TracksBar() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="sr-only">HopHacks targets</span>
      {TARGETED_PRIZES.map((prize) => (
        <span
          key={prize.id}
          title={prize.detail}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
            prize.kind === "track"
              ? "bg-[var(--color-navy-800)] text-white"
              : "border border-[var(--color-hairline)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
          }`}
        >
          {prize.kind === "track" ? "Track · " : ""}
          {prize.label}
        </span>
      ))}
    </div>
  );
}
