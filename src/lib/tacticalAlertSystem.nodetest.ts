import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTacticalAlerts, formatTacticalAdvisory, shouldAutomaticallyLogTacticalAlert, type NavigationTelemetry, type TacticalAlert } from './tacticalAlertSystem';
import { isTacticalAlarmType } from '../core/alerts/boatAlarms';

const base: NavigationTelemetry = {lat:36,lng:-4,cog:225,sog:6,windDir:270,windSpeed:12,waypointLat:37,waypointLng:-4,currentSailConfig:'full'};
test('free navigation, absent waypoint and motor never generate layline alarms or tactical logs',()=>{
  for(const context of [{},{activeWaypoint:false},{activeWaypoint:true,currentSailConfig:'motor',windSource:'BOAT' as const}]) {
    const alerts=generateTacticalAlerts({...base,...context});
    assert.equal(alerts.filter(a=>a.type!=='safety').length,0);
    assert.equal(alerts.filter(shouldAutomaticallyLogTacticalAlert).length,0);
  }
});
test('severe direct-bearing deviation never becomes a layline alarm even with a waypoint',()=>{
  for(const cog of [0,45,180,270]) {
    const alerts=generateTacticalAlerts({...base,cog,activeWaypoint:true,windSource:'BOAT'});
    assert.equal(alerts.some(a=>a.type==='layline'),false);
    assert.ok(alerts.filter(a=>a.type!=='safety').every(a=>a.severity==='info'&&!shouldAutomaticallyLogTacticalAlert(a)));
  }
});
test('missing, forecast and invalid wind cannot generate instrument-based sailing tactics',()=>{
  for(const input of [{windSource:'METEO' as const},{windSource:'NONE' as const},{windDir:NaN},{windSpeed:NaN},{waypointLat:100}]) {
    assert.equal(generateTacticalAlerts({...base,activeWaypoint:true,windSource:'BOAT',...input}).filter(a=>a.type!=='safety').length,0);
  }
});
test('wind safety warning and critical thresholds remain active and auto-loggable',()=>{
  for(const [windSpeed,severity] of [[20,'warning'],[30,'critical']] as const) {
    const alerts=generateTacticalAlerts({...base,windSpeed,windSource:'BOAT',currentSailConfig:'motor',activeWaypoint:false});
    const safety=alerts.find(a=>a.type==='safety');
    assert.ok(safety);assert.equal(safety.severity,severity);assert.equal(shouldAutomaticallyLogTacticalAlert(safety),true);
  }
});
test('forecast warnings are explicitly labelled and absence of advice never asserts safety',()=>{
  assert.match(generateTacticalAlerts({...base,windSpeed:30,windSource:'METEO'})[0].message,/Previsión meteorológica/);
  assert.doesNotMatch(formatTacticalAdvisory([]).message,/condiciones óptimas|sistemas verdes/i);
});
test('legacy tactical types are rejected at safety boundary; safety types are preserved',()=>{
  assert.equal(isTacticalAlarmType('LAYLINE_DEVIATION'),true);
  for(const type of ['depth','ais_collision','anchor_drag','engine_temp','oil_pressure','battery_low','fuel','water_low','sensor_quality']) assert.equal(isTacticalAlarmType(type),false);
  const legacy:TacticalAlert={type:'layline',severity:'critical',message:'legacy'};
  assert.equal(shouldAutomaticallyLogTacticalAlert(legacy),false);
});

test('non-finite wind never creates a weather safety alarm',()=>{
  for(const windSpeed of [NaN,Infinity,-Infinity]) assert.deepEqual(generateTacticalAlerts({...base,windSpeed}),[]);
});
