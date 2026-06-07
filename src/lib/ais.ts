export type AisRiskLevel = 'safe' | 'watch' | 'warning' | 'critical';

export interface VesselVector {
  lat: number;
  lng: number;
  sog: number;
  cog: number;
}

export interface AisTargetVector extends VesselVector {
  id?: string;
  mmsi?: string;
  nombre?: string;
  name?: string;
}

export interface CpaTcpaResult {
  cpa: number;
  tcpa: number;
  distance: number;
  risk: AisRiskLevel;
}

const EARTH_RADIUS_NM = 3440.065;
const MINUTES_PER_HOUR = 60;

const toRad = (value: number) => value * (Math.PI / 180);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const calculateDistanceNM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const startLat = toRad(lat1);
  const endLat = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const projectRelativePositionNM = (ownShip: VesselVector, target: VesselVector) => {
  const meanLat = toRad((ownShip.lat + target.lat) / 2);
  return {
    x: (target.lng - ownShip.lng) * 60 * Math.cos(meanLat),
    y: (target.lat - ownShip.lat) * 60,
  };
};

const velocityComponents = ({ sog, cog }: VesselVector) => {
  const courseRad = toRad(cog);
  return {
    x: sog * Math.sin(courseRad),
    y: sog * Math.cos(courseRad),
  };
};

export const classifyAisRisk = (cpa: number, tcpa: number): AisRiskLevel => {
  if (tcpa < 0 || tcpa > 45) return 'safe';
  if (cpa <= 0.27 && tcpa <= 20) return 'critical'; // 0.27 NM ≈ 500m
  if (cpa <= 0.5 && tcpa <= 30) return 'warning';
  if (cpa <= 1.0 && tcpa <= 45) return 'watch';
  return 'safe';
};

export const calculateCpaTcpa = (ownShip: VesselVector, target: VesselVector): CpaTcpaResult | null => {
  const values = [ownShip.lat, ownShip.lng, ownShip.sog, ownShip.cog, target.lat, target.lng, target.sog, target.cog];
  if (!values.every(isFiniteNumber)) return null;

  const relativePosition = projectRelativePositionNM(ownShip, target);
  const ownVelocity = velocityComponents(ownShip);
  const targetVelocity = velocityComponents(target);
  const relativeVelocity = {
    x: targetVelocity.x - ownVelocity.x,
    y: targetVelocity.y - ownVelocity.y,
  };

  const relativeSpeedSquared = relativeVelocity.x ** 2 + relativeVelocity.y ** 2;
  const distance = calculateDistanceNM(ownShip.lat, ownShip.lng, target.lat, target.lng);

  if (relativeSpeedSquared === 0) {
    return {
      cpa: Number(distance.toFixed(2)),
      tcpa: Infinity,
      distance: Number(distance.toFixed(2)),
      risk: 'safe',
    };
  }

  const tcpaHours = -(
    relativePosition.x * relativeVelocity.x +
    relativePosition.y * relativeVelocity.y
  ) / relativeSpeedSquared;

  const cpaX = relativePosition.x + relativeVelocity.x * tcpaHours;
  const cpaY = relativePosition.y + relativeVelocity.y * tcpaHours;
  const cpa = Math.sqrt(cpaX ** 2 + cpaY ** 2);
  const tcpa = tcpaHours * MINUTES_PER_HOUR;

  return {
    cpa: Number(cpa.toFixed(2)),
    tcpa: Number(tcpa.toFixed(1)),
    distance: Number(distance.toFixed(2)),
    risk: classifyAisRisk(cpa, tcpa),
  };
};

export const enrichAisTarget = <T extends AisTargetVector>(ownShip: VesselVector | null, target: T) => {
  if (!ownShip) return target;
  const cpaData = calculateCpaTcpa(ownShip, target);
  if (!cpaData) return target;

  return {
    ...target,
    cpa: cpaData.cpa,
    tcpa: cpaData.tcpa,
    distancia: cpaData.distance,
    risk: cpaData.risk,
  };
};
