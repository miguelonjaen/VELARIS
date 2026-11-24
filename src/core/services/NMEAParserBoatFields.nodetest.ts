// Marcas del parser que usa BOAT_DATA: sentencia del rumbo y referencia de la profundidad (node:test).
// Ejecutar con: node --import tsx --test src/core/services/NMEAParserBoatFields.nodetest.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NMEAParser } from './NMEAParser';

function nmea(body: string): string {
  let checksum = 0;
  for (const char of body) checksum ^= char.charCodeAt(0);
  return `$${body}*${checksum.toString(16).toUpperCase().padStart(2, '0')}`;
}

const parser = new NMEAParser();
const parse = (body: string) => parser.parse(nmea(body)) as unknown as Record<string, unknown>;

test('rumbo: HDT verdadero, HDM magnético y HDG marcado como tal (desvío sin aplicar)', () => {
  assert.deepEqual([parse('HEHDT,289.0,T').headingType, parse('HEHDT,289.0,T').sentence], ['true', 'HDT']);
  assert.deepEqual([parse('HCHDM,290.5,M').headingType, parse('HCHDM,290.5,M').sentence], ['magnetic', 'HDM']);
  assert.deepEqual([parse('HCHDG,288.0,1.5,E,2.0,W').headingType, parse('HCHDG,288.0,1.5,E,2.0,W').sentence], ['magnetic', 'HDG']);
});

test('profundidad: referencia según el offset de DPT; DBT bajo la sonda', () => {
  assert.deepEqual([parse('SDDPT,12.0,-1.5,').depth, parse('SDDPT,12.0,-1.5,').reference], [10.5, 'keel']);
  assert.deepEqual([parse('SDDPT,12.0,0.8,').depth, parse('SDDPT,12.0,0.8,').reference], [12.8, 'surface']);
  assert.equal(parse('SDDPT,14.2,,').reference, 'transducer');
  assert.equal(parse('SDDPT,14.2,0.0,').reference, 'transducer');
  assert.equal(parse('SDDBT,46.5,f,14.17,M,7.75,F').reference, 'transducer');
});
