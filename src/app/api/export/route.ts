import { NextResponse } from "next/server";
import { z } from "zod";
import { SiteAssessmentRequestSchema } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { buildActionPlanMarkdown } from "@/lib/export/actionPlan";
import { buildActionPlanPdf } from "@/lib/export/pdf";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  request: SiteAssessmentRequestSchema,
  format: z.enum(["markdown", "json", "pdf"]).default("markdown"),
});

/**
 * Downloadable action plan. It is rebuilt from the same analysis functions as
 * the on-screen cards, so an exported report always matches the display.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid export request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const assessment = runAssessment(parsed.data.request);
  const stamp = assessment.generatedAt.replace(/[:.]/g, "-");

  if (parsed.data.format === "json") {
    return new NextResponse(JSON.stringify(assessment, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="pantrytwin-assessment-${stamp}.json"`,
      },
    });
  }

  if (parsed.data.format === "pdf") {
    const pdf = buildActionPlanPdf(buildActionPlanMarkdown(assessment));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="pantrytwin-action-plan-${stamp}.pdf"`,
      },
    });
  }

  return new NextResponse(buildActionPlanMarkdown(assessment), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="pantrytwin-action-plan-${stamp}.md"`,
    },
  });
}
