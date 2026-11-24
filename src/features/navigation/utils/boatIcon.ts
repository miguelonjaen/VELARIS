/**
 * Icono de la embarcación propia en la carta (BoatLayer). Lógica pura, sin React ni Leaflet.
 *
 * Tamaño: el diseño del casco es de 34×64 px y ese es su tamaño al zoom de referencia (15, el
 * zoom inicial de la carta). Al acercar crece y al alejar se reduce de forma continua: cada nivel
 * de zoom multiplica el tamaño por 2^(1/4) ≈ 1,19 (la carta escala ×2 por nivel, el icono mucho
 * menos para seguir siendo legible). Límites: nunca menor que la mitad (17×32 px, sigue
 * visible) ni mayor que 1,5 veces (51×96 px). Es un único factor para ancho y alto: la
 * proporción se mantiene. Con zoom fraccionario el tamaño también es fraccionario (sin saltos).
 */

import { UNLIT_MAP_LIGHTS, type MapLights } from '../../boat/navigationLights';

export const BOAT_ICON_WIDTH = 34;
export const BOAT_ICON_HEIGHT = 64;
export const BOAT_ICON_REFERENCE_ZOOM = 15;
/** Exponente por nivel de zoom: 0,25 → ×1,19 por nivel. */
export const BOAT_ICON_ZOOM_EXPONENT = 0.25;
export const BOAT_ICON_MIN_SCALE = 0.5;
export const BOAT_ICON_MAX_SCALE = 1.5;
/** Duración de la transición del tamaño; igual que la animación de zoom de Leaflet (0,25 s). */
export const BOAT_ICON_TRANSITION_MS = 250;
/** Variables CSS con la escala y el rumbo actuales (se fijan en el elemento del marcador, sin recrearlo). */
export const BOAT_ICON_SCALE_VAR = "--gaulos-boat-scale";
export const BOAT_ICON_HEADING_VAR = "--gaulos-boat-heading";

export function boatIconScale(zoom: number): number {
    if (!Number.isFinite(zoom)) return 1;
    const raw = Math.pow(2, (zoom - BOAT_ICON_REFERENCE_ZOOM) * BOAT_ICON_ZOOM_EXPONENT);
    const clamped = Math.min(BOAT_ICON_MAX_SCALE, Math.max(BOAT_ICON_MIN_SCALE, raw));
    return Math.round(clamped * 1000) / 1000;
}

export const normalizeHeading = (heading: number): number =>
    Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : 0;

/**
 * HTML del icono. Rumbo y escala se leen de variables CSS del elemento del marcador
 * ([BOAT_ICON_HEADING_VAR], [BOAT_ICON_SCALE_VAR]); [heading] y [scale] son solo los valores
 * iniciales, para que el primer pintado ya sea correcto. Se aplican al casco alrededor de su
 * centro, que es el punto anclado a la posición: girar o escalar nunca desplaza la posición.
 * La rotación no se anima (de 359° a 1° no debe dar la vuelta); la escala sí, al ritmo de la
 * animación de zoom. La etiqueta SIM no gira ni escala y queda justo debajo del casco escalado.
 */
export function buildBoatIconHtml(simulated: boolean, heading = 0, scale = 1, lights: MapLights = UNLIT_MAP_LIGHTS): string {
    const scaleVar = `var(${BOAT_ICON_SCALE_VAR}, ${scale})`;
    const headingVar = `var(${BOAT_ICON_HEADING_VAR}, ${normalizeHeading(heading)}deg)`;

    const simulatedBadge = simulated
        ? `<div title="Posición SIMULADA (simulador NMEA): no son instrumentos del barco" style="position:absolute;left:50%;top:calc(${BOAT_ICON_HEIGHT / 2}px + ${BOAT_ICON_HEIGHT / 2}px * ${scaleVar} + 2px);transform:translateX(-50%);padding:1px 5px;border-radius:4px;background:#f59e0b;color:#111827;font:900 9px/12px monospace;letter-spacing:.12em;white-space:nowrap;box-shadow:0 0 6px rgba(245,158,11,.8);pointer-events:auto;transition:top ${BOAT_ICON_TRANSITION_MS}ms ease-out;">SIM</div>`
        : "";

    const lamp = (active: boolean, id: string, x: number, y: number, color: string) => active ? `<g data-light="${id}"><circle cx="${x}" cy="${y}" r="6" fill="${color}" opacity=".22"/><circle cx="${x}" cy="${y}" r="2.5" fill="${color}" stroke="#08121e" stroke-width=".6"/></g>` : '';
    const lamps = lamp(lights.port,'port',10,25,'#ff334d') + lamp(lights.starboard,'starboard',24,25,'#32f58b') + lamp(lights.stern,'stern',17,55,'#ffffff') + lamp(lights.masthead,'masthead',17,17,'#ffffff') + (lights.tricolor ? lamp(true,'tricolor-port',14,27,'#ff334d')+lamp(true,'tricolor-starboard',20,27,'#32f58b')+lamp(true,'tricolor-stern',17,33,'#ffffff') : '') + lamp(lights.anchor,'anchor',17,8,'#ffffff') + (lights.fog ? '<g data-light="fog"><title>Luz de niebla · ensayo</title><path d="M17 12 L5 1 L29 1 Z" fill="#ffffff" opacity=".24"/><circle cx="17" cy="12" r="2.5" fill="#ffffff" stroke="#08121e" stroke-width=".6"/></g>' : '');
    const lightBadge = lamps && lights.simulated ? '<span data-lighting="simulated" style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font:700 8px monospace;color:#fbbf24;white-space:nowrap;">LUCES SIM</span>' : '';
    return `
    <div style="position:relative;width:${BOAT_ICON_WIDTH}px;height:${BOAT_ICON_HEIGHT}px;">
    <div style="width:${BOAT_ICON_WIDTH}px;height:${BOAT_ICON_HEIGHT}px;transform:rotate(${headingVar});transform-origin:50% 50%;pointer-events:none;">
    <div
      style="
        width:${BOAT_ICON_WIDTH}px;
        height:${BOAT_ICON_HEIGHT}px;
        transform:scale(${scaleVar});
        transform-origin:50% 50%;
        transition:transform ${BOAT_ICON_TRANSITION_MS}ms ease-out;
        filter:drop-shadow(0 0 5px rgba(0,0,0,.65));
        pointer-events:none;
      "
    >
      <svg
        width="${BOAT_ICON_WIDTH}"
        height="${BOAT_ICON_HEIGHT}"
        viewBox="0 0 34 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="
            M17 2
            C13 8 8 18 7 30
            C6 42 9 54 17 62
            C25 54 28 42 27 30
            C26 18 21 8 17 2
            Z
          "
          fill="#d7dde3"
          stroke="#111827"
          stroke-width="1.5"
        />

        <path
          d="
            M17 8
            C14 15 11 23 11 31
            C11 39 13 47 17 54
            C21 47 23 39 23 31
            C23 23 20 15 17 8
            Z
          "
          fill="#9ca3af"
          opacity="0.75"
        />

        <line
          x1="17"
          y1="7"
          x2="17"
          y2="56"
          stroke="#374151"
          stroke-width="1"
        />

        <path
          d="
            M17 2
            L12.5 13
            L17 10
            L21.5 13
            Z
          "
          fill="#f3f4f6"
        />

        <path
          d="
            M12 52
            Q17 58 22 52
            L20 58
            Q17 62 14 58
            Z
          "
          fill="#6b7280"
        />

        <circle
          cx="17"
          cy="32"
          r="3"
          fill="#111827"
          stroke="${simulated ? "#f59e0b" : "#22d3ee"}"
          stroke-width="1.5"
        />
        ${lamps}
      </svg>
    </div>
    </div>
    ${lightBadge}
    ${simulatedBadge}
    </div>
  `;
}
