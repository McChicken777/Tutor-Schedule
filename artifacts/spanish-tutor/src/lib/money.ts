// Money is stored and passed around as whole cents so arithmetic never hits
// floating-point rounding; it is only turned into euros at the point of display.
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Parses a typed euro amount ("15,99" or "15.99") into whole cents. */
export function parseEurosToCents(value: string): number | null {
  const normalised = value.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  return Math.round(parseFloat(normalised) * 100);
}
