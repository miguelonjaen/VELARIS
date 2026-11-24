import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoatPolar, polarSpeed, polarTargetsForWind, polarLaylineRays, evaluatePolarLaylines } from './BoatPolar';
import { GeoMath } from './GeoMath';
// Datos sintéticos exclusivos del banco de pruebas; nunca se instalan en un barco.
const table = 'TWA/TWS;6;10\n0;0;0\n30;2;4\n45;4;6\n90;5;7\n150;4;6\n180;2;3';

test('importa tablas separadas por punto y coma, tabulador, coma y espacios', () => {
  for (const text of [table, table.replaceAll(';', '\t'), table.replaceAll(';', ','), table.replaceAll(';', ' ')]) {
    const polar = parseBoatPolar(text);
    assert.deepEqual(polar.windSpeeds, [6, 10]); assert.equal(polar.rows[2].angle, 45);
    assert.equal(polarSpeed(polar, 8, 45), 5);
    assert.equal(polarSpeed(polar, 8, -45), 5);
    assert.equal(polarSpeed(polar, 8, 315), 5);
  }
});
test('interpola ángulos y TWS sin extrapolar ni rellenar celdas', () => {
  const polar = parseBoatPolar(table);
  assert.equal(polarSpeed(polar, 8, 37.5), 4);
  assert.equal(polarSpeed(polar, 5.9, 45), null);
  assert.equal(polarSpeed(polar, 10.1, 45), null);
  assert.equal(polarTargetsForWind(null, 8), null);
  assert.equal(polarTargetsForWind(polar, 18), null);
  const target = polarTargetsForWind(polar, 8)!;
  assert.equal(target.upwindAngle, 45); assert.ok(target.downwindAngle !== null);
});
test('rechaza celdas vacías, negativas, duplicados, ejes invertidos y tamaño excesivo', () => {
  for (const invalid of ['', table.replace('4;6', ';6'), table.replace('4;6', '-4;6'),
    table.replace('6;10', '10;6'), table.replace('45;4;6', '30;4;6'), table.replace('TWA/TWS', 'TWS/TWA'), 'x'.repeat(200001)]) {
    assert.throws(() => parseBoatPolar(invalid));
  }
});
test('laylines ausentes sin polar, destino o viento; geometría referida al waypoint', () => {
  const position = { lat: 36, lng: -4.5 }, waypoint = { lat: 36.01, lng: -4.5 };
  const target = polarTargetsForWind(parseBoatPolar(table), 8)!;
  assert.equal(polarLaylineRays(position, waypoint, 0, null), null);
  assert.equal(polarLaylineRays(position, null, 0, target), null);
  assert.equal(polarLaylineRays(position, waypoint, null, target), null);
  const paths = polarLaylineRays(position, waypoint, 0, target)!;
  assert.deepEqual(paths.portPath[0], [waypoint.lat, waypoint.lng]);
  assert.deepEqual(paths.boatPortPath[0], [position.lat, position.lng]);
  assert.deepEqual(paths.boatStbdPath[0], [position.lat, position.lng]);
  assert.ok(Math.abs(GeoMath.initialBearing(position, {lat: paths.boatPortPath[1][0], lng: paths.boatPortPath[1][1]}) - 45) < 0.01);
  const bearing = (end: number[]) => GeoMath.initialBearing(waypoint, { lat: end[0], lng: end[1] });
  assert.ok(Math.abs(bearing(paths.portPath[1]) - 225) < 0.01);
  assert.ok(Math.abs(bearing(paths.stbdPath[1]) - 135) < 0.01);
});


test('disponibilidad: la polar manda; no depende de RPM ni del modo de piloto', () => {
  const input = { polar: parseBoatPolar(table), positionAvailable: true, waypointAvailable: true,
    windSource: 'BOAT' as const, tws: 8, twd: 270 };
  assert.ok(evaluatePolarLaylines(input).targets);
  assert.match(evaluatePolarLaylines({ ...input, polar: null }).reason, /Sin polar/);
  assert.match(evaluatePolarLaylines({ ...input, tws: 12 }).reason, /rango 6–10/);
  assert.match(evaluatePolarLaylines({ ...input, twd: null }).reason, /TWS\/TWD/);
  assert.match(evaluatePolarLaylines({ ...input, waypointAvailable: false }).reason, /waypoint/);
  assert.match(evaluatePolarLaylines({ ...input, windSource: 'METEO' }).reason, /previsión/);
});
