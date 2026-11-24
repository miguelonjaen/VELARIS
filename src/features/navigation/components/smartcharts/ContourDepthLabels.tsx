import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { RegionalBathymetryChart } from './bathymetry-atlas-contract';
import { placeDepthLabels, type LabelLine, type LabelRect } from './contour-labels';

class DepthLabels extends L.Layer {
  private readonly canvas=document.createElement('canvas');
  private frame=0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Bounds depend only on immutable chart geometry, not on zoom or screen position.
  private readonly indexed: { feature: RegionalBathymetryChart['features'][number]; bounds: L.LatLngBounds }[];

  constructor(charts: RegionalBathymetryChart[]) {
    super();
    this.indexed = charts.flatMap(chart => chart.features.map(feature => {
      let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
      for (const [lon,lat] of feature.geometry.coordinates) {
        west=Math.min(west,lon); east=Math.max(east,lon); south=Math.min(south,lat); north=Math.max(north,lat);
      }
      return { feature, bounds: L.latLngBounds([south,west],[north,east]) };
    }));
  }
  onAdd(map: L.Map): this {
    this.canvas.style.pointerEvents='none'; this.canvas.style.position='absolute';
    map.getPane('smartcharts-depth-labels')?.appendChild(this.canvas);
    map.on('moveend zoomend resize',this.schedule,this); map.on('zoomstart',this.hide,this);
    this.schedule(); return this;
  }
  onRemove(map: L.Map): this {
    if (this.timer !== null) clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);map.off('moveend zoomend resize',this.schedule,this);map.off('zoomstart',this.hide,this);this.canvas.remove();return this;
  }
  private hide(): void {
    this.canvas.style.visibility='hidden';
    if (this.timer !== null) clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
  }
  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.timer=setTimeout(() => { this.timer=null; this.frame=requestAnimationFrame(()=>this.draw()); },180);
  }
  private draw(): void {
    const map=this._map;if(!map)return;
    const size=map.getSize(), ratio=Math.min(window.devicePixelRatio || 1,2);
    this.canvas.width=Math.ceil(size.x*ratio);this.canvas.height=Math.ceil(size.y*ratio);
    this.canvas.style.width=`${size.x}px`;this.canvas.style.height=`${size.y}px`;
    L.DomUtil.setPosition(this.canvas,map.containerPointToLayerPoint([0,0]));
    const context=this.canvas.getContext('2d');if(!context)return;
    const origin=map.getContainer().getBoundingClientRect();
    const exclusions: LabelRect[]=Array.from(map.getContainer().querySelectorAll<HTMLElement>('.leaflet-control')).map(element=>{
      const r=element.getBoundingClientRect();return {x:r.left-origin.left-6,y:r.top-origin.top-6,width:r.width+12,height:r.height+12};
    });
    const indexed=this.indexed;
    function* lines(): Generator<LabelLine> {
      const view=map.getBounds();
      for(const {feature,bounds} of indexed) {
        if(!bounds.intersects(view))continue;
        const coordinates=feature.geometry.coordinates;
        yield {depth:feature.properties.depth_m,points:coordinates.map(([lon,lat])=>map.latLngToContainerPoint([lat,lon]))};
      }
    }
    const labels=placeDepthLabels(lines(),size.x,size.y,exclusions);
    context.scale(ratio,ratio);context.font='600 12px system-ui';context.textAlign='center';context.textBaseline='middle';context.lineJoin='round';
    for(const label of labels){
      context.save();context.translate(label.x,label.y);context.rotate(label.angle);
      context.lineWidth=4;context.strokeStyle='rgba(5,25,40,0.95)';context.strokeText(label.text,0,0);
      context.fillStyle='#e0f7ff';context.fillText(label.text,0,0);context.restore();
    }
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label',`${labels.length} etiquetas de profundidad en metros LAT`);
    this.canvas.style.visibility='visible';
  }
}
export default function ContourDepthLabels({charts}:{charts:RegionalBathymetryChart[]}):null {
  const map=useMap();
  useEffect(()=>{const layer=new DepthLabels(charts).addTo(map);return()=>{layer.remove();};},[map,charts]);
  return null;
}
