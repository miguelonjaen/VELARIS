import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {foldToponym, type GeographicKind, type GeographicReference, type GeographicResolution} from '../../shared/geographicReference';

export interface GeographicProvider { search(query: string): Promise<GeographicReference[]> }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validReference(v: unknown): v is GeographicReference {
  return record(v) && typeof v.name === 'string' && v.name.length > 0 && v.name.length <= 500 &&
    Array.isArray(v.position) && v.position.length === 2 && v.position.every(n=>typeof n === 'number' && Number.isFinite(n)) &&
    Math.abs(v.position[0]) <= 180 && Math.abs(v.position[1]) <= 90 &&
    typeof v.source === 'string' && /^https:\/\//.test(v.source) &&
    typeof v.sourceCoordinate === 'string' && typeof v.reference === 'string' &&
    typeof v.verifiedOn === 'string' && Number.isFinite(Date.parse(v.verifiedOn)) &&
    (v.aliases === undefined || Array.isArray(v.aliases) && v.aliases.length <= 100 && v.aliases.every(a=>typeof a === 'string' && a.length <= 500)) &&
    v.datum === 'WGS84' && v.navigationUse === false && typeof v.providerId === 'string' &&
    ['LOCALITY','PORT','PORT_ENTRANCE','ISLAND','CAPE','PLACE'].includes(String(v.kind));
}
export function parseNominatim(data: unknown, now = new Date().toISOString()): GeographicReference[] {
  if (!Array.isArray(data) || data.length > 20) throw new Error('GEOGRAPHY_INVALID_PROVIDER_RESPONSE');
  const results: GeographicReference[] = [];
  for (const row of data) {
    if (!record(row) || !['node','way','relation'].includes(String(row.osm_type)) ||
      !Number.isSafeInteger(row.osm_id) || Number(row.osm_id) <= 0 || typeof row.display_name !== 'string' ||
      typeof row.lon !== 'string' || typeof row.lat !== 'string' || !row.lon.trim() || !row.lat.trim()) continue;
    const tags = record(row.extratags) ? row.extratags : {};
    const type = String(row.type);
    const category = String(row.class ?? row.category);
    const kind: GeographicKind = type === 'island' || type === 'islet' ? 'ISLAND' :
      type === 'cape' ? 'CAPE' : type === 'harbour' || type === 'port' || type === 'marina' || tags.harbour === 'yes' || tags.industrial === 'port' || tags['seamark:type'] === 'harbour' ? 'PORT' :
      category === 'place' || category === 'boundary' ? 'LOCALITY' : 'PLACE';
    // Even an OSM harbour entrance is not promoted to a verified nautical entrance.
    const ref: GeographicReference = {name: row.display_name, position:[Number(row.lon),Number(row.lat)],
      kind, source:`https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`,
      aliases:[row.name,...(record(row.namedetails) ? Object.values(row.namedetails) : [])].filter((v): v is string=>typeof v === 'string' && v.length > 0 && v.length <= 500).slice(0,100),
      providerId:`osm:${row.osm_type}/${row.osm_id}`, datum:'WGS84', verifiedOn:now.slice(0,10), retrievedAt:now,
      attribution:'© OpenStreetMap contributors · ODbL-1.0', navigationUse:false,
      sourceCoordinate:`${row.lat}, ${row.lon} (representative OSM point)`,
      reference:'Referencia geográfica OSM; posición representativa, no entrada portuaria ni waypoint seguro. Fecha de consulta, no de actualización hidrográfica.'};
    if (validReference(ref) && !results.some(r=>r.providerId === ref.providerId)) results.push(ref);
  }
  return results;
}

/** Serialized requests, no autocomplete or speculative query expansion. Provider can be replaced at deployment. */
export class NominatimProvider implements GeographicProvider {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequest = 0;
  private blockedUntil = 0;
  constructor(private endpoint = 'https://nominatim.openstreetmap.org/search', private fetcher: typeof fetch = fetch) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('GEOGRAPHY_INVALID_ENDPOINT');
  }
  search(query: string): Promise<GeographicReference[]> {
    const task = this.queue.then(async () => {
      if (Date.now() < this.blockedUntil) throw new Error('GEOGRAPHY_PROVIDER_COOLDOWN');
      await new Promise<void>(resolve=>setTimeout(resolve,Math.max(0,1100-(Date.now()-this.lastRequest))));
      this.lastRequest = Date.now();
      const url = new URL(this.endpoint);
      url.search = new URLSearchParams({q:query,format:'jsonv2',limit:'8',addressdetails:'1',extratags:'1',namedetails:'1','accept-language':'es,en'}).toString();
      const response = await this.fetcher(url,{headers:{'User-Agent':'GAULOS/1.4 GeographicResolver (https://github.com/miguelonjaen/VELARIS)'},signal:AbortSignal.timeout(12000)});
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) this.blockedUntil = Date.now()+60000;
        throw new Error(`GEOGRAPHY_HTTP_${response.status}`);
      }
      const body = await response.text();
      if (body.length > 1000000) throw new Error('GEOGRAPHY_RESPONSE_TOO_LARGE');
      return parseNominatim(JSON.parse(body) as unknown);
    });
    this.queue = task.catch(()=>undefined);
    return task;
  }
}
interface CacheEntry { at: number; candidates: GeographicReference[] }
export class GeographicResolver {
  private cache = new Map<string, CacheEntry>();
  private initialized?: Promise<void>;
  private pending = new Map<string, Promise<GeographicResolution>>();
  private writes: Promise<void> = Promise.resolve();
  constructor(private provider: GeographicProvider, private cacheFile: string, private now: ()=>number = Date.now) {}
  private async load(): Promise<void> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.cacheFile,'utf8'));
      if (record(raw) && raw.version === 1 && Array.isArray(raw.entries)) {
        for (const entry of raw.entries.slice(-1000)) {
          if (Array.isArray(entry) && typeof entry[0] === 'string' && record(entry[1]) &&
            typeof entry[1].at === 'number' && Number.isFinite(entry[1].at) && entry[1].at <= this.now() &&
            Array.isArray(entry[1].candidates) && entry[1].candidates.length <= 8 && entry[1].candidates.every(validReference)) {
            this.cache.set(entry[0],{at:entry[1].at,candidates:entry[1].candidates});
          }
        }
      }
    } catch { /* Missing/corrupt cache never supplies coordinates. */ }
  }
  private async persist(): Promise<void> {
    const snapshot = JSON.stringify({version:1,entries:[...this.cache].slice(-1000)});
    this.writes = this.writes.catch(()=>undefined).then(async()=>{
      await mkdir(dirname(this.cacheFile),{recursive:true});
      await writeFile(`${this.cacheFile}.tmp`,snapshot,'utf8');
      await rename(`${this.cacheFile}.tmp`,this.cacheFile);
    });
    await this.writes;
  }
  async resolve(query: string, kind: GeographicKind = 'PLACE', offline = false): Promise<GeographicResolution> {
    if (typeof query !== 'string' || !query.trim() || query.length > 200 || !/\p{L}/u.test(query) || /[\x00-\x1f]/.test(query)) throw new Error('GEOGRAPHY_INVALID_QUERY');
    if (!['LOCALITY','PORT','PORT_ENTRANCE','ISLAND','CAPE','PLACE'].includes(kind)) throw new Error('GEOGRAPHY_INVALID_KIND');
    await (this.initialized ??= this.load());
    const key = foldToponym(query);
    const inFlightKey = `${key}:${kind}:${offline}`;
    const existing = this.pending.get(inFlightKey);
    if (existing) return existing;
    const task = this.lookup(query,key,kind,offline);
    this.pending.set(inFlightKey,task);
    try { return await task; } finally { this.pending.delete(inFlightKey); }
  }
  private async lookup(query: string, key: string, kind: GeographicKind, offline: boolean): Promise<GeographicResolution> {
    let entry = this.cache.get(key);
    // Explicit full display names select previously presented identities, not an
    // alias or the first search result. Preserve original retrieval time offline.
    const identities = new Map<string, {at:number; candidate:GeographicReference}>();
    for (const cached of this.cache.values()) for (const candidate of cached.candidates) {
      if (foldToponym(candidate.name) !== key) continue;
      const previous=identities.get(candidate.providerId!);
      if (!previous || cached.at > previous.at) identities.set(candidate.providerId!,{at:cached.at,candidate});
    }
    if (identities.size > 0 && identities.size <= 8) {
      const matches=[...identities.values()];
      entry={at:Math.min(...matches.map(m=>m.at)),candidates:matches.map(m=>m.candidate)};
    }
    const fresh = entry && this.now()-entry.at < (entry.candidates.length ? 30*86400000 : 300000);
    let cache: GeographicResolution['cache'] = fresh ? 'FRESH' : entry ? 'STALE' : 'MISS';
    let warning = '';
    if (!fresh && !offline) {
      try {
        const candidates = await this.provider.search(query);
        if (candidates.length > 8 || !candidates.every(validReference)) throw new Error('GEOGRAPHY_INVALID_REFERENCES');
        entry = {at:this.now(),candidates}; this.cache.delete(key); this.cache.set(key,entry);
        while (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!);
        cache = 'FRESH';
        try { await this.persist(); } catch { warning = ' No se pudo guardar la caché en disco.'; }
      } catch { warning = ' Proveedor no disponible; solo referencias previamente almacenadas.'; }
    }
    if (!entry) return {query,status:offline ? 'NOT_FOUND' : 'UNAVAILABLE',candidates:[],cache:'MISS',message:offline ? 'Sin referencia en caché offline.' : 'Búsqueda geográfica no disponible.'};
    const candidates = entry.candidates.filter(c=>kind === 'PLACE' || c.kind === kind);
    // Never silently substitute locality for harbour, nor island for port.
    const available = candidates.length ? candidates : entry.candidates;
    // Qualifiers belong to identity: a country must not disappear during alias matching.
    const qualifiers = foldToponym(query).split(',').slice(1).map(q=>q.trim()).filter(Boolean);
    const qualified = available.filter(c=>qualifiers.every(q=>
      ` ${foldToponym(c.name).replace(/[,.;]/g,' ')} `.includes(` ${q} `)));
    const exact = qualified.filter(c=>foldToponym(c.name) === foldToponym(query));
    const result = exact.length === 1 ? exact : qualified.length ? qualified : available;
    const qualifiersSatisfied = !qualifiers.length || qualified.length > 0;
    const matchedKind = kind === 'PLACE' || candidates.length > 0;
    const lexical = foldToponym(query).replace(/^(?:puerto|isla|cabo) (?:de |del )?/, '');
    const agrees = (c: GeographicReference): boolean => [c.name,...(c.aliases ?? [])].some(n=>
      foldToponym(n) === foldToponym(query) || foldToponym(n).replace(/^(?:puerto|isla|cabo) (?:de |del )?/, '') === lexical ||
      foldToponym(n.split(',')[0]).replace(/^(?:puerto|isla|cabo) (?:de |del )?/, '') === lexical.split(',')[0]);
    const status = !result.length ? 'NOT_FOUND' : result.length === 1 && matchedKind && qualifiersSatisfied && agrees(result[0]) ? 'RESOLVED' : 'AMBIGUOUS';
    return {query,status,candidates:structuredClone(result),cache,message:
      (status === 'RESOLVED' ? 'Identidad geográfica resuelta; no acredita cobertura cartográfica ni seguridad náutica.' :
       status === 'AMBIGUOUS' ? 'Confirme la grafía y precise país, provincia y tipo: localidad, puerto, isla o cabo. Repita el nombre completo del candidato en la orden; no se corrigen topónimos automáticamente.' :
       'Sin coincidencias. Revise la grafía o aporte país/región; no se inventan correcciones ni coordenadas.')+
      (cache === 'STALE' ? ' Caché antigua; fecha de consulta conservada.' : '')+warning};
  }
}
