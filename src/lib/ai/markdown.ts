/**
 * Small Markdown subset for assistant replies.
 *
 * The model is asked to write headings, lists and source-id citations.
 * HTML is never interpreted, so dataset text cannot inject markup.
 */

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; value: string }
  | { type: "citation"; id: string };

export type BlockNode =
  | { type: "heading"; level: 2 | 3; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "quote"; children: InlineNode[] }
  | { type: "rule" };

const SOURCE_ID = /^(acs|tracts|pantries|food-access|city-boundary|[a-z][a-z0-9-]{1,32})$/;

export function parseAssistantMarkdown(text: string): BlockNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trimEnd();

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      i += 1;
      continue;
    }

    const heading = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const level = heading[1].length === 2 ? 2 : 3;
      blocks.push({
        type: "heading",
        level,
        children: parseInline(heading[2] ?? ""),
      });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trimStart())) {
        quoted.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({
        type: "quote",
        children: parseInline(quoted.join(" ").trim()),
      });
      continue;
    }

    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: InlineNode[][] = [];
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i] ?? "")) {
        items.push(
          parseInline((lines[i] ?? "").replace(/^\s*(?:[-*]|\d+\.)\s+/, "")),
        );
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^(#{2,3})\s+/.test((lines[i] ?? "").trim()) &&
      !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i] ?? "") &&
      !/^>\s?/.test(lines[i] ?? "") &&
      !/^[-*_]{3,}$/.test((lines[i] ?? "").trim())
    ) {
      paragraph.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({
      type: "paragraph",
      children: parseInline(paragraph.join(" ").trim()),
    });
  }

  return blocks;
}

const CITATION_GROUP =
  /\[((?:[a-z][a-z0-9-]{1,32})(?:\s*,\s*[a-z][a-z0-9-]{1,32})*)\]/;

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const token =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[a-z][a-z0-9-]{1,32}(?:\s*,\s*[a-z][a-z0-9-]{1,32})*\]|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(input)) !== null) {
    if (match.index > last) {
      nodes.push({ type: "text", value: input.slice(last, match.index) });
    }
    const chunk = match[0];
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      nodes.push({
        type: "strong",
        children: [{ type: "text", value: chunk.slice(2, -2) }],
      });
    } else if (chunk.startsWith("`") && chunk.endsWith("`")) {
      nodes.push({ type: "code", value: chunk.slice(1, -1) });
    } else if (chunk.startsWith("[") && chunk.endsWith("]")) {
      const grouped = CITATION_GROUP.exec(chunk);
      const ids = grouped?.[1]
        ?.split(",")
        .map((id) => id.trim())
        .filter((id) => SOURCE_ID.test(id));
      if (ids && ids.length > 0) {
        for (const id of ids) nodes.push({ type: "citation", id });
      } else {
        nodes.push({ type: "text", value: chunk });
      }
    } else if (chunk.startsWith("*") && chunk.endsWith("*")) {
      nodes.push({
        type: "em",
        children: [{ type: "text", value: chunk.slice(1, -1) }],
      });
    }
    last = match.index + chunk.length;
  }

  if (last < input.length) {
    nodes.push({ type: "text", value: input.slice(last) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value: input }];
}
