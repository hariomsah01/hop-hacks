import { readFileSync } from "node:fs";
import path from "node:path";

import type { AnalyticsPeriod, AnalyticsRequest, AnalyticsResult } from "@/lib/contracts";
import { loadDatasets } from "@/lib/data/datasets";
import { analyzeLocation } from "@/lib/geo/analyze";
import { computeReach } from "@/lib/geo/reach";

const FOOD_FILE = path.join(
  process.cwd(),
  "data",
  "model",
  "maryland_food_bank_simulated_data.csv",
);
const UNEMPLOYMENT_FILE = path.join(
  process.cwd(),
  "data",
  "model",
  "md_unemployment_monthly.csv",
);

const TARGETS = [
  "foodDistributed",
  "foodReceived",
  "foodWasted",
  "clients",
  "households",
  "staff",
] as const;

type Target = (typeof TARGETS)[number];

type FoodRow = {
  month: string;
  foodDistributed: number;
  foodReceived: number;
  foodWasted: number;
  clients: number;
  households: number;
  staff: number;
};

type UnemploymentRow = {
  month: string;
  rate: number;
};

type Model = {
  means: number[];
  scales: number[];
  beta: number[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

function readFoodRows(): FoodRow[] {
  const rows = parseCsv(readFileSync(FOOD_FILE, "utf8"));
  const header = rows[0];
  const idx = (name: string) => header.indexOf(name);
  return rows.slice(1).map((row) => ({
    month: row[idx("month")],
    foodDistributed: Number(row[idx("food_distributed_pounds")]),
    foodReceived: Number(row[idx("food_received_pounds")]),
    foodWasted: Number(row[idx("food_discarded_pounds")]),
    clients: Number(row[idx("unique_clients_served")]),
    households: Number(row[idx("total_households_served")]),
    staff: Number(row[idx("staff_hours")]),
  }));
}

function readBaltimoreUnemployment(): UnemploymentRow[] {
  const rows = parseCsv(readFileSync(UNEMPLOYMENT_FILE, "utf8"));
  const header = rows[0];
  const countyIdx = header.indexOf("county");
  const dateIdx = header.indexOf("date");
  const rateIdx = header.indexOf("unemployment_rate");
  return rows
    .slice(1)
    .filter((row) => row[countyIdx] === "Baltimore City")
    .map((row) => ({
      month: row[dateIdx].slice(0, 7),
      rate: Number(row[rateIdx]),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function monthParts(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return { year, mon };
}

function addMonths(month: string, count: number): string {
  const { year, mon } = monthParts(month);
  const date = new Date(Date.UTC(year, mon - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(month: string): string {
  const { year, mon } = monthParts(month);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, mon - 1, 1)));
}

function solveLinear(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const aug = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const divisor = Math.abs(aug[col][col]) < 1e-12 ? 1e-12 : aug[col][col];
    for (let c = col; c <= n; c += 1) aug[col][c] /= divisor;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let c = col; c <= n; c += 1) aug[r][c] -= factor * aug[col][c];
    }
  }
  return aug.map((row) => row[n]);
}

function fitRidge(x: number[][], y: number[], lambda = 2): Model {
  const p = x[0].length;
  const means = Array.from({ length: p }, (_, j) => x.reduce((s, r) => s + r[j], 0) / x.length);
  const scales = Array.from({ length: p }, (_, j) => {
    const variance = x.reduce((s, r) => s + (r[j] - means[j]) ** 2, 0) / Math.max(1, x.length - 1);
    return Math.sqrt(variance) || 1;
  });
  const z = x.map((r) => r.map((v, j) => (v - means[j]) / scales[j]));
  const design = z.map((r) => [1, ...r]);
  const size = p + 1;
  const xtx = Array.from({ length: size }, () => Array(size).fill(0));
  const xty = Array(size).fill(0);
  for (let i = 0; i < design.length; i += 1) {
    for (let a = 0; a < size; a += 1) {
      xty[a] += design[i][a] * y[i];
      for (let b = 0; b < size; b += 1) xtx[a][b] += design[i][a] * design[i][b];
    }
  }
  for (let j = 1; j < size; j += 1) xtx[j][j] += lambda;
  return { means, scales, beta: solveLinear(xtx, xty) };
}

function predict(model: Model, row: number[]): number {
  let result = model.beta[0];
  for (let j = 0; j < row.length; j += 1) {
    result += model.beta[j + 1] * ((row[j] - model.means[j]) / model.scales[j]);
  }
  return result;
}

function cityPopulationTotal(): number {
  const { tracts } = loadDatasets();
  return tracts.reduce((sum, tract) => sum + (tract.population ?? 0), 0);
}

function cityPovertyRate(): number | null {
  const { tracts } = loadDatasets();
  let numerator = 0;
  let denominator = 0;
  for (const tract of tracts) {
    if (tract.povertyCount == null || tract.povertyUniverse == null) continue;
    numerator += tract.povertyCount;
    denominator += tract.povertyUniverse;
  }
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * How strongly this pin should move the ring. Crowded, higher-poverty, and
 * uncovered rings take up more of a new site's throughput.
 *
 * listedNearby is pantries whose published point sits inside the Map-tab
 * ring, not listings whose assumed rings could merely touch it.
 */
function locationUptake(access: LocationAccess): number {
  const peoplePerListing =
    access.listedCitywide > 0
      ? access.cityPopulation / access.listedCitywide
      : 0;
  const crowding =
    peoplePerListing > 0
      ? access.catchmentPopulation / Math.max(access.listedNearby, 1) / peoplePerListing
      : 1;
  const povertyRatio =
    access.cityPoverty != null &&
    access.catchmentPoverty != null &&
    access.cityPoverty > 0
      ? access.catchmentPoverty / access.cityPoverty
      : 1;
  const uncoveredRatio =
    access.catchmentPopulation > 0
      ? access.uncoveredPopulation / access.catchmentPopulation
      : 0;
  return clamp(
    0.45 * crowding + 0.35 * povertyRatio + 0.4 + 0.9 * uncoveredRatio,
    0.8,
    3.25,
  );
}

/** Forecast month 0 is already visible; month 11 is the full site effect. */
function expansionRamp(forecastOffset: number, horizon = 12): number {
  if (horizon <= 1) return 1;
  return 0.4 + 0.6 * (forecastOffset / (horizon - 1));
}

type LocationAccess = {
  cityPopulation: number;
  listedCitywide: number;
  catchmentPopulation: number;
  listedNearby: number;
  uncoveredPopulation: number;
  cityPoverty: number | null;
  catchmentPoverty: number | null;
};

/**
 * Pounds of this month's citywide food sitting on people in the ring who
 * still share existing listings. Zero listings → the whole ring is the gap.
 * Each added listing (including a ramped new site) splits that load further.
 *
 * Citywide people-per-pantry capacity was the wrong bar: a 1.2 km ring with
 * several listings looks "fully covered" on that test and the series went to 0.
 */
function foodAccessGapLb(args: {
  statewideFoodDistributed: number;
  cityPopulation: number;
  catchmentPopulation: number;
  listedNearby: number;
  extraListings: number;
  uncoveredPopulation: number;
}): number {
  const {
    statewideFoodDistributed,
    cityPopulation,
    catchmentPopulation,
    listedNearby,
    extraListings,
    uncoveredPopulation,
  } = args;
  if (
    statewideFoodDistributed <= 0 ||
    cityPopulation <= 0 ||
    catchmentPopulation <= 0
  ) {
    return 0;
  }
  const poundsPerPerson = statewideFoodDistributed / cityPopulation;
  const serving = Math.max(0, listedNearby) + Math.max(0, extraListings);
  const residualPeople = catchmentPopulation / (serving + 1);
  const uncoveredPeople = Math.max(
    0,
    uncoveredPopulation * Math.max(0, 1 - extraListings),
  );
  return Math.round(Math.max(residualPeople, uncoveredPeople) * poundsPerPerson);
}

function unemploymentForecast(rows: UnemploymentRow[], throughMonth: string): Map<string, number> {
  const out = new Map(rows.map((row) => [row.month, row.rate]));
  const origin = rows[0].month;
  const originParts = monthParts(origin);
  const x = rows.map((row) => {
    const p = monthParts(row.month);
    return (p.year - originParts.year) * 12 + p.mon - originParts.mon;
  });
  const monthMeans = Array.from({ length: 12 }, (_, i) => {
    const vals = rows.filter((r) => monthParts(r.month).mon === i + 1).map((r) => r.rate);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const grand = rows.reduce((s, r) => s + r.rate, 0) / rows.length;
  const seasonal = monthMeans.map((m) => m - grand);
  const deseason = rows.map((r) => r.rate - seasonal[monthParts(r.month).mon - 1]);
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = deseason.reduce((a, b) => a + b, 0) / deseason.length;
  const denom = x.reduce((s, v) => s + (v - meanX) ** 2, 0) || 1;
  const slope = x.reduce((s, v, i) => s + (v - meanX) * (deseason[i] - meanY), 0) / denom;
  const intercept = meanY - slope * meanX;

  let cursor = rows[rows.length - 1].month;
  while (cursor < throughMonth) {
    cursor = addMonths(cursor, 1);
    const p = monthParts(cursor);
    const ti = (p.year - originParts.year) * 12 + p.mon - originParts.mon;
    const rate = intercept + slope * ti + seasonal[p.mon - 1];
    out.set(cursor, Math.max(0, Number(rate.toFixed(2))));
  }
  return out;
}

function featureRow(
  month: string,
  t: number,
  unemploymentRate: number,
  lag1: number,
  lag12: number,
): number[] {
  const m = monthParts(month).mon;
  const angle = (2 * Math.PI * (m - 1)) / 12;
  return [t, Math.sin(angle), Math.cos(angle), unemploymentRate, lag1, lag12];
}

function forecastBaseline(food: FoodRow[], unemployment: UnemploymentRow[]) {
  const lastObserved = food[food.length - 1].month;
  const forecastEnd = addMonths(lastObserved, 12);
  const uMap = unemploymentForecast(unemployment, forecastEnd);
  const models = {} as Record<Target, Model>;
  const histories = {} as Record<Target, number[]>;

  for (const target of TARGETS) {
    const yAll = food.map((row) => row[target]);
    histories[target] = [...yAll];
    const x: number[][] = [];
    const y: number[] = [];
    for (let i = 12; i < food.length; i += 1) {
      const u = uMap.get(food[i].month);
      if (u == null) continue;
      x.push(featureRow(food[i].month, i, u, yAll[i - 1], yAll[i - 12]));
      y.push(yAll[i]);
    }
    models[target] = fitRidge(x, y, 2);
  }

  const forecastRows: FoodRow[] = [];
  for (let h = 1; h <= 12; h += 1) {
    const month = addMonths(lastObserved, h);
    const i = food.length + h - 1;
    const row = { month } as FoodRow;
    for (const target of TARGETS) {
      const values = histories[target];
      const lag1 = values[i - 1];
      const lag12 = values[i - 12];
      const u = uMap.get(month) ?? unemployment[unemployment.length - 1].rate;
      const raw = predict(models[target], featureRow(month, i, u, lag1, lag12));
      const nonNegative = Math.max(0, raw);
      row[target] = target === "staff" ? Math.round(nonNegative) : Math.round(nonNegative);
      values.push(row[target]);
    }
    forecastRows.push(row);
  }

  return { forecastRows, uMap, firstForecastMonth: addMonths(lastObserved, 1) };
}

function attributedScale(access: LocationAccess): number {
  if (access.cityPopulation <= 0 || access.catchmentPopulation <= 0) return 0;
  return access.catchmentPopulation / access.cityPopulation;
}

/**
 * Incremental ring activity from opening this pin. A naive 1/(n+1) split of
 * current ring throughput, stretched by local uptake. Floor/ceiling keep the
 * forecast visibly different from baseline without letting an empty ring 3×.
 */
function siteScale(access: LocationAccess): number {
  const ring = attributedScale(access);
  if (ring <= 0) return 0;
  const naiveShare = 1 / (access.listedNearby + 1);
  const relative = clamp(naiveShare * locationUptake(access), 0.16, 1.85);
  return ring * relative;
}

function wasteCut(access: LocationAccess): number {
  const span = 3.25 - 0.8;
  const t = span > 0 ? (locationUptake(access) - 0.8) / span : 0;
  return clamp(0.1 + 0.22 * t, 0.08, 0.35);
}

function scaleActivity(
  row: Pick<
    FoodRow,
    "foodDistributed" | "foodReceived" | "foodWasted" | "clients" | "households" | "staff"
  >,
  activity: number,
  waste: number,
  staff: number,
) {
  return {
    foodDistributed: Math.round(row.foodDistributed * activity),
    foodReceived: Math.round(row.foodReceived * activity),
    foodWasted: Math.round(row.foodWasted * waste),
    clients: Math.round(row.clients * activity),
    households: Math.round(row.households * activity),
    staff: Math.round(row.staff * staff),
  };
}

function baselinePeriods(
  food: FoodRow[],
  forecast: FoodRow[],
  access: LocationAccess,
): AnalyticsPeriod[] {
  const historyWindow = food.slice(-12);
  const activity = attributedScale(access);
  return [...historyWindow, ...forecast].map((row, index) => {
    const scaled = scaleActivity(row, activity, activity, activity);
    return {
      label: labelMonth(row.month),
      kind: index < historyWindow.length ? "observed" : "forecast",
      ...scaled,
      foodAccessGapLb: foodAccessGapLb({
        statewideFoodDistributed: row.foodDistributed,
        cityPopulation: access.cityPopulation,
        catchmentPopulation: access.catchmentPopulation,
        listedNearby: access.listedNearby,
        extraListings: 0,
        uncoveredPopulation: access.uncoveredPopulation,
      }),
    };
  });
}

function expansionPeriods(
  food: FoodRow[],
  forecast: FoodRow[],
  access: LocationAccess,
): AnalyticsPeriod[] {
  const historyWindow = food.slice(-12);
  const activity = attributedScale(access);
  const added = siteScale(access);
  const history = historyWindow.map((row) => {
    const scaled = scaleActivity(row, activity, activity, activity);
    return {
      label: labelMonth(row.month),
      kind: "observed" as const,
      ...scaled,
      foodAccessGapLb: foodAccessGapLb({
        statewideFoodDistributed: row.foodDistributed,
        cityPopulation: access.cityPopulation,
        catchmentPopulation: access.catchmentPopulation,
        listedNearby: access.listedNearby,
        extraListings: 0,
        uncoveredPopulation: access.uncoveredPopulation,
      }),
    };
  });

  const future = forecast.map((row, offset) => {
    const ramp = expansionRamp(offset, forecast.length);
    const activityScale = activity + added * ramp;
    // Extra throughput with a lower waste rate: more matching, not more discard.
    const wasteScale = activity * (1 - wasteCut(access) * ramp);
    const staffScale = activity + added * ramp * 0.5;
    const scaled = scaleActivity(row, activityScale, wasteScale, staffScale);
    return {
      label: labelMonth(row.month),
      kind: "forecast" as const,
      ...scaled,
      foodAccessGapLb: foodAccessGapLb({
        statewideFoodDistributed: row.foodDistributed,
        cityPopulation: access.cityPopulation,
        catchmentPopulation: access.catchmentPopulation,
        listedNearby: access.listedNearby,
        extraListings: ramp,
        uncoveredPopulation: access.uncoveredPopulation,
      }),
    };
  });

  return [...history, ...future];
}

function readLocationAccess(request: AnalyticsRequest): LocationAccess {
  const data = loadDatasets();
  const geo = analyzeLocation({
    location: { label: "proposed", ...request.proposed },
    catchmentRadiusMeters: request.catchmentRadiusMeters,
  });
  const reach = computeReach(geo, null);
  return {
    cityPopulation: cityPopulationTotal(),
    listedCitywide: Math.max(1, data.services.length),
    catchmentPopulation: geo.estimatedCatchmentPopulation.value ?? 0,
    listedNearby: geo.listedServiceCount.value ?? 0,
    uncoveredPopulation: reach.populationOutsideAllListings.value ?? 0,
    cityPoverty: cityPovertyRate(),
    catchmentPoverty: geo.povertyRate.value,
  };
}

export function buildAnalyticsSimulation(request: AnalyticsRequest): AnalyticsResult {
  const food = readFoodRows();
  const unemployment = readBaltimoreUnemployment();
  const { forecastRows } = forecastBaseline(food, unemployment);
  const access = readLocationAccess(request);
  const baseline = baselinePeriods(food, forecastRows, access);
  const firstForecastIndex = 12;

  return {
    generatedAt: new Date().toISOString(),
    placeholder: false,
    proposed: request.proposed,
    catchmentRadiusMeters: request.catchmentRadiusMeters,
    baseline: { firstForecastIndex, periods: baseline },
    withNewLocation: {
      firstForecastIndex,
      periods: expansionPeriods(food, forecastRows, access),
    },
  };
}
