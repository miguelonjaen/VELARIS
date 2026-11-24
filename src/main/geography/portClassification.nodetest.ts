import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNominatim,validReference} from './geographicResolver';
test('industrial=port identifies harbour installation; names on pedestrian ways do not',()=>{
  const base={osm_type:'way',osm_id:1,lat:'36.7',lon:'-4.4',name:'Puerto',display_name:'Puerto, España'};
  assert.equal(parseNominatim([{...base,category:'landuse',type:'industrial',extratags:{industrial:'port'}}])[0].kind,'PORT');
  assert.equal(parseNominatim([{...base,category:'highway',type:'pedestrian'}])[0].kind,'PLACE');
  assert.equal(validReference({...parseNominatim([{...base,category:'landuse',type:'industrial',extratags:{industrial:'port'}}])[0],aliases:[{}]}),false);
});
