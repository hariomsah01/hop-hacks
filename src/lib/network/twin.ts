import { booleanPointInPolygon, point as turfPoint } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { loadDatasets, sourcesFor } from "@/lib/data/datasets";
import type { SourceRecord } from "@/lib/contracts";

export type TwinMonthKind = "observed-input" | "forecast";

export interface TwinMonth {
  id: string;
  label: string;
  year: number;
  month: number;
  kind: TwinMonthKind;
  unemploymentRate: number;
  unemploymentLow: number;
  unemploymentHigh: number;
  networkPressureIndex: number;
  pressureLow: number;
  pressureHigh: number;
}

export interface TwinPantry {
  id: string;
  name: string;
  address: string | null;
  lng: number;
  lat: number;
  sourceIds: string[];
  tractName: string | null;
  localPopulation: number | null;
  localHouseholds: number | null;
  exposureMultiplier: number;
  pressureByMonth: number[];
}

export interface NetworkTwinResult {
  generatedAt: string;
  observedThrough: string;
  firstForecastIndex: number;
  months: TwinMonth[];
  pantries: TwinPantry[];

  network: {
    listedPantries: number;
    capacity: null;
    unmetVisits: null;
  };

  methodology: string[];
  limitations: string[];
  sources: SourceRecord[];
  modelVersion: string;
}

interface ObservedRate {
  year: number;
  month: number;
  value: number;
}

/**
 * BLS Baltimore City unemployment data.
 * Series: LAUCN245100000000003
 *
 * October 2025 is excluded because BLS reports that month
 * as unavailable.
 */
const OBSERVED_RATES: ObservedRate[] = [
  [2023, 1, 3.5],
  [2023, 2, 3.2],
  [2023, 3, 2.8],
  [2023, 4, 2.1],
  [2023, 5, 2.3],
  [2023, 6, 2.6],
  [2023, 7, 2.8],
  [2023, 8, 3.2],
  [2023, 9, 2.9],
  [2023, 10, 3.4],
  [2023, 11, 3.3],
  [2023, 12, 3.2],

  [2024, 1, 4.2],
  [2024, 2, 4.1],
  [2024, 3, 3.9],
  [2024, 4, 3.6],
  [2024, 5, 3.8],
  [2024, 6, 4.4],
  [2024, 7, 4.7],
  [2024, 8, 4.9],
  [2024, 9, 4.1],
  [2024, 10, 4.5],
  [2024, 11, 4.5],
  [2024, 12, 4.2],

  [2025, 1, 5.1],
  [2025, 2, 5.0],
  [2025, 3, 4.8],
  [2025, 4, 4.4],
  [2025, 5, 4.9],
  [2025, 6, 5.5],
  [2025, 7, 5.7],
  [2025, 8, 6.0],
  [2025, 9, 5.5],
  [2025, 11, 5.5],
  [2025, 12, 5.0],

  [2026, 1, 6.4],
  [2026, 2, 6.2],
  [2026, 3, 5.6],
  [2026, 4, 5.5],
  [2026, 5, 5.4],
  [2026, 6, 5.5],
  [2026, 7, 5.7],
].map(([year, month, value]) => ({
  year,
  month,
  value,
}));

const BLS_SOURCE: SourceRecord = {
  id: "bls-lau-baltimore-unemployment",
  publisher: "U.S. Bureau of Labor Statistics",
  title: "Baltimore City unemployment rate (LAUCN245100000000003)",
  landingUrl: "https://www.bls.gov/lau/",
  downloadUrl:
    "https://api.bls.gov/publicAPI/v2/timeseries/data/LAUCN245100000000003",
  retrievedAt: "2026-09-19T00:00:00.000Z",
  dataVintage: "January 2023 through July 2026; July 2026 preliminary",
  geographicVintage: "Baltimore City, Maryland",
  terms: "U.S. federal government public data",
  checksum: null,
  notes:
    "Monthly, not seasonally adjusted. October 2025 is unavailable and is not imputed.",
};

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function monthId(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Converts unemployment into a demand-pressure index.
 *
 * 100 represents a 4.5% unemployment rate.
 * Each one-percentage-point difference changes the index by eight points.
 *
 * This is a pressure indicator, not observed pantry attendance.
 */
function pressureIndex(unemploymentRate: number): number {
  return (
    Math.round((100 + (unemploymentRate - 4.5) * 8) * 10) / 10
  );
}

/**
 * Fits a seasonal linear-trend model to the observed unemployment data.
 */
function fitSeasonalTrend(observed: ObservedRate[]) {
  const originYear = observed[0].year;

  const x = observed.map(
    (row) => (row.year - originYear) * 12 + row.month - 1,
  );

  const monthMeans = Array.from({ length: 12 }, (_, month) => {
    const values = observed
      .filter((row) => row.month === month + 1)
      .map((row) => row.value);

    return (
      values.reduce((sum, value) => sum + value, 0) /
      values.length
    );
  });

  const grandMean =
    observed.reduce((sum, row) => sum + row.value, 0) /
    observed.length;

  const seasonal = monthMeans.map(
    (mean) => mean - grandMean,
  );

  const deseasonal = observed.map(
    (row) => row.value - seasonal[row.month - 1],
  );

  const meanX =
    x.reduce((sum, value) => sum + value, 0) / x.length;

  const meanY =
    deseasonal.reduce((sum, value) => sum + value, 0) /
    deseasonal.length;

  const slope =
    x.reduce(
      (sum, value, index) =>
        sum +
        (value - meanX) *
          (deseasonal[index] - meanY),
      0,
    ) /
    x.reduce(
      (sum, value) => sum + (value - meanX) ** 2,
      0,
    );

  const intercept = meanY - slope * meanX;

  const residuals = observed.map(
    (row, index) =>
      row.value -
      (intercept +
        slope * x[index] +
        seasonal[row.month - 1]),
  );

  const rmse = Math.sqrt(
    residuals.reduce(
      (sum, value) => sum + value ** 2,
      0,
    ) / residuals.length,
  );

  return {
    originYear,
    intercept,
    slope,
    seasonal,
    rmse,
  };
}

/**
 * Creates the visible historical timeline and the next
 * twelve forecast months.
 */
function buildMonths(): TwinMonth[] {
  const model = fitSeasonalTrend(OBSERVED_RATES);

  const visibleObserved = OBSERVED_RATES.filter(
    (row) =>
      row.year > 2024 ||
      (row.year === 2024 && row.month >= 8),
  );

  const observedMonths: TwinMonth[] = visibleObserved.map(
    (row) => {
      const index = pressureIndex(row.value);

      return {
        id: monthId(row.year, row.month),

        label: monthName.format(
          new Date(
            Date.UTC(row.year, row.month - 1, 1),
          ),
        ),

        year: row.year,
        month: row.month,
        kind: "observed-input",
        unemploymentRate: row.value,
        unemploymentLow: row.value,
        unemploymentHigh: row.value,
        networkPressureIndex: index,
        pressureLow: index,
        pressureHigh: index,
      };
    },
  );

  const forecastMonths: TwinMonth[] = [];

  for (let horizon = 1; horizon <= 12; horizon += 1) {
    const zeroBased = 7 + horizon;

    const year =
      2026 + Math.floor(zeroBased / 12);

    const month =
      (zeroBased % 12) + 1;

    const x =
      (year - model.originYear) * 12 +
      month -
      1;

    const rate = Math.max(
      0,
      model.intercept +
        model.slope * x +
        model.seasonal[month - 1],
    );

    const interval =
      1.64 *
      model.rmse *
      Math.sqrt(1 + horizon / 12);

    const rounded =
      Math.round(rate * 10) / 10;

    const low = Math.max(
      0,
      Math.round((rate - interval) * 10) / 10,
    );

    const high =
      Math.round((rate + interval) * 10) / 10;

    forecastMonths.push({
      id: monthId(year, month),

      label: monthName.format(
        new Date(
          Date.UTC(year, month - 1, 1),
        ),
      ),

      year,
      month,
      kind: "forecast",
      unemploymentRate: rounded,
      unemploymentLow: low,
      unemploymentHigh: high,
      networkPressureIndex: pressureIndex(rounded),
      pressureLow: pressureIndex(low),
      pressureHigh: pressureIndex(high),
    });
  }

  return [
    ...observedMonths,
    ...forecastMonths,
  ];
}

/**
 * Finds the census tract containing a pantry location.
 */
function containingTract(lng: number, lat: number) {
  const point = turfPoint([lng, lat]);

  return loadDatasets().tracts.find((tract) => {
    try {
      return booleanPointInPolygon(
        point,
        tract.geometry as Polygon | MultiPolygon,
      );
    } catch {
      return false;
    }
  });
}

/**
 * Builds the complete Baltimore network digital twin.
 */
export function buildNetworkTwin(): NetworkTwinResult {
  const data = loadDatasets();
  const months = buildMonths();

  const tractPopulations = data.tracts
    .map((tract) => tract.population)
    .filter(
      (value): value is number =>
        value !== null && value > 0,
    );

  const maxPopulation = Math.max(
    ...tractPopulations,
    1,
  );

  const pantries = data.services.map<TwinPantry>(
    (service) => {
      const tract = containingTract(
        service.lng,
        service.lat,
      );

      const population =
        tract?.population ?? null;

      /*
       * This measures relative local exposure only.
       * It is not pantry capacity, utilization,
       * inventory, or observed attendance.
       */
      const exposureMultiplier =
        population === null
          ? 1
          : Math.round(
              (0.82 +
                0.48 *
                  Math.sqrt(
                    population / maxPopulation,
                  )) *
                100,
            ) / 100;

      return {
        id: service.id,
        name: service.name,
        address: service.address,
        lng: service.lng,
        lat: service.lat,
        sourceIds: service.sourceIds,

        tractName:
          tract?.name ?? null,

        localPopulation:
          population,

        localHouseholds:
          tract?.households ?? null,

        exposureMultiplier,

        pressureByMonth: months.map(
          (month) =>
            Math.round(
              month.networkPressureIndex *
                exposureMultiplier *
                10,
            ) / 10,
        ),
      };
    },
  );

  return {
    generatedAt: new Date().toISOString(),

    observedThrough: "2026-07",

    firstForecastIndex: months.findIndex(
      (month) => month.kind === "forecast",
    ),

    months,
    pantries,

    network: {
      listedPantries: pantries.length,
      capacity: null,
      unmetVisits: null,
    },

    methodology: [
      "A seasonal linear-trend model is fitted to BLS Baltimore City monthly unemployment rates from January 2023 through July 2026.",

      "The citywide demand-pressure index is a transparent transform of that economic indicator: 100 at 4.5% unemployment and eight index points per percentage-point difference.",

      "Each pantry's local pressure index adjusts the city index using the population of the census tract containing the published location.",
    ],

    limitations: [
      "The index is an economic pressure signal, not observed pantry attendance or a count of households needing food.",

      "The public roster does not report pantry capacity, inventory, staffing, households served or unmet visits. Those values remain unavailable.",

      "Forecast intervals reflect time-series error only; they do not cover policy shocks, closures, supply disruptions or roster errors.",

      "October 2025 is absent because BLS reports the value as unavailable; it is not silently replaced with zero.",
    ],

    sources: [
      ...sourcesFor([
        "tracts",
        "pantries",
        "food-access",
      ]),

      BLS_SOURCE,
    ],

    modelVersion:
      "pantrytwin-network-0.1.0",
  };
}