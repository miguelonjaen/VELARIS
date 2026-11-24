export interface SourceContribution { id: string; name: string; amps: number | null; ageMs: number | null }

/** Never normalize a partial or asynchronous set of source readings to 100%. */
export function chargeContributions(sources: readonly SourceContribution[]) {
  const known = sources.filter(s => s.amps !== null && Number.isFinite(s.amps) && s.amps >= 0 && s.ageMs !== null && Number.isFinite(s.ageMs) && s.ageMs >= 0 && s.ageMs <= 15000);
  const ages = known.map(s => s.ageMs!);
  const synchronized = known.length > 0 && Math.max(...ages)-Math.min(...ages) <= 2000;
  const sum = known.reduce((total,s) => total+s.amps!,0);
  const complete = sources.length > 0 && known.length === sources.length && synchronized && Number.isFinite(sum);
  return {
    complete,
    totalAmps: complete ? sum : null,
    latestAgeMs: known.length ? Math.min(...ages) : null,
    activeNames: known.filter(s => s.amps! > 0).map(s => s.name),
    rows: sources.map(s => ({...s,percent:complete ? sum > 0 ? s.amps!/sum*100 : 0 : null})),
  };
}
