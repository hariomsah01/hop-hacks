# PantryTwin

Compare two candidate food-pantry locations in Baltimore City using public
data, explicit operating assumptions, and an AI assistant that is only allowed
to explain evidence the server computed.

PantryTwin answers one question: **given the same staff, food and budget, what
would each of these two locations actually be able to do?** It reports modelled
outcomes under assumptions you control. It does not predict success.

---

## What it does

- **Geographic reach.** Draws a catchment around each pin and apportions census
  tract population by the share of each tract inside the ring.
- **Operations.** Runs a deterministic 28-day model of intake, storage, shelf
  life, volunteer throughput, delivery and cost, and reports which resource ran
  out first.
- **Three demand levels.** Participation is not measured anywhere in this
  build, so low, medium and high assumptions are always run together.
- **Honest gaps.** A value that is not known is shown as *unavailable* and is
  never replaced with zero.
- **Exportable plan.** One Markdown action plan containing the settings,
  results, assumptions, limitations and full source manifest.

## Provenance model

Every number on screen carries one of four labels, and the same labels appear
in the export:

| Label | Meaning |
| --- | --- |
| **Sourced** | Taken directly from a public dataset in the manifest. |
| **Estimated** | Calculated by our analysis functions from sourced data. |
| **Assumed** | A planning input you chose. Not measured. |
| **Unavailable** | Not known. Deliberately blank, never zero. |

## Quick start

```bash
npm install
npm run ingest      # fetch Baltimore City public data into data/processed
npm run dev         # http://localhost:3000
```

`npm run ingest` is optional to re-run: the cached datasets are committed so the
app works immediately after `npm install`.

### The MapLibre worker step

`scripts/copy-maplibre-worker.mjs` runs automatically on install, dev and
build. It copies MapLibre's worker chunks into `public/maplibre/` so that
`config.WORKER_URL` can point at a real URL.

This is not optional. MapLibre 6 locates its own worker by reading
`import.meta.url` and returns an empty string when that is not an `http(s)`
URL. Bundlers rewrite `import.meta.url`, so in a Next.js build the lookup
fails silently: no worker starts, every GeoJSON source stays unloaded, and the
map paints a background with no tracts, services, catchments or street tiles on
it, with nothing logged to the console.

If the map ever renders empty, check that `/maplibre/maplibre-gl-worker.mjs`
returns 200 before looking anywhere else.

Copy `.env.example` to `.env.local` to enable the Gemini assistant and the
Census enrichment. The app runs fully without either.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` / `npm start` | Production build and serve. |
| `npm run ingest` | Re-fetch public data and rewrite the source manifest. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Geographic and simulation unit tests. |
| `npm run checks` | Typecheck, tests and production build together. |
| `node scripts/smoke.mjs` | End-to-end checks against a running server. |

## Data sources

Fetched by `scripts/ingest/run.mjs` from Baltimore City's ArcGIS open-data
portal, with the schema of each layer inspected rather than assumed. The fields
actually used are recorded in `data/processed/validation-report.json`.

| ID | Dataset | Used for |
| --- | --- | --- |
| `tracts` | Census tracts, 2020 geography, with the publisher's joined ACS profile | Catchment population |
| `pantries` | Food pantry partner locations | Existing service listings |
| `food-access` | Food access resource points | Existing service listings |
| `city-boundary` | Baltimore City boundary | Inside/outside checks |
| `acs` | Census ACS 5-year estimates | Poverty and vehicle access (requires `CENSUS_API_KEY`) |

Ingestion writes a checksum, retrieval timestamp, data vintage and terms for
every source, and records anything that was blocked or skipped instead of
quietly filling the gap.

### Known data gaps

- **Pantry capacity is published nowhere.** No dataset states how many
  households an existing site can serve, so nearby listings are never treated
  as competition.
- **Operating hours are mostly missing.** Only a minority of listings publish
  any hours text, and none of it is verified.
- **Poverty and vehicle access need a Census key.** Without `CENSUS_API_KEY`
  those metrics report as unavailable.
- **The tract layer does not state its ACS release year.** The manifest records
  this uncertainty rather than inventing a vintage.

## How the analysis works

### Catchment population

The catchment is a **straight-line radius**, not a walking or driving time
area. Population is apportioned by the share of each tract's area inside the
ring, which assumes people are spread evenly across a tract. A tract that
reports no population is excluded from the estimate rather than counted as
zero. If the ring intersects no tract at all, coverage is a genuine zero.

When both pins are close together their catchments overlap. The app measures
and reports that overlap, because people in the shared area are reachable from
either site and the two populations must not be added together.

### The 28-day model

Pure and deterministic: identical inputs always produce identical output. Each
day it receives weekly deliveries limited by storage, expires stock past its
shelf life, then serves households up to the tightest of volunteer throughput,
delivery capacity and stock on hand, drawing first-expiring-first. Tests assert
that intake equals distribution plus spoilage plus closing stock.

The model deliberately does **not** infer rent from a location, predict
attendance, or score a site's chance of success.

### Suitability heuristic

A transparent weighted score over four components: people reachable (35%),
share of requests served (25%), few existing listings nearby (20%) and cost per
household (20%). Each component is normalised **against the other candidate
only**, so the score says which of these two sites looks stronger on these
criteria. It is not a probability and is not comparable between sessions. A
component missing data for either site is dropped and the remaining weights are
rescaled. The formula and live weights are visible in the UI and the export.

## The AI assistant

The Gemini assistant runs server-side and **cannot calculate anything**. It may
only call four approved functions that read the comparison the server already
computed:

`get_location_evidence` · `compare_locations` · `get_scenario_results` ·
`summarize_limitations`

Arguments are validated with Zod, tool calls are capped, and the whole exchange
is time-bounded. The system instruction forbids inventing figures, requires
source IDs in citations, requires saying plainly when something is unavailable,
and forbids stating any probability of success. Text inside dataset records is
treated as data to report, never as instructions to follow.

If the key is missing or the call fails, the panel says so and every metric on
screen is unaffected.

## Deploying to DigitalOcean App Platform

`.do/app.yaml` describes the service. Point App Platform at the repository, set
`GEMINI_API_KEY` as an encrypted secret, and deploy. The health check uses
`/api/health`, which reports 503 if the cached datasets are missing so a bad
deploy is obvious immediately rather than at demo time.

## Limitations

- Straight-line catchments ignore streets, water and transit.
- Demand is an assumption, never a measurement.
- Coverage is Baltimore City only; a pin outside the boundary understates every
  count, and the app says so.
- The service roster's completeness is not guaranteed by the publisher.
- Estimates carry sampling error that this build does not display.
