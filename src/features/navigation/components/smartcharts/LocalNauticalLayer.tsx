import {useEffect,useMemo,useState} from 'react';
import {GeoJSON,Pane,useMap} from 'react-leaflet';
import L from 'leaflet';
import type {FeatureCollection,Geometry} from 'geojson';
import catalog from './nautical/catalog.json';
import {getEncPointIcon} from './enc-point-icons';
import {nauticalPortrayal,type NauticalFeature,type NauticalProperties} from './nautical-portrayal';
import {loadNauticalResource} from './nauticalRepository';
export default function LocalNauticalLayer({onStatus}:{onStatus:(status:string)=>void}):React.ReactElement {
 const map=useMap();const [revision,setRevision]=useState(0);const [features,setFeatures]=useState<NauticalFeature[]>([]);const [failed,setFailed]=useState(false);
 useEffect(()=>{const update=()=>setRevision(v=>v+1);map.on('moveend zoomend',update);return()=>{map.off('moveend zoomend',update);};},[map]);
 const zoom=map.getZoom();
 const selected=useMemo(()=>{const b=map.getBounds();return zoom<10?[]:catalog.sectors.filter(s=>s.bbox[0]<=b.getEast()&&s.bbox[2]>=b.getWest()&&s.bbox[1]<=b.getNorth()&&s.bbox[3]>=b.getSouth());},[map,revision,zoom]);
 const key=selected.map(s=>s.id).join(',');
 useEffect(()=>{let cancelled=false;setFailed(false);setFeatures([]);
 Promise.all(selected.map(async s=>{return loadNauticalResource(s.resource);})).then(collections=>{if(!cancelled)setFeatures(collections.flatMap(c=>c.features));}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};
 },[key]);
 const visible=features.filter(f=>{const b=map.getBounds();const box=f.bbox;return !box||box[0]<=b.getEast()&&box[2]>=b.getWest()&&box[1]<=b.getNorth()&&box[3]>=b.getSouth();});
 const data:FeatureCollection<Geometry,NauticalProperties>={type:'FeatureCollection',features:visible};
 useEffect(()=>{onStatus(failed?'Error al cargar datos locales':zoom<10?'Amplía a zoom 10 para ver objetos':`${visible.length} objetos en la vista · ${selected.length} zonas`);},[failed,zoom,visible.length,key,onStatus]);
 return <Pane name="smartcharts-local-nautical" style={{zIndex:375}}>
 {failed&&<div role="alert" style={{position:'absolute',top:110,left:320,background:'#7f1d1d',color:'white',padding:8,zIndex:800}}>No se pudo cargar el catálogo náutico local.</div>}
 <GeoJSON key={`${key}:${revision}:${features.length}`} data={data} pane="smartcharts-local-nautical" style={{color:'#d946ef',weight:2,fillOpacity:0.08}} pointToLayer={(feature,latlng)=>(() => { const icon=getEncPointIcon(nauticalPortrayal(feature as NauticalFeature),zoom); const svg=decodeURIComponent(icon.options.iconUrl.slice('data:image/svg+xml;charset=UTF-8,'.length)); return L.marker(latlng,{pane:'smartcharts-local-nautical',zIndexOffset:1000,icon:L.divIcon({html:svg,className:'smartcharts-nautical-icon',iconSize:icon.options.iconSize,iconAnchor:icon.options.iconAnchor})}); })()} onEachFeature={(feature,layer)=>{
 const f=feature as NauticalFeature;const container=document.createElement('div');const title=document.createElement('strong');title.textContent=f.properties.name||f.properties.kind;container.append(title);
 const type=document.createElement('div');type.textContent=`${f.properties.kind} · OSM ${f.id}`;container.append(type);
 const details=document.createElement('details');details.style.maxHeight='240px';details.style.overflowY='auto';const summary=document.createElement('summary');summary.textContent='Atributos de origen';details.append(summary);
 for(const [key,value] of Object.entries(f.properties.tags)){const row=document.createElement('div');row.textContent=`${key}: ${value}`;details.append(row);}container.append(details);
 const warning=document.createElement('p');warning.textContent='OSM · experimental · no apto para navegación';container.append(warning);layer.bindPopup(container);
 }}/></Pane>;
}
