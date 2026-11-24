import React, { useEffect, useRef, useState } from 'react';
/** Scales the complete map without changing its composition; small tablets retain horizontal panning. */
export function VisualMapFrame({height,children}:{height:number;children:React.ReactNode}){
  const ref=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1);
  useEffect(()=>{const element=ref.current;if(!element)return;const observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width)setScale(Math.max(.85,Math.min(1,width/1260)));});observer.observe(element);return()=>observer.disconnect();},[]);
  return <div className="vm-viewport" ref={ref}><div style={{width:1260*scale,height:height*scale}}><div className="vm-canvas" style={{width:1260,height,transform:`scale(${scale})`}}>{children}</div></div></div>;
}
