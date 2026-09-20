import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stringifyJson } from "../scripts/ingest/lib.mjs";

describe("stringifyJson", () => {
  it("indents records but keeps primitive arrays on one line", () => {
    const text = stringifyJson([
      {
        id: "svc-1",
        sourceIds: ["pantries"],
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-76.6, 39.2],
              [-76.5, 39.3],
            ],
          ],
        },
      },
    ]);

    expect(text).toContain('\n  {\n    "id": "svc-1"');
    expect(text).toContain('"sourceIds": ["pantries"]');
    expect(text).toContain("[[-76.6,39.2],[-76.5,39.3]]");
    expect(JSON.parse(text)).toEqual([
      {
        id: "svc-1",
        sourceIds: ["pantries"],
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-76.6, 39.2],
              [-76.5, 39.3],
            ],
          ],
        },
      },
    ]);
  });
});

describe("processed caches", () => {
  it("keeps service listings as one readable object per pantry", () => {
    const text = readFileSync(
      path.join(process.cwd(), "data", "processed", "services.json"),
      "utf8",
    );
    expect(text.startsWith("[\n  {\n    \"id\":")).toBe(true);
    expect(JSON.parse(text).length).toBeGreaterThan(50);
  });
});
