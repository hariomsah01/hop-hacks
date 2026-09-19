import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const USER_AGENT = "PantryTwin/0.1 (HopHacks project; public data ingestion)";

export async function fetchWithRetry(url, { attempts = 3, timeoutMs = 60_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError;
}

export async function fetchJson(url, options) {
  const res = await fetchWithRetry(url, options);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Response was not JSON (first 120 chars: ${text.slice(0, 120)})`);
  }
  // ArcGIS reports failures inside a 200 response body.
  if (parsed?.error) {
    throw new Error(`Service error: ${JSON.stringify(parsed.error).slice(0, 200)}`);
  }
  return { parsed, text };
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), "utf8");
}

/**
 * Picks the first field whose name matches one of the candidate patterns.
 * The guide requires that we inspect schemas rather than assume field names,
 * so the chosen field is reported back and recorded in the validation report.
 */
export function pickField(fieldNames, patterns) {
  for (const pattern of patterns) {
    const hit = fieldNames.find((name) => pattern.test(name));
    if (hit) return hit;
  }
  return null;
}

/** Rounds coordinates to ~1m precision to keep cached GeoJSON small. */
export function roundCoords(geometry, precision = 5) {
  const factor = 10 ** precision;
  const round = (n) => Math.round(n * factor) / factor;
  const walk = (node) =>
    typeof node[0] === "number"
      ? [round(node[0]), round(node[1])]
      : node.map(walk);
  if (!geometry) return geometry;
  return { ...geometry, coordinates: walk(geometry.coordinates) };
}

const ARCGIS_ORG =
  "https://services1.arcgis.com/UWYHeuuJISiGmgXx/ArcGIS/rest/services";

export function layerUrl(service, layer = 0) {
  return `${ARCGIS_ORG}/${service}/FeatureServer/${layer}`;
}

export async function describeLayer(service, layer = 0) {
  const { parsed } = await fetchJson(`${layerUrl(service, layer)}?f=json`);
  return {
    name: parsed.name,
    geometryType: parsed.geometryType,
    fields: (parsed.fields ?? []).map((f) => f.name),
  };
}

/** Pages through an ArcGIS FeatureServer layer and returns GeoJSON features. */
export async function fetchAllFeatures(service, layer = 0, { pageSize = 1000 } = {}) {
  const features = [];
  let offset = 0;
  for (let page = 0; page < 50; page += 1) {
    const url =
      `${layerUrl(service, layer)}/query?where=1%3D1&outFields=*&outSR=4326` +
      `&f=geojson&resultOffset=${offset}&resultRecordCount=${pageSize}`;
    const { parsed } = await fetchJson(url);
    const batch = parsed.features ?? [];
    features.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
  return features;
}

export function nowIso() {
  return new Date().toISOString();
}
