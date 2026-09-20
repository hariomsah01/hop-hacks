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

export interface SitePoint {
  lng: number;
  lat: number;
}

export interface ReferencePin {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

interface MapViewProps {
  proposed: SitePoint;
  reference: ReferencePin | null;
  catchmentRadiusMeters: number;
  onMoveProposed: (point: SitePoint) => void;
  onSelectReference: (id: string | null) => void;
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

/** The proposal is orange; the real pantry it is measured against is purple. */
const PROPOSED_COLOUR = "#c2410c";
const REFERENCE_COLOUR = "#5b3bc4";

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

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function buildProposedPin(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "pantry-pin";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", "Proposed pantry site. Drag to move.");
  el.style.cssText = `
    width: 34px; height: 34px; border-radius: 50% 50% 50% 8%;
    transform: rotate(45deg);
    background: ${PROPOSED_COLOUR};
    border: 3px solid #ffffff;
    box-shadow: 0 4px 14px rgb(15 37 64 / 0.4);
    display: flex; align-items: center; justify-content: center;
    cursor: grab;
  `;
  const text = document.createElement("span");
  text.textContent = "+";
  text.style.cssText =
    "transform: rotate(-45deg); color: #fff; font-weight: 700; font-size: 20px; line-height: 1;";
  el.appendChild(text);
  return el;
}

export default function MapView({
  proposed,
  reference,
  catchmentRadiusMeters,
  onMoveProposed,
  onSelectReference,
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
  const [showTracts, setShowTracts] = useState(true);
  const [showServices, setShowServices] = useState(true);

  // Keep the latest callbacks without re-running the map setup effect.
  const onMoveRef = useRef(onMoveProposed);
  const onSelectRef = useRef(onSelectReference);
  const selectedIdRef = useRef<string | null>(reference?.id ?? null);
  useEffect(() => {
    onMoveRef.current = onMoveProposed;
    onSelectRef.current = onSelectReference;
    selectedIdRef.current = reference?.id ?? null;
  }, [onMoveProposed, onSelectReference, reference]);

  // ------------------------------------------------------------- load layers
  useEffect(() => {
    let cancelled = false;
    fetch("/api/layers")
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
      map.addSource("tracts", { type: "geojson", data: layers.tracts });
      map.addLayer({
        id: "tracts-fill",
        type: "fill",
        source: "tracts",
        paint: {
          // Shaded by population density; tracts without population stay grey.
          "fill-color": [
            "case",
            ["==", ["get", "densityPerSqKm"], null],
            "#e5e7eb",
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
          ],
          "fill-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "tracts-outline",
        type: "line",
        source: "tracts",
        paint: { "line-color": "#9fb3c4", "line-width": 0.5 },
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

      // Drawn above the roster so the chosen pantry stays legible when
      // listings sit on top of each other. The filter is set separately.
      map.addLayer({
        id: "services-selected",
        type: "circle",
        source: "services",
        filter: ["==", ["get", "id"], "__none__"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 15, 13],
          "circle-color": REFERENCE_COLOUR,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });

      const popup = new Popup({ closeButton: false, offset: 12 });
      map.on("mouseenter", "services-points", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, string | null>;
        const isSelected = props.id === selectedIdRef.current;
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
              `<span style="font-size:12px;color:#3d5a7d">${notes}</span><br/>` +
              `<span style="font-size:12px;font-weight:600;color:${REFERENCE_COLOUR}">${
                isSelected
                  ? "Click to clear this comparison"
                  : "Click to compare your site against this one"
              }</span>`,
          )
          .addTo(map);
      });
      map.on("mouseleave", "services-points", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("click", "services-points", (event) => {
        const props = event.features?.[0]?.properties as
          | Record<string, string>
          | undefined;
        const id = props?.id;
        if (!id) return;
        // Clicking the chosen pantry again clears the comparison.
        onSelectRef.current(id === selectedIdRef.current ? null : id);
      });
    }
  }, [ready, layers, styleEpoch]);

  // ------------------------------------------------- selected service marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!map.getLayer("services-selected")) return;
    map.setFilter("services-selected", [
      "==",
      ["get", "id"],
      reference?.id ?? "__none__",
    ]);
  }, [ready, reference, layers, styleEpoch]);

  // ------------------------------------------------------- layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of ["tracts-fill", "tracts-outline"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showTracts ? "visible" : "none");
      }
    }
  }, [ready, showTracts, layers, styleEpoch]);

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
    if (!marker) {
      const created = new Marker({
        element: buildProposedPin(),
        draggable: true,
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

    const current = marker.getLngLat();
    if (
      Math.abs(current.lng - proposed.lng) > 1e-6 ||
      Math.abs(current.lat - proposed.lat) > 1e-6
    ) {
      marker.setLngLat([proposed.lng, proposed.lat]);
    }
  }, [ready, proposed]);

  // --------------------------------------------------------- catchment rings
  useEffect(() => {
    const map = mapRef.current;
    // `ready` already means a style document is loaded, which is all that is
    // required to attach a source.
    if (!map || !ready) return;

    const rings: Array<[string, string, SitePoint | null]> = [
      ["catchment-proposed", PROPOSED_COLOUR, proposed],
      ["catchment-reference", REFERENCE_COLOUR, reference],
    ];

    for (const [sourceId, colour, point] of rings) {
      // An unselected reference draws an empty collection rather than being
      // removed, so the layer ordering stays stable between renders.
      const data = point
        ? circleGeoJSON(point, catchmentRadiusMeters)
        : EMPTY_COLLECTION;

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
  }, [ready, proposed, reference, catchmentRadiusMeters, styleEpoch]);

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
      <div className="absolute left-3 top-3 z-10 w-52 rounded-lg border border-[var(--color-hairline)] bg-white/95 p-2.5 shadow-sm backdrop-blur">
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
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--color-hairline)] pt-2 text-[11px] text-[var(--color-navy-500)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PROPOSED_COLOUR }} />
            Proposed
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: REFERENCE_COLOUR }} />
            Compare
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
