import {
  centroid as turfCentroid,
  distance as turfDistance,
  feature as turfFeature,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { ServiceRecord, TractRecord } from "@/lib/data/datasets";
import { tractPovertyRate } from "@/lib/geo/pressure";

function toFeature(
  geometry: TractRecord["geometry"],
): Feature<Polygon | MultiPolygon> {
  return turfFeature(geometry as Polygon | MultiPolygon);
}

export function nearestListedMeters(
  lng: number,
  lat: number,
  services: Pick<ServiceRecord, "lng" | "lat">[],
): number | null {
  if (services.length === 0) return null;
  let nearest = Number.POSITIVE_INFINITY;
  const origin: [number, number] = [lng, lat];
  for (const service of services) {
    const metres =
      turfDistance(origin, [service.lng, service.lat], {
        units: "kilometers",
      }) * 1000;
    if (metres < nearest) nearest = metres;
  }
  return nearest;
}

export function tractCentre(
  geometry: TractRecord["geometry"],
): { lng: number; lat: number } | null {
  try {
    const point = turfCentroid(toFeature(geometry));
    const [lng, lat] = point.geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
  } catch {
    return null;
  }
}

export function annotateTractPressureInputs(
  tract: TractRecord,
  services: Pick<ServiceRecord, "lng" | "lat">[],
): {
  povertyRate: number | null;
  nearestListedMeters: number | null;
} {
  const centre = tractCentre(tract.geometry);
  return {
    povertyRate: tractPovertyRate(tract.povertyCount, tract.povertyUniverse),
    nearestListedMeters: centre
      ? nearestListedMeters(centre.lng, centre.lat, services)
      : null,
  };
}
