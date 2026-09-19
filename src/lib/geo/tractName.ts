/**
 * Builds a readable label for a census tract.
 *
 * Baltimore's published tract layer stores the literal string "Census Tract"
 * in its name column for every row, so it cannot tell two tracts apart. The
 * tract code inside the GEOID can: a GEOID is a 2-digit state, a 3-digit
 * county and a 6-digit tract code, and the Census names tracts after that
 * code. Decoding a sourced identifier is not the same as inventing a value,
 * and the GEOID itself travels alongside the label everywhere it is shown.
 */
export function tractLabel(
  geoid: string,
  publisherName: string | null,
): string {
  const trimmed = publisherName?.trim() ?? "";
  const isPlaceholder = trimmed === "" || /^census tracts?$/i.test(trimmed);
  if (!isPlaceholder) return trimmed;

  const code = geoid.slice(-6);
  if (!/^\d{6}$/.test(code)) return `Tract ${geoid}`;

  // The last two digits are the suffix: "010100" is tract 101, "010102" is
  // tract 101.02.
  const major = String(Number(code.slice(0, 4)));
  const suffix = code.slice(4);
  return suffix === "00"
    ? `Census Tract ${major}`
    : `Census Tract ${major}.${suffix}`;
}
