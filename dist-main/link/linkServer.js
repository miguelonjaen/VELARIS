// @ts-check
'use strict';
/**
 * Servidor VELARIS Link (proceso principal de Electron).
 *
 * - Escucha solo en IPv4 privadas (10/8, 172.16/12, 192.168/16) y en loopback; nunca en 0.0.0.0.
 * - Desactivado por defecto: se activa desde el panel «Dispositivos VELARIS Link».
 * - Ningún mensaje de datos se acepta antes de autenticar el dispositivo (reto-respuesta HMAC).
 * - Solo recibe datos: no reenvía nada a ningún dispositivo (sin bucles de retransmisión).
 */
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const protocol = require('./protocol');
const { LinkStorageError } = require('./linkStore');
const { TYPES, ERROR_CODES } = protocol;
const PAIRING_WINDOW_MS = 120000;
const MAX_PAIRING_ATTEMPTS = 5;
const MAX_UNAUTHENTICATED = 8;
const UNAUTHENTICATED_TIMEOUT_MS = 30000;
const PENDING_APPROVAL_TIMEOUT_MS = 120000;
const BEACON_INTERVAL_MS = 2000;
const INTERFACE_CHECK_MS = 10000;
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 200;
const DIAGNOSTICS_MAX = 80;
/**
 * Tipos mínimos de `ws` que se usan aquí (el proyecto no instala @types/ws).
 * @typedef {{ readyState: number, send(data: string): void, close(code?: number, reason?: string): void, terminate(): void,
 *   on(event: string, listener: (...args: any[]) => void): void }} WsSocket
 * @typedef {{ clients: Set<WsSocket>, on(event: 'connection', listener: (socket: WsSocket, request: http.IncomingMessage) => void): void,
 *   close(callback: () => void): void }} WsServer
 * @typedef {new (options: { server: http.Server, maxPayload: number, perMessageDeflate: boolean }) => WsServer} WsServerConstructor
 * @typedef {import('./linkStore').LinkStore} LinkStore
 * @typedef {import('./protocol').LinkEnvelope} LinkEnvelope
 * @typedef {{ address: string, netmask: string, broadcast: string }} BindAddress
 * @typedef {{
 *   id: string, socket: WsSocket, remoteAddress: string, state: 'NEW'|'CHALLENGED'|'PENDING'|'AUTHED',
 *   deviceId: string|null, deviceName: string, platform: string, nonce: string, sessionId: string|null,
 *   caps: string[], connectedAt: number, lastRx: number, rateWindowStart: number, rateCount: number,
 *   unauthTimer: NodeJS.Timeout|null, pending: number
 * }} Connection
 * @typedef {{ requestId: string, connectionId: string, deviceId: string, deviceName: string, platform: string, address: string, requestedAt: number, timer: NodeJS.Timeout }} PendingPair
 */
/** @param {string} ip */
function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        return false;
    return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}
/**
 * Rango 100.64.0.0/10 (CGNAT), el que usan las VPN tipo Tailscale. Solo se acepta en una interfaz
 * cuyo nombre sea de VPN (ver selectBindAddresses): en una interfaz normal sería la IP WAN de un
 * operador, que nunca debe recibir conexiones de Link.
 * @param {string} ip
 */
function isOverlayIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
        return false;
    return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}
const OVERLAY_INTERFACE_NAME = /tailscale/i;
/**
 * Dirección de origen observada en el socket y su clase, SOLO para diagnóstico (no autentica nada):
 * 'LAN' (IP privada), 'VPN' (100.64.0.0/10), 'local' (bucle), 'otra' (cualquier otra, p. ej. IP pública) o
 * 'desconocida' si el socket no la expone. Quita el prefijo IPv4-mapeado (::ffff:).
 * @param {string|undefined|null} remoteAddress
 * @returns {{ address: string, origin: 'LAN'|'VPN'|'local'|'otra'|'desconocida' }}
 */
function classifyOrigin(remoteAddress) {
    const raw = typeof remoteAddress === 'string' ? remoteAddress.trim() : '';
    if (!raw || raw === '?')
        return { address: 'desconocida', origin: 'desconocida' };
    const address = raw.replace(/^::ffff:/i, '');
    if (address === '::1' || address.startsWith('127.'))
        return { address, origin: 'local' };
    if (isPrivateIPv4(address))
        return { address, origin: 'LAN' };
    if (isOverlayIPv4(address))
        return { address, origin: 'VPN' };
    return { address, origin: 'otra' };
}
/** @param {string} address @param {string} netmask */
function broadcastAddress(address, netmask) {
    const a = address.split('.').map(Number);
    const m = netmask.split('.').map(Number);
    return a.map((octet, i) => (octet | (~m[i] & 255)) & 255).join('.');
}
/**
 * Direcciones en las que se puede escuchar: IPv4 privadas de interfaces activas + loopback.
 * @param {ReturnType<typeof os.networkInterfaces>} interfaces
 * @returns {BindAddress[]}
 */
function selectBindAddresses(interfaces) {
    /** @type {BindAddress[]} */
    const result = [{ address: '127.0.0.1', netmask: '255.0.0.0', broadcast: '' }];
    for (const [name, entries] of Object.entries(interfaces)) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal)
                continue;
            const overlay = isOverlayIPv4(entry.address) && OVERLAY_INTERFACE_NAME.test(name);
            if (!overlay && !isPrivateIPv4(entry.address))
                continue;
            if (result.some((r) => r.address === entry.address))
                continue;
            // Una VPN no tiene difusión útil: el teléfono recibe esta dirección en el WELCOME.
            result.push({ address: entry.address, netmask: entry.netmask, broadcast: overlay ? '' : broadcastAddress(entry.address, entry.netmask) });
        }
    }
    return result;
}
/**
 * Direcciones de VPN (Tailscale) de este PC, para que el teléfono las memorice y las use cuando
 * está fuera de la LAN (datos móviles).
 * @param {ReturnType<typeof os.networkInterfaces>} interfaces
 * @returns {string[]}
 */
function overlayAddresses(interfaces) {
    const result = [];
    for (const [name, entries] of Object.entries(interfaces)) {
        if (!OVERLAY_INTERFACE_NAME.test(name))
            continue;
        for (const entry of entries ?? []) {
            if (entry.family === 'IPv4' && !entry.internal && isOverlayIPv4(entry.address))
                result.push(entry.address);
        }
    }
    return result;
}
class LinkServer extends EventEmitter {
    /**
     * @param {{
     *   store: LinkStore,
     *   port?: number, discoveryPort?: number,
     *   networkInterfaces?: () => ReturnType<typeof os.networkInterfaces>,
     *   now?: () => number, log?: (level: string, message: string) => void,
     *   WebSocketServer?: WsServerConstructor,
     *   enableDiscovery?: boolean, heartbeatMs?: number, staleMs?: number
     * }} options
     */
    constructor(options) {
        super();
        this.store = options.store;
        this.port = options.port ?? protocol.LINK_TCP_PORT;
        this.discoveryPort = options.discoveryPort ?? protocol.DISCOVERY_UDP_PORT;
        this.networkInterfaces = options.networkInterfaces ?? (() => os.networkInterfaces());
        this.now = options.now ?? (() => Date.now());
        this.log = options.log ?? (() => { });
        /** @type {WsServerConstructor} */
        // @ts-ignore -- el proyecto no instala @types/ws; los tipos usados están en WsServerConstructor.
        this.WebSocketServer = options.WebSocketServer ?? require('ws').WebSocketServer;
        this.enableDiscovery = options.enableDiscovery ?? true;
        this.heartbeatMs = options.heartbeatMs ?? protocol.HEARTBEAT_MS;
        this.staleMs = options.staleMs ?? protocol.STALE_CONNECTION_MS;
        /** @type {Map<string, { http: http.Server, wss: WsServer, bind: BindAddress }>} */
        this.servers = new Map();
        /** @type {Map<string, Connection>} */
        this.connections = new Map();
        /** deviceId → instante de la última desconexión de una sesión autenticada (para medir la recuperación). */
        this.lastDrop = new Map();
        /** @type {Map<string, PendingPair>} */
        this.pending = new Map();
        /** @type {{ code: string, expiresAt: number, attempts: number } | null} */
        this.pairing = null;
        /** @type {Map<string, { deviceId: string, deviceName: string, fix: import('./protocol').Fix, trackId: string|null, rx: number }>} */
        this.positions = new Map();
        /** @type {{ at: number, level: string, message: string }[]} */
        this.diagnostics = [];
        /** @type {string|null} */
        this.lastError = null;
        this.running = false;
        /** @type {dgram.Socket|null} */
        this.beaconSocket = null;
        /** @type {NodeJS.Timeout[]} */
        this.timers = [];
    }
    // --- Ciclo de vida ---------------------------------------------------------------------
    async start() {
        if (this.running)
            return;
        this.running = true;
        await this.#syncListeners();
        this.timers.push(setInterval(() => { this.#syncListeners().catch(() => { }); }, INTERFACE_CHECK_MS));
        this.timers.push(setInterval(() => this.#heartbeat(), this.heartbeatMs));
        if (this.enableDiscovery)
            this.#startBeacon();
        this.#diag('info', `Servidor activado (TCP ${this.port}, anuncio UDP ${this.discoveryPort})`);
        this.#emitStatus();
    }
    async stop() {
        if (!this.running)
            return;
        this.running = false;
        for (const timer of this.timers)
            clearInterval(timer);
        this.timers = [];
        for (const connection of this.connections.values())
            this.#close(connection, 'SERVER_STOPPED');
        for (const pending of this.pending.values())
            clearTimeout(pending.timer);
        this.pending.clear();
        this.pairing = null;
        if (this.beaconSocket) {
            try {
                this.beaconSocket.close();
            }
            catch { /* ya cerrado */ }
            this.beaconSocket = null;
        }
        await Promise.all([...this.servers.keys()].map((address) => this.#closeListener(address)));
        this.#diag('info', 'Servidor desactivado');
        this.#emitStatus();
    }
    /** @param {boolean} enabled */
    async setEnabled(enabled) {
        this.store.setEnabled(enabled);
        if (enabled)
            await this.start();
        else
            await this.stop();
    }
    // --- Emparejamiento --------------------------------------------------------------------
    startPairing() {
        if (!this.running)
            throw new Error('Activa VELARIS Link antes de vincular un dispositivo');
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        this.pairing = { code, expiresAt: this.now() + PAIRING_WINDOW_MS, attempts: 0 };
        this.#diag('info', 'Ventana de vinculación abierta (2 minutos)');
        this.#emitStatus();
        return { code, expiresAt: this.pairing.expiresAt };
    }
    cancelPairing() {
        this.pairing = null;
        this.#emitStatus();
    }
    /** @param {string} requestId */
    approvePairing(requestId) {
        const pending = this.pending.get(requestId);
        if (!pending)
            throw new Error('Solicitud de vinculación no encontrada o caducada');
        const connection = this.connections.get(pending.connectionId);
        this.#removePending(requestId);
        if (!connection || connection.state !== 'PENDING')
            throw new Error('El dispositivo se ha desconectado');
        const token = crypto.randomBytes(32).toString('base64url');
        this.store.addDevice({ deviceId: pending.deviceId, name: pending.deviceName, platform: pending.platform }, token);
        // D5: tras el primer emparejamiento correcto Link queda activado por defecto (se conserva al reiniciar).
        if (!this.store.settings.enabled) {
            this.store.setEnabled(true);
            this.#diag('info', 'VELARIS Link queda activado por defecto tras el primer emparejamiento');
        }
        connection.state = 'CHALLENGED';
        this.#armAuthTimeout(connection);
        this.#send(connection, TYPES.PAIR_RESULT, {
            accepted: true, token, desktopId: this.store.identity.desktopId, desktopName: this.store.identity.name, reason: null
        });
        this.#diag('info', `Dispositivo vinculado: ${pending.deviceName}`);
        this.emit('devices', this.store.listDevices());
        this.#emitStatus();
    }
    /** @param {string} requestId */
    rejectPairing(requestId) {
        const pending = this.pending.get(requestId);
        if (!pending)
            return;
        const connection = this.connections.get(pending.connectionId);
        this.#removePending(requestId);
        if (connection) {
            this.#send(connection, TYPES.PAIR_RESULT, {
                accepted: false, token: null, desktopId: this.store.identity.desktopId, desktopName: this.store.identity.name, reason: 'REJECTED'
            });
            this.#close(connection, 'PAIRING_REJECTED');
        }
        this.#diag('warn', `Vinculación rechazada: ${pending.deviceName}`);
        this.#emitStatus();
    }
    /** @param {string} deviceId */
    revokeDevice(deviceId) {
        const removed = this.store.revokeDevice(deviceId);
        for (const connection of this.connections.values()) {
            if (connection.deviceId === deviceId) {
                this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Vinculación revocada desde VELARIS Desktop', true, null);
                this.#close(connection, 'REVOKED');
            }
        }
        this.positions.delete(deviceId);
        if (removed)
            this.#diag('warn', 'Dispositivo desvinculado');
        this.emit('devices', this.store.listDevices());
        this.#emitStatus();
        return removed;
    }
    // --- Estado ----------------------------------------------------------------------------
    getStatus() {
        const now = this.now();
        const pairing = this.pairing && this.pairing.expiresAt > now ? { code: this.pairing.code, expiresAt: this.pairing.expiresAt } : null;
        return {
            enabled: this.store.settings.enabled,
            running: this.running,
            desktopId: this.store.identity.desktopId,
            desktopName: this.store.identity.name,
            port: this.port,
            discoveryPort: this.discoveryPort,
            listening: [...this.servers.values()].map((l) => l.bind.address),
            pairing,
            pending: [...this.pending.values()].map(({ requestId, deviceName, platform, address, requestedAt }) => ({ requestId, deviceName, platform, address, requestedAt })),
            connections: [...this.connections.values()].filter((c) => c.state === 'AUTHED').map((c) => ({
                deviceId: c.deviceId, deviceName: c.deviceName, address: c.remoteAddress, connectedAt: c.connectedAt, lastRx: c.lastRx,
                pending: c.pending
            })),
            devices: this.store.listDevices(),
            positions: [...this.positions.values()],
            lastError: this.lastError,
            diagnostics: this.diagnostics.slice(-30)
        };
    }
    // --- Red -------------------------------------------------------------------------------
    async #syncListeners() {
        if (!this.running)
            return;
        const wanted = selectBindAddresses(this.networkInterfaces());
        const wantedSet = new Set(wanted.map((w) => w.address));
        for (const address of [...this.servers.keys()]) {
            if (!wantedSet.has(address)) {
                await this.#closeListener(address);
                this.#diag('info', `Interfaz retirada: ${address}`);
            }
        }
        for (const bind of wanted) {
            const existing = this.servers.get(bind.address);
            if (existing) {
                existing.bind = bind;
                continue;
            }
            try {
                await this.#listen(bind);
                this.#diag('info', `Escuchando en ${bind.address}:${this.port}`);
            }
            catch (error) {
                this.#fail(`No se pudo escuchar en ${bind.address}:${this.port}: ${ /** @type {Error} */(error).message}`);
            }
        }
        this.#emitStatus();
    }
    /** @param {BindAddress} bind */
    #listen(bind) {
        return new Promise((resolve, reject) => {
            const server = http.createServer((_req, res) => {
                res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('VELARIS Link: se requiere WebSocket');
            });
            const wss = new this.WebSocketServer({ server, maxPayload: protocol.MAX_MESSAGE_BYTES, perMessageDeflate: false });
            wss.on('connection', (socket, request) => this.#onConnection(socket, request.socket.remoteAddress ?? '?'));
            server.once('error', reject);
            server.listen(this.port, bind.address, () => {
                server.off('error', reject);
                server.on('error', (error) => this.#fail(`Error en ${bind.address}: ${error.message}`));
                this.servers.set(bind.address, { http: server, wss, bind });
                resolve(undefined);
            });
        });
    }
    /** @param {string} address */
    #closeListener(address) {
        const listener = this.servers.get(address);
        this.servers.delete(address);
        if (!listener)
            return Promise.resolve();
        for (const client of listener.wss.clients)
            client.terminate();
        return new Promise((resolve) => {
            listener.wss.close(() => listener.http.close(() => resolve(undefined)));
        });
    }
    #startBeacon() {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        socket.on('error', (error) => this.#diag('warn', `Anuncio UDP: ${error.message}`));
        socket.bind(0, () => {
            try {
                socket.setBroadcast(true);
            }
            catch { /* sin permiso de broadcast */ }
        });
        this.beaconSocket = socket;
        this.timers.push(setInterval(() => this.#sendBeacon(), BEACON_INTERVAL_MS));
    }
    #sendBeacon() {
        if (!this.beaconSocket)
            return;
        const message = protocol.createMessage(TYPES.DISCOVERY_BEACON, this.store.identity.desktopId, {
            name: this.store.identity.name, port: this.port, versions: protocol.SUPPORTED_VERSIONS, pairing: this.#pairingOpen()
        }, { now: this.now() });
        const data = Buffer.from(JSON.stringify(message), 'utf8');
        for (const { bind } of this.servers.values()) {
            if (!bind.broadcast)
                continue;
            this.beaconSocket.send(data, this.discoveryPort, bind.broadcast, () => { });
        }
    }
    // --- Conexiones ------------------------------------------------------------------------
    /** @param {WsSocket} socket @param {string} remoteAddress */
    #onConnection(socket, remoteAddress) {
        const unauthenticated = [...this.connections.values()].filter((c) => c.state !== 'AUTHED').length;
        if (unauthenticated >= MAX_UNAUTHENTICATED) {
            socket.close(1013, 'RATE_LIMITED');
            this.#diag('warn', `Conexión rechazada (demasiadas sin autenticar) desde ${remoteAddress}`);
            return;
        }
        /** @type {Connection} */
        const connection = {
            id: crypto.randomUUID(), socket, remoteAddress, state: 'NEW', deviceId: null, deviceName: '', platform: '',
            nonce: crypto.randomBytes(16).toString('hex'), sessionId: null, caps: [], connectedAt: this.now(), lastRx: this.now(),
            rateWindowStart: this.now(), rateCount: 0, unauthTimer: null, pending: 0
        };
        this.#armAuthTimeout(connection);
        this.connections.set(connection.id, connection);
        this.#diag('info', `Conexión TCP entrante de ${remoteAddress}`);
        socket.on('message', (/** @type {Buffer} */ data, /** @type {boolean} */ isBinary) => this.#onRawMessage(connection, data, isBinary));
        socket.on('close', () => this.#onClosed(connection));
        socket.on('error', (/** @type {Error} */ error) => this.#diag('warn', `Socket ${remoteAddress}: ${error.message}`));
    }
    /** @param {Connection} connection @param {Buffer} data @param {boolean} isBinary */
    #onRawMessage(connection, data, isBinary) {
        const now = this.now();
        connection.lastRx = now;
        if (now - connection.rateWindowStart > RATE_WINDOW_MS) {
            connection.rateWindowStart = now;
            connection.rateCount = 0;
        }
        if (++connection.rateCount > RATE_MAX_MESSAGES) {
            this.#sendError(connection, ERROR_CODES.RATE_LIMITED, 'Demasiados mensajes', true, null);
            this.#close(connection, 'RATE_LIMITED');
            return;
        }
        if (isBinary) {
            this.#sendError(connection, ERROR_CODES.BAD_MESSAGE, 'Solo se admiten mensajes de texto JSON', false, null);
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(data.toString());
        }
        catch {
            this.#sendError(connection, ERROR_CODES.BAD_MESSAGE, 'JSON inválido', false, null);
            return;
        }
        const result = protocol.validateMessage(parsed);
        if (!result.ok) {
            const ref = parsed && typeof parsed.id === 'string' ? parsed.id : null;
            this.#diag('warn', `Mensaje rechazado de ${connection.deviceName || connection.remoteAddress}: ${result.code} ${result.detail}`);
            this.#sendError(connection, ERROR_CODES.BAD_MESSAGE, `${result.code}: ${result.detail}`, false, ref);
            return;
        }
        try {
            this.#handle(connection, result.value);
        }
        catch (error) {
            const storage = error instanceof LinkStorageError;
            const message = /** @type {Error} */ (error).message;
            if (storage && /otro dispositivo/.test(message)) {
                this.#sendError(connection, ERROR_CODES.TRACK_OWNER_MISMATCH, message, false, result.value.id);
            }
            else {
                this.#fail(`Error procesando ${result.value.type}: ${message}`);
                this.#sendError(connection, storage ? ERROR_CODES.STORAGE_FAILED : ERROR_CODES.INTERNAL, message, false, result.value.id);
            }
        }
    }
    /** @param {Connection} connection @param {LinkEnvelope} message */
    #handle(connection, message) {
        if (message.type === TYPES.HEARTBEAT) {
            if (connection.state === 'AUTHED') {
                const reported = message.payload.pending;
                const pending = Number.isInteger(reported) && reported >= 0 ? Math.min(reported, 1e9) : 0;
                if (pending !== connection.pending) {
                    connection.pending = pending;
                    this.#emitStatus();
                }
            }
            return;
        }
        if (message.type === TYPES.BYE) {
            this.#close(connection, 'CLIENT_BYE');
            return;
        }
        if (connection.state !== 'AUTHED') {
            this.#handleHandshake(connection, message);
            return;
        }
        if (message.src !== connection.deviceId) {
            this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'src no coincide con el dispositivo autenticado', true, message.id);
            this.#close(connection, 'SRC_MISMATCH');
            return;
        }
        const deviceId = /** @type {string} */ (connection.deviceId);
        switch (message.type) {
            case TYPES.POSITION: {
                const previous = this.positions.get(deviceId);
                if (previous && previous.fix.t >= message.payload.fix.t)
                    return; // desordenado o repetido: no retrocede
                const position = { deviceId, deviceName: connection.deviceName, fix: message.payload.fix, trackId: message.payload.trackId, rx: this.now() };
                this.positions.set(deviceId, position);
                this.emit('position', position);
                return;
            }
            case TYPES.TRACK_START:
            case TYPES.TRACK_UPDATE:
            case TYPES.TRACK_END: {
                const trackId = /** @type {string} */ (message.sid);
                const result = this.store.upsertTrackMeta(deviceId, trackId, message.payload);
                const state = this.store.getTrackSyncState(trackId);
                this.#send(connection, TYPES.ACK, { ref: message.id, trackId, metaRev: result.metaRev, seq: state.seq, events: [] }, trackId);
                if (result.changed)
                    this.emit('track', this.store.getTrackSummary(trackId));
                return;
            }
            case TYPES.TRACK_POINTS: {
                const trackId = /** @type {string} */ (message.sid);
                const result = this.store.appendPoints(deviceId, trackId, message.payload.points);
                const state = this.store.getTrackSyncState(trackId);
                this.#send(connection, TYPES.ACK, { ref: message.id, trackId, metaRev: state.metaRev, seq: result.contiguousSeq, events: [] }, trackId);
                if (result.added.length > 0)
                    this.emit('trackPoints', { trackId, points: result.added, summary: this.store.getTrackSummary(trackId) });
                return;
            }
            case TYPES.LOG_EVENT: {
                const event = message.payload;
                if (event.trackId) {
                    const owner = this.store.getTrackOwner(event.trackId);
                    if (owner && owner !== deviceId)
                        throw new LinkStorageError('El track pertenece a otro dispositivo');
                }
                const result = this.store.addEvent(deviceId, connection.deviceName, event);
                this.#send(connection, TYPES.ACK, { ref: message.id, trackId: event.trackId, metaRev: null, seq: null, events: [event.eventId] }, event.trackId ?? undefined);
                if (result.added)
                    this.emit('logEvent', result.event);
                return;
            }
            case TYPES.SYNC_REQUEST: {
                const tracks = message.payload.tracks.map((/** @type {string} */ trackId) => {
                    const owner = this.store.getTrackOwner(trackId);
                    if (owner && owner !== deviceId)
                        return { trackId, known: false, metaRev: 0, seq: 0, maxSeq: 0, events: [] };
                    return this.store.getTrackSyncState(trackId);
                });
                this.#send(connection, TYPES.SYNC_STATE, { ref: message.id, tracks });
                return;
            }
            default:
                this.#sendError(connection, ERROR_CODES.BAD_MESSAGE, `${message.type} no esperado en esta fase`, false, message.id);
        }
    }
    /** @param {Connection} connection @param {LinkEnvelope} message */
    #handleHandshake(connection, message) {
        switch (message.type) {
            case TYPES.HELLO: {
                if (connection.state !== 'NEW')
                    return;
                if (!message.payload.versions.includes(protocol.PROTOCOL_VERSION)) {
                    this.#sendError(connection, ERROR_CODES.UNSUPPORTED_VERSION, 'Versión de VELARIS Link incompatible', true, message.id);
                    this.#close(connection, 'UNSUPPORTED_VERSION');
                    return;
                }
                connection.deviceId = message.src;
                connection.deviceName = message.payload.deviceName;
                connection.platform = message.payload.platform;
                connection.caps = message.payload.caps.filter((/** @type {string} */ c) => protocol.CAPABILITIES.includes(c));
                connection.state = 'CHALLENGED';
                this.#send(connection, TYPES.CHALLENGE, {
                    nonce: connection.nonce, desktopId: this.store.identity.desktopId, desktopName: this.store.identity.name,
                    version: protocol.PROTOCOL_VERSION, caps: connection.caps, pairing: this.#pairingOpen()
                });
                return;
            }
            case TYPES.AUTH: {
                if (connection.state !== 'CHALLENGED' || message.src !== connection.deviceId) {
                    this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Secuencia de autenticación inválida', true, message.id);
                    this.#close(connection, 'BAD_AUTH_SEQUENCE');
                    return;
                }
                const token = this.store.getDeviceToken(message.src);
                const expected = token ? protocol.computeProof(token, connection.nonce, this.store.identity.desktopId, message.src) : null;
                if (!expected || !protocol.proofsEqual(expected, message.payload.proof)) {
                    this.#diag('warn', `Intento no autorizado de «${connection.deviceName}» desde ${connection.remoteAddress}`);
                    this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Dispositivo no vinculado o revocado', true, message.id);
                    this.#close(connection, 'NOT_AUTHORIZED');
                    return;
                }
                for (const other of this.connections.values()) {
                    if (other !== connection && other.deviceId === message.src && other.state === 'AUTHED')
                        this.#close(other, 'REPLACED');
                }
                if (connection.unauthTimer)
                    clearTimeout(connection.unauthTimer);
                connection.unauthTimer = null;
                connection.state = 'AUTHED';
                connection.sessionId = crypto.randomUUID();
                this.store.touchDevice(message.src, connection.deviceName);
                this.#send(connection, TYPES.WELCOME, {
                    sessionId: connection.sessionId, desktopId: this.store.identity.desktopId, desktopName: this.store.identity.name,
                    version: protocol.PROTOCOL_VERSION, caps: connection.caps, heartbeatMs: this.heartbeatMs,
                    altHosts: overlayAddresses(this.networkInterfaces())
                });
                this.#diag('info', `Conectado: ${connection.deviceName} (${connection.remoteAddress})`);
                const droppedAt = this.lastDrop.get(message.src);
                if (droppedAt !== undefined) {
                    this.lastDrop.delete(message.src);
                    const seconds = Math.round((this.now() - droppedAt) / 100) / 10;
                    const { address, origin } = classifyOrigin(connection.remoteAddress);
                    this.#diag('info', `RECUPERACION_SESION ${connection.deviceName}: desconexión→WELCOME ${seconds.toFixed(1)} s · origen ${address} (${origin})`);
                    this.emit('recovery', { deviceId: message.src, seconds, address, origin });
                }
                this.#emitStatus();
                return;
            }
            case TYPES.PAIR_REQUEST: {
                if (connection.state !== 'CHALLENGED' || message.src !== connection.deviceId) {
                    this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Secuencia de vinculación inválida', true, message.id);
                    this.#close(connection, 'BAD_PAIR_SEQUENCE');
                    return;
                }
                if (!this.#pairingOpen() || !this.pairing) {
                    this.#sendError(connection, ERROR_CODES.PAIRING_CLOSED, 'Abre «Vincular dispositivo» en VELARIS Desktop', true, message.id);
                    this.#close(connection, 'PAIRING_CLOSED');
                    return;
                }
                const expected = Buffer.from(this.pairing.code, 'utf8');
                const given = Buffer.from(message.payload.code, 'utf8');
                if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
                    this.pairing.attempts++;
                    const left = MAX_PAIRING_ATTEMPTS - this.pairing.attempts;
                    this.#diag('warn', `Código de vinculación incorrecto desde ${connection.remoteAddress}`);
                    if (left <= 0) {
                        this.pairing = null;
                        this.#sendError(connection, ERROR_CODES.PAIRING_CLOSED, 'Demasiados intentos: genera un código nuevo', true, message.id);
                        this.#close(connection, 'PAIRING_ATTEMPTS');
                    }
                    else {
                        this.#sendError(connection, ERROR_CODES.PAIRING_CODE_INVALID, `Código incorrecto (${left} intentos restantes)`, false, message.id);
                    }
                    this.#emitStatus();
                    return;
                }
                this.pairing = null; // código de un solo uso
                connection.state = 'PENDING';
                connection.deviceName = message.payload.deviceName;
                connection.platform = message.payload.platform;
                const requestId = crypto.randomUUID();
                this.pending.set(requestId, {
                    requestId, connectionId: connection.id, deviceId: /** @type {string} */ (connection.deviceId),
                    deviceName: connection.deviceName, platform: connection.platform, address: connection.remoteAddress, requestedAt: this.now(),
                    timer: setTimeout(() => this.rejectPairing(requestId), PENDING_APPROVAL_TIMEOUT_MS)
                });
                if (connection.unauthTimer)
                    clearTimeout(connection.unauthTimer);
                connection.unauthTimer = null;
                this.#send(connection, TYPES.PAIR_PENDING, { message: 'Acepta el dispositivo en VELARIS Desktop' });
                this.#diag('info', `Solicitud de vinculación de «${connection.deviceName}» (${connection.remoteAddress})`);
                this.emit('pairingRequest', { requestId, deviceName: connection.deviceName, platform: connection.platform, address: connection.remoteAddress });
                this.#emitStatus();
                return;
            }
            default:
                this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Autenticación requerida', true, message.id);
                this.#close(connection, 'NOT_AUTHENTICATED');
        }
    }
    #heartbeat() {
        const now = this.now();
        for (const connection of this.connections.values()) {
            if (connection.state !== 'AUTHED')
                continue;
            if (now - connection.lastRx > this.staleMs) {
                this.#diag('warn', `Sin noticias de ${connection.deviceName} durante ${Math.round((now - connection.lastRx) / 1000)} s: conexión obsoleta`);
                this.#close(connection, 'STALE', true);
                continue;
            }
            this.#send(connection, TYPES.HEARTBEAT, {});
        }
        if (this.pairing && this.pairing.expiresAt <= now) {
            this.pairing = null;
            this.#emitStatus();
        }
    }
    /** @param {Connection} connection */
    #armAuthTimeout(connection) {
        if (connection.unauthTimer)
            clearTimeout(connection.unauthTimer);
        connection.unauthTimer = setTimeout(() => {
            if (connection.state === 'NEW' || connection.state === 'CHALLENGED') {
                this.#sendError(connection, ERROR_CODES.NOT_AUTHORIZED, 'Tiempo de autenticación agotado', true, null);
                this.#close(connection, 'AUTH_TIMEOUT');
            }
        }, UNAUTHENTICATED_TIMEOUT_MS);
    }
    /** @param {Connection} connection */
    #onClosed(connection) {
        if (!this.connections.has(connection.id))
            return;
        this.connections.delete(connection.id);
        if (connection.unauthTimer)
            clearTimeout(connection.unauthTimer);
        for (const [requestId, pending] of this.pending) {
            if (pending.connectionId === connection.id)
                this.#removePending(requestId);
        }
        if (connection.state === 'AUTHED') {
            this.#diag('info', `Desconectado: ${connection.deviceName}`);
            if (connection.deviceId)
                this.lastDrop.set(connection.deviceId, this.now());
        }
        else
            this.#diag('warn', `Conexión de ${connection.deviceName || connection.remoteAddress} cerrada antes de autenticarse (estado ${connection.state})`);
        this.#emitStatus();
    }
    /** @param {Connection} connection @param {string} reason @param {boolean} [terminate] */
    #close(connection, reason, terminate = false) {
        try {
            if (terminate)
                connection.socket.terminate();
            else
                connection.socket.close(1000, reason.slice(0, 100));
        }
        catch { /* ya cerrado */ }
        this.#onClosed(connection);
    }
    /** @param {string} requestId */
    #removePending(requestId) {
        const pending = this.pending.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
    }
    #pairingOpen() {
        return !!this.pairing && this.pairing.expiresAt > this.now();
    }
    /** @param {Connection} connection @param {string} type @param {any} payload @param {string} [sid] */
    #send(connection, type, payload, sid) {
        if (connection.socket.readyState !== 1)
            return;
        const message = protocol.createMessage(type, this.store.identity.desktopId, payload, { sid, now: this.now() });
        connection.socket.send(JSON.stringify(message));
    }
    /** @param {Connection} connection @param {string} code @param {string} text @param {boolean} fatal @param {string|null} ref */
    #sendError(connection, code, text, fatal, ref) {
        this.#send(connection, TYPES.ERROR, { code, message: text, fatal, ref });
    }
    /** @param {string} message */
    #fail(message) {
        this.lastError = message;
        this.#diag('error', message);
    }
    /** @param {string} level @param {string} message */
    #diag(level, message) {
        this.diagnostics.push({ at: this.now(), level, message });
        if (this.diagnostics.length > DIAGNOSTICS_MAX)
            this.diagnostics.splice(0, this.diagnostics.length - DIAGNOSTICS_MAX);
        this.log(level, `[VELARIS Link] ${message}`);
    }
    #emitStatus() {
        this.emit('status', this.getStatus());
    }
}
module.exports = { LinkServer, classifyOrigin, selectBindAddresses, isPrivateIPv4, isOverlayIPv4, overlayAddresses, broadcastAddress };
