export function formatFantasyPoints(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }

  return String(Math.round(numeric));
}
