import React, { useId } from 'react';

/** Code-native technical symbols: interactive UI, not a raster installation illustration. */
export function EquipmentGlyph({catalogId}:{catalogId:string}) {
  const gradient=`equipment-${useId().replace(/:/g,'')}`;
  const battery=catalogId==='battery'||catalogId.startsWith('bank-');
  const source=catalogId==='alternator'||catalogId==='generator';
  const charger=catalogId==='charger'||catalogId==='inverter-charger'||catalogId==='controller';
  const top=charger?'#2995da':source?'#e7eef3':battery?'#496174':'#d5e5ef';
  const bottom=charger?'#00538a':source?'#727f8c':battery?'#172d3c':'#69879e';
  const panel=catalogId==='ac-panel'||catalogId==='dc-panel';
  return <svg className="eo-glyph" viewBox="0 0 140 82" aria-hidden="true" focusable="false">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor={top}/><stop offset="1" stopColor={bottom}/></linearGradient></defs>
    <g fill={`url(#${gradient})`} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      {battery?<><path d="M21 22h98v51H21zM18 19h104v8H18zM29 12h15v7H29zM97 12h15v7H97z"/><path d="M25 30h90v38H25z" fill="none" opacity=".45"/>{catalogId==='bank-starter'?<path d="M49 46h8l6-7h19l7 8h7v17H50zM65 35h15M58 33v9" fill="none" stroke="#f2f8ff" strokeWidth="2"/>:catalogId==='bank-service'?<path d="m53 48 17-14 17 14M58 45v20h9V54h7v11h9V45" fill="none" stroke="#f2f8ff" strokeWidth="2"/>:<path d="m74 31-16 22h13l-5 14 19-24H72z" fill="#dcefff" stroke="none"/>}<path d="M29 12h15v7H29zM97 12h15v7H97z" fill={catalogId==='bank-service'?'#137ad8':'#e04535'} stroke="none"/><path d="M32 15h8m-4-4v8m64-4h8"/><path d="M24 76h92M17 28v40m106-40v40"/></>:
      catalogId==='solar'?<><path d="m32 10-13 58h102l-13-58z" fill="#0d354b"/><path d="M29 23h82M26 38h88M23 53h94M50 11l-5 57m25-57v57m20-57 5 57" fill="none" stroke="#70b2d1"/><path d="M64 68v8m12-8v8M48 77h44"/></>:
      source?<><path d="M33 23h63v40H33zM20 29h13v28H20zM96 29h18v28H96zM114 36h10v14h-10z"/><ellipse cx="34" cy="43" rx="9" ry="22"/><path d="M44 27v32m7-32v32m7-32v32M66 25v36m8-36v36m8-36v36m8-36v36M43 18h42v6M44 64v7h40v-7" fill="none"/><circle cx="24" cy="43" r="5"/></>:
      catalogId==='shore'||catalogId==='ac-socket'?<><rect x="42" y="6" width="56" height="69" rx="5" fill="#233f49"/><circle cx="70" cy="42" r="23" fill="#122b35"/><path d="M61 34v13m18-13v13M65 58h10M56 11h28" strokeWidth="3"/><circle cx="48" cy="12" r="2"/><circle cx="92" cy="69" r="2"/></>:
      panel?<><rect x="12" y="7" width="116" height="69" rx="4"/><path d="M20 20h100M20 65h100" fill="none"/>{[24,47,70,93].map((x,index)=><g key={x}><rect x={x} y="28" width="18" height="28" rx="1" fill="#bdd1d0" stroke="#829ca4"/><rect x={x+4} y="33" width="10" height="11" fill={index===0?'#e2ac5b':'#8b353d'} stroke="none"/><path d={`M${x+4} 50h10`} stroke="#315362"/></g>)}</>:
      catalogId==='bus-positive'||catalogId==='bus-negative'||catalogId==='distributor'||catalogId==='dc-distribution'?<><rect x="16" y="24" width="108" height="31" rx="5"/><path d="M26 40h88" stroke={catalogId==='bus-negative'?'#a8b8bd':'#ec7979'} strokeWidth="5"/>{[31,55,79,103].map(x=><g key={x}><path d={`M${x} 12v12m0 31v15`}/><circle cx={x} cy="39" r="4" fill="#a5bec7"/></g>)}</>:
      catalogId==='switch'||catalogId==='acr'||catalogId==='ac-transfer'?<><rect x="35" y="10" width="70" height="63" rx="7"/><circle cx="51" cy="53" r="4"/><circle cx="89" cy="53" r="4"/><path d="m55 51 30-24" stroke="#e89983" strokeWidth="3"/><path d="M44 17h19m13 0h19"/></>:
      catalogId==='fuse'||catalogId==='breaker'||catalogId==='rcd'||catalogId==='shunt'||catalogId==='terminal'?<><path d="M10 42h31m58 0h31"/><rect x="41" y="23" width="58" height="36" rx="3"/><path d="m47 48 17-13 15 13 14-13" fill="none"/><circle cx="29" cy="42" r="5"/><circle cx="111" cy="42" r="5"/></>:
      ['lighting','navigation','pump','fridge','windlass','autopilot','custom-consumer'].includes(catalogId)?<>
        {catalogId==='lighting'?<><path d="M53 49c-20-28 1-43 17-43s37 15 17 43l-7 10H60z"/><path d="M59 64h22m-20 6h18M70 1v-1M39 14l-7-5m69 5 7-5M36 35H25m79 0h11"/></>:
        catalogId==='fridge'?<><rect x="45" y="5" width="50" height="70" rx="5"/><path d="M46 30h48M52 17v8m0 13v17M52 79h5m26 0h5"/></>:
        catalogId==='pump'?<><path d="M23 34h46v23H23zM69 38h25v15H69zM94 29h15v34H94zM105 34h20v12h-16M28 30V18h30v12"/><path d="M17 68q9-8 18 0t18 0t18 0t18 0t18 0" fill="none"/></>:
        <><rect x="24" y="10" width="92" height="54" rx="4"/><path d="M62 64v10m16-10v10M50 76h40M32 20h76v32H32z" fill="none"/><path d="m41 41 15-12 14 14 13-8 17 7" stroke="#679db9" fill="none"/></>}
      </>:
      <><rect x="27" y="5" width="86" height="71" rx="5"/><path d="M34 14h72v15H34z" fill="#08222c"/><path d="M39 22h16m9 0h16m8 0h12M37 40h66M37 46h66M37 52h66M37 58h66" fill="none"/>{charger&&<path d="m75 30-17 20h12l-6 17 21-24H73z" fill="#f4fcff" stroke="none"/>}<path d="M43 76v5m53-5v5" strokeWidth="4"/>{catalogId==='controller'&&<text x="70" y="70" textAnchor="middle" fontSize="9" stroke="none" fill="#b2dce3">MPPT / PWM</text>}</>}
    </g>
  </svg>;
}
