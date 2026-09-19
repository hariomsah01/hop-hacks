import { NextResponse } from "next/server";

import { NetworkComparisonRequestSchema } from "@/lib/contracts";
import { runNetworkComparison } from "@/lib/network/comparison";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = NetworkComparisonRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid network comparison request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  return NextResponse.json(runNetworkComparison(parsed.data));
}
