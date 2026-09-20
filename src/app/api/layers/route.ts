import { NextResponse } from "next/server";
import { loadDatasets } from "@/lib/data/datasets";

/**
 * Map layers as GeoJSON, ready for MapLibre sources. Cached because the
 * cached public datasets only change when the ingestion script is re-run.
 */
export async function GET() {
  const data = loadDatasets();

  const tracts = {
    type: "FeatureCollection" as const,
    features: data.tracts.map((tract) => {
      // People per square kilometre, used only to shade the choropleth.
      const density =
        tract.population !== null &&
        tract.landAreaSqMeters !== null &&
        tract.landAreaSqMeters > 0
          ? (tract.population / tract.landAreaSqMeters) * 1e6
          : null;
      return {
        type: "Feature" as const,
        geometry: tract.geometry,
        properties: {
          geoid: tract.geoid,
          name: tract.name,
          population: tract.population,
          densityPerSqKm: density === null ? null : Math.round(density),
        },
      };
    }),
  };

  const services = {
    type: "FeatureCollection" as const,
    features: data.services.map((service) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [service.lng, service.lat] },
      properties: {
        id: service.id,
        name: service.name,
        address: service.address,
        publishedHours: service.publishedHours,
        services: service.services,
        program: service.program,
        sourceIds: service.sourceIds.join(","),
      },
    })),
  };

  const boundary = data.cityBoundary
    ? {
        type: "Feature" as const,
        geometry: data.cityBoundary,
        properties: { name: "Baltimore City" },
      }
    : null;

  return NextResponse.json(
    {
      tracts,
      services,
      boundary,
      availability: data.availability,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
