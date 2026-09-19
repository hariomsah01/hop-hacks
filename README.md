# PantryTwin

Help a Baltimore nonprofit decide whether opening a pantry at a chosen point
would add coverage, compared with a real listed pantry nearby.

You control the proposed site and its operating plan. The other site is a
public listing. The report is modelled outcomes under your assumptions, not a
prediction of success.

## HopHacks prize targets

One track only, plus branded prizes the app actually uses:

| Selection | Role in the product |
| --- | --- |
| **Bloomberg — Most Philanthropic Hack** | The only track. Nonprofits compare a proposed pantry against an existing listing. |
| **Gemini API** | Server-side assistant that may only call approved analysis functions and explain sourced results. |
| **Auctor — Conversation to Action** | A question plus the current assessment becomes a downloadable action plan. |
| **DigitalOcean** | Host the running app (App Platform spec in `.do/app.yaml`). |

Do not select unused sponsor prizes. ElevenLabs, Backboard and GoDaddy stay off
the submission until those features exist.

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

When the proposed ring overlaps an existing pantry, the app reports **net new
reach** versus **duplicated reach**. People in the shared area can already
reach the listed site, so the two populations must not be added together.

### The 28-day model

Pure and deterministic, and applied only to the **proposed** pantry. Each day
it receives weekly deliveries limited by storage, expires stock past its shelf
life, then serves households up to the tightest of volunteer throughput,
delivery capacity and stock on hand, drawing first-expiring-first. Tests assert
that intake equals distribution plus spoilage plus closing stock.

The existing pantry is not simulated. No public dataset states its staffing,
food volume, storage or budget, so modelling it would mean inventing them.

The model deliberately does **not** infer rent from a location, predict
attendance, or score a site's chance of success.

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
