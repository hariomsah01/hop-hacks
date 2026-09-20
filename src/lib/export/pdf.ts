/**
 * A text-only PDF of the action plan. No extra library: Helvetica, wrapped
 * lines, one figure per page. The bytes come from the same markdown the
 * Markdown export uses, so the PDF cannot invent a number.
 */

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toWinAnsi(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function stripMarkup(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/_/g, "")
    .replace(/`/g, "")
    .replace(/^\s*-\s+/, "• ");
}

function wrapLine(line: string, max = 88): string[] {
  const clean = stripMarkup(toWinAnsi(line));
  if (clean.length <= max) return [clean];
  const words = clean.split(/\s+/);
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      rows.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : [""];
}

function buildPageStream(lines: string[], title: string, page: number, total: number): string {
  const commands: string[] = ["BT", "/F1 9 Tf", "14 TL", "48 744 Td"];
  commands.push(`(${pdfEscape(`${title}  ·  ${page} / ${total}`)}) Tj`, "T*");
  commands.push("/F1 10 Tf", "T*");
  for (const line of lines) {
    commands.push(`(${pdfEscape(line)}) Tj`, "T*");
  }
  commands.push("ET");
  return commands.join("\n");
}

export function buildActionPlanPdf(markdown: string): Uint8Array {
  const title = "PantryTwin action plan";
  const wrapped = markdown.split(/\r?\n/).flatMap((line) => wrapLine(line));
  const linesPerPage = 56;
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += linesPerPage) {
    pages.push(wrapped.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([""]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kidRefs = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kidRefs}] /Count ${pages.length} >>`);

  const fontObjectNumber = 3 + pages.length * 2;
  pages.forEach((lines, index) => {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const stream = buildPageStream(lines, title, index + 1, pages.length);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObject} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
    );
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(chunks.join("").length);
    chunks.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }
  const xrefAt = chunks.join("").length;
  const xrefLines = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f "];
  for (let i = 1; i <= objects.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n `);
  }
  chunks.push(
    `${xrefLines.join("\n")}\n`,
    "trailer\n",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    "startxref\n",
    `${xrefAt}\n`,
    "%%EOF\n",
  );
  return new TextEncoder().encode(chunks.join(""));
}
