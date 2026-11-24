import L from 'leaflet';
import type {Feature,Geometry} from 'geojson';
type EncPreviewFeature=Feature<Geometry,Record<string,unknown>>;
export const getEncLayerName = (feature: EncPreviewFeature | undefined): string => {
  const layerName = feature?.properties?.__s57Layer;
  return typeof layerName === 'string' ? layerName : 'UNKNOWN';
};


const S57_COLOUR_HEX: Record<number, string> = {
  1: '#f8fafc', // white
  2: '#111827', // black
  3: '#ef4444', // red
  4: '#22c55e', // green
  5: '#3b82f6', // blue
  6: '#facc15', // yellow
  7: '#9ca3af', // grey
  8: '#92400e', // brown
  9: '#f59e0b', // amber
  10: '#8b5cf6', // violet
  11: '#f97316', // orange
  12: '#d946ef', // magenta
  13: '#ec4899' // pink
};

export const getS57Number = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export const getS57Codes = (value: unknown): number[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (typeof item === 'number' && Number.isInteger(item)) return [item];
    if (typeof item !== 'string') return [];
    return item.split(/[\s,]+/).map(part => part.trim()).filter(part => part.length > 0).map(Number).filter(Number.isInteger);
  });
};

export const getS57Attribute = (feature: EncPreviewFeature, name: string): unknown => feature.properties?.[name];


const getEncPointShape = (feature: EncPreviewFeature): string => {
  const layerName = getEncLayerName(feature);
  const properties = feature.properties ?? {};

  if (layerName === 'LIGHTS') {
    return '<circle cx="12" cy="12" r="3.2"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.6 4.6l2.8 2.8m9.2 9.2 2.8 2.8m0-14.8-2.8 2.8m-9.2 9.2-2.8 2.8"/>';
  }

  if (layerName === 'BOYLAT' || layerName === 'BOYSPP') {
    switch (getS57Number(properties.BOYSHP)) {
      case 1: return '<path d="M12 2 3.5 21h17z"/>'; // conical
      case 2: return '<path d="M6 4h12v16H6z"/>'; // can
      case 3: return '<circle cx="12" cy="12" r="8"/>'; // spherical
      case 4: return '<path d="M8 6h8v15H8zM6 21h12"/>'; // pillar
      case 5: return '<path d="M12 2 9 21h6z"/>'; // spar
      case 6: return '<path d="M5 8h14v9H5zM7 6h10v2H7z"/>'; // barrel
      case 7: return '<path d="M4 9h16v10H4zM8 5h8v4H8z"/>'; // superbuoy
      case 8: return '<path d="m7 4 10 0 5 8-5 8H7l-5-8z"/>'; // ice buoy
      default: return '<circle cx="12" cy="12" r="8"/>';
    }
  }

  if (layerName === 'BCNLAT' || layerName === 'BCNSPP') {
    switch (getS57Number(properties.BCNSHP)) {
      case 1: return '<path d="M11 3h2v18h-2zM8 7h8v2H8z"/>'; // stake/pole
      case 2: return '<path d="M12 3c-5 3 5 5 0 8s5 5 0 10" fill="none"/>'; // withy
      case 3: return '<path d="M7 21 9 6h6l2 15zM8.5 11h7"/>'; // beacon tower
      case 4: return '<path d="M6 21 9 4h6l3 17M7 15h10M8 10h8M9 6h6" fill="none"/>'; // lattice beacon
      case 5: return '<path d="M9 4h6v17H9zM7 21h10"/>'; // pile beacon
      case 6: return '<path d="M3 20h18L12 4zM7 15h10"/>'; // cairn
      case 7: return '<path d="M11 2h2v13h-2zM6 15h12l2 6H4z"/>'; // buoyant beacon
      default: return '<path d="m12 2 9 10-9 10-9-10z"/>';
    }
  }

  if (layerName === 'WRECKS') {
    return '<circle cx="12" cy="12" r="8"/><path d="m7 7 10 10m0-10L7 17" fill="none"/>';
  }
  if (layerName === 'UWTROC') return '<path d="M12 2 22 20H2z"/>';
  if (layerName === 'OBSTRN') return '<path d="m12 2 10 10-10 10L2 12z"/><path d="M12 7v6m0 3v1" fill="none"/>';
  return '<circle cx="12" cy="12" r="7"/>';
};

export const getEncPointIcon = (feature: EncPreviewFeature, zoom: number): L.Icon => {
  const layerName = getEncLayerName(feature);
  const isHazard = ['OBSTRN', 'UWTROC', 'WRECKS'].includes(layerName);
  const fallback = isHazard ? '#ef4444' : layerName === 'LIGHTS' ? '#facc15' : '#fbbf24';
  const colors = getS57Codes(getS57Attribute(feature, 'COLOUR'))
    .map((code) => S57_COLOUR_HEX[code])
    .filter((color): color is string => typeof color === 'string');
  const markColors = colors.length > 0 ? colors : [fallback];
  const shape = getEncPointShape(feature);
  const colorPattern = getS57Number(getS57Attribute(feature, 'COLPAT'));
  let fillMarkup = `<g fill="${markColors[0]}">${shape}</g>`;

  if (markColors.length > 1 && (colorPattern === 1 || colorPattern === 2 || colorPattern === 3 || colorPattern === 4)) {
    const stripeCount = markColors.length;
    const stripes = markColors.map((color, index) => {
      if (colorPattern === 2) {
        const width = 24 / stripeCount;
        return `<rect x="${index * width}" y="0" width="${width}" height="24" fill="${color}"/>`;
      }
      if (colorPattern === 4) {
        const x = index % 2 === 0 ? 0 : 12;
        const y = index < 2 ? 0 : 12;
        return `<rect x="${x}" y="${y}" width="12" height="12" fill="${color}"/>`;
      }
      if (colorPattern === 3) {
        const height = 48 / stripeCount;
        return `<rect x="-12" y="${-12 + index * height}" width="48" height="${height}" fill="${color}"/>`;
      }
      const height = 24 / stripeCount;
      return `<rect x="0" y="${index * height}" width="24" height="${height}" fill="${color}"/>`;
    }).join('');
    const stripeGroup = colorPattern === 3 ? `<g transform="rotate(45 12 12)">${stripes}</g>` : stripes;
    fillMarkup = `<defs><clipPath id="enc-mark-shape"><g>${shape}</g></clipPath></defs><g clip-path="url(#enc-mark-shape)">${stripeGroup}</g>`;
  } else if (markColors.length > 1 && colorPattern === 6) {
    fillMarkup = `<g fill="${markColors[0]}" stroke="${markColors[1]}" stroke-width="4">${shape}</g>`;
  }

  const isLight = layerName === 'LIGHTS';
  const outlineColor = layerName === 'WRECKS' || layerName === 'UWTROC' || layerName === 'OBSTRN'
    ? '#ef4444'
    : '#0f172a';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g stroke="${outlineColor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${isLight ? `<g fill="none" stroke="#0f172a" stroke-width="3">${shape}</g><g fill="${markColors[0]}" stroke="${markColors[0]}" stroke-width="1.8">${shape}</g>` : `${fillMarkup}<g fill="none" stroke="${outlineColor}">${shape}</g>`}</g></svg>`;
  const size = zoom < 12 ? 12 : zoom < 14 ? 14 : zoom < 15 ? 16 : 18;
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
};
