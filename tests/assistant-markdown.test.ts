import { describe, expect, it } from "vitest";
import { parseAssistantMarkdown } from "@/lib/ai/markdown";


describe("parseAssistantMarkdown", () => {
  it("renders headings, lists and source citations", () => {
    const blocks = parseAssistantMarkdown(
      [
        "## What the pin shows",
        "",
        "People in this ring — **18,400** (estimated) [tracts]",
        "",
        "### How to use this",
        "- Move the pin",
        "- Click a listed pantry [pantries]",
      ].join("\n"),
    );

    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1]?.type).toBe("paragraph");
    expect(blocks[2]).toMatchObject({ type: "heading", level: 3 });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: false });

    const paragraph = blocks[1];
    if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
    expect(paragraph.children.some((n) => n.type === "strong")).toBe(true);
    expect(
      paragraph.children.some((n) => n.type === "citation" && n.id === "tracts"),
    ).toBe(true);
  });

  it("splits grouped source citations", () => {
    const nodes = parseAssistantMarkdown(
      "Listed services (sourced) [pantries, food-access]",
    );
    const paragraph = nodes[0];
    if (paragraph?.type !== "paragraph") throw new Error("expected paragraph");
    const ids = paragraph.children
      .filter((n) => n.type === "citation")
      .map((n) => (n.type === "citation" ? n.id : ""));
    expect(ids).toEqual(["pantries", "food-access"]);
  });

  it("drops horizontal rules", () => {
    const blocks = parseAssistantMarkdown("Lead\n\n---\n\n### Next");
    expect(blocks.some((block) => block.type === "rule")).toBe(false);
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "heading"]);
  });

  it("treats HTML as plain text", () => {
    const blocks = parseAssistantMarkdown("<script>alert(1)</script>");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", value: "<script>alert(1)</script>" }],
    });
  });
});
