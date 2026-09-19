import { NextResponse } from "next/server";
import { z } from "zod";
import { SiteAssessmentRequestSchema } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { askAssistant } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const BodySchema = z.object({
  question: z.string().min(3).max(1000),
  request: SiteAssessmentRequestSchema,
});

/**
 * Answers a question about the current assessment.
 *
 * The assessment is recomputed server-side first, so the assistant can only
 * ever describe numbers this server produced. The API key stays on the server.
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
      { error: "Invalid assistant request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const assessment = runAssessment(parsed.data.request);
    const answer = await askAssistant(parsed.data.question, assessment);
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A failed assistant must never take the assessment down with it.
    return NextResponse.json(
      {
        status: "error",
        text: "The AI explanation could not be generated. The findings and metrics on screen are unaffected.",
        toolCalls: [],
        sourceIds: [],
        model: null,
        warning: message,
      },
      { status: 200 },
    );
  }
}
