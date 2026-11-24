import test from 'node:test';
import assert from 'node:assert/strict';
import type { CopilotContext } from './context';
import { buildOfficerBriefing, isOfficerBriefingCommand } from './officerBriefing';

const context = (position: 'VALID' | 'UNKNOWN' = 'VALID'): CopilotContext => ({
  navigation: {
    position: { status: position, source: position === 'VALID' ? 'BOAT' : null, ageMs: position === 'VALID' ? 900 : null }
  },
  weather: { atmospheric: { status: 'valid', source: 'OpenWeather' } },
  aisScope: { streamHealth: 'unknown' },
  ais: [{ status: 'valid' }, { status: 'stale' }]
} as CopilotContext);

test('solo intercepta órdenes explícitas de informe operativo', () => {
  for (const command of ['informe', 'Informe oficial', 'ESTADO OPERATIVO', 'situación']) {
    assert.equal(isOfficerBriefingCommand(command), true);
  }
  for (const question of ['estado del mar', 'informe de avería del motor', 'situación COLREG']) {
    assert.equal(isOfficerBriefingCommand(question), false);
  }
});

test('detecta reposición, caducidad, mantenimiento y travesía pendiente sin IA', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  const briefing = buildOfficerBriefing({
    now,
    vessel: { id: 'ship-1', name: 'GAULOS' },
    context: context(),
    inventory: { rows: [
      { id: 'water', nombre: 'Agua', cantidad_actual: 1, cantidad_minima: 4 },
      { id: 'flare', nombre: 'Bengala', cantidad_actual: 4, cantidad_minima: 2, fecha_caducidad: '2026-11-19' }
    ], error: null },
    maintenance: { rows: [{ id: 'engine', tarea: 'Cambio de aceite', estado: 'warning', proxima_revision: '2026-11-25' }], error: null },
    voyage: { state: 'pending', startedAt: now - 60_000 },
    criticalAisTargets: 0
  });

  assert.equal(briefing.priority, 'critical');
  assert.equal(briefing.tasks.length, 4);
  assert.ok(briefing.tasks.some(task => task.source === 'voyage'));
  assert.match(briefing.text, /4 tareas/);
  assert.match(briefing.text, /1 blancos AIS vigentes/);
});

test('una consulta fallida se declara como limitación y nunca como estado nominal', () => {
  const briefing = buildOfficerBriefing({
    now: Date.UTC(2026, 10, 20),
    vessel: { id: 'ship-1', name: 'GAULOS' },
    context: context('UNKNOWN'),
    inventory: { rows: null, error: 'sin conexión' },
    maintenance: { rows: [], error: null },
    voyage: { state: 'idle', startedAt: null },
    criticalAisTargets: 0
  });

  assert.equal(briefing.priority, 'warning');
  assert.match(briefing.text, /Inventario no consultado/);
  assert.match(briefing.text, /Posición vigente no disponible/);
  assert.equal(briefing.evidence.inventoryAvailable, false);
});

test('no convierte la ausencia de pendientes en certificación de seguridad', () => {
  const briefing = buildOfficerBriefing({
    now: Date.UTC(2026, 10, 20),
    vessel: { id: 'ship-1', name: 'GAULOS' },
    context: context(),
    inventory: { rows: [], error: null },
    maintenance: { rows: [], error: null },
    voyage: { state: 'idle', startedAt: null },
    criticalAisTargets: 0
  });

  assert.ok(!briefing.text.toLowerCase().includes('seguro'));
  assert.match(briefing.text, /fuentes consultadas/);
});
