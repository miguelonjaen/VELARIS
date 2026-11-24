/**
 * Configuración de la entrada NMEA de Desktop («Gateway NMEA» en Configuración).
 *
 * Lógica pura y comprobable. Se guarda con el mismo mecanismo que las demás
 * preferencias locales de GAULOS (localStorage, claves «GAULOS_*»). Guardar la
 * configuración NO conecta: la conexión solo se abre a petición del usuario.
 *
 * TCP es cliente de un servidor NMEA: un gateway del barco o un simulador (p. ej.
 * NMEA Simulator X). NMEA no permite distinguirlos, así que el origen se DECLARA:
 *  - "BOAT": se comporta como los instrumentos del barco (prioridad sobre Droid),
 *    exactamente igual que se comportará un gateway real.
 *  - "SIMULATOR": solo visualización, con la prioridad más baja.
 * La validación definitiva la hace el proceso principal (NMEAService).
 */

export type NmeaGatewayTransport = "tcp" | "serial";

/** Origen declarado de los datos de la conexión TCP. */
export type NmeaTcpSource = "BOAT" | "SIMULATOR";

export interface NmeaGatewayConfig {
    readonly transport: NmeaGatewayTransport;
    readonly host: string;
    /** Texto del campo; se valida al conectar. */
    readonly port: string;
    readonly serialPath: string;
    readonly tcpSource: NmeaTcpSource;
}

export const NMEA_GATEWAY_STORAGE_KEY = "VELARIS_nmea_gateway";

/** Valores de la prueba local con NMEA Simulator X (mismo ordenador). */
export const DEFAULT_NMEA_GATEWAY_CONFIG: NmeaGatewayConfig = {
    transport: "tcp",
    host: "127.0.0.1",
    port: "10110",
    serialPath: "",
    tcpSource: "BOAT"
};

export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const text = (value: unknown, fallback: string, max: number): string =>
    typeof value === "string" ? value.slice(0, max) : fallback;

export function loadNmeaGatewayConfig(storage: KeyValueStorage | null | undefined): NmeaGatewayConfig {
    try {
        const raw = storage?.getItem(NMEA_GATEWAY_STORAGE_KEY);
        if (!raw) return DEFAULT_NMEA_GATEWAY_CONFIG;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const defaults = DEFAULT_NMEA_GATEWAY_CONFIG;
        return {
            transport: parsed.transport === "serial" ? "serial" : "tcp",
            host: text(parsed.host, defaults.host, 253),
            port: typeof parsed.port === "number" ? String(parsed.port) : text(parsed.port, defaults.port, 5),
            serialPath: text(parsed.serialPath, defaults.serialPath, 256),
            tcpSource: parsed.schemaVersion === 2 && parsed.tcpSource === "SIMULATOR" ? "SIMULATOR" : "BOAT"
        };
    } catch {
        return DEFAULT_NMEA_GATEWAY_CONFIG;
    }
}

export function saveNmeaGatewayConfig(storage: KeyValueStorage | null | undefined, config: NmeaGatewayConfig): boolean {
    try {
        storage?.setItem(NMEA_GATEWAY_STORAGE_KEY, JSON.stringify({ ...config, schemaVersion: 2 }));
        return Boolean(storage);
    } catch {
        return false;
    }
}

export type NmeaConnectionTargetRequest =
    | { readonly transport: "tcp"; readonly host: string; readonly port: string; readonly source: NmeaTcpSource }
    | { readonly transport: "serial"; readonly path: string };

/** Destino tipado para el canal «hw:connect-target». */
export function toConnectionTarget(config: NmeaGatewayConfig): NmeaConnectionTargetRequest {
    return config.transport === "tcp"
        ? { transport: "tcp", host: config.host.trim(), port: config.port.trim(), source: config.tcpSource }
        : { transport: "serial", path: config.serialPath.trim() };
}

/** Estado devuelto por «hw:get-status» (NMEAServiceStatus del proceso principal). */
export interface NmeaServiceStatusView {
    readonly state: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";
    readonly transport: "serial" | "tcp" | null;
    readonly portPath: string | null;
    readonly host: string | null;
    readonly port: number | null;
    readonly source: "BOAT" | "SIMULATOR" | null;
    readonly error: string | null;
    readonly lastLineAt: number | null;
}

export interface NmeaStatusDescription {
    readonly tone: "idle" | "busy" | "ok" | "warn" | "error";
    readonly text: string;
    /** Clasificación de los datos, siempre visible cuando hay conexión. */
    readonly classification: string | null;
}

export function describeNmeaStatus(status: NmeaServiceStatusView | null | undefined, now: number): NmeaStatusDescription {
    if (!status || status.state === "DISCONNECTED") {
        return { tone: "idle", text: "Desconectado.", classification: null };
    }
    const label = status.transport === "tcp"
        ? `TCP ${status.host ?? "?"}:${status.port ?? "?"}`
        : `serie ${status.portPath ?? "?"}`;
    const classification = status.source === "SIMULATOR"
        ? "Datos SIMULADOS: no son instrumentos del barco."
        : status.source === "BOAT"
            ? (status.transport === "tcp" ? "Tratado como instrumentos del barco (origen declarado en la conexión TCP)." : "Instrumentos del barco.")
            : null;

    switch (status.state) {
        case "CONNECTING":
            return { tone: "busy", text: `Conectando a ${label}…`, classification };
        case "RECONNECTING":
            return { tone: "warn", text: status.error ?? `Reintentando ${label}…`, classification };
        case "ERROR":
            return { tone: "error", text: status.error ?? `Error en ${label}.`, classification };
        case "CONNECTED": {
            if (status.lastLineAt === null) {
                return { tone: "ok", text: `Conectado a ${label}. Esperando sentencias…`, classification };
            }
            const seconds = Math.max(0, Math.round((now - status.lastLineAt) / 1000));
            return { tone: "ok", text: `Conectado a ${label}. Última sentencia hace ${seconds} s.`, classification };
        }
        default:
            return { tone: "idle", text: "Desconectado.", classification: null };
    }
}
