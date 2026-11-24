// @ts-check
'use strict';

/**
 * Datos de los instrumentos del barco que Desktop envía al teléfono en BOAT_DATA (capacidad boat.v1).
 *
 * Entrada: los mismos mensajes que NMEAService entrega al renderer, con su procedencia. Solo se
 * acepta procedencia BOAT: el puerto serie o una conexión TCP que el usuario declaró como
 * «Instrumentos del barco» (puede ser un simulador autorizado para pruebas). Nunca entran datos de
 * Droid (llegan por GAULOS Link, no por NMEAService) ni de un simulador «solo visual» (SIMULATOR).
 *
 * Equivale a la fuente BOAT resuelta en app.navigationState: BOAT es la fuente de mayor prioridad,
 * así que un dato BOAT válido y vigente es siempre el seleccionado. Se aplican las mismas reglas:
 *  - GPS: solo los campos que trae la sentencia (`fields`); sin `fields`, solo la posición
 *    (SharedNavigationFeeds). GGA no aporta SOG/COG; VTG no aporta posición.
 *  - Validez (SharedNavigationState): posición 0,0 o fuera de rango inválida; SOG ≥ 0; ángulos 0..360.
 *    Una lectura más reciente inválida retira el valor anterior de ese campo.
 *  - Caducidad: 10 s (sensorQuality STALE_LIMITS_SECONDS de gps, sog y heading), con reloj monotónico.
 *  - hdgMag solo de HDM: en HDG el valor es el del sensor sin desvío aplicado.
 *  - depth solo con referencia conocida (quilla, superficie o sonda).
 */

const { performance } = require('perf_hooks');
const protocol = require('./protocol');

const DEPTH_REFS = new Set(['keel', 'surface', 'transducer']);

/** @param {unknown} v */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v */
const isAngle = (v) => isNum(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= 360;

class BoatDataFeed {
  /**
   * @param {{ now?: () => number, maxAgeMs?: number }} [options]
   */
  constructor(options = {}) {
    this.now = options.now ?? (() => performance.now());
    this.maxAgeMs = Math.min(options.maxAgeMs ?? protocol.BOAT_DATA_MAX_AGE_MS, protocol.BOAT_DATA_MAX_AGE_MS);
    /** @type {Map<string, { value: any, at: number }>} */
    this.fields = new Map();
    /** @type {{ transport: string, sourceId: string } | null} */
    this.origin = null;
  }

  /** Olvida todo (cambio o cierre de la conexión NMEA). */
  clear() {
    this.fields.clear();
    this.origin = null;
  }

  /**
   * @param {any} message mensaje de NMEAParser
   * @param {{ transport?: string, source?: string, sourceId?: string } | null | undefined} origin
   * @returns {boolean} true si el mensaje era de los instrumentos del barco
   */
  ingest(message, origin) {
    if (!origin || origin.source !== 'BOAT') return false;
    if (origin.transport !== 'serial' && origin.transport !== 'tcp') return false;
    if (!message || typeof message.type !== 'string') return false;
    const sourceId = typeof origin.sourceId === 'string' ? origin.sourceId : '';
    if (!this.origin || this.origin.transport !== origin.transport || this.origin.sourceId !== sourceId) {
      this.clear();
      this.origin = { transport: origin.transport, sourceId };
    }
    const at = this.now();
    /** @param {string} key @param {boolean} valid @param {any} value */
    const put = (key, valid, value) => {
      if (valid) this.fields.set(key, { value, at });
      else this.fields.delete(key);
    };

    switch (message.type) {
      case 'GPS': {
        const present = message.fields;
        if (present ? present.position === true : true) {
          const { lat, lng } = message;
          const valid = isNum(lat) && isNum(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
          put('position', valid, { lat, lon: lng });
        }
        if (present && present.sog === true) put('sog', isNum(message.sog) && message.sog >= 0 && message.sog <= 200, message.sog);
        if (present && present.cog === true) put('cog', isAngle(message.cog), message.cog);
        return true;
      }
      case 'HEADING':
        if (message.headingType === 'true') put('hdgTrue', isAngle(message.heading), message.heading);
        else if (message.headingType === 'magnetic' && message.sentence === 'HDM') put('hdgMag', isAngle(message.heading), message.heading);
        return true;
      case 'DEPTH':
        if (DEPTH_REFS.has(message.reference)) {
          put('depth', isNum(message.depth) && message.depth >= 0 && message.depth <= 11000, { v: message.depth, ref: message.reference });
        }
        return true;
      default:
        return true;
    }
  }

  /**
   * Payload de BOAT_DATA con los campos vigentes, o null si no hay ninguno.
   * @returns {Record<string, any> | null}
   */
  payload() {
    if (!this.origin) return null;
    const now = this.now();
    /** @type {Record<string, any>} */
    const out = {};
    for (const [key, { value, at }] of this.fields) {
      const ageMs = Math.max(0, Math.round(now - at));
      if (ageMs > this.maxAgeMs) {
        this.fields.delete(key);
        continue;
      }
      if (key === 'position') out.position = { lat: value.lat, lon: value.lon, ageMs };
      else if (key === 'depth') out.depth = { v: value.v, ref: value.ref, ageMs };
      else out[key] = { v: value, ageMs };
    }
    if (Object.keys(out).length === 0) return null;
    out.origin = { transport: this.origin.transport, declared: this.origin.transport === 'tcp' };
    return out;
  }
}

module.exports = { BoatDataFeed };
