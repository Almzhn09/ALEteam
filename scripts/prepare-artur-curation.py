"""Reproducible source review candidates. No HTTP, publication, inferred holdings or legal approval."""
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import hashlib, json
root=Path(__file__).resolve().parents[1]
out=root/'data/artur/discovery'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def save(name,value):(out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
source=root/'sources/archive-20261110/linked/S09-link-1.docx'
with ZipFile(source) as z:doc=ET.fromstring(z.read('word/document.xml'))
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
tables=[]
for ti,table in enumerate(doc.findall('.//w:tbl',ns),1):
 rows=[]
 for ri,row in enumerate(table.findall('w:tr',ns),1):
  cells=[]
  for cell in row.findall('w:tc',ns):
   paragraphs=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in cell.findall('w:p',ns)]
   span=cell.find('w:tcPr/w:gridSpan',ns);merge=cell.find('w:tcPr/w:vMerge',ns)
   cells.append({'text':'\n'.join(paragraphs),'gridSpan':int(span.get('{'+ns['w']+'}val')) if span is not None else 1,'verticalMerge':merge.get('{'+ns['w']+'}val','continue') if merge is not None else None})
  rows.append({'physicalRow':ri,'cells':cells,'classification':'header' if ri<=2 else 'holdings_row_requires_review'})
 tables.append({'table':ti,'rows':rows,'physicalRows':len(rows),'candidateRows':max(0,len(rows)-2)})
save('newspaper-holdings-drafts.json',{'version':1,'state':'DRAFT','publicationAllowed':False,'source':'sources/archive-20261110/linked/S09-link-1.docx','sourceSha256':sha(source),'sourceAsOf':'2018-01-01 as stated inside the document; link says 2026 and a different year range','mapping':{'columns':['sequence (blank in source)','newspaper title','place and publisher','volume notation','year notation','notes'],'unit':'holdings table row, not a separately digitized newspaper/document','ditto':'Preserve -/- literally; expansion requires review','stableCatalogId':None,'rights':'metadata and digital-copy approval are separate; not established by possession','branch':None},'tables':tables})
cms=json.loads((root/'data/archive-20261110/cms-draft-requests.json').read_text())['records']
branches=json.loads((root/'data/archive-20261110/branches.json').read_text())['records']
records=[{'reviewKey':'cms-'+r['sourceKey'],'type':'cms','sourceKey':r['sourceKey'],'sourceId':r['sourceId'],'locale':r['request']['locale'],'title':r['request']['payload']['title'],'bodySha256':hashlib.sha256(r['request']['payload']['body'].encode()).hexdigest(),'decision':'PENDING','blockers':['independent editorial/rights review','native-language review where applicable']} for r in cms]
records += [{'reviewKey':'branch-'+r['sourceKey'],'type':'branch','sourceKey':r['sourceKey'],'sourceId':'S01','locale':'ru','title':r['name'],'decision':'PENDING','blockers':r['issues']+['hours/coordinates not supplied; text card allowed','confirm current contacts']} for r in branches]
save('showcase-review.json',{'version':1,'candidateCount':len(records),'approvedCount':0,'state':'DRAFT','note':'Real source-based editorial candidates, not invented archival documents and not an approved public collection. Synthetic browser fixtures are separate.','records':records})
templates=[]
for file,first,number,name,period,volume in [('S09-link-2.xlsb',2,3,7,6,9),('S09-link-3.xlsb',3,5,9,8,11)]:
 templates.append({'originalPath':'sources/archive-20261110/linked/'+file,'sha256':sha(root/'sources/archive-20261110/linked'/file),'requiresBranchMapping':True,'previewTemplate':{'branchId':None,'sourceNamespace':'archive-2018-'+file.removesuffix('.xlsb').lower(),'format':'xlsb','mapping':{'sheet':'Фонды','startRow':first,'mode':'funds','columns':{'number':{'column':number,'representation':'display'},'name':{'column':name,'representation':'display'}},'defaults':{}}},'additionalSourceColumns':{'historicalPeriod':period,'volumeNotation':volume},'missing':['reviewed branch ID','confirmed source date (2018 vs 2026)','stable archival entity identity beyond literal number','approved metadata/copy rights'],'stagingAvailable':False})
save('fund-preview-mappings.json',{'version':1,'templates':templates,'notes':['Read exact original bytes and supply base64 only through the staff-only preview endpoint. Null branchId is deliberately not an executable request.','Year/volume/rename information remains raw source assertions. Fund preview cannot create inventories/cases/documents.']})
print('Prepared',sum(t['candidateRows'] for t in tables),'newspaper holdings rows and',len(records),'real editorial review candidates; nothing published.')
