import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import catalog from './nautical/catalog.json';
import { loadNauticalResource } from './nauticalRepository';
import { analyseArea, intersects, validBounds, type Bounds, type AreaReport, type ChartFeature } from '../../../copilot/areaAnalysis';
import { registerChartQuery } from '../../../copilot/tacticalQueries';
interface Props { encFilename?: string }
/** Read-only chart access for the existing tactical agent; no separate analysis UI. */
export default function TacticalChartQueries({ encFilename }: Props): null {
 const map = useMap();
 useEffect(() => registerChartQuery(async (signal) => {
      const bounds = map.getBounds();
      const bbox: Bounds = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      if (!validBounds(bbox) || bbox[2] - bbox[0] > 2 || bbox[3] - bbox[1] > 2) throw new Error('Amplía la carta: analiza una vista de hasta 2° × 2°, sin cruzar el antimeridiano.');
      const issues: string[] = [`OSM local experimental: fecha del catálogo ${catalog.sourceDate}. La hora de consulta no acredita actualización ENC.`];
      const sectors = catalog.sectors.filter(s => intersects(s.bbox as [number, number, number, number], bbox));
      if (sectors.length > 12) throw new Error('Demasiados sectores: amplía la carta.');
      const results = await Promise.allSettled(sectors.map(s => loadNauticalResource(s.resource)));
      const osm: ChartFeature[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') osm.push(...result.value.features as unknown as ChartFeature[]);
        else issues.push(`OSM: no se pudo cargar ${sectors[i].id}`);
      });
      if (!sectors.length) issues.push('Fuera de los sectores del catálogo OSM local.');
      let enc: AreaReport['enc'] = 'unavailable'; let encFeatures: ChartFeature[] = [];
      if (encFilename) {
        try {
          const query = new URLSearchParams({ bbox: bbox.join(',') });

          let response: Response;
          response = await fetch(`http://127.0.0.1:8089/api/enc-charts/${encodeURIComponent(encFilename)}/preview?${query}`, { signal: signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload: unknown = await response.json();
          if (!payload || typeof payload !== 'object' || !('features' in payload) || !Array.isArray(payload.features)) throw new Error('GeoJSON no válido');
          encFeatures = (payload as FeatureCollection).features.filter(f => f.type === 'Feature' && f.geometry && f.properties) as ChartFeature[];
          if ('validation' in payload && payload.validation && typeof payload.validation === 'object') {
            const diagnostic = payload.validation as Record<string, unknown>;
            const counts = ['invalidCoordinates', 'invalidGeometries', 'soundingsMissingDepth', 'invalidDepthAttributes', 'invalidCodedAttributes', 'missingDepthRanges', 'depthRangeOrderErrors', 'missingDepthContours'];
            if (counts.some(key => typeof diagnostic[key] === 'number' && (diagnostic[key] as number) > 0)) issues.push('La validación ENC informa geometrías o atributos incompletos/inválidos; consulte la capa ENC.');
            if (String(diagnostic.depthUnitCode) !== '1' || String(diagnostic.coordinateUnitCode) !== '1' || String(diagnostic.horizontalDatumCode) !== '2') issues.push('Unidades o datum de la ENC no acreditados como metros/grados/WGS84.');
          } else issues.push('Diagnóstico de validación ENC no disponible.');
          enc = 'available';
        } catch { enc = 'error'; issues.push('Consulta ENC fallida: no se ha acreditado cobertura ni ausencia de peligros.'); }
      } else issues.push('Ninguna celda ENC seleccionada. OSM y EMODnet no sustituyen una ENC.');

 return { ...analyseArea(bbox, [{source:'ENC', features:encFeatures}, {source:'OSM', features:osm}], enc, issues, Date.now()), encFilename };
 }), [map, encFilename]);
 return null;
}
