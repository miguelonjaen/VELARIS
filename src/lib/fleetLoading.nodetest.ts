import test from 'node:test';
import assert from 'node:assert/strict';
import { fleetFilter, fleetRows, FleetLoadGate } from './fleetLoading';
test('fleet includes owner and captain while rejecting REST filter injection',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  assert.equal(fleetFilter(id),`user_id.eq.${id},capitan_id.eq.${id}`);
  assert.throws(()=>fleetFilter('x,user_id.neq.null'));assert.throws(()=>fleetFilter(''));
});
test('504, PGRST003, RLS and malformed responses never become empty success or clear valid fleet',()=>{
  let fleet=[{id:'existing'}];
  for(const error of [{code:'504',message:'timeout'},{code:'PGRST003',message:'pool timeout'},{code:'42501',message:'permission denied'},null]) {
    assert.throws(()=>{fleet=fleetRows(null,error);});assert.deepEqual(fleet,[{id:'existing'}]);
  }
  assert.deepEqual(fleetRows([],null),[]);
});
test('overlapping loads, logout and unmount invalidate requests and abort transport',()=>{
  const gate=new FleetLoadGate(),first=gate.begin(),latest=gate.begin();
  assert.equal(first.current(),false);assert.equal(first.signal.aborted,true);assert.equal(latest.current(),true);
  gate.cancel();assert.equal(latest.current(),false);assert.equal(latest.signal.aborted,true);
});
