/**
 * Planner-chosen Maryland Food Bank partner sites. These names are the
 * published roster strings, not a claim about current hours or capacity.
 */
export const MARYLAND_FOOD_BANK_ORG_LABEL = "Maryland Food Bank";

export const MARYLAND_FOOD_BANK_SITE_NAMES = [
  "40 West Assistance & Referral",
  "Grace and Hope Mission",
  "South Creek Community Development Corporation",
] as const;

export const DEFAULT_SELECTED_SITE_NAME =
  "40 West Assistance & Referral" as const;

export function isMarylandFoodBankSite(
  name: string | null | undefined,
): boolean {
  return (
    typeof name === "string" &&
    (MARYLAND_FOOD_BANK_SITE_NAMES as readonly string[]).includes(name)
  );
}

export function serviceIdsByName(
  services: GeoJSON.FeatureCollection,
  names: readonly string[],
): Map<string, string> {
  const wanted = new Set(names);
  const found = new Map<string, string>();
  for (const feature of services.features) {
    const name = feature.properties?.name;
    const id = feature.properties?.id;
    if (typeof name === "string" && typeof id === "string" && wanted.has(name)) {
      found.set(name, id);
    }
  }
  return found;
}

export function marylandFoodBankIds(
  services: GeoJSON.FeatureCollection,
): Set<string> {
  return new Set(
    serviceIdsByName(services, MARYLAND_FOOD_BANK_SITE_NAMES).values(),
  );
}

export function defaultSelectedServiceId(
  services: GeoJSON.FeatureCollection,
): string | null {
  const byName = serviceIdsByName(services, MARYLAND_FOOD_BANK_SITE_NAMES);
  return (
    byName.get(DEFAULT_SELECTED_SITE_NAME) ??
    byName.values().next().value ??
    null
  );
}

export function idsToHighlight(
  selectedId: string | null,
  orgIds: Set<string>,
): Set<string> {
  if (!selectedId) return new Set();
  if (orgIds.has(selectedId)) return new Set(orgIds);
  return new Set([selectedId]);
}
