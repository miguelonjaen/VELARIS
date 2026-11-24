import { useCallback, useEffect, useState } from "react";
import {
    describeNmeaStatus,
    loadNmeaGatewayConfig,
    saveNmeaGatewayConfig,
    toConnectionTarget,
    type NmeaGatewayConfig,
    type NmeaServiceStatusView,
    type NmeaStatusDescription
} from "./nmeaGatewayConfig";

interface NmeaDesktopApi {
    connectNmea?: (target: unknown) => Promise<{ ok: boolean; error?: string; status?: NmeaServiceStatusView | null }>;
    disconnectHardware?: () => void;
    getHardwareStatus?: () => Promise<NmeaServiceStatusView | null>;
    listHardwarePorts?: () => Promise<Array<{ path: string; manufacturer: string | null }>>;
}

const STATUS_REFRESH_MS = 1000;

const desktopApi = (): NmeaDesktopApi | null =>
    typeof window !== "undefined" ? ((window as unknown as { GAULOSAPI?: NmeaDesktopApi }).GAULOSAPI ?? null) : null;

const browserStorage = () => {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
};

/**
 * Estado del bloque «Gateway NMEA». No conecta al montar: solo a petición.
 * Consulta el estado del proceso principal mientras el panel está abierto.
 */
export function useNmeaGateway() {
    const [config, setConfig] = useState<NmeaGatewayConfig>(() => loadNmeaGatewayConfig(browserStorage()));
    const [status, setStatus] = useState<NmeaServiceStatusView | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [serialPorts, setSerialPorts] = useState<Array<{ path: string; manufacturer: string | null }>>([]);
    const [now, setNow] = useState(() => Date.now());
    const available = Boolean(desktopApi()?.connectNmea);

    const update = useCallback((patch: Partial<NmeaGatewayConfig>) => {
        setConfig((previous) => {
            const next = { ...previous, ...patch };
            saveNmeaGatewayConfig(browserStorage(), next);
            return next;
        });
        setMessage(null);
    }, []);

    useEffect(() => {
        const api = desktopApi();
        if (!api?.getHardwareStatus) return;
        let cancelled = false;
        const refresh = () => {
            api.getHardwareStatus?.()
                .then((next) => { if (!cancelled) { setStatus(next ?? null); setNow(Date.now()); } })
                .catch(() => undefined);
        };
        refresh();
        const interval = window.setInterval(refresh, STATUS_REFRESH_MS);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, []);

    const refreshSerialPorts = useCallback(() => {
        desktopApi()?.listHardwarePorts?.()
            .then((ports) => setSerialPorts(Array.isArray(ports) ? ports : []))
            .catch(() => setSerialPorts([]));
    }, []);

    useEffect(() => {
        if (config.transport === "serial") refreshSerialPorts();
    }, [config.transport, refreshSerialPorts]);

    const connect = useCallback(async (asInstruments = false) => {
        const api = desktopApi();
        if (!api?.connectNmea) {
            setMessage("La conexión NMEA solo está disponible en GAULOS Desktop.");
            return;
        }
        try {
            const selected = asInstruments ? { ...config, tcpSource: 'BOAT' as const } : config;
            if (asInstruments) { setConfig(selected); saveNmeaGatewayConfig(browserStorage(), selected); }
            const result = await api.connectNmea(toConnectionTarget(selected));
            if (result.ok && (selected.transport === 'serial' || selected.tcpSource === 'BOAT')) window.dispatchEvent(new Event('gaulos:nmea-instruments'));
            setMessage(result.ok ? null : (result.error ?? "No se pudo conectar."));
            if (result.status !== undefined) setStatus(result.status ?? null);
        } catch {
            setMessage("No se pudo comunicar con el proceso principal de GAULOS.");
        }
    }, [config]);

    const disconnect = useCallback(() => {
        desktopApi()?.disconnectHardware?.();
        setMessage(null);
    }, []);

    const description: NmeaStatusDescription = describeNmeaStatus(status, now);

    return { config, update, status, description, message, connect, useAsInstruments: () => connect(true), disconnect, available, serialPorts, refreshSerialPorts };
}
