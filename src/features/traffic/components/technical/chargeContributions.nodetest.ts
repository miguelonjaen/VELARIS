import test from 'node:test';
import assert from 'node:assert/strict';
import {chargeContributions} from './chargeContributions';
test('complete synchronized source currents produce shares and preserve zero',()=>{
  const actual=chargeContributions([{id:'a',name:'Alternador',amps:40,ageMs:100},{id:'s',name:'Solar',amps:10,ageMs:120}]);
  assert.equal(actual.totalAmps,50);assert.deepEqual(actual.rows.map(r=>r.percent),[80,20]);
  const zero=chargeContributions([{id:'s',name:'Solar',amps:0,ageMs:0}]);assert.equal(zero.totalAmps,0);assert.equal(zero.rows[0].percent,0);assert.deepEqual(zero.activeNames,[]);
});
test('unknown, stale, invalid and asynchronous sources never fabricate full contributions',()=>{
  const baseline={id:'s',name:'Solar',amps:10,ageMs:0};
  for(const other of [{id:'a',name:'Alt',amps:null,ageMs:null},{id:'a',name:'Alt',amps:20,ageMs:15001},{id:'a',name:'Alt',amps:20,ageMs:2001},{id:'a',name:'Alt',amps:-20,ageMs:0},{id:'a',name:'Alt',amps:NaN,ageMs:0}]) {
    const actual=chargeContributions([baseline,other]);assert.equal(actual.complete,false);assert.equal(actual.totalAmps,null);assert.ok(actual.rows.every(r=>r.percent===null));
  }
  assert.equal(chargeContributions([]).totalAmps,null);
});
