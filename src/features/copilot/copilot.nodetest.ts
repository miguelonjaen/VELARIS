import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseArea, areaAdvisories, AdvisoryTransitions, geometryBounds, type ChartFeature } from './areaAnalysis';
import { timed, buildCopilotContext, contextAdvisories } from './context';
import { confirmNavigationAction, validNavigationAction } from './toolPolicy';
import { SharedNavigationState } from '../../core/navigation/SharedNavigationState';
import { BoatInstrumentStore } from '../../core/instruments/BoatInstrumentStore';
import { NMEAParser } from '../../core/services/NMEAParser';
import { getVerifiedTacticalAnswer } from './verifiedAnswers';

const feature = (id: string, kind: string, x = 0): ChartFeature => ({ type: 'Feature', id, properties: { __s57Layer: kind, OBJNAM: id, CATZOC: 6 }, geometry: { type: 'Point', coordinates: [x, 0] } });
test('area queries preserve S57 provenance, deduplicate and exclude distant geometry', () => {
  const report = analyseArea([-1,-1,1,1], [{ source: 'ENC', features: [feature('1','WRECKS'), feature('1','WRECKS'), feature('2','LIGHTS'), feature('3','WRECKS',10), feature('4','M_QUAL')] }], 'available', [], 100);
  assert.equal(report.total, 3); assert.equal(report.objects[0].category, 'hazard');
  assert.equal(report.objects[0].attributes.CATZOC,6); assert.equal(report.quality,'objects-available'); assert.equal(report.coverage,'unknown');
});
test('absence and failed ENC never certify safety or survey quality', () => {
  const report = analyseArea([-1,-1,1,1], [], 'error', ['failed'], 100);
  assert.equal(report.coverage,'unknown'); assert.equal(report.quality,'unknown'); assert.equal(areaAdvisories(report).length,2);
  assert.throws(() => analyseArea([179,-1,-179,1], [], 'unavailable', [],100));
});
test('OSM display adapter does not become an ENC object', () => {
  const osm = { ...feature('1','WRECKS'), properties: { kind:'wreck', name:'OSM object', tags:{'seamark:type':'wreck'} } };
  const r = analyseArea([-1,-1,1,1], [{ source:'OSM',features:[osm] }], 'unavailable', [],100);
  assert.equal(r.objects[0].source,'OSM'); assert.equal(r.objects[0].kind,'wreck'); assert.equal(r.coverage,'unknown');
});
test('bounded results retain truncation and prioritize hazards', () => {
  const features = Array.from({length:220},(_,i) => feature(String(i), i === 219 ? 'WRECKS':'SOUNDG'));
  const r = analyseArea([-1,-1,1,1], [{ source:'ENC',features }], 'available', [],100);
  assert.equal(r.total,220); assert.equal(r.objects.length,200); assert.equal(r.truncated,true); assert.equal(r.objects[0].kind,'WRECKS');
});
test('geometry bounds include crossing lines and enclosing polygons conservatively', () => {
  assert.deepEqual(geometryBounds({type:'LineString',coordinates:[[-2,0],[2,0]]}),[-2,0,2,0]);
  assert.equal(analyseArea([-1,-1,1,1],[{source:'ENC',features:[{...feature('1','RESARE'),geometry:{type:'Polygon',coordinates:[[[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]]]}}]}],'available',[],1).total,1);
});
test('freshness drops unknown, expired, future and nonfinite timestamps; zero remains valid', () => {
  assert.equal(timed(0,'boat',100,10,100).value,0);
  assert.equal(timed(7,'boat',100,10,111).value,null);
  assert.equal(timed(7,'boat',null,10,100).status,'unavailable');
  assert.equal(timed(7,'boat',101,10,100).status,'invalid');
  assert.equal(timed(7,'boat',NaN,10,100).status,'invalid');
});
test('confirmation rejects malformed tools and cancellation blocks execution', () => {
  assert.equal(validNavigationAction({name:'set_navigation_target',args:{lat:91,lng:0,name:'bad'}}),false);
  assert.equal(validNavigationAction({name:'start_travesia',args:{assisted:'yes'}}),false);
  assert.equal(confirmNavigationAction({name:'activate_mob',args:{}},()=>false),false);
  assert.equal(confirmNavigationAction({name:'end_travesia',args:{}},()=>true),true);
  assert.equal(confirmNavigationAction({name:'unknown',args:{}},()=>{throw Error('must not prompt');}),false);
});
test('advisories emit once until recovery and reappearance', () => {
  const transitions = new AdvisoryTransitions(); const warning = {id:'missing',priority:'warning' as const,text:'missing'};
  assert.equal(transitions.update([warning]).length,1); assert.equal(transitions.update([warning]).length,0);
  transitions.update([]); assert.equal(transitions.update([warning]).length,1);
});
test('existing stores supply context without a default GPS fix or depth', () => {
  const policy = {BOAT:{maxAgeMs:1000,ageFrom:'receivedAt' as const},DROID:{maxAgeMs:1000,ageFrom:'receivedAt' as const}};
  const nav = new SharedNavigationState({position:policy,sog:policy,cog:policy,headingTrue:policy,headingMagnetic:policy});
  const context = buildCopilotContext({now:100,navigation:nav.snapshot(100),instruments:new BoatInstrumentStore().snapshot(100),ais:[],weather:{atmospheric:null,marine:null},target:{lat:0,lng:0},targetName:'test',trial:false});
  assert.equal(context.navigation.position.value,null); assert.equal(context.instruments.depth.value,null);
  assert.equal(context.weather.atmospheric.status,'unavailable'); assert.equal(context.route.timestamp,null);
  assert.ok(contextAdvisories(context).some(a=>a.id==='position-unavailable'));
  const withAis = buildCopilotContext({now:100,navigation:nav.snapshot(100),instruments:new BoatInstrumentStore().snapshot(100),ais:[{mmsi:'123456789',lat:0,lng:0,sog:102.3,cog:511,timestamp:100},{lat:91,lng:0,timestamp:100}],weather:{atmospheric:null,marine:null},target:null,targetName:null,trial:false});
  assert.equal(withAis.ais[0].value?.sog,null); assert.equal(withAis.ais[0].value?.cog,null);
  assert.equal(withAis.ais[1].status,'invalid'); assert.equal(withAis.aisScope.streamHealth,'unknown');
});

test('Oficial IA: NMEA, contexto, respuesta y caducidad', () => {
  const T0 = Date.UTC(2026, 9, 22, 10, 0, 0);

  const parser = new NMEAParser();
  const store = new BoatInstrumentStore(() => T0);

  const checksum = (body: string) => {
    let cs = 0;
    for (const ch of body) cs ^= ch.charCodeAt(0);
    return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`;
  };

  const policy = {
    BOAT: { maxAgeMs: 1000, ageFrom: 'receivedAt' as const },
    DROID: { maxAgeMs: 1000, ageFrom: 'receivedAt' as const }
  };

  const nav = new SharedNavigationState({
    position: policy,
    sog: policy,
    cog: policy,
    headingTrue: policy,
    headingMagnetic: policy
  });

  const contextAt = (now: number) =>
    buildCopilotContext({
      now,
      navigation: nav.snapshot(now),
      instruments: store.snapshot(now),
      ais: [],
      weather: { atmospheric: null, marine: null },
      target: null,
      targetName: null,
      trial: false
    });

  const question = '¿Qué profundidad marca la sonda?';

  // Primera lectura NMEA.
  const first = parser.parse(
    checksum('SDDBT,27.6,f,8.4,M,4.6,F')
  );

  assert.equal(first.type, 'DEPTH');
  assert.equal(store.ingest(first, T0), true);

  const firstContext = contextAt(T0);

  assert.equal(firstContext.instruments.depth.status, 'valid');

  const firstAnswer = getVerifiedTacticalAnswer(
    question,
    firstContext
  );

  assert.ok(firstAnswer?.includes('8,4 metros'));

  // Nueva lectura siete segundos después.
  const second = parser.parse(
    checksum('SDDBT,29.5,f,9.0,M,4.9,F')
  );

  assert.equal(second.type, 'DEPTH');
  assert.equal(store.ingest(second, T0 + 7000), true);

  const updatedAnswer = getVerifiedTacticalAnswer(
    question,
    contextAt(T0 + 7000)
  );

  assert.ok(updatedAnswer?.includes('9 metros'));

  // La lectura caduca después de ocho segundos.
  const expiredContext = contextAt(T0 + 15001);

  assert.notEqual(
    expiredContext.instruments.depth.status,
    'valid'
  );

  const expiredAnswer = getVerifiedTacticalAnswer(
    question,
    expiredContext
  );

  assert.equal(
    expiredAnswer,
    'No dispongo de una lectura vigente de la sonda del barco. No puedo confirmar la profundidad actual.'
  );
});