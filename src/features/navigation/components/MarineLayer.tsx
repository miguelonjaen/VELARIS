import React, { useMemo } from 'react';
import { Polyline } from 'react-leaflet';
import type { MarineWeatherData } from '../../../lib/useMarineWeather';

interface Position {
  lat: number;
  lng: number;
}

interface MarineLayerProps {
  shipPosition: Position | null;
  marineWeather: MarineWeatherData | null;
  showWaves: boolean;
  showCurrent: boolean;
}

interface Arrow {
  start: Position;
  end: Position;
  left: Position;
  right: Position;
}

const DEG_TO_RAD = Math.PI / 180;
const WAVE_ARROW_MIN_LENGTH_NM = 0.04;
const WAVE_ARROW_MAX_LENGTH_NM = 0.14;
const CURRENT_ARROW_MIN_LENGTH_NM = 0.04;
const CURRENT_ARROW_MAX_LENGTH_NM = 0.14;
const ARROWHEAD_LENGTH_NM = 0.018;
const GRID_OFFSETS = [-2, -1, 0, 1, 2] as const;
const WAVE_GRID_SPACING_DEGREES = 0.008;
const CURRENT_GRID_SPACING_DEGREES = 0.008;

const destination = (position: Position, bearing: number, distanceNm: number): Position => {
  const bearingRad = bearing * DEG_TO_RAD;
  const latitudeRad = position.lat * DEG_TO_RAD;
  return {
    lat: position.lat + (distanceNm * Math.cos(bearingRad)) / 60,
    lng: position.lng + (distanceNm * Math.sin(bearingRad)) / (60 * Math.cos(latitudeRad))
  };
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const waveArrowLength = (waveHeight: number): number =>
  clamp(WAVE_ARROW_MIN_LENGTH_NM + waveHeight * 0.05, WAVE_ARROW_MIN_LENGTH_NM, WAVE_ARROW_MAX_LENGTH_NM);

const currentArrowLength = (currentSpeed: number): number =>
  clamp(CURRENT_ARROW_MIN_LENGTH_NM + currentSpeed * 0.05, CURRENT_ARROW_MIN_LENGTH_NM, CURRENT_ARROW_MAX_LENGTH_NM);

const createArrow = (start: Position, bearing: number, lengthNm: number): Arrow => {
  const end = destination(start, bearing, lengthNm);
  return {
    start,
    end,
    left: destination(end, (bearing + 150) % 360, ARROWHEAD_LENGTH_NM),
    right: destination(end, (bearing + 210) % 360, ARROWHEAD_LENGTH_NM)
  };
};

const createGridArrows = (shipPosition: Position, bearing: number, lengthNm: number, spacingDegrees: number, gridOffset: number): Arrow[] =>
  GRID_OFFSETS.flatMap(row => GRID_OFFSETS.flatMap(column => {
    if (row === 0 && column === 0) return [];
    const start = {
      lat: shipPosition.lat + (row + gridOffset) * spacingDegrees,
      lng: shipPosition.lng + ((column + gridOffset) * spacingDegrees) / Math.cos(shipPosition.lat * DEG_TO_RAD)
    };
    return [createArrow(start, bearing, lengthNm)];
  }));

interface ArrowGridProps {
  shipPosition: Position;
  bearing: number;
  lengthNm: number;
  spacingDegrees: number;
  gridOffset: number;
  color: string;
}

const ArrowGrid: React.FC<ArrowGridProps> = ({ shipPosition, bearing, lengthNm, spacingDegrees, gridOffset, color }) => {
  const arrows = useMemo(
    () => createGridArrows(shipPosition, bearing, lengthNm, spacingDegrees, gridOffset),
    [shipPosition, bearing, lengthNm, spacingDegrees, gridOffset]
  );

  return <>{arrows.map((arrow, index) => (
    <React.Fragment key={`${color}-${index}`}>
      <Polyline
        positions={[[arrow.start.lat, arrow.start.lng], [arrow.end.lat, arrow.end.lng]]}
        pathOptions={{ color, weight: 2.5, opacity: 0.84 }}
      />
      <Polyline
        positions={[[arrow.end.lat, arrow.end.lng], [arrow.left.lat, arrow.left.lng]]}
        pathOptions={{ color, weight: 2.5, opacity: 0.84 }}
      />
      <Polyline
        positions={[[arrow.end.lat, arrow.end.lng], [arrow.right.lat, arrow.right.lng]]}
        pathOptions={{ color, weight: 2.5, opacity: 0.84 }}
      />
    </React.Fragment>
  ))}</>;
};

/** Static marine overlays using independent wave and current visibility flags. */
const MarineLayer: React.FC<MarineLayerProps> = ({ shipPosition, marineWeather, showWaves, showCurrent }) => {
  if (!shipPosition || !marineWeather) return null;

  const waveBearingToward = marineWeather.waveDirection === null
    ? null
    : (marineWeather.waveDirection + 180) % 360;

  return (
    <>
      {showWaves && marineWeather.waveHeight !== null && waveBearingToward !== null && (
        <ArrowGrid
          shipPosition={shipPosition}
          bearing={waveBearingToward}
          lengthNm={waveArrowLength(marineWeather.waveHeight)}
          spacingDegrees={WAVE_GRID_SPACING_DEGREES}
          gridOffset={0}
          color="#38bdf8"
        />
      )}
      {showCurrent && marineWeather.currentSpeed !== null && marineWeather.currentDirection !== null && (
        <ArrowGrid
          shipPosition={shipPosition}
          bearing={marineWeather.currentDirection}
          lengthNm={currentArrowLength(marineWeather.currentSpeed)}
          spacingDegrees={CURRENT_GRID_SPACING_DEGREES}
          gridOffset={0.5}
          color="#f59e0b"
        />
      )}
    </>
  );
};

export default MarineLayer;
