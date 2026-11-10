"""Map source-backed discovery assertions to real CMS source keys, not fabricated IDs."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];base=root/'data/artur/discovery';requests=json.loads((root/'data/archive-20261110/cms-draft-requests.json').read_text())['records']
def bindings(evidence):
 result=[]
 for e in evidence:
  matches=[r for r in requests if e['quote'] in r['request']['payload']['body']]
  if not matches:raise ValueError('Source quote not present in CMS draft package: '+e['path'])
  for r in matches:result.append({'namespace':'archive-20261110','sourceKey':r['sourceKey'],'locale':r['request']['locale'],'quote':e['quote'],'sourceFileSha256':e['sha256'],'cmsBodySha256':hashlib.sha256(r['request']['payload']['body'].encode()).hexdigest()})
 return result
places=json.loads((base/'places.json').read_text())['records'];events=json.loads((base/'place-events.json').read_text())['records'];records=[]
for p in places:
 b=bindings(p['evidence']);records.append({'draftKey':'place-'+p['id'],'proposedKind':'PLACE','state':'DRAFT','data':{'projectKey':p['id'],'names':p['name'],'coordinates':None,'ambiguousNames':p['ambiguousNames']},'evidenceBindings':b})
 for i,a in enumerate(p['aliases']):records.append({'draftKey':'alias-'+p['id']+'-'+str(i),'parentDraftKey':'place-'+p['id'],'proposedKind':'ALIAS','state':'DRAFT','data':a,'reviewNote':'Forms normalize wording; EN transliterations are editorial, not certified historical names','evidenceBindings':b})
for e in events:records.append({'draftKey':'event-'+e['id'],'parentDraftKey':'place-'+e['placeId'],'proposedKind':'HISTORY','state':'DRAFT','data':e,'evidenceBindings':bindings(e['evidence'])})
(base/'publication-plan.json').write_text(json.dumps({'version':1,'draftsOnly':True,'notEndpointPayload':True,'instructions':'Resolve approved CMS sources through SourceDraftBinding after normal review; replace logical keys with real IDs and current published revisions. Stage facts as DRAFT. Never auto-verify or publish.','records':records},ensure_ascii=False,indent=2)+'\n')
print('Mapped',len(records),'place/alias/history assertions to existing source keys; no invented CMS/DB IDs.')
