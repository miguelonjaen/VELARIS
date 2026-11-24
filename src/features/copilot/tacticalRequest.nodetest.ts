import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredReadOnlyTopics, localChartSummary } from './tacticalRequest';
import { analyseArea } from './areaAnalysis';
test('Motril request forces read-only chart and route evidence without action tools', () => {
  assert.deepEqual(requiredReadOnlyTopics('vamos a navegar al puerto de Motril, calcula una ruta con una distancia de 1 NM a la costa, avísame de peligros que pueda haber'), ['chart', 'route', 'navigation', 'instruments', 'ais', 'weather']);
  assert.ok(requiredReadOnlyTopics('explica el inventario').length > 0);
});
test('offline chart summary discloses spatial limits, unknown coverage and no validated route', () => {
  const report = analyseArea([-4, 36, -3, 37], [], 'unavailable', ['No hay ENC'], Date.now());
  const summary = localChartSummary(report);
  for (const evidence of ['SOLO LA VISTA VISIBLE', 'no fecha de actualización ENC', 'unavailable', 'unknown', 'No hay ENC', 'planificador geométrico experimental', 'Ausencia de objetos no acredita aguas libres']) assert.ok(summary.includes(evidence),evidence);
});
