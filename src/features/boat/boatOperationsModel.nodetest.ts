import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manualBoatState, parseManualBoatEvent, serializeManualBoatEvent, type ManualBoatEvent } from './boatOperationsModel';
import type { LogEntry } from '../../shared/types';
const event = (extra: Partial<ManualBoatEvent> = {}): ManualBoatEvent => ({ version: 1, vesselId: 'boat-a', equipmentId: 'pump', label: 'Bomba', at: '2026-11-17T12:00:00Z', origin: 'desktop.manual', result: 'declared', previous: null, value: true, ...extra });
const entry = (e: ManualBoatEvent, extra: Partial<LogEntry> = {}): LogEntry => ({ id: e.at, barco_id: e.vesselId, user_id: 'captain', fecha: '2026-11-17', categoria: 'BARCO MANUAL', descripcion: serializeManualBoatEvent(e), ...extra });
test('manual declaration round trips with origin, result, boat, time and before/after', () => {
  assert.deepEqual(parseManualBoatEvent(serializeManualBoatEvent(event())), event());
});
test('journal order does not change the latest declared equipment state', () => {
  const newer = event({ at: '2026-11-17T12:01:00Z', previous: true, value: false });
  const older = event();
  for (const entries of [[entry(newer), entry(older)], [entry(older), entry(newer)]]) assert.equal(manualBoatState(entries,'boat-a').get('pump')?.value, false);
});
test('boats remain isolated, including a mismatched payload', () => {
  assert.equal(manualBoatState([entry(event({vesselId:'boat-b'})),entry(event(),{barco_id:'boat-b'})],'boat-a').size,0);
});
test('malformed payload, unsupported origin, invalid time and physical confirmation cannot create state', () => {
  const text = serializeManualBoatEvent(event());
  for (const bad of ['ordinary note', 'GAULOS_MANUAL_V1\n{', text.replace('desktop.manual','hardware'), text.replace('2026-11-17T12:00:00Z','invalid'), text.replace('declared','confirmed')]) assert.equal(parseManualBoatEvent(bad),null);
});
test('missing state stays unknown and repeated copies do not multiply equipment', () => {
  assert.equal(manualBoatState([], 'boat-a').get('pump'),undefined);
  assert.equal(manualBoatState([entry(event()),entry(event())], 'boat-a').size,1);
});
