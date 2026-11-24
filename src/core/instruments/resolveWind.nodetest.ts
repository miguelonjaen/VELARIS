import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatInstrumentStore } from './BoatInstrumentStore';
import { resolveWind, shortestWindRotation } from './resolveWind';
import { NMEAParser } from '../services/NMEAParser';
import { NAVIGATION_FIELDS, SharedNavigationState, type NavigationFreshnessPolicy } from '../navigation/SharedNavigationState';
const T = 100000;
const policy = Object.fromEntries(NAVIGATION_FIELDS.map(field => [field, {
    BOAT: { maxAgeMs: 8000, ageFrom: 'receivedAt' }, DROID: { maxAgeMs: 8000, ageFrom: 'receivedAt' },
    SIMULATOR: { maxAgeMs: 8000, ageFrom: 'receivedAt' }
}])) as unknown as NavigationFreshnessPolicy;
const meteo = { tws: 30, twd: 270, timestamp: T };
function rig(heading = true) {
    const store = new BoatInstrumentStore(() => T);
    const nav = new SharedNavigationState(policy, () => T);
    if (heading) nav.update({ field: 'headingTrue', value: 350, source: 'BOAT', sourceId: 'nmea',
        observedAt: T, receivedAt: T, observedAtFromSource: false });
    return { store, read: (at = T) => resolveWind(store.snapshot(at), nav.snapshot(at), meteo, at) };
}
test('NMEA prevalece sobre meteo; MWV R y T alternados no cambian el canal verdadero', () => {
    const r = rig();
    r.store.ingest({ type: 'WIND', reference: 'true', speed: 12, angle: 20 }, T);
    assert.equal(r.read().twd, 10);
    for (let i = 0; i < 10; i++) {
        r.store.ingest({ type: 'WIND', reference: 'apparent', speed: 18, angle: 50 }, T);
        assert.equal(r.read().tws, 12); assert.equal(r.read().twd, 10);
        assert.equal(r.read().aws, 18); assert.equal(r.read().awa, 50);
    }
    assert.equal(r.read().source, 'BOAT');
});
test('solo aparente no inventa verdadero ni lo mezcla con previsión', () => {
    const r = rig(); r.store.ingest({ type: 'WIND', reference: 'apparent', speed: 18, angle: 50 }, T);
    assert.equal(r.read().tws, null); assert.equal(r.read().twd, null); assert.equal(r.read().aws, 18);
});
test('sin rumbo verdadero no se presenta un ángulo relativo como dirección geográfica', () => {
    const r = rig(false); r.store.ingest({ type: 'WIND', reference: 'true', speed: 12, angle: 20 }, T);
    assert.equal(r.read().twa, 20); assert.equal(r.read().twd, null);
});
test('caducidad elimina NMEA y activa respaldo meteorológico etiquetado; cero es dato válido', () => {
    const r = rig(); r.store.ingest({ type: 'WIND', reference: 'true', speed: 0, angle: 0 }, T);
    assert.equal(r.read().tws, 0);
    assert.equal(r.read(T + 8001).source, 'METEO'); assert.equal(r.read(T + 8001).tws, 30);
});
test('aguja cruza 180 y 360 por el arco corto sin vuelta completa', () => {
    assert.equal(shortestWindRotation(179, -179), 181);
    assert.equal(shortestWindRotation(359, 1), 361);
    assert.equal(shortestWindRotation(1, 359), -1);
});
test('MWV rechaza referencia o unidad desconocida', () => {
    const parser = new NMEAParser();
    const sentence = (body: string) => {
        let sum = 0; for (const char of body) sum ^= char.charCodeAt(0);
        return '$' + body + '*' + sum.toString(16).padStart(2, '0');
    };
    assert.equal(parser.parse(sentence('IIMWV,20,X,12,N,A')).type, 'NMEA_INVALID');
    assert.equal(parser.parse(sentence('IIMWV,20,R,12,X,A')).type, 'NMEA_INVALID');
    assert.equal(parser.parse(sentence('IIMWV,20,R,12,N,A')).type, 'WIND');
});


test('MWD del simulador aporta TWS/TWD al almacén y al selector sin confundirse con AWA', () => {
    const parser = new NMEAParser();
    const parse = (body: string) => {
        let sum = 0; for (const char of body) sum ^= char.charCodeAt(0);
        return parser.parse('$' + body + '*' + sum.toString(16).padStart(2, '0'));
    };
    const r = rig();
    r.store.ingest(parse('WIMWV,189,R,6.6,N,A'), T);
    r.store.ingest(parse('WIMWD,90,T,88,M,12.5,N,6.43,M'), T);
    assert.equal(r.read().tws, 12.5);
    assert.equal(r.read().twd, 90);
    assert.equal(r.read().twa, 100);
    assert.equal(r.read().awa, 189);
    assert.equal(r.read(T + 8001).source, 'METEO');
    const noHeading = rig(false);
    noHeading.store.ingest(parse('WIMWD,90,T,88,M,12.5,N,6.43,M'), T);
    assert.equal(noHeading.read().twd, 90, 'MWD ya aporta referencia al norte verdadero');
    assert.equal(noHeading.read().twa, null);
    const ms = parse('WIMWD,90,T,88,M,,N,5,M');
    assert.ok(ms.type === 'WIND');
    assert.ok(Math.abs(ms.speed - 9.71922) < 0.001);
    assert.equal(parse('WIMWD,,T,88,M,12,N,6,M').type, 'NMEA_INVALID');
    assert.equal(parse('WIMWD,90,T,88,M,-1,N,,M').type, 'NMEA_INVALID');
});
