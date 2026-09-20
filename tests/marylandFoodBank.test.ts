import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTED_SITE_NAME,
  defaultSelectedServiceId,
  idsToHighlight,
  isMarylandFoodBankSite,
  marylandFoodBankIds,
  serviceIdsByName,
} from "@/lib/orgs/marylandFoodBank";

function collection(
  rows: Array<{ id: string; name: string }>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: row,
    })),
  };
}

describe("Maryland Food Bank org selection", () => {
  const services = collection([
    { id: "svc-77", name: "40 West Assistance & Referral" },
    { id: "svc-53", name: "Grace and Hope Mission" },
    { id: "svc-61", name: "St. Vincent Emergency" },
    { id: "svc-48", name: "South Creek Community Development Corporation" },
    { id: "svc-1", name: "Some other pantry" },
  ]);

  it("resolves the three hardcoded roster names and ignores others", () => {
    const ids = marylandFoodBankIds(services);
    expect(ids.size).toBe(3);
    expect(ids.has("svc-61")).toBe(false);
    expect(ids.has("svc-1")).toBe(false);
    expect(
      serviceIdsByName(services, [DEFAULT_SELECTED_SITE_NAME]).get(
        DEFAULT_SELECTED_SITE_NAME,
      ),
    ).toBe("svc-77");
  });

  it("preselects 40 West when that roster name is present", () => {
    expect(defaultSelectedServiceId(services)).toBe("svc-77");
  });

  it("highlights the whole org when one partner is selected", () => {
    const orgIds = marylandFoodBankIds(services);
    const highlighted = idsToHighlight("svc-53", orgIds);
    expect(highlighted).toEqual(orgIds);
  });

  it("highlights only the clicked site when it is not in the org", () => {
    const orgIds = marylandFoodBankIds(services);
    expect(idsToHighlight("svc-1", orgIds)).toEqual(new Set(["svc-1"]));
  });

  it("recognises only the hardcoded partner names", () => {
    expect(isMarylandFoodBankSite("Grace and Hope Mission")).toBe(true);
    expect(isMarylandFoodBankSite("St. Vincent Emergency")).toBe(false);
    expect(isMarylandFoodBankSite("Some other pantry")).toBe(false);
    expect(isMarylandFoodBankSite(null)).toBe(false);
  });

  it("does not invent an id when a roster name is missing", () => {
    const partial = collection([{ id: "svc-53", name: "Grace and Hope Mission" }]);
    expect(marylandFoodBankIds(partial).size).toBe(1);
    expect(defaultSelectedServiceId(partial)).toBe("svc-53");
    expect(defaultSelectedServiceId(collection([]))).toBeNull();
  });
});
