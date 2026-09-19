import { NextResponse } from "next/server";
import { buildNetworkTwin } from "@/lib/network/twin";

export async function GET() {
  return NextResponse.json(buildNetworkTwin(), {
    headers: {
      "cache-control": "public, max-age=3600",
    },
  });
}