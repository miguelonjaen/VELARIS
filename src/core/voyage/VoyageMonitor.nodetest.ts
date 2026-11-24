// Travesía automática y acontecimientos de bitácora (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoyageMonitor, type VoyageEvent } from './VoyageMonitor';
import { voyageSampleFromNavigation, reconcileVoyageActivity } from './voyageSample';
import { describeVoyageEvent } from './voyageLog';
import {
  NAVIGATION_FIELDS,
  SharedNavigationState,
  type NavigationFreshnessPolicy,
  type NavigationSource
} from '../navigation/SharedNavigationState';

const MAX_AGE = 5_000;
const policy = Object.fromEntries(NAVIGATION_FIELDS.map((field) => [field, {
  BOAT: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' },
  DROID: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' },
  SIMULATOR: { maxAgeMs: MAX_AGE, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;

const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);
const START = { lat: 36.5950, lng: -4.5100 };

/**
 * Banco de pruebas con el mismo flujo que App: estado compartido → muestra → monitor →
 * la «aplicación» abre la travesía al recibir VOYAGE_START y la cierra con VOYAGE_AUTO_END.
 */
function rig(options = {}) {
  let clock = T0;
  const nav = new SharedNavigationState(policy, () => clock);
  const monitor = new VoyageMonitor(options);
  const app = { active: false, starts: 0, ends: 0, events: [] as VoyageEvent[] };
  const feed = (source: NavigationSource, data: { pos?: { lat: number; lng: number } | null; sog?: number; cog?: number }) => {
    const base = { source, sourceId: source.toLowerCase(), observedAt: clock, receivedAt: clock, observedAtFromSource: false };
    if (data.pos) nav.update({ ...base, field: 'position', value: data.pos });
    if (data.sog !== undefined) nav.update({ ...base, field: 'sog', value: data.sog });
    if (data.cog !== undefined) nav.update({ ...base, field: 'cog', value: data.cog });
  };
  const tick = () => {
    const events = monitor.tick(voyageSampleFromNavigation(nav.snapshot(clock), clock, app.active, 'TCP 127.0.0.1:10110'));
    for (const e of events) {
      app.events.push(e);
      if (e.type === 'VOYAGE_START' && !app.active) { app.active = true; app.starts++; }
      if (e.type === 'VOYAGE_AUTO_END') { app.active = false; app.ends++; }
    }
    return events;
  };
  /** Avanza `seconds` segundos, alimentando (o no) datos cada segundo. */
  const run = (seconds: number, each?: (i: number) => void) => {
    for (let i = 0; i < seconds; i++) {
      clock += 1000;
      each?.(i);
      tick();
    }
  };
  return { nav, monitor, app, feed, run, tick, now: () => clock };
}

const moving = (r: ReturnType<typeof rig>, source: NavigationSource, cog = 90, sog = 6) =>
  (i: number) => r.feed(source, { pos: { lat: START.lat, lng: START.lng + i * 0.0003 }, sog, cog });

test('1 · inicio automático con instrumentos del barco (TCP declarado como barco) navegando', () => {
  const r = rig();
  r.run(29, moving(r, 'BOAT'));
  assert.equal(r.app.starts, 0, 'no se inicia antes de 30 s de movimiento sostenido');
  r.run(2, moving(r, 'BOAT'));
  assert.equal(r.app.starts, 1);
  const start = r.app.events.find(e => e.type === 'VOYAGE_START');
  assert.ok(start && start.type === 'VOYAGE_START');
  assert.equal(start.origin, 'TCP 127.0.0.1:10110');
  assert.equal(start.sog, 6);
  assert.equal(start.cog, 90);
  const entry = describeVoyageEvent(start);
  assert.equal(entry.titulo, 'Salida');
  assert.equal(entry.lifecycleEvent, 'Salida');
  assert.equal(entry.measured.latitud, start.position.lat);
  assert.equal(entry.measured.velocidad_gps, 6);
  assert.match(entry.descripcion, /TCP 127\.0\.0\.1:10110/);
});

test('2 · el simulador visual y el GPS del teléfono no inician travesías', () => {
  for (const source of ['SIMULATOR', 'DROID'] as const) {
    const r = rig();
    r.run(120, moving(r, source));
    assert.equal(r.app.starts, 0, `${source} no debe iniciar travesía`);
    assert.equal(r.app.events.length, 0);
  }
});

test('2b · barco parado, datos vacíos o 0,0 no inician travesía', () => {
  const r = rig();
  r.run(60, (i) => r.feed('BOAT', { pos: { lat: START.lat, lng: START.lng }, sog: 0.2, cog: 10 }));
  r.run(60, () => r.feed('BOAT', { pos: { lat: 0, lng: 0 }, sog: 6, cog: 10 }));
  r.run(60, () => r.feed('BOAT', { sog: 6, cog: 10 })); // sin posición
  assert.equal(r.app.starts, 0);
});

test('3/7 · desconexión y reconexión: misma travesía, pérdida y recuperación registradas, sin duplicar', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT'));
  assert.equal(r.app.starts, 1);
  r.run(40); // simulador desconectado: los datos caducan
  const lost = r.app.events.filter(e => e.type === 'SIGNAL_LOST');
  assert.equal(lost.length, 1, 'una sola pérdida de señal');
  assert.equal(r.app.active, true, 'la travesía sigue abierta');
  assert.equal(r.monitor.isSignalLost, true);
  r.run(60, moving(r, 'BOAT')); // reconexión con el barco navegando
  assert.equal(r.app.events.filter(e => e.type === 'SIGNAL_RECOVERED').length, 1);
  assert.equal(r.app.starts, 1, 'no se crea otra travesía al reconectar');
  assert.equal(r.monitor.isSignalLost, false);
  const lostEntry = describeVoyageEvent(lost[0]);
  assert.equal(lostEntry.categoria, 'Seguridad');
  assert.equal(lostEntry.measured.latitud, null, 'la pérdida no inventa posición actual');
});

test('4 · cambio de rumbo gradual: una entrada por cambio significativo, no por oscilaciones', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT', 90));
  r.run(60, (i) => moving(r, 'BOAT', 90 + (i % 2 ? 8 : -8))(i)); // oscilación ±8°
  assert.equal(r.app.events.filter(e => e.type === 'COURSE_CHANGE').length, 0);
  // Giro gradual de 90° a 150° en 30 s (2°/s): ningún par consecutivo supera 30°.
  r.run(30, (i) => moving(r, 'BOAT', 90 + (i + 1) * 2)(i));
  r.run(40, moving(r, 'BOAT', 150));
  const changes = r.app.events.filter((e): e is Extract<VoyageEvent, { type: 'COURSE_CHANGE' }> => e.type === 'COURSE_CHANGE');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].from, 90);
  assert.ok(changes[0].to >= 120 && changes[0].to <= 150);
  const entry = describeVoyageEvent(changes[0]);
  assert.match(entry.titulo, /Cambio de rumbo/);
  assert.equal(entry.measured.rumbo, changes[0].to);
  assert.equal(entry.measured.velocidad_gps, 6);
});

test('4b · cambio de velocidad sostenido', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT', 90, 6));
  r.run(150, moving(r, 'BOAT', 90, 2.5));
  const speed = r.app.events.filter(e => e.type === 'SPEED_CHANGE');
  assert.equal(speed.length, 1);
});

test('4c · cambio de fuente de posición (barco → teléfono) registrado una vez', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT'));
  r.run(60, moving(r, 'DROID'));
  const sourceChanges = r.app.events.filter(e => e.type === 'SOURCE_CHANGE');
  assert.equal(sourceChanges.length, 1);
  assert.deepEqual([sourceChanges[0].type === 'SOURCE_CHANGE' && sourceChanges[0].from, sourceChanges[0].type === 'SOURCE_CHANGE' && sourceChanges[0].to], ['BOAT', 'DROID']);
});

test('8 · datos caducados o inválidos no generan acontecimientos de navegación', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT'));
  const before = r.app.events.length;
  r.run(20, () => r.feed('BOAT', { pos: { lat: 999, lng: 999 }, sog: -3, cog: 720 }));
  const newer = r.app.events.slice(before);
  assert.ok(newer.every(e => e.type === 'SIGNAL_LOST' || e.type === 'SOURCE_CHANGE'), JSON.stringify(newer.map(e => e.type)));
});

test('política de cierre: solo una travesía automática se cierra sola tras 60 min sin datos; luego se exige rearme', () => {
  const r = rig();
  r.run(31, moving(r, 'BOAT'));
  r.run(59 * 60);
  assert.equal(r.app.ends, 0);
  r.run(2 * 60);
  assert.equal(r.app.ends, 1);
  assert.equal(r.app.active, false);
  // Barco aún navegando al volver los datos: no reabre otra travesía hasta haberse detenido.
  r.run(120, moving(r, 'BOAT'));
  assert.equal(r.app.starts, 1);
  r.run(5, () => r.feed('BOAT', { pos: START, sog: 0, cog: 0 }));
  r.run(31, moving(r, 'BOAT'));
  assert.equal(r.app.starts, 2, 'nueva travesía tras detenerse y volver a navegar');
});

test('una travesía iniciada a mano no se cierra automáticamente', () => {
  const r = rig();
  r.app.active = true; // inicio manual
  r.run(10, moving(r, 'BOAT'));
  r.run(3 * 60 * 60);
  assert.equal(r.app.ends, 0);
  assert.equal(r.app.events.filter(e => e.type === 'SIGNAL_LOST').length, 1);
});


test('estado remoto inactivo no cancela la travesía automática ni oculta sus millas', () => {
  const r = rig(); r.run(31, moving(r, 'BOAT'));
  assert.equal(r.app.active, true);
  r.app.active = reconcileVoyageActivity(r.app.active, false, r.monitor.autoStarted);
  r.run(45, moving(r, 'BOAT'));
  assert.equal(r.app.active, true);
  assert.equal(r.app.starts, 1);
  assert.equal(reconcileVoyageActivity(true, undefined, false), true);
  assert.equal(reconcileVoyageActivity(true, false, false), false, 'se conserva cierre remoto de sesiones no automáticas');
});
