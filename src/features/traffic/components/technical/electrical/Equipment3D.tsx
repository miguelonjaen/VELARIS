import React, { useEffect, useRef, useState } from 'react';
import type { Battery, TechnicalInventory } from '../model';
import { bankNominal } from '../installationModel';
import { EquipmentSchematic } from '../EquipmentSchematic';
type Vec=[number,number,number];
const cross=(a:Vec,b:Vec):Vec=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:Vec):Vec=>{const length=Math.hypot(...v)||1;return v.map(n=>n/length) as Vec;};
function box(vertices:number[],center:Vec,size:Vec,color:Vec){
  const faces:[Vec,Vec,Vec][]=[[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[0,1,0],[1,0,0]]];
  for(const[normal,u,v]of faces){const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];for(const index of [0,1,2,0,2,3]){const[a,b]=corners[index];const p=center.map((c,n)=>c+(normal[n]+u[n]*a+v[n]*b)*size[n]/2);vertices.push(...p,...normal,...color);}}
}
function tube(vertices:number[],a:Vec,b:Vec,radius:number,color:Vec){const direction=unit([b[0]-a[0],b[1]-a[1],b[2]-a[2]]),u=unit(cross(direction,Math.abs(direction[1])<0.9?[0,1,0]:[1,0,0])),v=cross(direction,u);for(let segment=0;segment<10;segment++){const angles=[segment*Math.PI/5,(segment+1)*Math.PI/5];for(const [end,angle]of [[0,angles[0]],[1,angles[0]],[1,angles[1]],[0,angles[0]],[1,angles[1]],[0,angles[1]]]){const normal=u.map((n,i)=>n*Math.cos(angle)+v[i]*Math.sin(angle)) as Vec;const c=end?b:a;vertices.push(...c.map((n,i)=>n+normal[i]*radius),...normal,...color);}}}

/** Real WebGL geometry, complementary to the shared graph. No telemetry or twin simulation. */
export function Equipment3D({inventory,componentId,telemetryLabel='Sin telemetría'}:{inventory:TechnicalInventory;componentId:string;telemetryLabel?:string}){
  const canvas=useRef<HTMLCanvasElement>(null),[unavailable,setUnavailable]=useState(false);const rotation=useRef({x:-0.25,y:0.35,zoom:5});
  const selected=inventory.components.find(c=>c.id===componentId)??inventory.installation?.nodes.find(c=>c.id===componentId);
  const batteries=inventory.components.filter((c):c is Battery=>c.kind==='battery'&&(selected?.kind==='bank'?c.bankId===componentId:c.id===componentId));
  const nominal=selected?.kind==='bank'?bankNominal(selected,inventory):null;
  useEffect(()=>{
    const element=canvas.current;if(!element)return;const gl=element.getContext('webgl',{antialias:true,alpha:false});if(!gl){setUnavailable(true);return;}
    const shader=(type:number,source:string)=>{const value=gl.createShader(type);if(!value)throw new Error('Shader no disponible');gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS)){gl.deleteShader(value);throw new Error('No se pudo crear la vista 3D');}return value;};
    let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null,vs:WebGLShader|null=null,fs:WebGLShader|null=null;
    let render=()=>{};
    try{
      vs=shader(gl.VERTEX_SHADER,'attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform vec2 r;uniform float z;uniform float aspect;varying vec3 color;vec3 rotate(vec3 v){v=vec3(v.x,cos(r.x)*v.y-sin(r.x)*v.z,sin(r.x)*v.y+cos(r.x)*v.z);return vec3(cos(r.y)*v.x+sin(r.y)*v.z,v.y,-sin(r.y)*v.x+cos(r.y)*v.z);}void main(){vec3 v=rotate(p);v.z-=z;float f=2.0;gl_Position=vec4(v.x*f/aspect,v.y*f,-1.002*v.z-0.2002,-v.z);vec3 normal=normalize(rotate(n));float light=0.28+0.65*max(dot(normal,normalize(vec3(-0.4,0.8,0.7))),0.0);color=c*light;}');
      fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 color;void main(){gl_FragColor=vec4(color,1.0);}');
      program=gl.createProgram();if(!program)throw new Error('GPU no disponible');gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Vista 3D no disponible');gl.useProgram(program);
      const data:number[]=[],positions=new Map<string,Vec>();const count=Math.max(1,batteries.length);
      const objects=batteries.length?batteries:[selected].filter((c):c is NonNullable<typeof selected>=>!!c);
      objects.forEach((component,index)=>{const x=(index-(count-1)/2)*1.35;positions.set(component.id,[x,0,0]);box(data,[x,-0.03,0],[1.02,0.8,0.72],[0.08,0.2,0.31]);box(data,[x,0.4,0],[1.07,0.08,0.77],[0.34,0.44,0.52]);box(data,[x,-0.47,0],[1.14,0.08,0.84],[0.22,0.31,0.38]);if(component.kind==='battery'){box(data,[x-0.31,0.49,0.08],[0.17,0.12,0.16],[0.9,0.12,0.12]);box(data,[x+0.31,0.49,0.08],[0.17,0.12,0.16],[0.13,0.42,0.72]);}});
      if(selected?.kind==='bank'&&batteries.length){positions.set(componentId,[0,0,-0.95]);box(data,[-0.31,0.55,-0.87],[0.18,0.14,0.18],[0.9,0.12,0.12]);box(data,[0.31,0.55,-0.87],[0.18,0.14,0.18],[0.13,0.42,0.72]);}
      for(const wire of inventory.electrical?.wires??[]){const a=positions.get(wire.from.componentId),b=positions.get(wire.to.componentId);if(!a||!b)continue;const pole=(end:typeof wire.from)=>inventory.electrical?.devices.find(d=>d.componentId===end.componentId)?.terminals.find(t=>t.id===end.terminalId)?.pole;const ap=pole(wire.from),bp=pole(wire.to);if(!['positive','negative'].includes(ap??'')||!['positive','negative'].includes(bp??''))continue;const start:Vec=[a[0]+(ap==='positive'?-0.31:0.31),a[1]+0.55,a[2]+0.08],destination:Vec=[b[0]+(bp==='positive'?-0.31:0.31),b[1]+0.55,b[2]+0.08];let previous:Vec=start;for(let step=1;step<=12;step++){const t=step/12;const next:Vec=[start[0]*(1-t)+destination[0]*t,start[1]*(1-t)+destination[1]*t+Math.sin(Math.PI*t)*0.45,start[2]*(1-t)+destination[2]*t];tube(data,previous,next,0.035,ap==='positive'?[0.9,0.15,0.1]:[0.12,0.55,0.85]);previous=next;}}
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
      for(const[name,offset]of [['p',0],['n',12],['c',24]] as const){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,36,offset);}
      const r=gl.getUniformLocation(program,'r'),z=gl.getUniformLocation(program,'z'),aspect=gl.getUniformLocation(program,'aspect');rotation.current.zoom=Math.max(4,count*1.5);
      render=()=>{const width=element.clientWidth,height=element.clientHeight,ratio=Math.min(devicePixelRatio,2);element.width=width*ratio;element.height=height*ratio;gl.viewport(0,0,element.width,element.height);gl.clearColor(0.015,0.055,0.085,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.uniform2f(r,rotation.current.x,rotation.current.y);gl.uniform1f(z,rotation.current.zoom);gl.uniform1f(aspect,width/Math.max(1,height));gl.drawArrays(gl.TRIANGLES,0,data.length/9);};render();
    }catch{setUnavailable(true);}
    let pointer:{x:number;y:number}|null=null;
    const down=(event:PointerEvent)=>{pointer={x:event.clientX,y:event.clientY};element.setPointerCapture(event.pointerId);};
    const move=(event:PointerEvent)=>{if(!pointer)return;rotation.current.y+=(event.clientX-pointer.x)*0.008;rotation.current.x+=(event.clientY-pointer.y)*0.008;pointer={x:event.clientX,y:event.clientY};render();};
    const up=()=>{pointer=null;};const wheel=(event:WheelEvent)=>{event.preventDefault();rotation.current.zoom=Math.max(1.5,Math.min(100,rotation.current.zoom+event.deltaY*0.01));render();};
    const resize=new ResizeObserver(render);resize.observe(element);element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);element.addEventListener('pointerup',up);element.addEventListener('pointercancel',up);element.addEventListener('wheel',wheel,{passive:false});
    return()=>{resize.disconnect();element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',up);element.removeEventListener('wheel',wheel);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);};
  },[inventory,componentId]);
  return <div className="ee-3d"><p>Arrastra para girar · rueda para acercar. Geometría técnica orientativa; no reproduce dimensiones ni emplazamiento real.</p><canvas ref={canvas} aria-label={`Representación 3D de ${selected?.name??'equipo'}`} style={{width:'100%',height:360,touchAction:'none'}}/>{unavailable&&<><p>WebGL no disponible. Se muestra el esquema 2D complementario.</p>{!!batteries.length&&<EquipmentSchematic equipment={batteries} disabled onEdit={()=>{}}/>}</>}<p>{selected?.name}{selected?.kind==='bank'?` · ${nominal?.volts??'—'} V / ${nominal?.ah??'—'} Ah`:selected?.kind==='battery'?` · ${selected.nominalV??'—'} V / ${selected.capacityAh??'—'} Ah`:' · nominales según sus terminales'} · {telemetryLabel}</p>{selected?.kind==='bank'&&<p>Bornes del banco: referencias esquemáticas de sus terminales declarados. Solo se dibujan los cables del modelo compartido.</p>}<ul>{batteries.map(b=><li key={b.id}>{b.name}: {b.nominalV??'—'} V · {b.capacityAh??'—'} Ah · {b.chemistry}</li>)}</ul></div>;
}
