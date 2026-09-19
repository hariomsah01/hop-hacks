"use client";

import { circle as turfCircle } from "@turf/turf";

import {
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  config as maplibreConfig,
} from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  Layers,
  LocateFixed,
} from "lucide-react";

import {
  BALTIMORE_CITY_BBOX,
  BALTIMORE_CITY_CENTER,
} from "@/lib/contracts";

import type {
  TwinPantry,
} from "@/lib/network/twin";

interface LayerPayload {
  tracts: GeoJSON.FeatureCollection;
  services: GeoJSON.FeatureCollection;
  boundary: GeoJSON.Feature | null;
}

interface NetworkTwinMapProps {
  pantries: TwinPantry[];
  monthIndex: number;
  monthLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  comparisonMode: boolean;
  proposed: { lng: number; lat: number } | null;
  catchmentRadiusMeters: number;
  onPropose: (point: { lng: number; lat: number }) => void;
}

const DEFAULT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

maplibreConfig.WORKER_URL =
  "/maplibre/maplibre-gl-worker.mjs";

function escapeHtml(value: string): string {
  return value.replace(
    /[<>&]/g,
    (character) => {
      if (character === "<") return "&lt;";
      if (character === ">") return "&gt;";
      return "&amp;";
    },
  );
}

export default function NetworkTwinMap({
  pantries,
  monthIndex,
  monthLabel,
  selectedId,
  onSelect,
  comparisonMode,
  proposed,
  catchmentRadiusMeters,
  onPropose,
}: NetworkTwinMapProps) {
  const containerRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<MapLibreMap | null>(null);

  const onSelectRef =
    useRef(onSelect);

  const monthLabelRef =
    useRef(monthLabel);

  const comparisonModeRef =
    useRef(comparisonMode);

  const onProposeRef =
    useRef(onPropose);

  const [layers, setLayers] =
    useState<LayerPayload | null>(null);

  const [mapReady, setMapReady] =
    useState(false);

  const [showTracts, setShowTracts] =
    useState(true);

  const [showPantries, setShowPantries] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
    monthLabelRef.current = monthLabel;
    comparisonModeRef.current = comparisonMode;
    onProposeRef.current = onPropose;
  }, [onSelect, monthLabel, comparisonMode, onPropose]);

  /*
   * Load the same Baltimore data already used by
   * the existing PantryTwin map.
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/layers")
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Layer request failed (${response.status})`,
          );
        }

        return response.json() as Promise<LayerPayload>;
      })
      .then((payload) => {
        if (!cancelled) {
          setLayers(payload);
        }
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setError(
            `Could not load map data: ${reason.message}`,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Add the selected month's pressure value
   * to every pantry map feature.
   */
  const servicesWithPressure =
    useMemo<GeoJSON.FeatureCollection>(() => {
      if (!layers) {
        return {
          type: "FeatureCollection",
          features: [],
        };
      }

      const pressureById = new Map(
        pantries.map((pantry) => [
          pantry.id,
          pantry.pressureByMonth[
            monthIndex
          ] ?? null,
        ]),
      );

      return {
        ...layers.services,

        features:
          layers.services.features.map(
            (feature) => ({
              ...feature,

              properties: {
                ...(feature.properties ?? {}),

                pressureIndex:
                  pressureById.get(
                    String(
                      feature.properties?.id,
                    ),
                  ) ?? null,
              },
            }),
          ),
      };
    }, [
      layers,
      pantries,
      monthIndex,
    ]);

  const proposedPoint =
    useMemo<GeoJSON.FeatureCollection>(() => ({
      type: "FeatureCollection",
      features: proposed
        ? [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [proposed.lng, proposed.lat],
              },
              properties: {
                label: "Proposed pantry",
              },
            },
          ]
        : [],
    }), [proposed]);

  const proposedCatchment =
    useMemo<GeoJSON.FeatureCollection>(() => ({
      type: "FeatureCollection",
      features: proposed
        ? [
            turfCircle(
              [proposed.lng, proposed.lat],
              catchmentRadiusMeters / 1000,
              {
                steps: 128,
                units: "kilometers",
                properties: {
                  label: "Proposed catchment",
                },
              },
            ),
          ]
        : [],
    }), [proposed, catchmentRadiusMeters]);

  /*
   * Create the MapLibre map once.
   */
  useEffect(() => {
    if (
      !containerRef.current ||
      mapRef.current
    ) {
      return;
    }

    const map = new MapLibreMap({
      container: containerRef.current,

      style:
        process.env
          .NEXT_PUBLIC_MAP_STYLE_URL
          ?.trim() ||
        DEFAULT_STYLE,

      center:
        BALTIMORE_CITY_CENTER,

      zoom: 11.5,

      maxBounds: [
        [
          BALTIMORE_CITY_BBOX[0] -
            0.35,
          BALTIMORE_CITY_BBOX[1] -
            0.35,
        ],
        [
          BALTIMORE_CITY_BBOX[2] +
            0.35,
          BALTIMORE_CITY_BBOX[3] +
            0.35,
        ],
      ],

      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new AttributionControl({
        compact: true,
      }),
      "bottom-right",
    );

    map.addControl(
      new NavigationControl({
        showCompass: false,
      }),
      "top-right",
    );

    map.on("style.load", () => {
      setMapReady(true);
    });

    map.on("click", (event) => {
      if (!comparisonModeRef.current) return;

      const serviceLayer = map.getLayer("network-services-points");
      const serviceHit = serviceLayer
        ? map.queryRenderedFeatures(event.point, {
            layers: ["network-services-points"],
          }).length > 0
        : false;

      if (serviceHit) return;

      onProposeRef.current({
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      });
    });

    map.on("error", (event) => {
      const message =
        event.error?.message ??
        "Unknown map error";

      if (
        !/sprite|glyph/i.test(message)
      ) {
        setError(
          `Map error: ${message}`,
        );
      }
    });

    const resizeObserver =
      new ResizeObserver(() => {
        map.resize();
      });

    resizeObserver.observe(
      containerRef.current,
    );

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /*
   * Add census tracts, city boundary,
   * and pantry locations.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (
      !map ||
      !mapReady ||
      !layers
    ) {
      return;
    }

    if (
      !map.getSource(
        "network-tracts",
      )
    ) {
      map.addSource(
        "network-tracts",
        {
          type: "geojson",
          data: layers.tracts,
        },
      );

      map.addLayer({
        id: "network-tracts-fill",
        type: "fill",
        source: "network-tracts",

        paint: {
          "fill-color": [
            "case",

            [
              "==",
              [
                "get",
                "densityPerSqKm",
              ],
              null,
            ],

            "#e5e7eb",

            [
              "interpolate",
              ["linear"],

              [
                "get",
                "densityPerSqKm",
              ],

              0,
              "#f0f9f8",

              2500,
              "#d7efed",

              6500,
              "#9bd6d1",

              12000,
              "#4baea8",
            ],
          ],

          "fill-opacity": 0.38,
        },
      });

      map.addLayer({
        id: "network-tracts-line",
        type: "line",
        source: "network-tracts",

        paint: {
          "line-color": "#9fb3c4",
          "line-width": 0.5,
        },
      });
    }

    if (
      layers.boundary &&
      !map.getSource(
        "network-boundary",
      )
    ) {
      map.addSource(
        "network-boundary",
        {
          type: "geojson",
          data: layers.boundary,
        },
      );

      map.addLayer({
        id: "network-boundary-line",
        type: "line",
        source: "network-boundary",

        paint: {
          "line-color": "#0f2540",
          "line-width": 2,
          "line-dasharray": [
            3,
            2,
          ],
        },
      });
    }

    if (
      !map.getSource(
        "network-services",
      )
    ) {
      map.addSource(
        "network-services",
        {
          type: "geojson",
          data:
            servicesWithPressure,
        },
      );

      /*
       * Pantry color changes according
       * to monthly pressure.
       */
      map.addLayer({
        id: "network-services-points",
        type: "circle",
        source: "network-services",

        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],

            10,
            5,

            15,
            8,
          ],

          "circle-color": [
            "case",

            [
              "==",
              [
                "get",
                "pressureIndex",
              ],
              null,
            ],
            "#6b7280",

            [
              "<",
              [
                "get",
                "pressureIndex",
              ],
              100,
            ],
            "#0d8383",

            [
              "<",
              [
                "get",
                "pressureIndex",
              ],
              115,
            ],
            "#d97706",

            "#c2410c",
          ],

          "circle-opacity": 0.9,

          "circle-stroke-color":
            "#ffffff",

          "circle-stroke-width":
            1.4,
        },
      });

      /*
       * The selected pantry is shown
       * as a larger purple circle.
       */
      map.addLayer({
        id:
          "network-services-selected",

        type: "circle",

        source:
          "network-services",

        filter: [
          "==",
          ["get", "id"],
          "__none__",
        ],

        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],

            10,
            9,

            15,
            14,
          ],

          "circle-color":
            "#5b3bc4",

          "circle-stroke-color":
            "#ffffff",

          "circle-stroke-width":
            3,
        },
      });

      const popup = new Popup({
        closeButton: false,
        offset: 12,
      });

      map.on(
        "mouseenter",
        "network-services-points",
        (event) => {
          map.getCanvas().style.cursor =
            "pointer";

          const feature =
            event.features?.[0];

          if (!feature) return;

          const properties =
            feature.properties as Record<
              string,
              string | number | null
            >;

          const pressure = Number(
            properties.pressureIndex,
          );

          const name = escapeHtml(
            String(
              properties.name ??
                "Pantry listing",
            ),
          );

          const address =
            escapeHtml(
              String(
                properties.address ??
                  "Address not published",
              ),
            );

          const displayedPressure =
            Number.isFinite(pressure)
              ? pressure.toFixed(1)
              : "Unavailable";

          popup
            .setLngLat(event.lngLat)
            .setHTML(
              `<strong style="color:#0f2540">${name}</strong><br/>` +
                `<span style="font-size:12px;color:#3d5a7d">${address}</span><br/>` +
                `<span style="font-size:12px;color:#3d5a7d">${escapeHtml(
                  monthLabelRef.current,
                )} pressure index: <strong>${displayedPressure}</strong></span><br/>` +
                `<span style="font-size:12px;font-weight:600;color:#5b3bc4">Click to inspect this location</span>`,
            )
            .addTo(map);
        },
      );

      map.on(
        "mouseleave",
        "network-services-points",
        () => {
          map.getCanvas().style.cursor =
            comparisonModeRef.current
              ? "crosshair"
              : "";

          popup.remove();
        },
      );

      map.on(
        "click",
        "network-services-points",
        (event) => {
          const id = String(
            event.features?.[0]
              ?.properties?.id ?? "",
          );

          if (id) {
            onSelectRef.current(id);
          }
        },
      );
    }

    if (!map.getSource("network-proposed-catchment")) {
      map.addSource("network-proposed-catchment", {
        type: "geojson",
        data: proposedCatchment,
      });

      map.addLayer({
        id: "network-proposed-catchment-fill",
        type: "fill",
        source: "network-proposed-catchment",
        paint: {
          "fill-color": "#7c3aed",
          "fill-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "network-proposed-catchment-line",
        type: "line",
        source: "network-proposed-catchment",
        paint: {
          "line-color": "#6d28d9",
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      });
    }

    if (!map.getSource("network-proposed-point")) {
      map.addSource("network-proposed-point", {
        type: "geojson",
        data: proposedPoint,
      });

      map.addLayer({
        id: "network-proposed-point",
        type: "circle",
        source: "network-proposed-point",
        paint: {
          "circle-radius": 10,
          "circle-color": "#7c3aed",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
    }
  }, [
    mapReady,
    layers,
    servicesWithPressure,
    proposedCatchment,
    proposedPoint,
  ]);

  /*
   * Update pantry colors whenever
   * the selected month changes.
   */
  useEffect(() => {
    const source =
      mapRef.current?.getSource(
        "network-services",
      ) as
        | GeoJSONSource
        | undefined;

    source?.setData(
      servicesWithPressure,
    );
  }, [servicesWithPressure]);

  useEffect(() => {
    const pointSource = mapRef.current?.getSource(
      "network-proposed-point",
    ) as GeoJSONSource | undefined;
    const catchmentSource = mapRef.current?.getSource(
      "network-proposed-catchment",
    ) as GeoJSONSource | undefined;

    pointSource?.setData(proposedPoint);
    catchmentSource?.setData(proposedCatchment);
  }, [proposedPoint, proposedCatchment]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getCanvas().style.cursor = comparisonMode ? "crosshair" : "";
  }, [comparisonMode, mapReady]);

  /*
   * Update the selected pantry marker.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (
      !map?.getLayer(
        "network-services-selected",
      )
    ) {
      return;
    }

    map.setFilter(
      "network-services-selected",
      [
        "==",
        ["get", "id"],
        selectedId ?? "__none__",
      ],
    );
  }, [
    selectedId,
    mapReady,
  ]);

  /*
   * Show or hide census tracts.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    for (const layerId of [
      "network-tracts-fill",
      "network-tracts-line",
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showTracts
            ? "visible"
            : "none",
        );
      }
    }
  }, [
    showTracts,
    mapReady,
  ]);

  /*
   * Show or hide pantry locations.
   */
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    for (const layerId of [
      "network-services-points",
      "network-services-selected",
    ]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          showPantries
            ? "visible"
            : "none",
        );
      }
    }
  }, [
    showPantries,
    mapReady,
  ]);

  function fitCity() {
    mapRef.current?.fitBounds(
      [
        [
          BALTIMORE_CITY_BBOX[0],
          BALTIMORE_CITY_BBOX[1],
        ],

        [
          BALTIMORE_CITY_BBOX[2],
          BALTIMORE_CITY_BBOX[3],
        ],
      ],

      {
        padding: 36,
        duration: 500,
      },
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Baltimore pantry network map"
      />

      <div className="absolute left-3 top-3 z-10 rounded-lg border border-[var(--color-hairline)] bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-navy-500)]">
          <Layers
            size={13}
            aria-hidden
          />

          Network layers
        </div>

        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input
            type="checkbox"
            checked={showTracts}
            onChange={(event) =>
              setShowTracts(
                event.target.checked,
              )
            }
          />

          Population density
        </label>

        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
          <input
            type="checkbox"
            checked={showPantries}
            onChange={(event) =>
              setShowPantries(
                event.target.checked,
              )
            }
          />

          Existing pantries
        </label>

        <div className="mt-3 border-t border-[var(--color-hairline)] pt-2 text-xs">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-navy-500)]">
            Pressure index
          </p>

          <div className="flex items-center gap-2 py-0.5">
            <span className="h-3 w-3 rounded-full bg-[#0d8383]" />
            Below 100
          </div>

          <div className="flex items-center gap-2 py-0.5">
            <span className="h-3 w-3 rounded-full bg-[#d97706]" />
            100–114
          </div>

          <div className="flex items-center gap-2 py-0.5">
            <span className="h-3 w-3 rounded-full bg-[#c2410c]" />
            115 or higher
          </div>

          <div className="flex items-center gap-2 py-0.5">
            <span className="h-3 w-3 rounded-full bg-[#5b3bc4]" />
            {comparisonMode ? "Proposed pantry" : "Selected location"}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={fitCity}
        className="absolute right-3 top-20 z-10 flex items-center gap-1.5 rounded-lg border border-[var(--color-hairline)] bg-white/95 px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-[var(--color-teal-50)]"
      >
        <LocateFixed
          size={13}
          aria-hidden
        />

        Fit city
      </button>

      <p className="absolute bottom-2 left-3 z-10 rounded bg-white/90 px-2 py-1 text-xs text-[var(--color-navy-500)]">
        {comparisonMode
          ? proposed
            ? `Case B selected for ${monthLabel}. Click another empty point to move it.`
            : "Click an empty point in Baltimore to place the Case B pantry."
          : `Showing ${monthLabel}. Click a pantry to inspect its local timeline.`}
      </p>

      {!mapReady && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-canvas)]/80 text-sm text-[var(--color-navy-500)]">
          Loading network map…
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-4 z-30 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle
            size={16}
            className="mt-0.5 shrink-0"
            aria-hidden
          />

          {error}
        </div>
      )}
    </div>
  );
}
