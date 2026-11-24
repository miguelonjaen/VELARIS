import { ReadlineParser } from "@serialport/parser-readline";
import { createConnection, isIP } from "net";

import { NMEAParser } from "@/core/services/NMEAParser";
import { TelemetryMessage } from "@/core/types/TelemetryMessage";

/**
 * Entrada NMEA 0183 de GAULOS Desktop.
 *
 * Transportes:
 *  - serie: instrumentos del barco (fuente BOAT). Sin cambios de comportamiento.
 *  - tcp (cliente): servidor NMEA por TCP (gateway del barco o un simulador como
 *    NMEA Simulator X en 127.0.0.1:10110). El origen lo DECLARA quien configura la
 *    conexión, porque NMEA no permite distinguir datos reales de simulados:
 *      · BOAT: se comporta exactamente como los instrumentos del barco (prioridad
 *        sobre Droid, núcleo de telemetría, alarmas), igual que un gateway real.
 *      · SIMULATOR (valor por defecto si no se declara): solo visualización, con la
 *        prioridad más baja.
 *
 * Cada línea recibida se analiza con NMEAParser y se entrega a onData junto con
 * su procedencia (NMEAInputOrigin); el proceso principal la reenvía al renderer
 * por el canal que corresponde a esa procedencia.
 *
 * Ciclo de vida: una sola conexión a la vez (serie o TCP). Repetir el mismo
 * destino no duplica nada; conectar otro cierra el anterior. disconnect() cierra,
 * retira listeners y cancela reintentos. Los errores quedan en getStatus().
 * TCP reintenta de forma acotada (por defecto 3 veces: 2 s, 4 s, 8 s) tras un
 * fallo o un cierre remoto; el contador solo se repone cuando llega una línea.
 */

/** Velocidad de la conexión serie existente (NMEA 0183 estándar). */
export const NMEA_0183_BAUD_RATE = 4800;

/** Longitud máxima de una línea aceptada (NMEA 0183 limita las sentencias a 82 caracteres). */
export const NMEA_MAX_LINE_LENGTH = 1024;

export const NMEA_TCP_CONNECT_TIMEOUT_MS = 5000;

export const NMEA_TCP_RECONNECT_DEFAULTS = { maxAttempts: 3, baseDelayMs: 2000 } as const;

export type NMEATransport = "serial" | "tcp";

/** Clasificación de la procedencia de los datos. */
export type NMEAInputSource = "BOAT" | "SIMULATOR";

export interface NMEAInputOrigin {
    readonly transport: NMEATransport;
    readonly source: NMEAInputSource;
    /** Identificador del emisor: "nmea" (serie) o "tcp:<host>:<puerto>". */
    readonly sourceId: string;
}

export const SERIAL_NMEA_ORIGIN: NMEAInputOrigin = { transport: "serial", source: "BOAT", sourceId: "nmea" };

export interface NMEASerialTarget {
    readonly transport: "serial";
    readonly path: string;
}

export interface NMEATcpTarget {
    readonly transport: "tcp";
    readonly host: string;
    readonly port: number;
    /** Origen declarado de los datos; SIMULATOR si no se indica. */
    readonly source?: NMEAInputSource;
}

/** Origen declarado de una conexión TCP. Sin declarar → SIMULATOR (nunca se supone barco). */
export function validateInputSource(input: unknown): { readonly ok: true; readonly source: NMEAInputSource } | NMEAValidationError {
    if (input === undefined || input === null || input === "") return { ok: true, source: "SIMULATOR" };
    if (input === "BOAT" || input === "SIMULATOR") return { ok: true, source: input };
    return { ok: false, error: "Origen de datos no admitido: usa «BOAT» (instrumentos del barco) o «SIMULATOR»." };
}

export type NMEAConnectionTarget = NMEASerialTarget | NMEATcpTarget;

export type NMEAValidationError = { readonly ok: false; readonly error: string };

export type NMEATargetValidation = { readonly ok: true; readonly target: NMEAConnectionTarget } | NMEAValidationError;

export type NMEAConnectResult = { readonly ok: true } | NMEAValidationError;

/* tsconfig.main.json no activa strictNullChecks: el estrechamiento por «ok» no es fiable allí. */
const failure = (result: unknown): NMEAValidationError => result as NMEAValidationError;

/* ------------------------------------------------------------------ */
/* Validación de destinos (pura, sin red)                              */
/* ------------------------------------------------------------------ */

const HOST_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/** Cadenas con aspecto de dirección de red, que nunca se tratan como puerto serie. */
const NETWORK_ADDRESS_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$|[^\\/:]+:\d{1,5}$)/i;

export function validateTcpHost(input: unknown): { readonly ok: true; readonly host: string } | NMEAValidationError {
    const host = typeof input === "string" ? input.trim() : "";
    if (!host) return { ok: false, error: "Indica el host del servidor NMEA (por ejemplo 127.0.0.1)." };
    if (host.length > 253) return { ok: false, error: "El host del servidor NMEA es demasiado largo." };
    if (isIP(host)) return { ok: true, host };
    if (/^[\d.]+$/.test(host)) return { ok: false, error: `«${host}» no es una dirección IPv4 válida.` };
    if (host.split(".").every((label) => HOST_LABEL.test(label))) return { ok: true, host };
    return {
        ok: false,
        error: `«${host}» no es un host válido: escribe solo la IP o el nombre, sin protocolo, puerto ni ruta.`
    };
}

export function validateTcpPort(input: unknown): { readonly ok: true; readonly port: number } | NMEAValidationError {
    const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
    const port = /^\d{1,5}$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { ok: false, error: "El puerto TCP debe ser un número entero entre 1 y 65535." };
    }
    return { ok: true, port };
}

export function validateSerialPath(input: unknown): { readonly ok: true; readonly path: string } | NMEAValidationError {
    const path = typeof input === "string" ? input.trim() : "";
    if (!path) return { ok: false, error: "Indica el puerto serie (por ejemplo COM3)." };
    if (path.length > 256) return { ok: false, error: "La ruta del puerto serie es demasiado larga." };
    if (NETWORK_ADDRESS_LIKE.test(path)) {
        return { ok: false, error: `«${path}» parece una dirección de red, no un puerto serie: usa el transporte TCP.` };
    }
    return { ok: true, path };
}

/**
 * Normaliza un destino de conexión. Por compatibilidad, una cadena es una ruta
 * de puerto serie (mensajes «hw:connect» existentes).
 */
export function validateConnectionTarget(input: unknown): NMEATargetValidation {
    if (typeof input === "string") {
        const serial = validateSerialPath(input);
        return serial.ok ? { ok: true, target: { transport: "serial", path: (serial as { path: string }).path } } : failure(serial);
    }
    if (typeof input !== "object" || input === null) {
        return { ok: false, error: "Destino de conexión NMEA no válido." };
    }
    const candidate = input as Record<string, unknown>;
    if (candidate.transport === "serial") {
        const serial = validateSerialPath(candidate.path);
        return serial.ok ? { ok: true, target: { transport: "serial", path: (serial as { path: string }).path } } : failure(serial);
    }
    if (candidate.transport === "tcp") {
        const host = validateTcpHost(candidate.host);
        if (!host.ok) return failure(host);
        const port = validateTcpPort(candidate.port);
        if (!port.ok) return failure(port);
        const source = validateInputSource(candidate.source);
        if (!source.ok) return failure(source);
        return {
            ok: true,
            target: {
                transport: "tcp",
                host: (host as { host: string }).host,
                port: (port as { port: number }).port,
                source: (source as { source: NMEAInputSource }).source
            }
        };
    }
    return { ok: false, error: "Transporte NMEA no admitido: usa «serial» o «tcp»." };
}

export const tcpSourceId = (target: { host: string; port: number }): string => `tcp:${target.host}:${target.port}`;

/* ------------------------------------------------------------------ */
/* Separación de líneas de un flujo continuo                           */
/* ------------------------------------------------------------------ */

/**
 * Recompone líneas de un flujo de bytes: una sentencia puede llegar partida en
 * varios paquetes y un paquete puede traer varias. Acepta CRLF y LF. Un resto
 * sin terminador más largo que el máximo se descarta (basura o flujo binario).
 */
export class NMEALineSplitter {
    private buffer = "";

    constructor(private readonly maxLineLength: number = NMEA_MAX_LINE_LENGTH) {}

    public push(chunk: string): string[] {
        this.buffer += chunk;
        const parts = this.buffer.split("\n");
        this.buffer = parts.pop() ?? "";
        if (this.buffer.length > this.maxLineLength) this.buffer = "";
        const lines: string[] = [];
        for (const part of parts) {
            const line = part.trim();
            if (line && line.length <= this.maxLineLength) lines.push(line);
        }
        return lines;
    }

    public reset(): void {
        this.buffer = "";
    }
}

/* ------------------------------------------------------------------ */
/* Dependencias inyectables                                            */
/* ------------------------------------------------------------------ */

export interface NMEAPortLike {
    readonly isOpen: boolean;
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    unpipe?(destination?: NodeJS.WritableStream): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: () => void): this;
    close(callback?: (error?: Error | null) => void): void;
    removeAllListeners(event?: string): this;
}

export type NMEAPortFactory = (
    options: { path: string; baudRate: number },
    onOpen: (error: Error | null) => void
) => NMEAPortLike;

export interface NMEASocketLike {
    on(event: "connect", listener: () => void): this;
    on(event: "data", listener: (chunk: Buffer | string) => void): this;
    on(event: "timeout", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close", listener: () => void): this;
    setTimeout(ms: number): this;
    destroy(error?: Error): this;
    removeAllListeners(event?: string): this;
}

export type NMEASocketFactory = (target: { host: string; port: number }) => NMEASocketLike;

export interface NMEAPortInfo {
    readonly path: string;
    readonly manufacturer: string | null;
}

export interface NMEALogger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

export type NMEAConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

export interface NMEAServiceStatus {
    readonly state: NMEAConnectionState;
    readonly transport: NMEATransport | null;
    /** Puerto serie activo (solo transporte serie). */
    readonly portPath: string | null;
    /** Servidor TCP (solo transporte tcp). */
    readonly host: string | null;
    readonly port: number | null;
    /** Clasificación de los datos de la conexión: BOAT (serie) o SIMULATOR (tcp). */
    readonly source: NMEAInputSource | null;
    readonly error: string | null;
    /** Instante (ms) de la última línea recibida; null si aún no ha llegado ninguna. */
    readonly lastLineAt: number | null;
    /** Reintento TCP en curso o programado (0 si no hay). */
    readonly reconnectAttempt: number;
    readonly maxReconnectAttempts: number;
}

export interface NMEAServiceOptions {
    readonly openPort?: NMEAPortFactory;
    readonly openSocket?: NMEASocketFactory;
    readonly listPorts?: () => Promise<NMEAPortInfo[]>;
    readonly logger?: NMEALogger;
    readonly clock?: () => number;
    /** Tiempo máximo para establecer la conexión TCP (ms). */
    readonly connectTimeoutMs?: number;
    /** Reintentos TCP acotados; maxAttempts 0 los desactiva. */
    readonly reconnect?: { readonly maxAttempts: number; readonly baseDelayMs: number };
}

/* La dependencia nativa solo se carga al abrir un puerto real. */
const defaultOpenPort: NMEAPortFactory = (options, onOpen) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SerialPort } = require("serialport");
    return new SerialPort({ path: options.path, baudRate: options.baudRate, autoOpen: true }, onOpen);
};

/* Cliente TCP con la API nativa de Node.js (sin dependencias). */
const defaultOpenSocket: NMEASocketFactory = ({ host, port }) =>
    createConnection({ host, port }) as unknown as NMEASocketLike;

const defaultListPorts = async (): Promise<NMEAPortInfo[]> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SerialPort } = require("serialport");
    const ports: Array<{ path: string; manufacturer?: string }> = await SerialPort.list();
    return ports.map(port => ({ path: port.path, manufacturer: port.manufacturer ?? null }));
};

const defaultLogger = (): NMEALogger => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const logModule = require("electron-log/main");
    return (logModule.default ?? logModule) as NMEALogger;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function describeSocketError(error: Error, label: string): string {
    switch ((error as NodeJS.ErrnoException).code) {
        case "ECONNREFUSED":
            return `Conexión rechazada por ${label}: comprueba que el simulador está en marcha y sirve NMEA por TCP en ese puerto.`;
        case "ECONNRESET":
            return `${label} cortó la conexión.`;
        case "ETIMEDOUT":
            return `Sin respuesta de ${label}.`;
        case "ENOTFOUND":
        case "EAI_AGAIN":
            return `No se encuentra el host de ${label}.`;
        case "EHOSTUNREACH":
        case "ENETUNREACH":
            return `No hay ruta de red hasta ${label}.`;
        default:
            return `Error de conexión con ${label}: ${error.message}`;
    }
}

const IDLE_STATUS: NMEAServiceStatus = {
    state: "DISCONNECTED",
    transport: null,
    portPath: null,
    host: null,
    port: null,
    source: null,
    error: null,
    lastLineAt: null,
    reconnectAttempt: 0,
    maxReconnectAttempts: 0
};

export class NMEAService {

    /* Transporte serie */
    private activePort: NMEAPortLike | null = null;

    private lineParser: ReadlineParser | null = null;

    /* Transporte TCP */
    private activeSocket: NMEASocketLike | null = null;

    private tcpTarget: { host: string; port: number; source: NMEAInputSource } | null = null;

    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    private reconnectAttempt = 0;

    private socketReceivedLine = false;

    private readonly parser = new NMEAParser();

    private readonly openPort: NMEAPortFactory;

    private readonly openSocket: NMEASocketFactory;

    private readonly listPortsImpl: () => Promise<NMEAPortInfo[]>;

    private readonly logger: NMEALogger;

    private readonly clock: () => number;

    private readonly connectTimeoutMs: number;

    private readonly reconnectPolicy: { readonly maxAttempts: number; readonly baseDelayMs: number };

    private status: NMEAServiceStatus = IDLE_STATUS;

    constructor(
        private readonly onData: (message: TelemetryMessage, origin: NMEAInputOrigin) => void,
        options: NMEAServiceOptions = {}
    ) {
        this.openPort = options.openPort ?? defaultOpenPort;
        this.openSocket = options.openSocket ?? defaultOpenSocket;
        this.listPortsImpl = options.listPorts ?? defaultListPorts;
        this.logger = options.logger ?? defaultLogger();
        this.clock = options.clock ?? Date.now;
        this.connectTimeoutMs = options.connectTimeoutMs ?? NMEA_TCP_CONNECT_TIMEOUT_MS;
        const reconnect = options.reconnect ?? NMEA_TCP_RECONNECT_DEFAULTS;
        this.reconnectPolicy = {
            maxAttempts: Math.max(0, Math.min(10, Math.floor(reconnect.maxAttempts))),
            baseDelayMs: Math.max(10, reconnect.baseDelayMs)
        };
    }

    public getStatus(): NMEAServiceStatus {
        return { ...this.status };
    }

    /** Puertos serie presentes en el equipo (para elegir uno real; no se supone ninguno). */
    public async listPorts(): Promise<NMEAPortInfo[]> {
        return this.listPortsImpl();
    }

    /** Conecta a un destino ya validado (serie o TCP). */
    public connectTarget(target: NMEAConnectionTarget): NMEAConnectResult {
        if (target.transport === "tcp") return this.connectTcp(target);
        return this.connect(target.path)
            ? { ok: true }
            : { ok: false, error: this.status.error ?? "No se pudo iniciar la conexión serie." };
    }

    /**
     * Abre el puerto serie indicado. Si ya está abierto o abriéndose el mismo puerto,
     * no hace nada; si había otra conexión, la cierra antes. Devuelve false si no se
     * pudo iniciar. Una dirección de red nunca se trata como puerto serie.
     */
    public connect(portPath: string): boolean {
        const validation = validateSerialPath(portPath);
        if (!validation.ok) {
            this.logger.warn(`[NMEA] ${failure(validation).error} No se abre ninguna conexión.`);
            return false;
        }
        const path = (validation as { path: string }).path;

        if (this.activePort && this.status.portPath === path
            && (this.status.state === "CONNECTED" || this.status.state === "CONNECTING")) {
            return true;
        }

        this.disconnect();
        this.status = { ...IDLE_STATUS, state: "CONNECTING", transport: "serial", portPath: path, source: "BOAT" };

        try {
            const port = this.openPort({ path, baudRate: NMEA_0183_BAUD_RATE }, (error) => {
                if (this.activePort !== port) {
                    // Se desconectó mientras se abría: no dejar un puerto abierto huérfano.
                    if (!error) this.closeQuietly(port);
                    return;
                }
                if (error) {
                    this.fail(port, `No se pudo abrir ${path}: ${error.message}`);
                    return;
                }
                this.status = { ...this.status, state: "CONNECTED", error: null };
                this.logger.info(`⚓ Conectado a puerto NMEA: ${path}`);
            });

            const lineParser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));
            lineParser.on("data", (line: string) => {
                if (this.activePort !== port) return;
                this.handleLine(line, SERIAL_NMEA_ORIGIN);
            });

            port.on("error", (error: Error) => {
                if (this.activePort !== port) return;
                this.fail(port, `Error NMEA en ${path}: ${error.message}`);
            });
            port.on("close", () => {
                if (this.activePort !== port) return;
                this.releasePort();
                if (this.status.state !== "ERROR") {
                    this.status = { ...this.status, state: "DISCONNECTED" };
                }
                this.logger.warn(`[NMEA] Puerto cerrado: ${path}`);
            });

            this.activePort = port;
            this.lineParser = lineParser;
            return true;
        } catch (error) {
            this.status = { ...IDLE_STATUS, state: "ERROR", transport: "serial", portPath: path, source: "BOAT", error: errorText(error) };
            this.logger.error(`Fallo al abrir puerto: ${errorText(error)}`);
            return false;
        }
    }

    /**
     * Conecta como cliente a un servidor NMEA por TCP con el origen declarado (BOAT o
     * SIMULATOR; por defecto SIMULATOR). Valida antes de abrir nada; repetir el mismo
     * destino no duplica la conexión; cualquier otra conexión previa se cierra.
     */
    public connectTcp(input: { readonly host: unknown; readonly port: unknown; readonly source?: unknown }): NMEAConnectResult {
        const hostResult = validateTcpHost(input?.host);
        if (!hostResult.ok) return this.rejectTarget(failure(hostResult));
        const portResult = validateTcpPort(input?.port);
        if (!portResult.ok) return this.rejectTarget(failure(portResult));
        const sourceResult = validateInputSource(input?.source);
        if (!sourceResult.ok) return this.rejectTarget(failure(sourceResult));
        const host = hostResult as { host: string };
        const port = portResult as { port: number };
        const source = (sourceResult as { source: NMEAInputSource }).source;

        if (this.tcpTarget && this.tcpTarget.host === host.host && this.tcpTarget.port === port.port
            && this.tcpTarget.source === source
            && (this.status.state === "CONNECTED" || this.status.state === "CONNECTING" || this.status.state === "RECONNECTING")) {
            return { ok: true };
        }

        this.disconnect();
        this.tcpTarget = { host: host.host, port: port.port, source };
        this.reconnectAttempt = 0;
        this.openTcp();
        return { ok: true };
    }

    /** Cierra la conexión activa (serie o TCP), retira listeners y cancela reintentos. Idempotente. */
    public disconnect(): void {
        this.cancelReconnect();
        this.tcpTarget = null;
        this.reconnectAttempt = 0;

        const socket = this.activeSocket;
        this.releaseSocket();
        if (socket) this.destroyQuietly(socket);

        const port = this.activePort;
        this.releasePort();
        if (port) this.closeQuietly(port);

        if (this.status.state !== "DISCONNECTED") {
            this.status = { ...this.status, state: "DISCONNECTED", error: null, reconnectAttempt: 0 };
        }
    }

    private rejectTarget(failure: NMEAValidationError): NMEAValidationError {
        this.logger.warn(`[NMEA] ${failure.error} No se abre ninguna conexión.`);
        return failure;
    }

    private handleLine(line: string, origin: NMEAInputOrigin): void {
        this.status = { ...this.status, lastLineAt: this.clock() };
        this.onData(this.parser.parse(line), origin);
    }

    /* ---------------- TCP ---------------- */

    private openTcp(): void {
        const target = this.tcpTarget;
        if (!target) return;
        const label = `${target.host}:${target.port}`;
        const origin: NMEAInputOrigin = { transport: "tcp", source: target.source, sourceId: tcpSourceId(target) };
        const retrying = this.reconnectAttempt > 0;

        this.status = {
            ...IDLE_STATUS,
            state: retrying ? "RECONNECTING" : "CONNECTING",
            transport: "tcp",
            host: target.host,
            port: target.port,
            source: target.source,
            error: retrying ? this.status.error : null,
            lastLineAt: retrying ? this.status.lastLineAt : null,
            reconnectAttempt: this.reconnectAttempt,
            maxReconnectAttempts: this.reconnectPolicy.maxAttempts
        };

        let socket: NMEASocketLike;
        try {
            socket = this.openSocket({ host: target.host, port: target.port });
        } catch (error) {
            this.handleTcpFailure(`No se pudo iniciar la conexión TCP con ${label}: ${errorText(error)}`);
            return;
        }

        const splitter = new NMEALineSplitter();
        let failure: string | null = null;
        this.activeSocket = socket;
        this.socketReceivedLine = false;

        socket.setTimeout(this.connectTimeoutMs);

        socket.on("connect", () => {
            if (this.activeSocket !== socket) return;
            socket.setTimeout(0);
            this.status = { ...this.status, state: "CONNECTED", error: null };
            this.logger.info(`⚓ Conectado a servidor NMEA TCP ${label} (origen declarado: ${target.source === "BOAT" ? "instrumentos del barco" : "simulador"})`);
        });

        socket.on("data", (chunk: Buffer | string) => {
            if (this.activeSocket !== socket) return;
            const text = typeof chunk === "string" ? chunk : chunk.toString("latin1");
            for (const line of splitter.push(text)) {
                if (this.activeSocket !== socket) return;
                if (!this.socketReceivedLine) {
                    // La conexión entrega datos: se reponen los reintentos.
                    this.socketReceivedLine = true;
                    this.reconnectAttempt = 0;
                    this.status = { ...this.status, reconnectAttempt: 0 };
                }
                this.handleLine(line, origin);
            }
        });

        socket.on("timeout", () => {
            if (this.activeSocket !== socket) return;
            failure = `Sin respuesta de ${label} en ${Math.round(this.connectTimeoutMs / 1000)} s.`;
            socket.destroy();
        });

        socket.on("error", (error: Error) => {
            if (this.activeSocket !== socket) return;
            failure = describeSocketError(error, label);
        });

        socket.on("close", () => {
            if (this.activeSocket !== socket) return;
            this.releaseSocket();
            this.handleTcpFailure(failure ?? `El servidor ${label} cerró la conexión.`);
        });
    }

    private handleTcpFailure(message: string): void {
        if (!this.tcpTarget) return;
        const { maxAttempts, baseDelayMs } = this.reconnectPolicy;

        if (this.reconnectAttempt < maxAttempts) {
            this.reconnectAttempt += 1;
            const delayMs = baseDelayMs * 2 ** (this.reconnectAttempt - 1);
            const error = `${message} Reintento ${this.reconnectAttempt} de ${maxAttempts} en ${Math.max(1, Math.round(delayMs / 1000))} s.`;
            this.status = { ...this.status, state: "RECONNECTING", error, reconnectAttempt: this.reconnectAttempt };
            this.logger.warn(`[NMEA] ${error}`);
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.openTcp();
            }, delayMs);
            return;
        }

        const error = maxAttempts > 0 ? `${message} Sin conexión tras ${maxAttempts} reintentos.` : message;
        this.tcpTarget = null;
        this.reconnectAttempt = 0;
        this.status = { ...this.status, state: "ERROR", error, reconnectAttempt: 0 };
        this.logger.error(`[NMEA] ${error}`);
    }

    private cancelReconnect(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private releaseSocket(): void {
        const socket = this.activeSocket;
        this.activeSocket = null;
        if (socket) {
            socket.removeAllListeners();
            // Un error tardío de un socket ya retirado no debe tumbar el proceso principal.
            socket.on("error", () => undefined);
        }
    }

    private destroyQuietly(socket: NMEASocketLike): void {
        try {
            socket.destroy();
        } catch {
            // El socket ya estaba cerrado.
        }
    }

    /* ---------------- Serie ---------------- */

    private fail(port: NMEAPortLike, message: string): void {
        this.logger.error(message);
        this.status = { ...this.status, state: "ERROR", error: message };
        if (this.activePort === port) {
            this.releasePort();
            this.closeQuietly(port);
        }
    }

    private closeQuietly(port: NMEAPortLike): void {
        try {
            if (port.isOpen) port.close();
        } catch {
            // El puerto ya estaba inutilizable.
        }
    }

    private releasePort(): void {
        const port = this.activePort;
        const lineParser = this.lineParser;
        this.lineParser = null;
        this.activePort = null;
        if (lineParser) {
            port?.unpipe?.(lineParser);
            lineParser.removeAllListeners("data");
        }
        if (port) {
            port.removeAllListeners();
            // Un error tardío de un puerto ya retirado no debe tumbar el proceso principal.
            port.on("error", () => undefined);
        }
    }
}
