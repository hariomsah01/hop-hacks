import type { SiteAssessmentRequest } from "@/lib/contracts";

/** Browser-side download of the assessment export. */
export async function downloadAssessment(
  request: SiteAssessmentRequest,
  format: "markdown" | "json",
): Promise<void> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request, format }),
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    format === "json" ? "pantrytwin-assessment.json" : "pantrytwin-action-plan.md";
  link.click();
  URL.revokeObjectURL(url);
}
