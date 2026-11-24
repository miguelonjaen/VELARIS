export type SensorId = 'gps' | 'wind' | 'depth' | 'ais' | 'heading' | 'sog';
export type SensorSource = 'real' | 'simulated';
export type SensorStatus = 'offline' | 'stale' | 'poor' | 'good' | 'excellent';

export interface SensorQuality {
  id: SensorId;
  label: string;
  source: SensorSource;
  lastUpdate: number | null;
  ageSeconds: number | null;
  status: SensorStatus;
  confidence: number;
  message: string;
}

export type SensorQualityMap = Record<SensorId, SensorQuality>;

const SENSOR_LABELS: Record<SensorId, string> = {
  gps: 'GPS',
  wind: 'Viento',
  depth: 'Sonda',
  ais: 'AIS',
  heading: 'Rumbo',
  sog: 'SOG',
};

export const STALE_LIMITS_SECONDS: Record<SensorId, number> = {
  gps: 10,
  wind: 8,
  depth: 8,
  ais: 30,
  heading: 10,
  sog: 10,
};

export const createSensorQuality = (
  id: SensorId,
  source: SensorSource = 'simulated',
  lastUpdate: number | null = null,
  now = Date.now()
): SensorQuality => {
  const ageSeconds = lastUpdate ? (now - lastUpdate) / 1000 : null;
  const staleLimit = STALE_LIMITS_SECONDS[id];

  let status: SensorStatus = 'offline';
  let confidence = 0;
  let message = 'Sin datos recibidos';

  if (source === 'simulated') {
    status = 'poor';
    confidence = 0.45;
    message = 'Fuente simulada';
  }

  if (source === 'real' && ageSeconds !== null) {
    if (ageSeconds <= staleLimit / 2) {
      status = 'excellent';
      confidence = 0.98;
      message = 'Datos reales recientes';
    } else if (ageSeconds <= staleLimit) {
      status = 'good';
      confidence = 0.85;
      message = 'Datos reales validos';
    } else {
      status = 'stale';
      confidence = 0.35;
      message = `Datos obsoletos: ${ageSeconds.toFixed(0)}s`;
    }
  }

  return {
    id,
    label: SENSOR_LABELS[id],
    source,
    lastUpdate,
    ageSeconds: ageSeconds === null ? null : Number(ageSeconds.toFixed(1)),
    status,
    confidence,
    message,
  };
};

export const createInitialSensorQualityMap = (): SensorQualityMap => ({
  gps: createSensorQuality('gps'),
  wind: createSensorQuality('wind'),
  depth: createSensorQuality('depth'),
  ais: createSensorQuality('ais'),
  heading: createSensorQuality('heading'),
  sog: createSensorQuality('sog'),
});

export const refreshSensorQualityMap = (
  previous: SensorQualityMap,
  sources: Record<string, SensorSource>,
  now = Date.now()
): SensorQualityMap => ({
  gps: createSensorQuality('gps', sources.gps || previous.gps.source, previous.gps.lastUpdate, now),
  wind: createSensorQuality('wind', sources.wind || previous.wind.source, previous.wind.lastUpdate, now),
  depth: createSensorQuality('depth', sources.depth || previous.depth.source, previous.depth.lastUpdate, now),
  ais: createSensorQuality('ais', sources.ais || previous.ais.source, previous.ais.lastUpdate, now),
  heading: createSensorQuality('heading', sources.heading || previous.heading.source, previous.heading.lastUpdate, now),
  sog: createSensorQuality('sog', sources.sog || previous.sog.source, previous.sog.lastUpdate, now),
});

export const markSensorUpdated = (
  previous: SensorQualityMap,
  ids: SensorId[],
  source: SensorSource = 'real',
  now = Date.now()
): SensorQualityMap => {
  const next = { ...previous };
  ids.forEach((id) => {
    next[id] = createSensorQuality(id, source, now, now);
  });
  return next;
};

export const getOverallSensorConfidence = (quality: SensorQualityMap) => {
  const values = Object.values(quality);
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, item) => sum + item.confidence, 0) / values.length).toFixed(2));
};
