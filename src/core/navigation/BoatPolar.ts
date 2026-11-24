import { GeoMath } from './GeoMath';
import type { GeoPoint } from './GeoPoint';
export interface BoatPolar {
    readonly windSpeeds: readonly number[];
    readonly rows: readonly { readonly angle: number; readonly speeds: readonly number[] }[];
}
export interface PolarTargets {
    readonly upwindAngle: number;
    readonly downwindAngle: number | null;
    readonly upwindSpeed: number;
}

/** Tabla TWA/TWS, TWS y velocidad del barco en nudos. Sin datos de relleno. */
export function parseBoatPolar(text: string): BoatPolar {
    if (text.length > 200_000) throw new Error('La polar supera 200 KB');
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
    if (lines.length < 3 || lines.length > 182) throw new Error('Se necesitan al menos dos filas TWA; máximo 181');
    const separator = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : ' ';
    const split = (line: string): string[] => separator === ' ' ? line.split(/\s+/) : line.split(separator).map(value => value.trim());
    const number = (value: string): number => {
        if (!value || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) throw new Error('Hay una celda vacía o no numérica');
        const result = Number(value.replace(',', '.'));
        if (!Number.isFinite(result)) throw new Error('Valor numérico inválido');
        return result;
    };
    const header = split(lines[0]);
    if (!/^TWA(?:[\/\\]TWS)?$/i.test(header[0])) throw new Error('La primera celda debe ser TWA/TWS');
    const windSpeeds = header.slice(1).map(number);
    if (windSpeeds.length < 2 || windSpeeds.length > 40 || windSpeeds.some((value, i) => value < 0 || value > 200 || i > 0 && value <= windSpeeds[i - 1])) {
        throw new Error('TWS: al menos dos columnas no negativas, crecientes y sin duplicados (kn)');
    }
    const rows = lines.slice(1).map((line, index) => {
        const values = split(line).map(number);
        if (values.length !== header.length) throw new Error(`Fila ${index + 2}: número de columnas incorrecto`);
        const [angle, ...speeds] = values;
        if (angle < 0 || angle > 180 || speeds.some(speed => speed < 0 || speed > 100)) throw new Error(`Fila ${index + 2}: TWA o velocidad fuera de rango`);
        return { angle, speeds };
    });
    if (rows.some((row, i) => i > 0 && row.angle <= rows[i - 1].angle)) throw new Error('Los ángulos TWA deben ser crecientes y sin duplicados');
    if (!rows.some(row => row.angle > 0 && row.angle < 90 && row.speeds.some(speed => speed > 0))) throw new Error('La polar no aporta datos de ceñida utilizables');
    return { windSpeeds, rows };
}
function windColumn(polar: BoatPolar, wind: number): { left: number; right: number; fraction: number } | null {
    if (!Number.isFinite(wind) || wind < polar.windSpeeds[0] || wind > polar.windSpeeds[polar.windSpeeds.length - 1]) return null;
    const right = polar.windSpeeds.findIndex(value => value >= wind);
    const left = Math.max(0, right - 1);
    return { left, right, fraction: left === right ? 0 : (wind - polar.windSpeeds[left]) / (polar.windSpeeds[right] - polar.windSpeeds[left]) };
}
export function polarSpeed(polar: BoatPolar | null, wind: number, angle: number): number | null {
    if (!polar || !Number.isFinite(angle)) return null;
    const column = windColumn(polar, wind);
    const twa = Math.abs((((angle % 360) + 540) % 360) - 180);
    if (!column || twa < polar.rows[0].angle || twa > polar.rows[polar.rows.length - 1].angle) return null;
    const right = polar.rows.findIndex(row => row.angle >= twa);
    const left = Math.max(0, right - 1);
    const speed = (i: number) => polar.rows[i].speeds[column.left] + (polar.rows[i].speeds[column.right] - polar.rows[i].speeds[column.left]) * column.fraction;
    if (left === right) return speed(left);
    return speed(left) + (speed(right) - speed(left)) * (twa - polar.rows[left].angle) / (polar.rows[right].angle - polar.rows[left].angle);
}
export function polarTargetsForWind(polar: BoatPolar | null, wind: number): PolarTargets | null {
    if (!polar || !windColumn(polar, wind)) return null;
    let up: { angle: number; speed: number; vmg: number } | null = null;
    let down: { angle: number; vmg: number } | null = null;
    // Incluye puntos interpolados para encontrar el máximo VMG sin una polar prefabricada.
    for (let angle = Math.ceil(polar.rows[0].angle * 2) / 2; angle <= polar.rows[polar.rows.length - 1].angle; angle += 0.5) {
        const speed = polarSpeed(polar, wind, angle);
        if (speed === null || speed <= 0) continue;
        const vmg = speed * Math.cos(angle * Math.PI / 180);
        if (angle > 0 && angle < 90 && (!up || vmg > up.vmg)) up = { angle, speed, vmg };
        if (angle > 90 && angle < 180 && (!down || -vmg > down.vmg)) down = { angle, vmg: -vmg };
    }
    return up ? { upwindAngle: up.angle, upwindSpeed: up.speed, downwindAngle: down?.angle ?? null } : null;
}


/** Rayos de aproximación al waypoint, simétricos y sin corriente/abatimiento. */
export function polarLaylineRays(position: GeoPoint | null, waypoint: GeoPoint | null, twd: number | null, targets: PolarTargets | null) {
    if (!position || !waypoint || twd === null || !Number.isFinite(twd) || !targets) return null;
    if (![position.lat, position.lng, waypoint.lat, waypoint.lng].every(Number.isFinite)
        || Math.abs(position.lat) > 85 || Math.abs(waypoint.lat) > 85 || Math.abs(position.lng) > 180 || Math.abs(waypoint.lng) > 180) return null;
    const distance = GeoMath.distanceNM(position, waypoint);
    if (distance < 0.005 || distance > 200) return null;
    const btw = GeoMath.initialBearing(position, waypoint);
    const delta = Math.abs(((btw - twd + 540) % 360) - 180);
    const angle = delta <= 90 ? targets.upwindAngle : targets.downwindAngle;
    if (angle === null) return null;
    const extent = Math.min(300, distance * 1.5);
    const end = (origin: GeoPoint, bearing: number): [number, number] => {
        const lat = origin.lat * Math.PI / 180, lon = origin.lng * Math.PI / 180;
        const course = bearing * Math.PI / 180, arc = extent / 3440.065;
        const y = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(course));
        const x = lon + Math.atan2(Math.sin(course) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(y));
        return [y * 180 / Math.PI, ((x * 180 / Math.PI + 540) % 360) - 180];
    };
    const target: [number, number] = [waypoint.lat, waypoint.lng];
    const boat: [number, number] = [position.lat, position.lng];
    return {
        portPath: [target, end(waypoint, twd + angle + 180)],
        stbdPath: [target, end(waypoint, twd - angle + 180)],
        boatPortPath: [boat, end(position, twd + angle)],
        boatStbdPath: [boat, end(position, twd - angle)]
    };
}


export function evaluatePolarLaylines(input: {
    readonly polar: BoatPolar | null;
    readonly positionAvailable: boolean;
    readonly waypointAvailable: boolean;
    readonly windSource: 'BOAT' | 'METEO' | 'NONE';
    readonly tws: number | null;
    readonly twd: number | null;
}): { readonly targets: PolarTargets | null; readonly reason: string } {
    if (!input.polar) return { targets: null, reason: 'Sin polar válida guardada para este barco' };
    if (!input.positionAvailable) return { targets: null, reason: 'Sin posición vigente del barco o del ensayo' };
    if (!input.waypointAvailable) return { targets: null, reason: 'Sin waypoint activo' };
    if (input.windSource !== 'BOAT' || input.tws === null || input.twd === null || !Number.isFinite(input.tws) || !Number.isFinite(input.twd)) {
        return { targets: null, reason: 'Sin TWS/TWD NMEA vigentes; el viento de previsión no activa laylines' };
    }
    const targets = polarTargetsForWind(input.polar, input.tws);
    if (!targets) return { targets: null, reason: `TWS ${input.tws.toFixed(1)} kn sin datos polares utilizables (rango ${input.polar.windSpeeds[0]}–${input.polar.windSpeeds[input.polar.windSpeeds.length - 1]} kn)` };
    return { targets, reason: `Disponibles · TWS ${input.tws.toFixed(1)} kn · ceñida polar ${targets.upwindAngle.toFixed(1)}°` };
}
