import type { BathymetryBounds, BathymetrySector } from './bathymetry-atlas-contract';
const area = (b: BathymetryBounds): number => (b[2]-b[0])*(b[3]-b[1]);
const contains = (a: BathymetryBounds,b: BathymetryBounds): boolean => a[0]<=b[0] && a[1]<=b[1] && a[2]>=b[2] && a[3]>=b[3];
export function selectViewportBathymetry(sectors: BathymetrySector[], viewport: BathymetryBounds, zoom: number): BathymetrySector[] {
  const overview = sectors.find(s=>s.id==='overview');
  if (zoom < 7) return overview ? [overview] : [];
  const candidates = sectors.filter(s=>!s.simplified && s.bbox[0]<viewport[2] && s.bbox[2]>viewport[0] && s.bbox[1]<viewport[3] && s.bbox[3]>viewport[1]);
  // One containing sector avoids rendering nested copies of the same source contours.
  const enclosing = candidates.filter(s=>contains(s.bbox,viewport)).sort((a,b)=>area(a.bbox)-area(b.bbox));
  if (enclosing[0]) return [enclosing[0]];
  const selected: BathymetrySector[]=[];
  for (const sector of candidates.sort((a,b)=>area(b.bbox)-area(a.bbox))) {
    if (!selected.some(s=>contains(s.bbox,sector.bbox))) selected.push(sector);
  }
  // At a wide extent use the complete overview rather than silently dropping detail sectors.
  return selected.length<=6 ? selected : overview ? [overview] : [];
}
