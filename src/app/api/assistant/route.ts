import { NextResponse } from "next/server";
import { z } from "zod";
import { SiteAssessmentRequestSchema } from "@/lib/contracts";
import { runAssessment } from "@/lib/analysis/assess";
import { streamAssistant } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const BodySchema = z.object({
  question: z.string().min(2).max(1000),
  request: SiteAssessmentRequestSchema,
});

/**
 * Streams an answer about the current assessment.
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
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };
        try {
          for await (const event of streamAssistant(
            parsed.data.question,
            assessment,
          )) {
            send(event);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send({
            type: "done",
            status: "error",
            text: "The explanation request did not complete. The analysis is unaffected.",
            model: null,
            toolCalls: [],
            sourceIds: [],
            warning: message,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
