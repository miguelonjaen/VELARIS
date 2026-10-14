// @ts-check
'use strict';
/**
 * Persistencia local de VELARIS Link en Desktop (carpeta userData/velaris-link).
 *
 *   identity.json            { desktopId, name }
 *   settings.json            { enabled }
 *   devices.json             [{ deviceId, name, platform, pairedAt, lastSeenAt, tokenEnc }]
 *   logbook.jsonl            eventos de bitácora recibidos (uno por línea, deduplicados por eventId)
 *   tracks/<trackId>/meta.json     metadatos + propietario (deviceId)
 *   tracks/<trackId>/points.jsonl  puntos originales, solo-añadir (deduplicados por seq)
 *
 * Toda escritura que se confirma al emisor se hace con fsync antes de devolver: un ACK solo se
 * envía cuando el dato está realmente en disco. Los datos nunca se reescriben ni se reordenan.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { STRONG_ID_PATTERN } = require('./protocol');
/**
 * @typedef {{ isAvailable(): boolean, encrypt(plain: string): string, decrypt(enc: string): string }} SecretBox
 * @typedef {{ deviceId: string, name: string, platform: string, pairedAt: number, lastSeenAt: number|null, tokenEnc: string }} StoredDevice
 * @typedef {import('./protocol').TrackPoint} TrackPoint
 * @typedef {import('./protocol').TrackMeta} TrackMeta
 * @typedef {import('./protocol').LogEvent} LogEvent
 * @typedef {LogEvent & { deviceId: string, deviceName: string, receivedAt: number }} StoredEvent
 * @typedef {{ trackId: string, deviceId: string, meta: TrackMeta, receivedAt: number }} StoredMeta
 * @typedef {{ stored: StoredMeta, points: Map<number, TrackPoint & { rx: number }>, contiguousSeq: number, maxSeq: number }} TrackCache
 */
class LinkStorageError extends Error {
}
class LinkStore {
    /**
     * @param {{ dir: string, secretBox: SecretBox, now?: () => number, defaultName?: string }} options
     */
    constructor(options) {
        this.dir = options.dir;
        this.secretBox = options.secretBox;
        this.now = options.now ?? (() => Date.now());
        this.defaultName = options.defaultName ?? `VELARIS · ${os.hostname()}`;
        /** @type {{ desktopId: string, name: string }} */
        this.identity = { desktopId: '', name: '' };
        /** @type {{ enabled: boolean }} */
        this.settings = { enabled: false };
        /** @type {StoredDevice[]} */
        this.devices = [];
        /** @type {Map<string, StoredEvent>} */
        this.events = new Map();
        /** @type {Map<string, TrackCache>} */
        this.tracks = new Map();
    }
    init() {
        fs.mkdirSync(path.join(this.dir, 'tracks'), { recursive: true });
        const identity = this.#readJson('identity.json', null);
        if (identity && typeof identity.desktopId === 'string' && STRONG_ID_PATTERN.test(identity.desktopId)) {
            this.identity = { desktopId: identity.desktopId, name: typeof identity.name === 'string' ? identity.name : this.defaultName };
        }
        else {
            this.identity = { desktopId: crypto.randomUUID(), name: this.defaultName };
            this.#writeJsonAtomic('identity.json', this.identity);
        }
        const settings = this.#readJson('settings.json', {});
        this.settings = { enabled: settings.enabled === true };
        const devices = this.#readJson('devices.json', []);
        this.devices = Array.isArray(devices) ? devices.filter((d) => d && typeof d.deviceId === 'string' && typeof d.tokenEnc === 'string') : [];
        this.#loadEvents();
        this.#loadTracks();
        return this;
    }
    // --- Ajustes ---------------------------------------------------------------------------
    /** @param {boolean} enabled */
    setEnabled(enabled) {
        this.settings = { ...this.settings, enabled: enabled === true };
        this.#writeJsonAtomic('settings.json', this.settings);
    }
    // --- Dispositivos ----------------------------------------------------------------------
    listDevices() {
        return this.devices.map(({ tokenEnc: _omit, ...rest }) => ({ ...rest }));
    }
    /** @param {string} deviceId */
    hasDevice(deviceId) {
        return this.devices.some((d) => d.deviceId === deviceId);
    }
    /** @param {string} deviceId @returns {string|null} */
    getDeviceToken(deviceId) {
        const device = this.devices.find((d) => d.deviceId === deviceId);
        if (!device)
            return null;
        try {
            return this.secretBox.decrypt(device.tokenEnc);
        }
        catch {
            return null;
        }
    }
    /**
     * Vincula (o revincula) un dispositivo. El token se guarda cifrado con el almacén seguro del SO.
     * @param {{ deviceId: string, name: string, platform: string }} device
     * @param {string} token
     */
    addDevice(device, token) {
        if (!this.secretBox.isAvailable()) {
            throw new LinkStorageError('El cifrado seguro del sistema no está disponible: no se puede guardar la vinculación');
        }
        const record = {
            deviceId: device.deviceId,
            name: device.name,
            platform: device.platform,
            pairedAt: this.now(),
            lastSeenAt: null,
            tokenEnc: this.secretBox.encrypt(token)
        };
        this.devices = [...this.devices.filter((d) => d.deviceId !== device.deviceId), record];
        this.#writeJsonAtomic('devices.json', this.devices);
    }
    /** @param {string} deviceId @param {string} [name] */
    touchDevice(deviceId, name) {
        const device = this.devices.find((d) => d.deviceId === deviceId);
        if (!device)
            return;
        device.lastSeenAt = this.now();
        if (name)
            device.name = name;
        this.#writeJsonAtomic('devices.json', this.devices);
    }
    /** @param {string} deviceId */
    revokeDevice(deviceId) {
        const before = this.devices.length;
        this.devices = this.devices.filter((d) => d.deviceId !== deviceId);
        if (this.devices.length !== before)
            this.#writeJsonAtomic('devices.json', this.devices);
        return this.devices.length !== before;
    }
    // --- Tracks ----------------------------------------------------------------------------
    /**
     * Guarda los metadatos si su revisión es más reciente. Idempotente.
     * @param {string} deviceId @param {string} trackId @param {TrackMeta} meta
     * @returns {{ metaRev: number, changed: boolean, previousState: string|null }}
     */
    upsertTrackMeta(deviceId, trackId, meta) {
        const track = this.#trackFor(deviceId, trackId);
        const previous = track.stored.meta;
        if (meta.rev <= previous.rev) {
            return { metaRev: previous.rev, changed: false, previousState: previous.state };
        }
        const stored = { trackId, deviceId, meta: { ...meta }, receivedAt: this.now() };
        this.#writeJsonAtomic(path.join('tracks', trackId, 'meta.json'), stored);
        track.stored = stored;
        return { metaRev: meta.rev, changed: true, previousState: previous.rev === 0 ? null : previous.state };
    }
    /**
     * Añade los puntos nuevos (deduplicados por seq) con fsync y recalcula la secuencia contigua.
     * @param {string} deviceId @param {string} trackId @param {TrackPoint[]} points
     * @returns {{ added: (TrackPoint & { rx: number })[], contiguousSeq: number, maxSeq: number }}
     */
    appendPoints(deviceId, trackId, points) {
        const track = this.#trackFor(deviceId, trackId);
        const rx = this.now();
        const seen = new Set();
        const added = [];
        for (const point of points) {
            if (track.points.has(point.seq) || seen.has(point.seq))
                continue;
            seen.add(point.seq);
            added.push({ ...point, rx });
        }
        if (added.length > 0) {
            this.#appendLinesSync(path.join('tracks', trackId, 'points.jsonl'), added.map((p) => JSON.stringify(p)));
            for (const point of added) {
                track.points.set(point.seq, point);
                if (point.seq > track.maxSeq)
                    track.maxSeq = point.seq;
            }
            while (track.points.has(track.contiguousSeq + 1))
                track.contiguousSeq++;
        }
        return { added, contiguousSeq: track.contiguousSeq, maxSeq: track.maxSeq };
    }
    /** @param {string} trackId */
    getTrackOwner(trackId) {
        return this.tracks.get(trackId)?.stored.deviceId ?? null;
    }
    /** @param {string} trackId */
    getTrackSyncState(trackId) {
        const track = this.tracks.get(trackId);
        const events = [...this.events.values()].filter((e) => e.trackId === trackId).map((e) => e.eventId);
        if (!track)
            return { trackId, known: false, metaRev: 0, seq: 0, maxSeq: 0, events };
        return { trackId, known: true, metaRev: track.stored.meta.rev, seq: track.contiguousSeq, maxSeq: track.maxSeq, events };
    }
    listTracks() {
        return [...this.tracks.values()].map((t) => this.#summary(t)).sort((a, b) => b.startedAt - a.startedAt);
    }
    /** @param {string} trackId */
    getTrackSummary(trackId) {
        const track = this.tracks.get(trackId);
        return track ? this.#summary(track) : null;
    }
    /** Puntos originales ordenados por seq. @param {string} trackId */
    getTrackPoints(trackId) {
        const track = this.tracks.get(trackId);
        if (!track)
            return [];
        return [...track.points.values()].sort((a, b) => a.seq - b.seq);
    }
    // --- Bitácora --------------------------------------------------------------------------
    /**
     * @param {string} deviceId @param {string} deviceName @param {LogEvent} event
     * @returns {{ added: boolean, event: StoredEvent }}
     */
    addEvent(deviceId, deviceName, event) {
        const existing = this.events.get(event.eventId);
        if (existing)
            return { added: false, event: existing };
        /** @type {StoredEvent} */
        const stored = { ...event, deviceId, deviceName, receivedAt: this.now() };
        this.#appendLinesSync('logbook.jsonl', [JSON.stringify(stored)]);
        this.events.set(stored.eventId, stored);
        return { added: true, event: stored };
    }
    listEvents() {
        return [...this.events.values()].sort((a, b) => b.at - a.at);
    }
    // --- Internos --------------------------------------------------------------------------
    /** @param {TrackCache} track */
    #summary(track) {
        const { meta, deviceId, trackId, receivedAt } = track.stored;
        const device = this.devices.find((d) => d.deviceId === deviceId);
        const expected = meta.state === 'FINISHED' ? meta.lastSeq : Math.max(meta.lastSeq, track.maxSeq);
        return {
            trackId,
            deviceId,
            deviceName: meta.deviceName || device?.name || 'Dispositivo',
            name: meta.name,
            state: meta.rev === 0 ? 'UNKNOWN' : meta.state,
            startedAt: meta.startedAt,
            endedAt: meta.endedAt,
            lastSeq: meta.lastSeq,
            contiguousSeq: track.contiguousSeq,
            maxSeq: track.maxSeq,
            pointCount: track.points.size,
            missing: Math.max(0, expected - track.points.size),
            complete: meta.state === 'FINISHED' && track.contiguousSeq >= meta.lastSeq,
            distanceNm: meta.distanceNm,
            durationMs: meta.durationMs,
            updatedAt: receivedAt
        };
    }
    /**
     * Devuelve la caché del track, creándola si no existe. Rechaza un track de otro dispositivo.
     * @param {string} deviceId @param {string} trackId @returns {TrackCache}
     */
    #trackFor(deviceId, trackId) {
        if (!STRONG_ID_PATTERN.test(trackId))
            throw new LinkStorageError('trackId inválido');
        let track = this.tracks.get(trackId);
        if (track) {
            if (track.stored.deviceId !== deviceId)
                throw new LinkStorageError('El track pertenece a otro dispositivo');
            return track;
        }
        fs.mkdirSync(path.join(this.dir, 'tracks', trackId), { recursive: true });
        /** @type {StoredMeta} */
        const stored = {
            trackId, deviceId, receivedAt: this.now(),
            meta: { rev: 0, name: '', state: 'RECORDING', startedAt: this.now(), endedAt: null, lastSeq: 0, source: 'phone_gps', deviceName: '', distanceNm: 0, durationMs: 0 }
        };
        this.#writeJsonAtomic(path.join('tracks', trackId, 'meta.json'), stored);
        track = { stored, points: new Map(), contiguousSeq: 0, maxSeq: 0 };
        this.tracks.set(trackId, track);
        return track;
    }
    #loadTracks() {
        const tracksDir = path.join(this.dir, 'tracks');
        for (const trackId of fs.readdirSync(tracksDir)) {
            if (!STRONG_ID_PATTERN.test(trackId))
                continue;
            const stored = this.#readJson(path.join('tracks', trackId, 'meta.json'), null);
            if (!stored || stored.trackId !== trackId || typeof stored.deviceId !== 'string' || !stored.meta)
                continue;
            /** @type {TrackCache} */
            const track = { stored, points: new Map(), contiguousSeq: 0, maxSeq: 0 };
            for (const point of this.#readLines(path.join('tracks', trackId, 'points.jsonl'))) {
                if (!Number.isInteger(point.seq) || point.seq < 1 || track.points.has(point.seq))
                    continue;
                track.points.set(point.seq, point);
                if (point.seq > track.maxSeq)
                    track.maxSeq = point.seq;
            }
            while (track.points.has(track.contiguousSeq + 1))
                track.contiguousSeq++;
            this.tracks.set(trackId, track);
        }
    }
    #loadEvents() {
        for (const event of this.#readLines('logbook.jsonl')) {
            if (event && typeof event.eventId === 'string' && !this.events.has(event.eventId))
                this.events.set(event.eventId, event);
        }
    }
    /**
     * Lee un JSONL tolerando una última línea incompleta (corte de corriente durante una escritura).
     * @param {string} relative @returns {any[]}
     */
    #readLines(relative) {
        const file = path.join(this.dir, relative);
        if (!fs.existsSync(file))
            return [];
        const result = [];
        for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
            if (!line.trim())
                continue;
            try {
                result.push(JSON.parse(line));
            }
            catch {
                // Línea truncada: se ignora; el emisor la reenviará porque nunca se confirmó.
            }
        }
        return result;
    }
    /** @param {string} relative @param {string[]} lines */
    #appendLinesSync(relative, lines) {
        const file = path.join(this.dir, relative);
        let fd = -1;
        try {
            fd = fs.openSync(file, 'a');
            // Si la última escritura quedó cortada sin salto de línea, se empieza en una línea nueva.
            const size = fs.fstatSync(fd).size;
            let prefix = '';
            if (size > 0) {
                const last = Buffer.alloc(1);
                const readFd = fs.openSync(file, 'r');
                try {
                    fs.readSync(readFd, last, 0, 1, size - 1);
                }
                finally {
                    fs.closeSync(readFd);
                }
                if (last.toString('utf8') !== '\n')
                    prefix = '\n';
            }
            fs.writeSync(fd, `${prefix}${lines.join('\n')}\n`);
            fs.fsyncSync(fd);
        }
        catch (error) {
            throw new LinkStorageError(`No se pudo guardar en ${relative}: ${ /** @type {Error} */(error).message}`);
        }
        finally {
            if (fd >= 0)
                fs.closeSync(fd);
        }
    }
    /** @param {string} relative @param {any} fallback */
    #readJson(relative, fallback) {
        try {
            return JSON.parse(fs.readFileSync(path.join(this.dir, relative), 'utf8'));
        }
        catch {
            return fallback;
        }
    }
    /** @param {string} relative @param {unknown} value */
    #writeJsonAtomic(relative, value) {
        const file = path.join(this.dir, relative);
        const temporary = `${file}.tmp`;
        try {
            const fd = fs.openSync(temporary, 'w');
            try {
                fs.writeSync(fd, JSON.stringify(value, null, 2));
                fs.fsyncSync(fd);
            }
            finally {
                fs.closeSync(fd);
            }
            fs.renameSync(temporary, file);
        }
        catch (error) {
            throw new LinkStorageError(`No se pudo guardar ${relative}: ${ /** @type {Error} */(error).message}`);
        }
    }
}
module.exports = { LinkStore, LinkStorageError };
