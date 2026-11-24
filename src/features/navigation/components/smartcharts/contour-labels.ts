export interface LabelPoint { x: number; y: number }
export interface LabelRect { x: number; y: number; width: number; height: number }
export interface DepthLabel extends LabelPoint { depth: number; text: string; angle: number; rect: LabelRect }
export interface LabelLine { depth: number; points: LabelPoint[] }
const overlaps = (a: LabelRect, b: LabelRect): boolean => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
/** Screen-space placement, independent of Leaflet; labels remain on actual contour segments. */
export function placeDepthLabels(lines: Iterable<LabelLine>, width: number, height: number, exclusions: LabelRect[] = []): DepthLabel[] {
  const labels: DepthLabel[] = [];
  const occupied = [...exclusions];
  for (const line of lines) {
    if (!Number.isFinite(line.depth) || line.depth <= 0) continue;
    let distance = 0, target = 75;
    for (let i=1;i<line.points.length;i++) {
      const a=line.points[i-1], b=line.points[i], dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
      if (!Number.isFinite(length) || length===0) continue;
      // Skip offscreen segments without interpolating through an unrepresented gap.
      if (Math.max(a.x,b.x)<0 || Math.min(a.x,b.x)>width || Math.max(a.y,b.y)<0 || Math.min(a.y,b.y)>height) { distance=0;target=75;continue; }
      while (distance+length>=target) {
        const fraction=(target-distance)/length;
        const x=a.x+fraction*dx, y=a.y+fraction*dy;
        let angle=Math.atan2(dy,dx);
        if(angle>Math.PI/2)angle-=Math.PI; else if(angle< -Math.PI/2)angle+=Math.PI;
        const text=`${line.depth} m`, textWidth=text.length*7.5+12;
        const boxWidth=Math.abs(Math.cos(angle))*textWidth+Math.abs(Math.sin(angle))*22;
        const boxHeight=Math.abs(Math.sin(angle))*textWidth+Math.abs(Math.cos(angle))*22;
        const rect={x:x-boxWidth/2-8,y:y-boxHeight/2-8,width:boxWidth+16,height:boxHeight+16};
        if(rect.x>=8 && rect.y>=80 && rect.x+rect.width<=width-8 && rect.y+rect.height<=height-45 && !occupied.some(other=>overlaps(rect,other)) && !labels.some(other=>other.depth===line.depth && Math.hypot(other.x-x,other.y-y)<240)) {
          labels.push({x,y,text,depth:line.depth,angle,rect}); occupied.push(rect);
          if(labels.length>=120)return labels;
        }
        target+=240;
      }
      distance+=length;
    }
  }
  return labels;
}
