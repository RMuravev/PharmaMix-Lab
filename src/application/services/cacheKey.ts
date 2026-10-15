/** Stable key builder: cache identity includes data and algorithm versions, not approximate totals. */
export function createCalculationCacheKey(input: {
  calculationType: string;
  datasetVersion: string;
  algorithmVersion: string;
  params: unknown;
  filters?: unknown;
}): string {
  return `${input.calculationType}:${stableSerialize({
    datasetVersion: input.datasetVersion,
    algorithmVersion: input.algorithmVersion,
    params: input.params,
    filters: input.filters ?? null,
  })}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`;
}
