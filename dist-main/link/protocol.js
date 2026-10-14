// @ts-check
'use strict';
/**
 * VELARIS Link v1 — contrato común Desktop ↔ VELARISdroid.
 * Especificación y ejemplos compartidos: ../VELARIS-Link/PROTOCOL.md y ../VELARIS-Link/fixtures.
 * Equivalente Kotlin: VELARISdroid/app/src/main/java/com/velaris/droid/core/link/LinkProtocol.kt
 */
const crypto = require('crypto');
const PROTOCOL_VERSION = 1;
const SUPPORTED_VERSIONS = [1];
const LINK_TCP_PORT = 47811;
const DISCOVERY_UDP_PORT = 47812;
const HEARTBEAT_MS = 5000;
const STALE_CONNECTION_MS = 15000;
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_POINTS_PER_BATCH = 200;
const CAPABILITIES = ['position.v1', 'track.v1', 'logbook.v1'];
const TYPES = Object.freeze({
    DISCOVERY_BEACON: 'DISCOVERY_BEACON',
    HELLO: 'HELLO',
    CHALLENGE: 'CHALLENGE',
    AUTH: 'AUTH',
    WELCOME: 'WELCOME',
    PAIR_REQUEST: 'PAIR_REQUEST',
    PAIR_PENDING: 'PAIR_PENDING',
    PAIR_RESULT: 'PAIR_RESULT',
    HEARTBEAT: 'HEARTBEAT',
    POSITION: 'POSITION',
    TRACK_START: 'TRACK_START',
    TRACK_UPDATE: 'TRACK_UPDATE',
    TRACK_END: 'TRACK_END',
    TRACK_POINTS: 'TRACK_POINTS',
    LOG_EVENT: 'LOG_EVENT',
    ACK: 'ACK',
    SYNC_REQUEST: 'SYNC_REQUEST',
    SYNC_STATE: 'SYNC_STATE',
    ERROR: 'ERROR',
    BYE: 'BYE'
});
/** @type {Set<string>} */
const KNOWN_TYPES = new Set(Object.values(TYPES));
const TRACK_STATES = new Set(['RECORDING', 'PAUSED', 'FINISHED']);
/** Tipos de evento de bitácora. NOTE es la anotación manual (auto=false). */
const EVENT_KINDS = new Set([
    'TRACK_STARTED', 'TRACK_PAUSED', 'TRACK_RESUMED', 'TRACK_FINISHED', 'TRACK_RECOVERED',
    'GPS_LOST', 'GPS_RECOVERED', 'NOTE'
]);
const ERROR_CODES = Object.freeze({
    BAD_MESSAGE: 'BAD_MESSAGE',
    UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    PAIRING_CLOSED: 'PAIRING_CLOSED',
    PAIRING_CODE_INVALID: 'PAIRING_CODE_INVALID',
    PAIRING_REJECTED: 'PAIRING_REJECTED',
    RATE_LIMITED: 'RATE_LIMITED',
    TRACK_OWNER_MISMATCH: 'TRACK_OWNER_MISMATCH',
    STORAGE_FAILED: 'STORAGE_FAILED',
    INTERNAL: 'INTERNAL'
});
/** Identificadores de dispositivo, track, evento y mensaje: seguros como nombre de carpeta. */
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const STRONG_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
/** Marca temporal plausible (2000-01-01 … 2100-01-01) en ms. */
const MIN_TS = 946684800000;
const MAX_TS = 4102444800000;
/**
 * @typedef {{ v: number, type: string, id: string, src: string, ts: number, sid?: string, ack?: boolean, payload: any }} LinkEnvelope
 * @typedef {{ seq: number, t: number, lat: number, lon: number, acc: number|null, sog: number|null, cog: number|null, hdg: number|null, src: string }} TrackPoint
 * @typedef {{ t: number, lat: number, lon: number, acc: number|null, sog: number|null, cog: number|null, hdg: number|null, src: string }} Fix
 * @typedef {{ rev: number, name: string, state: string, startedAt: number, endedAt: number|null, lastSeq: number, source: string, deviceName: string, distanceNm: number, durationMs: number }} TrackMeta
 * @typedef {{ eventId: string, trackId: string|null, kind: string, auto: boolean, at: number, lat: number|null, lon: number|null, title: string, text: string, data: Record<string, unknown> }} LogEvent
 * @typedef {{ ok: boolean, value?: any, code?: string, detail?: string }} Validation  ok=true → value; ok=false → code y detail
 */
/** @param {unknown} v */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
/** @param {unknown} v */
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v */
const isTs = (v) => isFiniteNum(v) && Number.isInteger(v) && /** @type {number} */ (v) >= MIN_TS && /** @type {number} */ (v) <= MAX_TS;
/** @param {unknown} v @param {number} max */
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
/** @param {string} code @param {string} detail @returns {Validation} */
const fail = (code, detail) => ({ ok: false, code, detail });
/** @param {any} value @returns {Validation} */
const pass = (value) => ({ ok: true, value });
/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @returns {number|null|undefined} número válido, null si viene null/ausente, undefined si es inválido
 */
function optionalRange(v, min, max) {
    if (v === null || v === undefined)
        return null;
    if (!isFiniteNum(v))
        return undefined;
    const n = /** @type {number} */ (v);
    return n >= min && n <= max ? n : undefined;
}
/**
 * Valida un fix (posición) sin número de secuencia. Una posición ausente, fuera de rango o 0,0
 * se rechaza: nunca se convierte en una coordenada.
 * @param {unknown} raw
 * @returns {Validation}
 */
function validateFix(raw) {
    if (!isObj(raw))
        return fail('BAD_POINT', 'fix no es un objeto');
    const p = /** @type {Record<string, unknown>} */ (raw);
    if (!isTs(p.t))
        return fail('BAD_POINT', 'hora GPS (t) ausente o inválida');
    if (!isFiniteNum(p.lat) || !isFiniteNum(p.lon))
        return fail('BAD_POINT', 'coordenadas ausentes');
    const lat = /** @type {number} */ (p.lat);
    const lon = /** @type {number} */ (p.lon);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return fail('BAD_POINT', 'coordenadas fuera de rango');
    if (lat === 0 && lon === 0)
        return fail('BAD_POINT', 'posición 0,0 rechazada');
    const acc = optionalRange(p.acc, 0, 100000);
    const sog = optionalRange(p.sog, 0, 200);
    const cog = optionalRange(p.cog, 0, 360);
    const hdg = optionalRange(p.hdg, 0, 360);
    if (acc === undefined || sog === undefined || cog === undefined || hdg === undefined) {
        return fail('BAD_POINT', 'acc/sog/cog/hdg fuera de rango');
    }
    const src = isStr(p.src, 32) && /** @type {string} */ (p.src).length > 0 ? /** @type {string} */ (p.src) : null;
    if (!src)
        return fail('BAD_POINT', 'origen (src) ausente');
    return pass({ t: p.t, lat, lon, acc, sog, cog, hdg, src });
}
/** @param {unknown} raw @returns {Validation} */
function validatePoint(raw) {
    if (!isObj(raw))
        return fail('BAD_POINT', 'punto no es un objeto');
    const seq = /** @type {Record<string, unknown>} */ (raw).seq;
    if (!isFiniteNum(seq) || !Number.isInteger(seq) || /** @type {number} */ (seq) < 1) {
        return fail('BAD_POINT', 'seq debe ser un entero >= 1');
    }
    const fix = validateFix(raw);
    if (!fix.ok)
        return fix;
    return pass({ seq, ...fix.value });
}
/** @param {unknown} raw @returns {Validation} */
function validateTrackMeta(raw) {
    if (!isObj(raw))
        return fail('BAD_TRACK_META', 'meta no es un objeto');
    const m = /** @type {Record<string, unknown>} */ (raw);
    if (!isFiniteNum(m.rev) || !Number.isInteger(m.rev) || /** @type {number} */ (m.rev) < 1)
        return fail('BAD_TRACK_META', 'rev inválida');
    if (typeof m.state !== 'string' || !TRACK_STATES.has(m.state))
        return fail('BAD_TRACK_META', 'estado desconocido');
    if (!isTs(m.startedAt))
        return fail('BAD_TRACK_META', 'startedAt inválido');
    if (m.endedAt !== null && m.endedAt !== undefined && !isTs(m.endedAt))
        return fail('BAD_TRACK_META', 'endedAt inválido');
    if (m.state === 'FINISHED' && !isTs(m.endedAt))
        return fail('BAD_TRACK_META', 'un track FINISHED necesita endedAt');
    if (!isFiniteNum(m.lastSeq) || !Number.isInteger(m.lastSeq) || /** @type {number} */ (m.lastSeq) < 0)
        return fail('BAD_TRACK_META', 'lastSeq inválido');
    const name = isStr(m.name, 120) ? /** @type {string} */ (m.name) : '';
    const deviceName = isStr(m.deviceName, 80) ? /** @type {string} */ (m.deviceName) : '';
    const source = isStr(m.source, 32) ? /** @type {string} */ (m.source) : 'phone_gps';
    const distanceNm = isFiniteNum(m.distanceNm) && /** @type {number} */ (m.distanceNm) >= 0 ? /** @type {number} */ (m.distanceNm) : 0;
    const durationMs = isFiniteNum(m.durationMs) && /** @type {number} */ (m.durationMs) >= 0 ? Math.round(/** @type {number} */ (m.durationMs)) : 0;
    return pass({
        rev: m.rev, name, state: m.state, startedAt: m.startedAt, endedAt: m.endedAt ?? null,
        lastSeq: m.lastSeq, source, deviceName, distanceNm, durationMs
    });
}
/** @param {unknown} raw @returns {Validation} */
function validateLogEvent(raw) {
    if (!isObj(raw))
        return fail('BAD_EVENT', 'evento no es un objeto');
    const e = /** @type {Record<string, unknown>} */ (raw);
    if (typeof e.eventId !== 'string' || !STRONG_ID_PATTERN.test(e.eventId))
        return fail('BAD_EVENT', 'eventId inválido');
    if (e.trackId !== null && e.trackId !== undefined && (typeof e.trackId !== 'string' || !STRONG_ID_PATTERN.test(e.trackId))) {
        return fail('BAD_EVENT', 'trackId inválido');
    }
    if (typeof e.kind !== 'string' || !EVENT_KINDS.has(e.kind))
        return fail('BAD_EVENT', 'tipo de evento desconocido');
    if (typeof e.auto !== 'boolean')
        return fail('BAD_EVENT', 'auto debe ser booleano');
    if (e.kind === 'NOTE' && e.auto)
        return fail('BAD_EVENT', 'una anotación manual no puede ser automática');
    if (!isTs(e.at))
        return fail('BAD_EVENT', 'at inválido');
    let lat = null;
    let lon = null;
    if (e.lat !== null && e.lat !== undefined) {
        const fix = validateFix({ t: e.at, lat: e.lat, lon: e.lon, src: 'event' });
        if (!fix.ok)
            return fail('BAD_EVENT', `posición del evento: ${fix.detail}`);
        lat = fix.value.lat;
        lon = fix.value.lon;
    }
    const title = isStr(e.title, 200) ? /** @type {string} */ (e.title) : '';
    const text = isStr(e.text, 2000) ? /** @type {string} */ (e.text) : '';
    const data = isObj(e.data) ? e.data : {};
    return pass({ eventId: e.eventId, trackId: e.trackId ?? null, kind: e.kind, auto: e.auto, at: e.at, lat, lon, title, text, data });
}
/**
 * Valida el sobre y, según el tipo, el payload. No confía en ningún campo del emisor.
 * @param {unknown} raw objeto ya parseado de JSON
 * @returns {Validation}
 */
function validateMessage(raw) {
    if (!isObj(raw))
        return fail('BAD_ENVELOPE', 'el mensaje no es un objeto');
    const m = /** @type {Record<string, unknown>} */ (raw);
    if (m.v !== PROTOCOL_VERSION)
        return fail('BAD_ENVELOPE', `versión ${String(m.v)} no soportada`);
    if (typeof m.type !== 'string' || m.type.length === 0)
        return fail('BAD_ENVELOPE', 'tipo ausente');
    if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id))
        return fail('BAD_ENVELOPE', 'id inválido');
    if (typeof m.src !== 'string' || !STRONG_ID_PATTERN.test(m.src))
        return fail('BAD_ENVELOPE', 'src inválido');
    if (!isTs(m.ts))
        return fail('BAD_ENVELOPE', 'ts inválido');
    if (!isObj(m.payload))
        return fail('BAD_ENVELOPE', 'payload ausente');
    if (!KNOWN_TYPES.has(m.type))
        return fail('UNKNOWN_TYPE', `tipo ${m.type} desconocido`);
    const p = /** @type {Record<string, any>} */ (m.payload);
    const needsTrack = m.type === TYPES.TRACK_START || m.type === TYPES.TRACK_UPDATE ||
        m.type === TYPES.TRACK_END || m.type === TYPES.TRACK_POINTS;
    if (needsTrack && (typeof m.sid !== 'string' || !STRONG_ID_PATTERN.test(m.sid))) {
        return fail('BAD_TRACK_ID', 'sid (trackId) inválido');
    }
    /** @type {any} */
    let payload = p;
    switch (m.type) {
        case TYPES.HELLO:
            if (!Array.isArray(p.versions) || !Array.isArray(p.caps) || typeof p.paired !== 'boolean') {
                return fail('BAD_PAYLOAD', 'HELLO incompleto');
            }
            payload = {
                deviceName: isStr(p.deviceName, 80) ? p.deviceName : 'Dispositivo',
                platform: isStr(p.platform, 32) ? p.platform : 'unknown',
                app: isStr(p.app, 80) ? p.app : '',
                versions: p.versions.filter((/** @type {unknown} */ x) => Number.isInteger(x)),
                caps: p.caps.filter((/** @type {unknown} */ x) => typeof x === 'string' && x.length <= 40),
                paired: p.paired
            };
            break;
        case TYPES.AUTH:
            if (typeof p.proof !== 'string' || !/^[0-9a-f]{64}$/.test(p.proof))
                return fail('BAD_PAYLOAD', 'proof inválida');
            break;
        case TYPES.PAIR_REQUEST:
            if (typeof p.code !== 'string' || !/^[0-9]{6}$/.test(p.code))
                return fail('BAD_PAYLOAD', 'código de 6 dígitos requerido');
            payload = { code: p.code, deviceName: isStr(p.deviceName, 80) ? p.deviceName : 'Dispositivo', platform: isStr(p.platform, 32) ? p.platform : 'unknown' };
            break;
        case TYPES.POSITION: {
            const fix = validateFix(p.fix);
            if (!fix.ok)
                return fix;
            const trackId = typeof p.trackId === 'string' && STRONG_ID_PATTERN.test(p.trackId) ? p.trackId : null;
            payload = { fix: fix.value, trackId };
            break;
        }
        case TYPES.TRACK_START:
        case TYPES.TRACK_UPDATE:
        case TYPES.TRACK_END: {
            const meta = validateTrackMeta(p);
            if (!meta.ok)
                return meta;
            if (m.type === TYPES.TRACK_END && meta.value.state !== 'FINISHED')
                return fail('BAD_TRACK_META', 'TRACK_END requiere estado FINISHED');
            payload = meta.value;
            break;
        }
        case TYPES.TRACK_POINTS: {
            if (!Array.isArray(p.points) || p.points.length === 0 || p.points.length > MAX_POINTS_PER_BATCH) {
                return fail('BAD_POINT', `points debe tener entre 1 y ${MAX_POINTS_PER_BATCH} elementos`);
            }
            const points = [];
            for (const raw of p.points) {
                const point = validatePoint(raw);
                if (!point.ok)
                    return point;
                points.push(point.value);
            }
            payload = { points };
            break;
        }
        case TYPES.LOG_EVENT: {
            const ev = validateLogEvent(p);
            if (!ev.ok)
                return ev;
            payload = ev.value;
            break;
        }
        case TYPES.SYNC_REQUEST:
            if (!Array.isArray(p.tracks) || p.tracks.length > 500 ||
                !p.tracks.every((/** @type {unknown} */ t) => typeof t === 'string' && STRONG_ID_PATTERN.test(t))) {
                return fail('BAD_PAYLOAD', 'tracks inválidos');
            }
            break;
        default:
            break;
    }
    /** @type {LinkEnvelope} */
    const envelope = { v: PROTOCOL_VERSION, type: m.type, id: m.id, src: m.src, ts: /** @type {number} */ (m.ts), payload };
    if (typeof m.sid === 'string')
        envelope.sid = m.sid;
    if (m.ack === true)
        envelope.ack = true;
    return pass(envelope);
}
/**
 * @param {string} type
 * @param {string} src
 * @param {any} payload
 * @param {{ sid?: string, ack?: boolean, now?: number }} [options]
 * @returns {LinkEnvelope}
 */
function createMessage(type, src, payload, options = {}) {
    /** @type {LinkEnvelope} */
    const message = { v: PROTOCOL_VERSION, type, id: crypto.randomUUID(), src, ts: options.now ?? Date.now(), payload };
    if (options.sid)
        message.sid = options.sid;
    if (options.ack)
        message.ack = true;
    return message;
}
/**
 * proof = hex(HMAC-SHA256(base64url_decode(token), 'VLINK1|nonce|desktopId|deviceId'))
 * @param {string} token @param {string} nonce @param {string} desktopId @param {string} deviceId
 */
function computeProof(token, nonce, desktopId, deviceId) {
    const key = Buffer.from(token, 'base64url');
    return crypto.createHmac('sha256', key).update(`VLINK1|${nonce}|${desktopId}|${deviceId}`, 'utf8').digest('hex');
}
/** Comparación en tiempo constante de dos pruebas hexadecimales. @param {string} a @param {string} b */
function proofsEqual(a, b) {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y);
}
module.exports = {
    PROTOCOL_VERSION, SUPPORTED_VERSIONS, LINK_TCP_PORT, DISCOVERY_UDP_PORT, HEARTBEAT_MS, STALE_CONNECTION_MS,
    MAX_MESSAGE_BYTES, MAX_POINTS_PER_BATCH, CAPABILITIES, TYPES, TRACK_STATES, EVENT_KINDS, ERROR_CODES,
    ID_PATTERN, STRONG_ID_PATTERN,
    validateMessage, validateFix, validatePoint, validateTrackMeta, validateLogEvent,
    createMessage, computeProof, proofsEqual
};
