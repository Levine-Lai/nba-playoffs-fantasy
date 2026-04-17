export function getDisplayTeamName(teamName: string | null | undefined, fallbackName: string | null | undefined) {
  const normalizedTeamName = String(teamName ?? "").trim();
  const normalizedFallback = String(fallbackName ?? "").trim();

  if (!normalizedTeamName) {
    return normalizedFallback;
  }

  if (normalizedFallback && normalizedTeamName === `${normalizedFallback} Squad`) {
    return normalizedFallback;
  }

  return normalizedTeamName;
}
