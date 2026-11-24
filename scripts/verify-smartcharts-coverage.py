from pathlib import Path
import json,hashlib
from shapely.geometry import box,Point,shape,mapping
from shapely.ops import unary_union
r=Path(__file__).resolve().parents[1];data=r/'src/features/navigation/components/smartcharts/mediterranean'
a=json.loads((r/'work/smartcharts-coverage/staged/provenance-alboran-corridor.json').read_text(encoding='utf8'))
b=json.loads((r/'work/smartcharts-coverage/reproduced/provenance-alboran-corridor.json').read_text(encoding='utf8'))
assert a['resources']==b['resources']
for name,record in a['resources'].items():assert hashlib.sha256((data/name).read_bytes()).hexdigest()==record['sha256']
catalog=json.loads((data/'catalog.json').read_text(encoding='utf8'))
coverage=unary_union([box(*s['bbox']) for s in catalog['sectors'] if not s['simplified']])
p=Point(-3,35.75);window=box(-3.95,35,-2.15,37.3)
index=json.loads((data/'base/index-alboran-corridor.json').read_text(encoding='utf8'))
sea=unary_union([shape(f['geometry']) for n in index['layerParts']['sea'] for f in json.loads((data/'base'/n).read_text(encoding='utf8'))['features']])
assert coverage.covers(p) and coverage.covers(window) and sea.covers(p)
result={'point':[-3,35.75],'pointCovered':True,'pointClassifiedSea':True,'window':list(window.bounds),'uncoveredAreaSquareDegrees':window.difference(coverage).area,'identicalRegeneratedResources':len(a['resources']),'resourceBytes':sum(x['bytes'] for x in a['resources'].values()),'hashes':a['resources'],'sourceDatum':a['datum'],'navigationUse':False,'officialEnc':False}
(r/'work/smartcharts-coverage/audit-after.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2))
