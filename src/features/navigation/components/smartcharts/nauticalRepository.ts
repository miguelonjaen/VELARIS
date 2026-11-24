import type { FeatureCollection, Geometry } from 'geojson';
import type { NauticalProperties } from './nautical-portrayal';

const loaders = import.meta.glob<FeatureCollection<Geometry, NauticalProperties>>('./nautical/spain-*.json', { import: 'default' });
// Shared bounded promise cache: portrayal and analysis use the same immutable source.
const cache = new Map<string, Promise<FeatureCollection<Geometry, NauticalProperties>>>();
export function loadNauticalResource(resource: string): Promise<FeatureCollection<Geometry, NauticalProperties>> {
  const existing = cache.get(resource);
  if (existing) return existing;
  const loader = loaders[`./nautical/${resource}`];
  if (!loader) return Promise.reject(new Error('Recurso náutico local no disponible'));
  const pending = loader().catch((error: unknown) => { cache.delete(resource); throw error; });
  cache.set(resource, pending);
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  return pending;
}
