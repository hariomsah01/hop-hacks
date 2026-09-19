import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { SourceRecord } from "@/lib/contracts";

/**
 * Server-side access to the cached public datasets produced by
 * `npm run ingest`. Files are kept in memory until their mtimes change, so a
 * fresh ingest (new landing URLs, ACS join, and so on) is picked up without
 * inventing fallback values.
 *
 * If a file is absent the dataset is reported as unavailable. Callers must
 * degrade to "unavailable" measures rather than substituting zeros.
 */

const DATA_DIR = path.join(process.cwd(), "data", "processed");

export interface TractRecord {
  geoid: string;
  name: string | null;
  population: number | null;
  households: number | null;
  housingUnits: number | null;
  landAreaSqMeters: number | null;
  povertyCount: number | null;
  povertyUniverse: number | null;
  noVehicleHouseholds: number | null;
  populationSource?: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface ServiceRecord {
  id: string;
  name: string;
  program: string | null;
  services: string | null;
  address: string | null;
  phone: string | null;
  publishedHours: string | null;
  lng: number;
  lat: number;
  sourceIds: string[];
  sourceRowCount: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ValidationReport {
  startedAt?: string;
  finishedAt?: string;
  datasets: Array<{ id: string; status: string; message: string; count?: number }>;
  checks: ValidationCheck[];
  blocked: Array<{ id: string; message: string; landingUrl: string }>;
}

export interface Datasets {
  tracts: TractRecord[];
  services: ServiceRecord[];
  cityBoundary: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
  sources: SourceRecord[];
  validation: ValidationReport | null;
  availability: {
    tracts: boolean;
    services: boolean;
    cityBoundary: boolean;
    /** True when at least one tract reports a population figure. */
    tractPopulation: boolean;
    /** Poverty needs an ACS key, so it is frequently absent. */
    tractPoverty: boolean;
    tractVehicleAccess: boolean;
  };
}

const CACHED_FILES = [
  "tracts.json",
  "services.json",
  "city-boundary.json",
  "manifest.json",
  "validation-report.json",
] as const;

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(DATA_DIR, file);
  if (!existsSync(full)) return fallback;
  try {
    return JSON.parse(readFileSync(full, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function processedSignature(): string {
  return CACHED_FILES.map((file) => {
    const full = path.join(DATA_DIR, file);
    try {
      const st = statSync(full);
      return `${file}:${st.mtimeMs}:${st.size}`;
    } catch {
      return `${file}:missing`;
    }
  }).join("|");
}

let cache: Datasets | null = null;
let cacheSignature = "";

export function loadDatasets(): Datasets {
  const signature = processedSignature();
  if (cache && cacheSignature === signature) return cache;
  cacheSignature = signature;

  const tracts = readJson<TractRecord[]>("tracts.json", []);
  const services = readJson<ServiceRecord[]>("services.json", []);
  const cityBoundary = readJson<Datasets["cityBoundary"]>("city-boundary.json", null);
  const sources = readJson<SourceRecord[]>("manifest.json", []);
  const validation = readJson<ValidationReport | null>("validation-report.json", null);

  cache = {
    tracts,
    services,
    cityBoundary,
    sources,
    validation,
    availability: {
      tracts: tracts.length > 0,
      services: services.length > 0,
      cityBoundary: cityBoundary !== null,
      tractPopulation: tracts.some((t) => t.population !== null),
      tractPoverty: tracts.some(
        (t) => t.povertyCount !== null && t.povertyUniverse !== null,
      ),
      tractVehicleAccess: tracts.some((t) => t.noVehicleHouseholds !== null),
    },
  };
  return cache;
}

/** Returns only the source records referenced by an analysis. */
export function sourcesFor(ids: string[]): SourceRecord[] {
  const { sources } = loadDatasets();
  const wanted = new Set(ids);
  return sources.filter((s) => wanted.has(s.id));
}

/** Test seam: clears the in-process dataset cache. */
export function resetDatasetCache(): void {
  cache = null;
  cacheSignature = "";
}
