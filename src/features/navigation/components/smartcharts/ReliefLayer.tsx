import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { type ReliefSettings } from './relief-model';
import type { ReliefResource } from './relief-assets';
import catalog from './relief/tiles/relief-catalog.json';

// URL imports avoid retaining every visited compressed pack in the JS module cache.
const urls=import.meta.glob<string>('./relief/tiles/relief-*.json',{eager:true,query:'?url',import:'default'});
const resources: Record<string,ReliefResource>={};
for(const entry of [{...catalog.overview,key:'overview'},...catalog.packs]) {
  const url=urls[`./relief/tiles/${entry.resource}`];
  if(url)resources[entry.key]={url,rawSha256:entry.rawSha256};
}
class ReliefTiles extends L.GridLayer {
  private readonly worker: Worker;
  private serial=0;
  private readonly pending=new Map<number,{canvas:HTMLCanvasElement;done:L.DoneCallback}>();
  constructor(settings:ReliefSettings,private readonly onFailure:()=>void) {
    super({pane:'smartcharts-relief',tileSize:256,noWrap:true,bounds:[[30,-7.43],[46,36.5]],maxNativeZoom:9,maxZoom:20,keepBuffer:1,updateWhenIdle:true,attribution:'EMODnet Bathymetry Consortium · DTM 2024 · CC BY 4.0 · Relieve experimental'});
    this.worker=new Worker(new URL('./relief.worker.ts',import.meta.url),{type:'module'});
    this.worker.postMessage({kind:'init',resources,settings});
    this.worker.onerror=():void=>this.onFailure();
    this.worker.onmessage=(event:MessageEvent<{id:number;pixels?:Uint8ClampedArray<ArrayBuffer>;error?:string}>):void=>{
      const task=this.pending.get(event.data.id);if(!task)return;
      this.pending.delete(event.data.id);
      const context=task.canvas.getContext('2d');
      if(event.data.error || !event.data.pixels || !context){task.done(new Error('Relieve no disponible'),task.canvas);this.onFailure();return;}
      context.putImageData(new ImageData(event.data.pixels,256,256),0,0);task.done(undefined,task.canvas);
    };
    this.on('tileunload',(event:L.TileEvent)=>{
      const id=Number(event.tile.dataset.reliefId);
      if(this.pending.delete(id))this.worker.postMessage({kind:'cancel',id});
    });
  }
  createTile(coords:L.Coords,done:L.DoneCallback):HTMLElement {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const id=++this.serial;canvas.dataset.reliefId=String(id);this.pending.set(id,{canvas,done});
    this.worker.postMessage({kind:'tile',id,x:coords.x,y:coords.y,z:coords.z});return canvas;
  }
  dispose():void{this.worker.terminate();this.pending.clear();this.remove();}
}
export default function ReliefLayer({settings,opacity,onStatus}:{settings:ReliefSettings;opacity:number;onStatus:(state:'loading'|'ready'|'error')=>void}):null {
  const map=useMap(),layerRef=useRef<ReliefTiles|null>(null),opacityRef=useRef(opacity);
  useEffect(()=>{opacityRef.current=opacity;layerRef.current?.setOpacity(opacity);},[opacity]);
  useEffect(()=>{
    onStatus('loading');let cancelled=false,failed=false;
    const layer=new ReliefTiles(settings,()=>{failed=true;if(!cancelled)onStatus('error');});layerRef.current=layer;
    layer.once('load',()=>{if(!cancelled && !failed)onStatus('ready');});layer.setOpacity(opacityRef.current).addTo(map);
    return()=>{cancelled=true;layerRef.current=null;layer.dispose();};
  },[map,settings,onStatus]);
  return null;
}
