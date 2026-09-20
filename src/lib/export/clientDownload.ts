import type { SiteAssessmentRequest } from "@/lib/contracts";

/** Browser-side download of the assessment export. */
export type ExportFormat = "markdown" | "json" | "pdf";

const FILENAME: Record<ExportFormat, string> = {
  markdown: "pantrytwin-action-plan.md",
  json: "pantrytwin-assessment.json",
  pdf: "pantrytwin-action-plan.pdf",
};

export async function downloadAssessment(
  request: SiteAssessmentRequest,
  format: ExportFormat,
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
  link.download = FILENAME[format];
  link.click();
  URL.revokeObjectURL(url);
}
