"use client";

import {
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  config as maplibreConfig,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Layers, LocateFixed, RotateCcw } from "lucide-react";
import { BALTIMORE_CITY_BBOX, BALTIMORE_CITY_CENTER } from "@/lib/contracts";
import { applyPressureToCollection } from "@/lib/geo/pressure";

export interface SitePoint {
  lng: number;
  lat: number;
}

interface MapViewProps {
  proposed: SitePoint;
  catchmentRadiusMeters: number;
  onMoveProposed: (point: SitePoint) => void;
  onChangeRadius: (meters: number) => void;
  onReset: () => void;
}

interface LayerPayload {
  tracts: GeoJSON.FeatureCollection;
  services: GeoJSON.FeatureCollection;
  boundary: GeoJSON.Feature | null;
}

const DEFAULT_STYLE =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/**
 * MapLibre 6 works out its own worker URL from `import.meta.url` and returns
 * an empty string when that is not an http(s) URL. A bundler rewrites
 * `import.meta.url`, so the lookup fails silently: no worker starts, every
 * GeoJSON source stays unloaded, and the map shows a background with no data
 * on it. Pointing at the copies that `scripts/copy-maplibre-worker.mjs` places
 * in public/ removes the guesswork.
 */
maplibreConfig.WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** How long to wait for the hosted basemap before drawing without it. */
const BASEMAP_TIMEOUT_MS = 5000;

/**
 * A self-contained style with no external sources, sprite or glyphs.
 *
 * MapLibre does not ship a basemap, so the hosted tile provider is a third
 * party that can be blocked, rate limited or simply offline on venue wifi.
 * When that happens the style never finishes loading and no custom layer can
 * be attached, which would leave the analysis invisible. Falling back to this
 * style keeps the tracts, services and catchments on screen regardless.
 */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#eef3f6" },
    },
  ],
};

/** The proposed pin and its straight-line catchment. */
const PROPOSED_COLOUR = "#c2410c";

function formatRadiusKm(meters: number): string {
  const km = meters / 1000;
  return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;
}

/** Builds a great-circle ring so the drawn catchment matches the analysis. */
function circleGeoJSON(
  centre: SitePoint,
  radiusMeters: number,
  steps = 128,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const latRadius = radiusMeters / 111_320;
  const lngRadius =
    radiusMeters / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([
      centre.lng + lngRadius * Math.cos(angle),
      centre.lat + latRadius * Math.sin(angle),
    ]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

function buildProposedPin(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "pantry-pin";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", "Proposed pantry site. Drag to move.");
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%;
    background: ${PROPOSED_COLOUR};
    border: 3px solid #ffffff;
    box-shadow: 0 4px 14px rgb(15 37 64 / 0.4);
    display: flex; align-items: center; justify-content: center;
    cursor: grab;
  `;
  const cross = document.createElement("span");
  cross.setAttribute("aria-hidden", "true");
  cross.style.cssText = "position: relative; width: 12px; height: 12px; display: block;";
  const bar = (extra: string) => {
    const piece = document.createElement("span");
    piece.style.cssText = `
      position: absolute; left: 50%; top: 50%;
      background: #fff; border-radius: 1px;
      transform: translate(-50%, -50%);
      ${extra}
    `;
    return piece;
  };
  cross.appendChild(bar("width: 12px; height: 2px;"));
  cross.appendChild(bar("width: 2px; height: 12px;"));
  el.appendChild(cross);
  return el;
}

export default function MapView({
  proposed,
  catchmentRadiusMeters,
  onMoveProposed,
  onChangeRadius,
  onReset,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const proposedMarkerRef = useRef<Marker | null>(null);
  /** True once a style document is usable, regardless of source loading. */
  const styleLoadedRef = useRef(false);
  /**
   * Incremented every time a style finishes loading. Custom sources are wiped
   * by a style change, so layer installation is keyed to this counter.
   * Zero means no style is usable yet.
   */
  const [styleEpoch, setStyleEpoch] = useState(0);
  const [basemapMissing, setBasemapMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = styleEpoch > 0;
  const [layers, setLayers] = useState<LayerPayload | null>(null);
  const [showTracts, setShowTracts] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showPressure, setShowPressure] = useState(true);

  // Keep the latest callbacks without re-running the map setup effect.
  const onMoveRef = useRef(onMoveProposed);
  useEffect(() => {
    onMoveRef.current = onMoveProposed;
  }, [onMoveProposed]);

  // ------------------------------------------------------------- load layers
  useEffect(() => {
    let cancelled = false;
    fetch("/api/layers?v=pressure-0.1.0")
      .then((res) => {
        if (!res.ok) throw new Error(`Layer request failed (${res.status})`);
        return res.json();
      })
      .then((payload: LayerPayload) => {
        if (!cancelled) setLayers(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`Could not load map data: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------ create map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const styleUrl =
      process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || DEFAULT_STYLE;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: styleUrl,
        center: BALTIMORE_CITY_CENTER,
        zoom: 11.6,
        maxBounds: [
          [BALTIMORE_CITY_BBOX[0] - 0.35, BALTIMORE_CITY_BBOX[1] - 0.35],
          [BALTIMORE_CITY_BBOX[2] + 0.35, BALTIMORE_CITY_BBOX[3] + 0.35],
        ],
        attributionControl: false,
      });
    } catch (err) {
      setError(
        `The map could not start: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    mapRef.current = map;
    // Basemap attribution stays visible, as the tile provider requires.
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (event) => {
      const message = event.error?.message ?? "Unknown map error";
      // Missing sprite/glyph warnings are noisy but not fatal.
      if (/sprite|glyph/i.test(message)) return;
      setError(`Map error: ${message}`);
    });

    // `style.load` fires for the initial style and again after any setStyle.
    map.on("style.load", () => {
      styleLoadedRef.current = true;
      setStyleEpoch((epoch) => epoch + 1);
    });

    // If the hosted basemap has not finished loading in time, drop to the
    // built-in style so our own layers can still be attached.
    //
    // This deliberately tracks the style document rather than calling
    // isStyleLoaded(), which also waits on our own GeoJSON sources and would
    // discard a perfectly good basemap while the tract data was still parsing.
    const basemapFallback = setTimeout(() => {
      if (styleLoadedRef.current) return;
      setBasemapMissing(true);
      map.setStyle(FALLBACK_STYLE);
    }, BASEMAP_TIMEOUT_MS);

    // Keep the canvas in step with the collapsible side panels.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      clearTimeout(basemapFallback);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      proposedMarkerRef.current = null;
      setStyleEpoch(0);
    };
  }, []);

  // --------------------------------------------------------- add data layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !layers) return;

    if (!map.getSource("tracts")) {
      map.addSource("tracts", {
        type: "geojson",
        data: applyPressureToCollection(layers.tracts, catchmentRadiusMeters),
      });
      map.addLayer({
        id: "tracts-fill",
        type: "fill",
        source: "tracts",
        paint: {
          // Shaded by population density; tracts without population stay grey.
          "fill-color": [
            "case",
            ["==", ["typeof", ["get", "densityPerSqKm"]], "number"],
            [
              "interpolate",
              ["linear"],
              ["get", "densityPerSqKm"],
              0, "#f0f9f8",
              2000, "#c3e8e5",
              5000, "#7fcfc9",
              9000, "#3fa9a3",
              15000, "#0b6b6b",
            ],
            "#e5e7eb",
          ],
          "fill-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "pressure-fill",
        type: "fill",
        source: "tracts",
        paint: {
          "fill-color": [
            "case",
            ["==", ["typeof", ["get", "pressureIndex"]], "number"],
            [
              "interpolate",
              ["linear"],
              ["get", "pressureIndex"],
              0, "#fff7ed",
              25, "#fdba74",
              50, "#f97316",
              75, "#c2410c",
              100, "#7c2d12",
            ],
            "#e5e7eb",
          ],
          "fill-opacity": [
            "case",
            ["==", ["typeof", ["get", "pressureIndex"]], "number"],
            ["interpolate", ["linear"], ["get", "pressureIndex"], 0, 0.18, 100, 0.72],
            0.2,
          ],
        },
      });
      map.addLayer({
        id: "tracts-outline",
        type: "line",
        source: "tracts",
        paint: { "line-color": "#9fb3c4", "line-width": 0.5 },
      });

      const tractPopup = new Popup({ closeButton: false, offset: 12 });
      const showTractPopup = (event: { lngLat: { lng: number; lat: number }; features?: Array<{ properties?: Record<string, unknown> }> }) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties ?? {};
        const escape = (value: string) =>
          value.replace(/[<>&]/g, (c) =>
            c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
          );
        const label =
          typeof props.name === "string" && props.name.length > 0
            ? props.name
            : "Census tract";
        const index =
          typeof props.pressureIndex === "number" ? props.pressureIndex : null;
        const poverty =
          typeof props.povertyRate === "number" ? props.povertyRate : null;
        const people =
          typeof props.population === "number" ? props.population : null;
        const nearest =
          typeof props.nearestListedMeters === "number"
            ? props.nearestListedMeters
            : null;
        const figure = (value: number | null, suffix: string) =>
          value === null ? "Unavailable" : `${value}${suffix}`;
        tractPopup
          .setLngLat(event.lngLat)
          .setHTML(
            `<strong style="color:#0f2540">${escape(label)}</strong><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">Coverage pressure: ${figure(index, " / 100")} <em>(estimated)</em></span><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">Poverty rate: ${poverty === null ? "Unavailable" : `${(poverty * 100).toFixed(1)}%`} <em>(sourced)</em></span><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">People: ${people === null ? "Unavailable" : people.toLocaleString("en-US")} <em>(sourced)</em></span><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">Nearest listed pantry: ${nearest === null ? "Unavailable" : `${Math.round(nearest)} m`} <em>(straight-line)</em></span>`,
          )
          .addTo(map);
      };
      map.on("mouseenter", "pressure-fill", showTractPopup);
      map.on("mouseenter", "tracts-fill", showTractPopup);
      map.on("mouseleave", "pressure-fill", () => {
        map.getCanvas().style.cursor = "";
        tractPopup.remove();
      });
      map.on("mouseleave", "tracts-fill", () => {
        map.getCanvas().style.cursor = "";
        tractPopup.remove();
      });
    }

    if (layers.boundary && !map.getSource("city-boundary")) {
      map.addSource("city-boundary", { type: "geojson", data: layers.boundary });
      map.addLayer({
        id: "city-boundary-line",
        type: "line",
        source: "city-boundary",
        paint: { "line-color": "#0f2540", "line-width": 2, "line-dasharray": [3, 2] },
      });
    }

    if (!map.getSource("services")) {
      map.addSource("services", { type: "geojson", data: layers.services });
      map.addLayer({
        id: "services-points",
        type: "circle",
        source: "services",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 7],
          "circle-color": "#0f2540",
          "circle-opacity": 0.75,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      const popup = new Popup({ closeButton: false, offset: 12 });
      map.on("mouseenter", "services-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string | null>;
        // Publisher free text is escaped into the DOM as data, never markup.
        const escape = (value: string) =>
          value.replace(/[<>&]/g, (c) =>
            c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
          );
        const notes = props.publishedHours
          ? `${escape(props.publishedHours)} <em>(publisher note, not verified)</em>`
          : "<em>no hours or capacity published</em>";
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<strong style="color:#0f2540">${escape(props.name ?? "Listing")}</strong><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">${escape(props.address ?? "address not published")}</span><br/>` +
              `<span style="font-size:12px;color:#3d5a7d">${notes}</span>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "services-points", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    }
  }, [ready, layers, styleEpoch]);

  // ------------------------------------------ pressure scores vs assumed ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !layers) return;
    const source = map.getSource("tracts") as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      applyPressureToCollection(layers.tracts, catchmentRadiusMeters),
    );
  }, [ready, layers, catchmentRadiusMeters, styleEpoch]);

  // ------------------------------------------------------- layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("tracts-fill")) {
      map.setLayoutProperty(
        "tracts-fill",
        "visibility",
        showTracts ? "visible" : "none",
      );
    }
    const outlineOn = showTracts || showPressure;
    if (map.getLayer("tracts-outline")) {
      map.setLayoutProperty(
        "tracts-outline",
        "visibility",
        outlineOn ? "visible" : "none",
      );
    }
  }, [ready, showTracts, showPressure, layers, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("pressure-fill")) {
      map.setLayoutProperty(
        "pressure-fill",
        "visibility",
        showPressure ? "visible" : "none",
      );
    }
  }, [ready, showPressure, layers, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("services-points")) {
      map.setLayoutProperty(
        "services-points",
        "visibility",
        showServices ? "visible" : "none",
      );
    }
  }, [ready, showServices, layers, styleEpoch]);

  // ------------------------------------------------------ proposed site pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const marker = proposedMarkerRef.current;
    if (marker && marker.getElement().style.height !== "28px") {
      marker.remove();
      proposedMarkerRef.current = null;
    }
    if (!proposedMarkerRef.current) {
      const created = new Marker({
        element: buildProposedPin(),
        draggable: true,
        anchor: "center",
      })
        .setLngLat([proposed.lng, proposed.lat])
        .addTo(map);
      created.on("dragend", () => {
        const { lng, lat } = created.getLngLat();
        onMoveRef.current({
          lng: Number(lng.toFixed(5)),
          lat: Number(lat.toFixed(5)),
        });
      });
      proposedMarkerRef.current = created;
      return;
    }

    const currentMarker = proposedMarkerRef.current;
    const current = currentMarker.getLngLat();
    if (
      Math.abs(current.lng - proposed.lng) > 1e-6 ||
      Math.abs(current.lat - proposed.lat) > 1e-6
    ) {
      currentMarker.setLngLat([proposed.lng, proposed.lat]);
    }
  }, [ready, proposed]);

  // --------------------------------------------------------- catchment rings
  useEffect(() => {
    const map = mapRef.current;
    // `ready` already means a style document is loaded, which is all that is
    // required to attach a source.
    if (!map || !ready) return;

    const rings: Array<[string, string, SitePoint]> = [
      ["catchment-proposed", PROPOSED_COLOUR, proposed],
    ];

    for (const [sourceId, colour, point] of rings) {
      const data = circleGeoJSON(point, catchmentRadiusMeters);

      const existing = map.getSource(sourceId) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        continue;
      }
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: `${sourceId}-fill`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": colour, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: `${sourceId}-line`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": colour,
          "line-width": 2,
          "line-dasharray": [2, 1.5],
        },
      });
    }
  }, [ready, proposed, catchmentRadiusMeters, styleEpoch]);

  const recentre = useCallback(() => {
    mapRef.current?.fitBounds(
      [
        [BALTIMORE_CITY_BBOX[0], BALTIMORE_CITY_BBOX[1]],
        [BALTIMORE_CITY_BBOX[2], BALTIMORE_CITY_BBOX[3]],
      ],
      { padding: 40, duration: 600 },
    );
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Map of Baltimore City" />

      {/* Layer controls */}
      <div className="absolute left-3 top-3 z-10 w-56 rounded-lg border border-[var(--color-hairline)] bg-white/95 p-2.5 shadow-sm backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-navy-500)]">
            <Layers size={12} aria-hidden /> Layers
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={recentre}
              title="Fit Baltimore City"
              className="rounded p-1 text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)] hover:text-[var(--color-navy-800)]"
            >
              <LocateFixed size={13} aria-hidden />
              <span className="sr-only">Fit city</span>
            </button>
            <button
              type="button"
              onClick={onReset}
              title="Reset proposed site"
              className="rounded p-1 text-[var(--color-navy-500)] hover:bg-[var(--color-teal-50)] hover:text-[var(--color-navy-800)]"
            >
              <RotateCcw size={13} aria-hidden />
              <span className="sr-only">Reset proposed site</span>
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
          <input
            type="checkbox"
            checked={showPressure}
            onChange={(e) => setShowPressure(e.target.checked)}
            className="accent-[var(--color-teal-600)]"
          />
          Coverage pressure
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
          <input
            type="checkbox"
            checked={showTracts}
            onChange={(e) => setShowTracts(e.target.checked)}
            className="accent-[var(--color-teal-600)]"
          />
          Population density
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
          <input
            type="checkbox"
            checked={showServices}
            onChange={(e) => setShowServices(e.target.checked)}
            className="accent-[var(--color-teal-600)]"
          />
          Listed pantries
        </label>
        <div className="mt-2 border-t border-[var(--color-hairline)] pt-2">
          <label className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-medium text-[var(--color-navy-600)]">
              Straight-line radius
            </span>
            <span className="tabular-nums text-[var(--color-navy-800)]">
              {formatRadiusKm(catchmentRadiusMeters)}
            </span>
          </label>
          <input
            type="range"
            min={200}
            max={5000}
            step={100}
            value={catchmentRadiusMeters}
            onChange={(e) => onChangeRadius(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="Straight-line catchment radius"
          />
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-navy-400)]">
            Assumed ring, not walking or drive time.
          </p>
        </div>
        {showPressure && (
          <div className="mt-2 border-t border-[var(--color-hairline)] pt-2">
            <p className="text-[10px] font-medium text-[var(--color-navy-600)]">
              Coverage pressure
            </p>
            <div
              className="mt-1 h-2 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #fff7ed 0%, #fdba74 25%, #f97316 50%, #c2410c 75%, #7c2d12 100%)",
              }}
              aria-hidden
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-[var(--color-navy-400)]">
              <span>Lower</span>
              <span>Higher</span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-navy-400)]">
              Estimated people × poverty × straight-line gap to the nearest
              listed pantry.
            </p>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--color-hairline)] pt-2 text-[11px] text-[var(--color-navy-500)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PROPOSED_COLOUR }} />
            Proposed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#0f2540]" />
            Listed
          </span>
        </div>
      </div>

      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-canvas)]/80">
          <div className="flex items-center gap-2 text-sm text-[var(--color-navy-500)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-teal-600)] border-t-transparent" />
            Loading Baltimore map…
          </div>
        </div>
      )}

      {basemapMissing && !error && (
        <div className="absolute bottom-3 left-3 z-10 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/95 px-2 py-1.5 text-[11px] text-amber-900">
          <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
          <span>
            Street basemap unreachable. Showing Baltimore data layers only; the
            analysis is unaffected.
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-4 z-30 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{error}</p>
            <p className="mt-0.5 text-xs">
              The analysis still runs; only the map display is affected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
