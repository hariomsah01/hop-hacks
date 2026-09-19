import { NextResponse } from "next/server";
import { loadDatasets } from "@/lib/data/datasets";

/**
 * The source manifest and ingestion validation report. Exposed so a reviewer
 * can check provenance, vintages and which sources were blocked without
 * reading the repository.
 */
export async function GET() {
  const data = loadDatasets();
  return NextResponse.json({
    sources: data.sources,
    validation: data.validation,
    availability: data.availability,
  });
}
