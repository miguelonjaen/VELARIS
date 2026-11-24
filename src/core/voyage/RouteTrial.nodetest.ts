import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteTrial } from './RouteTrial';
import { SimulationService } from '../services/SimulationService';
const origin = { lat: 36, lng: -4.5 };
const far = [{ lat: 36.01, lng: -4.5 }, { lat: 36.01, lng: -4.49 }];
const T = 1_800_000_000_000;

test('avance virtual usa SOG recibida; cero detiene; no necesita cambiar el GPS externo', () => {
    const trial = new RouteTrial(); const input = { ...origin };
    trial.start(input, far, 6, T);
    const first = trial.tick(T + 1000, 6)!;
    assert.ok(first.position.lat > origin.lat);
    assert.ok(Math.abs(first.distanceNm - 6 / 3600) < 0.00001);
    const second = trial.tick(T + 2000, 12)!;
    assert.ok(Math.abs(second.distanceNm - 18 / 3600) < 0.00001);
    assert.deepEqual(input, origin, 'el origen recibido nunca se modifica');
    const stopped = trial.tick(T + 3000, 0)!;
    assert.deepEqual(stopped.position, second.position);
    assert.equal(stopped.heading, second.heading);
});

test('caducidad pausa y recuperación no recupera minutos de silencio', () => {
    const trial = new RouteTrial(); trial.start(origin, far, 6, T);
    trial.tick(T + 1000, 6);
    const waiting = trial.tick(T + 2000, null)!;
    assert.equal(waiting.status, 'waiting'); assert.equal(waiting.sog, null);
    trial.tick(T + 300000, null);
    const recovered = trial.tick(T + 301000, 6)!;
    assert.deepEqual(recovered.position, waiting.position);
    assert.equal(recovered.distanceNm, waiting.distanceNm);
    assert.equal(trial.drainEvents().filter(e => e.title === 'Ensayo en espera').length, 1);
    assert.ok(trial.tick(T + 302000, 6)!.distanceNm > waiting.distanceNm);
});

test('pausa/reanudación, ticks tardíos, finalización explícita y reinicio independiente', () => {
    const trial = new RouteTrial(); trial.start(origin, far, 6, T);
    trial.tick(T + 1000, 6); trial.pause(T + 2000);
    const before = trial.snapshot();
    assert.deepEqual(trial.tick(T + 100000, 6)!.position, before.position);
    trial.resume(T + 101000); trial.tick(T + 102000, 6);
    assert.equal(trial.snapshot().distanceNm, before.distanceNm);
    const delayed = trial.tick(T + 300000, 6)!;
    assert.ok(delayed.distanceNm - before.distanceNm <= 12 / 3600 + 0.00001, 'paso acotado a dos segundos');
    trial.stop(T + 301000); assert.equal(trial.snapshot().status, 'stopped');
    assert.equal(trial.tick(T + 302000, 6)!.distanceNm, delayed.distanceNm);
    trial.start(origin, far, 6, T + 400000); assert.equal(trial.snapshot().distanceNm, 0);
});

test('alcanza sucesivos waypoints y registra llegada una vez', () => {
    const trial = new RouteTrial();
    trial.start(origin, [{ lat: 36.0003, lng: -4.5 }, { lat: 36.0003, lng: -4.4996 }], 6, T);
    for (let i = 1; i < 100; i++) trial.tick(T + i * 1000, 6);
    const result = trial.snapshot();
    assert.equal(result.status, 'finished'); assert.equal(result.waypointIndex, 2);
    assert.ok(result.distanceNm > 0); assert.ok(result.track.length > 1);
    const events = trial.drainEvents();
    assert.equal(events.filter(e => e.title === 'Waypoint alcanzado').length, 1);
    assert.equal(events.filter(e => e.title === 'Llegada del ensayo').length, 1);
    assert.ok(events.some(e => e.title === 'Cambio de rumbo virtual'));
});

test('rechaza ruta y SOG inválidas; estado externo y otra simulación quedan independientes', () => {
    const trial = new RouteTrial();
    assert.throws(() => trial.start(origin, [], 6, T));
    assert.throws(() => trial.start(origin, far, Number.NaN, T));
    assert.throws(() => trial.start(origin, [{ lat: 95, lng: 0 }], 6, T));
    const external = new SimulationService();
    trial.start(origin, far, 6, T); trial.tick(T + 1000, 6);
    assert.equal(external.getWaypointIndex(), 0); assert.equal(external.hasReachedDestination(), false);
});


test('heading NMEA gobierna el ensayo, modifica XTE y gira parado sin inventar desplazamiento', () => {
    const trial = new RouteTrial();
    trial.start(origin, far, 6, T, 0);
    const north = trial.tick(T + 1000, 6, 0)!;
    assert.ok(north.position.lat > origin.lat);
    assert.ok((north.metrics.xte?.distanceNm ?? 1) < 0.00001);
    const east = trial.tick(T + 2000, 6, 90)!;
    assert.equal(east.heading, 90);
    assert.ok(east.position.lng > north.position.lng);
    assert.ok((east.metrics.xte?.distanceNm ?? 0) > 0.001);
    assert.equal(east.metrics.xte?.side, 'right');
    const stopped = trial.tick(T + 3000, 0, 270)!;
    assert.deepEqual(stopped.position, east.position);
    assert.equal(stopped.heading, 270);
    assert.equal(stopped.distanceNm, east.distanceNm);
    assert.equal(stopped.metrics.xte?.distanceNm, east.metrics.xte?.distanceNm);
});

test('heading perdido detiene el ensayo; recuperación no recupera tiempo ni acepta NaN', () => {
    const trial = new RouteTrial(); trial.start(origin, far, 6, T, 90);
    trial.tick(T + 1000, 6, 90);
    const waiting = trial.tick(T + 2000, 6, null)!;
    assert.equal(waiting.status, 'waiting');
    trial.tick(T + 300000, 6, NaN);
    const recovered = trial.tick(T + 301000, 6, 180)!;
    assert.deepEqual(recovered.position, waiting.position);
    assert.equal(recovered.heading, 180);
    assert.equal(recovered.distanceNm, waiting.distanceNm);
    assert.ok(trial.tick(T + 302000, 6, 180)!.distanceNm > waiting.distanceNm);
    assert.throws(() => trial.start(origin, far, 6, T, NaN));
});

test('gobierno manual no salta al waypoint por tener distancia de avance suficiente', () => {
    const trial = new RouteTrial();
    trial.start(origin, [{lat:36.0001,lng:-4.5}], 200, T, 90);
    const east = trial.tick(T + 2000, 200, 90)!;
    assert.equal(east.status, 'running');
    assert.ok(east.position.lng > origin.lng);
    assert.ok(Math.abs(east.position.lat-origin.lat) < 0.00001);
    assert.ok((east.metrics.xte?.distanceNm ?? 0) > 0.1);
});
