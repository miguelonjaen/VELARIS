import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLogisticsReadOnlyAnswer, classifyReadOnlyLogisticsQuery } from './logisticsReadOnly';

test('intercepta únicamente consultas informativas inequívocas', () => {
  assert.deepEqual(classifyReadOnlyLogisticsQuery('Muestra el inventario'), { topics: ['inventory'], focus: 'summary' });
  assert.deepEqual(classifyReadOnlyLogisticsQuery('¿Qué mantenimiento está pendiente?'), { topics: ['maintenance'], focus: 'attention' });
  assert.deepEqual(classifyReadOnlyLogisticsQuery('Estado de mantenimiento e inventario'), { topics: ['inventory', 'maintenance'], focus: 'summary' });
});

test('órdenes mixtas, mutaciones y consultas ambiguas nunca eluden el intérprete', () => {
  for (const order of [
    'Muestra el inventario y calcula una ruta a Motril',
    'Actualiza el inventario',
    'Compra lo que falte en inventario',
    'Inventario',
    'Dime el stock y el SOG'
  ]) assert.equal(classifyReadOnlyLogisticsQuery(order), null, order);
});

test('una consulta local sigue respondiendo aunque el intérprete esté caído; una mixta no', async () => {
  let interpreterCalls = 0;
  const dispatch = async (order: string): Promise<string> => {
    const query = classifyReadOnlyLogisticsQuery(order);
    if (query) return buildLogisticsReadOnlyAnswer(query, {
      now: Date.UTC(2026, 10, 24), vessel: { id: 'ship-1', name: 'GAULOS' },
      inventory: { rows: [], error: null }, maintenance: { rows: [], error: null }
    });
    interpreterCalls += 1;
    throw new Error('OLLAMA_UNAVAILABLE');
  };

  assert.match(await dispatch('Muestra el inventario'), /No hay registros/);
  assert.equal(interpreterCalls, 0);
  await assert.rejects(dispatch('Muestra el inventario y calcula una ruta'), /OLLAMA_UNAVAILABLE/);
  assert.equal(interpreterCalls, 1);
});

test('distingue ausencia de registros, error de lectura y semántica de fechas/estado', () => {
  const inventory = classifyReadOnlyLogisticsQuery('¿Qué inventario requiere atención?');
  assert.ok(inventory);
  const answer = buildLogisticsReadOnlyAnswer(inventory, {
    now: Date.UTC(2026, 10, 24, 12), vessel: { id: 'ship-1', name: 'GAULOS' },
    inventory: { rows: [{ id: 'flare', nombre: 'Bengala', cantidad_actual: 0, cantidad_minima: 2, fecha_caducidad: '2026-11-23' }], error: null },
    maintenance: { rows: [], error: null }
  });
  assert.match(answer, /Reponer Bengala/);
  assert.match(answer, /Retirar\/revisar Bengala/);

  const maintenance = classifyReadOnlyLogisticsQuery('¿Qué mantenimiento está pendiente?');
  assert.ok(maintenance);
  const failed = buildLogisticsReadOnlyAnswer(maintenance, {
    now: Date.UTC(2026, 10, 24), vessel: { id: 'ship-1', name: 'GAULOS' },
    inventory: { rows: [], error: null }, maintenance: { rows: null, error: 'network detail' }
  });
  assert.match(failed, /Error de consulta/);
  assert.doesNotMatch(failed, /No hay registros/);
  assert.doesNotMatch(failed, /network detail/);
});
