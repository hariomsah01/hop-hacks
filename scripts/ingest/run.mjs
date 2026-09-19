/**
 * Baltimore City public-data ingestion.
 *
 * Every dataset is fetched from an official portal, its schema is inspected
 * rather than assumed, and the fields actually used are recorded in the
 * validation report. A source that is blocked or lacks the fields we need is
 * reported and left out; replacement records are never generated.
 *
 *   node scripts/ingest/run.mjs
 *
 * Optional: set CENSUS_API_KEY to enrich tracts with ACS poverty and vehicle
 * access, which the Baltimore tract layer does not publish.
 */
import {
  describeLayer,
  fetchAllFeatures,
  fetchJson,
  layerUrl,
  nowIso,
  pickField,
  roundCoords,
  sha256,
  writeJson,
} from "./lib.mjs";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadLocalEnv() {
  const files = [
    join(process.cwd(), ".env.local"),
    join(ROOT, ".env.local"),
    join(process.cwd(), ".env"),
    join(ROOT, ".env"),
  ];
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    let text = readFileSync(file, "utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnv();
console.log(
  `ingest env: CENSUS_API_KEY ${process.env.CENSUS_API_KEY ? "present" : "missing"}`,
);

const OUT = "data/processed";
const BALTIMORE_CITY_FIPS = { state: "24", county: "510" };

/** Published Baltimore City population is ~565k-620k across recent vintages. */
const PLAUSIBLE_CITY_POPULATION = { min: 500_000, max: 700_000 };

const manifest = [];
const report = { startedAt: nowIso(), datasets: [], checks: [], blocked: [] };

function recordDataset(entry) {
  report.datasets.push(entry);
  console.log(`${entry.status === "ok" ? "OK " : "!! "}${entry.id}: ${entry.message}`);
}

function recordBlocked(id, message, landingUrl) {
  report.blocked.push({ id, message, landingUrl });
  console.log(`!! ${id}: ${message}`);
}

function recordCheck(name, passed, detail) {
  report.checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

const ARCGIS_TERMS =
  "Baltimore City open data published via ArcGIS Online. Confirm reuse terms on the dataset landing page before redistribution.";

const landing = (service) =>
  `https://data.baltimorecity.gov/search?q=${encodeURIComponent(service)}`;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const str = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
};

// Baltimore City bounding box, used only to reject obviously bad coordinates.
const BBOX = { minLng: -76.75, maxLng: -76.49, minLat: 39.18, maxLat: 39.39 };
const inBaltimore = (lng, lat) =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  lng >= BBOX.minLng &&
  lng <= BBOX.maxLng &&
  lat >= BBOX.minLat &&
  lat <= BBOX.maxLat;

/** Pulls a point out of a feature, falling back to published X/Y columns. */
function pointOf(feature) {
  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (inBaltimore(lng, lat)) return { lng, lat };
  }
  const attrs = feature.properties ?? {};
  const lng = num(attrs.X ?? attrs.x ?? attrs.LONGITUDE ?? attrs.Longitude);
  const lat = num(attrs.Y ?? attrs.y ?? attrs.LATITUDE ?? attrs.Latitude);
  if (lng !== null && lat !== null && inBaltimore(lng, lat)) return { lng, lat };
  return null;
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Fetches one ArcGIS layer, inspects its schema, then maps chosen fields. */
async function ingestLayer({
  id,
  service,
  layer = 0,
  title,
  geographicVintage,
  dataVintage,
  fieldPlan,
  mapFeature,
}) {
  try {
    const described = await describeLayer(service, layer);
    const chosen = {};
    for (const [key, patterns] of Object.entries(fieldPlan ?? {})) {
      chosen[key] = pickField(described.fields, patterns);
    }

    const features = await fetchAllFeatures(service, layer);
    const mapped = features
      .map((feature) => mapFeature(feature, chosen))
      .filter((row) => row !== null);

    manifest.push({
      id,
      publisher: "Baltimore City (Open Baltimore / ArcGIS Online)",
      title,
      landingUrl: landing(service),
      downloadUrl: `${layerUrl(service, layer)}/query?where=1=1&outFields=*&f=geojson`,
      retrievedAt: nowIso(),
      dataVintage,
      geographicVintage,
      terms: ARCGIS_TERMS,
      checksum: sha256(JSON.stringify(mapped)),
      notes: `Publisher layer "${described.name}". Fields used: ${JSON.stringify(chosen)}`,
    });

    recordDataset({
      id,
      status: "ok",
      count: mapped.length,
      rawCount: features.length,
      availableFieldCount: described.fields.length,
      chosenFields: chosen,
      droppedFields: Object.entries(chosen)
        .filter(([, v]) => v === null)
        .map(([k]) => k),
      message: `${mapped.length} of ${features.length} records kept from "${described.name}"`,
    });

    return mapped;
  } catch (err) {
    recordBlocked(id, `Could not ingest: ${err.message}`, landing(service));
    return null;
  }
}

async function main() {
  // ---------------------------------------------------------------- boundary
  const boundary = await ingestLayer({
    id: "city-boundary",
    service: "Baltimore_City_Boundary",
    title: "Baltimore City boundary",
    dataVintage: "Current boundary as published by Baltimore City",
    geographicVintage: "WGS84 polygon as published",
    fieldPlan: {},
    mapFeature: (feature) =>
      feature.geometry ? { geometry: roundCoords(feature.geometry) } : null,
  });
  if (boundary?.length) {
    await writeJson(`${OUT}/city-boundary.json`, boundary[0].geometry);
  }

  // ------------------------------------------------------------------ tracts
  // This layer carries a publisher-joined ACS demographic profile. The joined
  // columns are truncated CSV headers, so they are matched explicitly rather
  // than guessed, and anything absent stays null.
  const tracts = await ingestLayer({
    id: "tracts",
    service: "Census_Tract_2020",
    title: "Baltimore City census tracts (2020 geography) with joined ACS profile",
    dataVintage:
      "ACS demographic profile joined by Baltimore City; the layer does not state its ACS release year",
    geographicVintage: "2020 Census tract geography (GEOID20)",
    fieldPlan: {
      geoid: [/^GEOID20$/, /^GEOID/i],
      name: [/^NAMELSAD20$/, /^NAME20$/, /^Geographic_Area_Name$/],
      // DP05 line 1, "Total population", truncated by the publisher's join.
      population: [/^Estimate__SEX_AND_AGE__Total_po$/],
      housingUnits: [/^Estimate__Total_housing_units$/],
      landArea: [/^ALAND20$/],
    },
    mapFeature: (feature, chosen) => {
      const attrs = feature.properties ?? {};
      if (!feature.geometry) return null;
      // GEOIDs are identifiers, not numbers: keep them as strings so leading
      // zeros survive.
      const geoid = chosen.geoid ? str(attrs[chosen.geoid]) : null;
      if (!geoid) return null;
      return {
        geoid,
        name: chosen.name ? str(attrs[chosen.name]) : null,
        population: chosen.population ? num(attrs[chosen.population]) : null,
        housingUnits: chosen.housingUnits ? num(attrs[chosen.housingUnits]) : null,
        landAreaSqMeters: chosen.landArea ? num(attrs[chosen.landArea]) : null,
        // Not published in this layer; only ACS enrichment can fill these.
        povertyCount: null,
        povertyUniverse: null,
        noVehicleHouseholds: null,
        households: null,
        geometry: roundCoords(feature.geometry),
      };
    },
  });

  // ------------------------------------------------- service listings, part 1
  const pantryPartners = await ingestLayer({
    id: "pantries",
    service: "Food_Pantry_Partners",
    title: "Baltimore City food pantry partner locations",
    dataVintage: "Partner roster as published by Baltimore City",
    geographicVintage: "WGS84 points as published",
    fieldPlan: {
      name: [/^Account_Name$/, /^Name$/i, /organi/i, /agency/i],
      program: [/^Program$/i],
      address: [/^Address$/i, /street/i],
      zip: [/^ZIP$/i, /zipcode/i],
      hours: [/hours/i, /schedule/i],
    },
    mapFeature: (feature, chosen) => {
      const attrs = feature.properties ?? {};
      const point = pointOf(feature);
      if (!point) return null;
      const name = chosen.name ? str(attrs[chosen.name]) : null;
      const address = chosen.address ? str(attrs[chosen.address]) : null;
      const zip = chosen.zip ? str(attrs[chosen.zip]) : null;
      return {
        name: name ?? "Unnamed listing",
        program: chosen.program ? str(attrs[chosen.program]) : null,
        services: null,
        address: address ? [address, zip].filter(Boolean).join(", ") : null,
        phone: null,
        // This roster publishes no operating hours, so hours stay unknown
        // rather than being inferred.
        publishedHours: chosen.hours ? str(attrs[chosen.hours]) : null,
        lng: round5(point.lng),
        lat: round5(point.lat),
        sourceId: "pantries",
      };
    },
  });

  // ------------------------------------------------- service listings, part 2
  // Despite the name, Food_Access is a geocoded point roster of food resources
  // with a services description, not a tract-level food-access index.
  const foodResources = await ingestLayer({
    id: "food-access",
    service: "Food_Access",
    title: "Baltimore City food access resource points",
    dataVintage: "Resource roster as published by Baltimore City",
    geographicVintage: "WGS84 points as published (geocoded addresses)",
    fieldPlan: {
      name: [/^Name$/],
      services: [/^Services$/i],
      address: [/^Match_addr$/i, /^Address$/i],
      zip: [/^ZipCode$/i, /^ARC_ZIP$/i],
      phone: [/^PhoneNumbe/i, /phone/i],
      website: [/^Website$/i],
      hours: [/^Additional$/i, /hours/i],
    },
    mapFeature: (feature, chosen) => {
      const attrs = feature.properties ?? {};
      const point = pointOf(feature);
      if (!point) return null;
      const address = chosen.address ? str(attrs[chosen.address]) : null;
      const zip = chosen.zip ? str(attrs[chosen.zip]) : null;
      return {
        name: (chosen.name ? str(attrs[chosen.name]) : null) ?? "Unnamed listing",
        program: null,
        services: chosen.services ? str(attrs[chosen.services]) : null,
        address: address ? [address, zip].filter(Boolean).join(", ") : null,
        phone: chosen.phone ? str(attrs[chosen.phone]) : null,
        // The "Additional" column sometimes carries hours text. It is stored
        // as published and never treated as verified.
        publishedHours: chosen.hours ? str(attrs[chosen.hours]) : null,
        lng: round5(point.lng),
        lat: round5(point.lat),
        sourceId: "food-access",
      };
    },
  });

  // ---------------------------------------------------- deduplicate listings
  let services = null;
  const combined = [...(pantryPartners ?? []), ...(foodResources ?? [])];
  if (combined.length) {
    const byKey = new Map();
    for (const row of combined) {
      // Same name at effectively the same spot is treated as one site.
      const key = `${row.name.toLowerCase()}|${row.lng.toFixed(4)}|${row.lat.toFixed(4)}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.sourceRowCount += 1;
        if (!existing.sourceIds.includes(row.sourceId)) {
          existing.sourceIds.push(row.sourceId);
        }
        existing.address ??= row.address;
        existing.phone ??= row.phone;
        existing.services ??= row.services;
        existing.program ??= row.program;
        existing.publishedHours ??= row.publishedHours;
      } else {
        const { sourceId, ...rest } = row;
        byKey.set(key, {
          id: `svc-${byKey.size + 1}`,
          ...rest,
          sourceIds: [sourceId],
          sourceRowCount: 1,
        });
      }
    }
    services = [...byKey.values()];
    recordDataset({
      id: "services-merged",
      status: "ok",
      count: services.length,
      rawCount: combined.length,
      message: `${combined.length} listings from 2 rosters collapsed to ${services.length} unique sites`,
    });
    await writeJson(`${OUT}/services.json`, services);
  }

  // --------------------------------------------------- optional ACS enrichment
  const censusKey = process.env.CENSUS_API_KEY;
  let acs = null;
  if (!censusKey) {
    recordBlocked(
      "acs",
      "CENSUS_API_KEY not set. Poverty rate and no-vehicle household share stay unavailable; population comes from the Baltimore tract layer's joined ACS profile.",
      "https://api.census.gov/data/key_signup.html",
    );
  } else {
    const variables = [
      "B01003_001E", // total population
      "B17001_001E", // poverty status universe
      "B17001_002E", // income below poverty level
      "B11001_001E", // total households
      "B08201_002E", // households with no vehicle available
    ];
    const url =
      `https://api.census.gov/data/2023/acs/acs5?get=NAME,${variables.join(",")}` +
      `&for=tract:*&in=state:${BALTIMORE_CITY_FIPS.state}+county:${BALTIMORE_CITY_FIPS.county}` +
      `&key=${censusKey}`;
    try {
      const { parsed, text } = await fetchJson(url);
      const [header, ...rows] = parsed;
      const idx = Object.fromEntries(header.map((h, i) => [h, i]));
      acs = rows.map((row) => ({
        geoid: `${row[idx.state]}${row[idx.county]}${row[idx.tract]}`,
        name: row[idx.NAME],
        population: num(row[idx.B01003_001E]),
        povertyUniverse: num(row[idx.B17001_001E]),
        povertyCount: num(row[idx.B17001_002E]),
        households: num(row[idx.B11001_001E]),
        noVehicleHouseholds: num(row[idx.B08201_002E]),
      }));
      manifest.push({
        id: "acs",
        publisher: "U.S. Census Bureau",
        title: "American Community Survey 5-year estimates, Baltimore City tracts",
        landingUrl: "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        downloadUrl: url.replace(censusKey, "REDACTED"),
        retrievedAt: nowIso(),
        dataVintage: "ACS 2019-2023 5-year estimates",
        geographicVintage: "2020 Census tract geography",
        terms: "U.S. Census Bureau public API. Attribution required.",
        checksum: sha256(text),
        notes:
          "Estimates carry sampling error. Margins of error are published by the API but are not displayed in this build.",
      });
      recordDataset({
        id: "acs",
        status: "ok",
        count: acs.length,
        message: `${acs.length} tracts enriched from ACS 5-year estimates`,
      });
    } catch (err) {
      recordBlocked("acs", `ACS request failed: ${err.message}`, "https://api.census.gov");
    }
  }

  // ------------------------------------------------------------------- merge
  if (tracts) {
    const acsByGeoid = new Map((acs ?? []).map((row) => [row.geoid, row]));
    const merged = tracts.map((tract) => {
      const enrich = acsByGeoid.get(tract.geoid);
      // Prefer the keyed ACS pull when present; otherwise keep the publisher's
      // joined value. Missing stays null, never zero.
      return {
        ...tract,
        name: tract.name ?? enrich?.name ?? null,
        population: enrich?.population ?? tract.population,
        households: enrich?.households ?? tract.households,
        povertyCount: enrich?.povertyCount ?? tract.povertyCount,
        povertyUniverse: enrich?.povertyUniverse ?? tract.povertyUniverse,
        noVehicleHouseholds:
          enrich?.noVehicleHouseholds ?? tract.noVehicleHouseholds,
        populationSource: enrich?.population != null ? "acs" : "tracts",
      };
    });

    const withPopulation = merged.filter((t) => t.population !== null);
    const cityTotal = withPopulation.reduce((sum, t) => sum + t.population, 0);

    recordDataset({
      id: "tracts-merged",
      status: "ok",
      count: merged.length,
      message: `${merged.length} tracts written; ${withPopulation.length} have population, ${
        merged.length - withPopulation.length
      } unavailable`,
    });

    // Guard against silently mapping the wrong joined column: the tract
    // populations must sum to something close to the published city total.
    recordCheck(
      "tract-population-sums-to-city",
      cityTotal >= PLAUSIBLE_CITY_POPULATION.min &&
        cityTotal <= PLAUSIBLE_CITY_POPULATION.max,
      `tract population total = ${cityTotal.toLocaleString()} (expected ${PLAUSIBLE_CITY_POPULATION.min.toLocaleString()}-${PLAUSIBLE_CITY_POPULATION.max.toLocaleString()})`,
    );
    recordCheck(
      "tracts-have-geometry",
      merged.every((t) => t.geometry?.coordinates?.length),
      `${merged.length} tracts carry geometry`,
    );
    recordCheck(
      "geoids-unique-strings",
      new Set(merged.map((t) => t.geoid)).size === merged.length &&
        merged.every((t) => typeof t.geoid === "string"),
      `${new Set(merged.map((t) => t.geoid)).size} unique string GEOIDs`,
    );

    await writeJson(`${OUT}/tracts.json`, merged);
  }

  if (services) {
    recordCheck(
      "services-inside-city-bbox",
      services.every((s) => inBaltimore(s.lng, s.lat)),
      `${services.length} listings inside the Baltimore City bounding box`,
    );
    const withHours = services.filter((s) => s.publishedHours).length;
    recordCheck(
      "service-hours-completeness",
      true,
      `${withHours} of ${services.length} listings publish any hours text; the rest stay unknown`,
    );
  }

  report.finishedAt = nowIso();
  await writeJson(`${OUT}/manifest.json`, manifest);
  await writeJson(`${OUT}/validation-report.json`, report);

  console.log(
    `\nWrote ${manifest.length} source records and ${report.datasets.length} dataset reports to ${OUT}/`,
  );
  if (report.blocked.length) {
    console.log(
      `${report.blocked.length} source(s) blocked or skipped - see ${OUT}/validation-report.json`,
    );
  }
  const failed = report.checks.filter((c) => !c.passed);
  if (failed.length) {
    console.log(`\n${failed.length} validation check(s) FAILED:`);
    for (const c of failed) console.log(`  - ${c.name}: ${c.detail}`);
    process.exitCode = 1;
  }
}

await main();
