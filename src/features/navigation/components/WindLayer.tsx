import React, { useEffect, useMemo, useState } from 'react';
import { Polyline, CircleMarker } from 'react-leaflet';
import { useMap } from 'react-leaflet';

interface WindLayerProps {
  shipPosition: {
    lat: number;
    lng: number;
  } | null;

  windSpeed: number;
  windDirection: number;
  visible: boolean;
}

interface WindVector {
  lat: number;
  lng: number;
  endLat: number;
  endLng: number;
}

interface WindParticle {
  id: number;
  lat: number;
  lng: number;
  progress: number;
}

const DEG_TO_RAD = Math.PI / 180;

const normalizeBearing = (bearing: number): number =>
  ((bearing % 360) + 360) % 360;

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(max, value));

const destination = (
  lat: number,
  lng: number,
  bearing: number,
  distanceNm: number
) => {
  const bearingRad = bearing * DEG_TO_RAD;
  const latRad = lat * DEG_TO_RAD;

  return {
    lat:
      lat +
      (distanceNm * Math.cos(bearingRad)) / 60,

    lng:
      lng +
      (distanceNm * Math.sin(bearingRad)) /
        (60 * Math.cos(latRad))
  };
};

const WindLayer: React.FC<WindLayerProps> = ({
  shipPosition,
  windSpeed,
  windDirection,
  visible
}) => {
  const map = useMap();
  const zoom = map.getZoom();

  const [animationTime, setAnimationTime] =
    useState(0);

  /*
   * ============================================================
   * Animación
   * ============================================================
   */

  useEffect(() => {
    if (!visible || !shipPosition) {
      return;
    }

    let frameId = 0;
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (startTime === null) {
        startTime = time;
      }

      setAnimationTime(
        time - startTime
      );

      frameId =
        requestAnimationFrame(animate);
    };

    frameId =
      requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    visible,
    shipPosition
  ]);

  /*
   * ============================================================
   * Geometría
   * ============================================================
   */

  const vectors = useMemo<WindVector[]>(() => {
    if (!visible || !shipPosition) {
      return [];
    }

    const gridRadius =
      zoom >= 15
        ? 0.014
        : zoom >= 13
          ? 0.028
          : 0.055;

    const spacing =
      zoom >= 15
        ? 0.008
        : zoom >= 13
          ? 0.015
          : 0.028;

    const speedFactor =
      clamp(
        windSpeed,
        2,
        40
      );

    const arrowLength =
      speedFactor * 0.00018;

    const rows =
      Math.ceil(
        (gridRadius * 2) /
          spacing
      );

    const cols = rows;

    const result: WindVector[] = [];

    for (
      let row =
        -Math.floor(rows / 2);

      row <=
        Math.floor(rows / 2);

      row++
    ) {
      for (
        let col =
          -Math.floor(cols / 2);

        col <=
          Math.floor(cols / 2);

        col++
      ) {
        const lat =
          shipPosition.lat +
          row * spacing;

        const lng =
          shipPosition.lng +
          (col * spacing) /
            Math.cos(
              shipPosition.lat *
                DEG_TO_RAD
            );

        const windFrom = normalizeBearing(windDirection);
        const windToward = normalizeBearing(windFrom + 180);

        if (row === 0 && col === 0) {
          console.log('[WIND ANGLE DEBUG]', {
            twdFrom: windFrom,
            windTo: windToward,
            angleUsedByWindLayer: windToward
          });
        }

const end = destination(
  lat,
  lng,
  windToward,
  arrowLength * 60
);

        result.push({
          lat,
          lng,
          endLat: end.lat,
          endLng: end.lng
        });
      }
    }

    return result;
  }, [
    visible,
    shipPosition,
    windSpeed,
    windDirection,
    zoom
  ]);

  /*
   * ============================================================
   * Partículas
   * ============================================================
   */

  const particles =
    useMemo<WindParticle[]>(() => {
      return vectors.map(
        (vector, index) => ({
          id: index,

          lat: vector.lat,

          lng: vector.lng,

          progress:
            (
              index * 0.173
            ) % 1
        })
      );
    }, [vectors]);

  /*
   * ============================================================
   * OFF
   * ============================================================
   */

  if (
    !visible ||
    !shipPosition
  ) {
    return null;
  }

  /*
   * ============================================================
   * Velocidad de animación
   * ============================================================
   */

  const animationSpeed =
    0.00018 +
    clamp(
      windSpeed,
      0,
      40
    ) *
      0.000012;

  /*
   * ============================================================
   * Render
   * ============================================================
   */

  return (
    <>
      {vectors.map(
        (vector, index) => {
          const dx =
            vector.endLng -
            vector.lng;

          const dy =
            vector.endLat -
            vector.lat;

          const angle =
            Math.atan2(
              dy,
              dx
            );

          const headLength =
            0.00115;

          const leftAngle =
            angle +
            Math.PI * 0.82;

          const rightAngle =
            angle -
            Math.PI * 0.82;

          const left = {
            lat:
              vector.endLat +
              Math.sin(
                leftAngle
              ) *
                headLength,

            lng:
              vector.endLng +
              Math.cos(
                leftAngle
              ) *
                headLength
          };

          const right = {
            lat:
              vector.endLat +
              Math.sin(
                rightAngle
              ) *
                headLength,

            lng:
              vector.endLng +
              Math.cos(
                rightAngle
              ) *
                headLength
          };

          const opacity =
            index % 3 === 0
              ? 0.42
              : index % 3 === 1
                ? 0.52
                : 0.46;

          return (
            <React.Fragment
              key={`wind-${index}`}
            >
              <Polyline
                positions={[
                  [
                    vector.lat,
                    vector.lng
                  ],
                  [
                    vector.endLat,
                    vector.endLng
                  ]
                ]}
                pathOptions={{
                  color:
                    '#38bdf8',

                  weight: 1.6,

                  opacity,

                  lineCap:
                    'round'
                }}
              />

              <Polyline
                positions={[
                  [
                    vector.endLat,
                    vector.endLng
                  ],
                  [
                    left.lat,
                    left.lng
                  ]
                ]}
                pathOptions={{
                  color:
                    '#38bdf8',

                  weight: 1.6,

                  opacity,

                  lineCap:
                    'round'
                }}
              />

              <Polyline
                positions={[
                  [
                    vector.endLat,
                    vector.endLng
                  ],
                  [
                    right.lat,
                    right.lng
                  ]
                ]}
                pathOptions={{
                  color:
                    '#38bdf8',

                  weight: 1.6,

                  opacity,

                  lineCap:
                    'round'
                }}
              />
            </React.Fragment>
          );
        }
      )}

      {particles.map(
        particle => {
          const vector =
            vectors[
              particle.id
            ];

          if (!vector) {
            return null;
          }

          /*
           * Movimiento continuo 0 → 1
           */

          const cycle =
            (
              particle.progress +
              (
                animationTime *
                animationSpeed
              )
            ) % 1;

          const lat =
            vector.lat +
            (
              vector.endLat -
              vector.lat
            ) *
              cycle;

          const lng =
            vector.lng +
            (
              vector.endLng -
              vector.lng
            ) *
              cycle;

          return (
           <CircleMarker
  key={`wind-particle-${particle.id}`}
  center={[
    lat,
    lng
  ]}
  radius={3}
  pathOptions={{
    color:
      '#bae6fd',

    fillColor:
      '#7dd3fc',

    fillOpacity:
      1,

    weight: 0
  }}
/>
          );
        }
      )}
    </>
  );
};

export default WindLayer;