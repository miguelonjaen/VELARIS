import test from 'node:test';
import assert from 'node:assert/strict';
import {placeDepthLabels,type LabelLine} from './contour-labels';
test('numeración toma profundidad original y se repite sobre la línea sin amontonarse',()=>{
  const labels=placeDepthLabels([{depth:200,points:[{x:0,y:200},{x:1200,y:200}]}],1200,700);
  assert.ok(labels.length>=3);
  assert.ok(labels.every(label=>label.text==='200 m' && label.y===200 && label.angle===0));
  for(let i=1;i<labels.length;i++)assert.ok(labels[i].x-labels[i-1].x>=240);
});
test('evita paneles y colisiones de curvas cercanas; mantiene lectura de izquierda a derecha',()=>{
  const lines:LabelLine[]=[{depth:100,points:[{x:0,y:200},{x:1000,y:200}]},{depth:200,points:[{x:1000,y:205},{x:0,y:205}]}];
  const labels=placeDepthLabels(lines,1000,700,[{x:0,y:0,width:360,height:650}]);
  assert.ok(labels.length>0);
  assert.ok(labels.every(label=>label.rect.x>=360 && Math.abs(label.angle)<=Math.PI/2));
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
    const a=labels[i].rect,b=labels[j].rect;
    assert.ok(!(a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y));
  }
});
test('curvas pequeñas, inválidas y fuera de pantalla no producen numeración falsa',()=>{
  assert.equal(placeDepthLabels([{depth:NaN,points:[{x:0,y:200},{x:1000,y:200}]},{depth:100,points:[{x:-200,y:200},{x:-100,y:200}]},{depth:50,points:[{x:400,y:200},{x:401,y:200}]}],1000,700).length,0);
});
