/**
 * Prize targets for HopHacks Fall 2026.
 *
 * Tracks and branded prizes the app is aimed at. Listed only when the product
 * uses that sponsor or fits that track.
 */
export const TARGETED_PRIZES = [
  {
    id: "bloomberg",
    kind: "track" as const,
    label: "Bloomberg Philanthropy",
    detail: "Most Philanthropic Hack",
  },
  {
    id: "opef",
    kind: "prize" as const,
    label: "OPEF Environmental Intelligence",
    detail: "OPEF Environmental Intelligence Track",
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
    id: "godaddy",
    kind: "prize" as const,
    label: "GoDaddy",
    detail: "Domain for the running app",
  },
] as const;

export default function TracksBar({
  tone = "light",
}: {
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="sr-only">HopHacks targets</span>
      {TARGETED_PRIZES.map((prize) => (
        <span
          key={prize.id}
          title={prize.detail}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
            prize.kind === "track"
              ? dark
                ? "bg-[#ffb000] text-black"
                : "bg-[var(--color-navy-800)] text-white"
              : dark
                ? "border border-[#2a3340] bg-[#11161d] text-[#c5d0dc]"
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
