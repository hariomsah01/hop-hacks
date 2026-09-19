import { NextResponse } from "next/server";
import { SiteAssessmentRequestSchema } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";

export const dynamic = "force-dynamic";

/**
 * Assesses a proposed pantry against a real listed one. Deterministic: no AI
 * is involved, and the same request always returns the same numbers.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = SiteAssessmentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid assessment request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(runAssessment(parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Assessment failed: ${message}` },
      { status: 500 },
    );
  }
}
