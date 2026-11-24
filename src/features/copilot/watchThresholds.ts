export type ThresholdOrigin = 'manufacturer' | 'user';
export interface ThresholdValue { value: number; origin: ThresholdOrigin }
export interface VesselWatchThresholds {
  vesselId: string;
  batteryStartVolts: ThresholdValue | null;
  batteryServiceVolts: ThresholdValue | null;
  engineTemperatureC: ThresholdValue | null;
  oilPressureBar: ThresholdValue | null;
  fuelPercent: ThresholdValue | null;
  waterPercent: ThresholdValue | null;
  minimumDepthMeters: ThresholdValue | null;
  anchorRadiusMeters: ThresholdValue | null;
  aisCpaNm: ThresholdValue | null;
  xteNm: ThresholdValue | null;
  windChangeKn: ThresholdValue | null;
  maxDataAgeSeconds: ThresholdValue | null;
  documentLeadDays: ThresholdValue | null;
  reliefLeadMinutes: ThresholdValue | null;
}

export function emptyWatchThresholds(vesselId: string): VesselWatchThresholds {
  return { vesselId, batteryStartVolts: null, batteryServiceVolts: null, engineTemperatureC: null, oilPressureBar: null,
    fuelPercent: null, waterPercent: null, minimumDepthMeters: null, anchorRadiusMeters: null, aisCpaNm: null, xteNm: null,
    windChangeKn: null, maxDataAgeSeconds: null, documentLeadDays: null, reliefLeadMinutes: null };
}

const RANGES: Record<Exclude<keyof VesselWatchThresholds, 'vesselId'>, readonly [number, number]> = {
  batteryStartVolts: [1, 100], batteryServiceVolts: [1, 100], engineTemperatureC: [20, 200], oilPressureBar: [0, 20],
  fuelPercent: [0, 100], waterPercent: [0, 100], minimumDepthMeters: [0, 2_000], anchorRadiusMeters: [1, 10_000],
  aisCpaNm: [0.01, 20], xteNm: [0.001, 20], windChangeKn: [0.1, 100], maxDataAgeSeconds: [1, 3_600],
  documentLeadDays: [0, 365], reliefLeadMinutes: [0, 240]
};

export function setWatchThreshold<K extends Exclude<keyof VesselWatchThresholds, 'vesselId'>>(
  current: VesselWatchThresholds, key: K, threshold: ThresholdValue | null
): VesselWatchThresholds {
  if (threshold) {
    const [min, max] = RANGES[key];
    if (!Number.isFinite(threshold.value) || threshold.value < min || threshold.value > max) throw new Error(`Umbral ${key} fuera de rango.`);
    if (threshold.origin !== 'manufacturer' && threshold.origin !== 'user') throw new Error('Origen de umbral no válido.');
  }
  return { ...current, [key]: threshold };
}

export class BrowserWatchThresholdStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  load(vesselId: string): VesselWatchThresholds {
    try {
      const value: unknown = JSON.parse(this.storage.getItem(`gaulos:watch-thresholds:v1:${vesselId}`) ?? 'null');
      if (!value || typeof value !== 'object' || (value as { vesselId?: unknown }).vesselId !== vesselId) return emptyWatchThresholds(vesselId);
      let result = emptyWatchThresholds(vesselId);
      for (const key of Object.keys(RANGES) as Array<keyof typeof RANGES>) {
        const threshold = (value as VesselWatchThresholds)[key];
        if (threshold !== null && threshold !== undefined) result = setWatchThreshold(result, key, threshold);
      }
      return result;
    } catch { return emptyWatchThresholds(vesselId); }
  }
  save(value: VesselWatchThresholds): void { this.storage.setItem(`gaulos:watch-thresholds:v1:${value.vesselId}`, JSON.stringify(value)); }
}
