/** Geographic identity only. No result authorizes a port approach or navigation. */
export type GeographicKind = 'LOCALITY' | 'PORT' | 'PORT_ENTRANCE' | 'ISLAND' | 'CAPE' | 'PLACE';
export interface GeographicReference {
  name: string;
  position: readonly [number, number];
  source: string;
  sourceCoordinate: string;
  reference: string;
  verifiedOn: string;
  datum: 'WGS84' | 'NOT_STATED_BY_SOURCE';
  kind?: GeographicKind;
  providerId?: string;
  aliases?: string[];
  attribution?: string;
  retrievedAt?: string;
  navigationUse?: false;
}
export interface GeographicResolution {
  status: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'UNAVAILABLE';
  query: string;
  candidates: GeographicReference[];
  cache: 'FRESH' | 'STALE' | 'MISS';
  message: string;
}
export const foldToponym = (name: string): string => name.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
