"""Map raw source rows into fund-history drafts; never invent inventories/cases/documents."""
from pathlib import Path
from collections import OrderedDict
import json,hashlib
root=Path(__file__).resolve().parents[1];base=root/'sources/archive-20261110/text';out=root/'data/artur/discovery';datasets=[];summary=[]
for filename,number_col,name_col,period_col,first in [('S09-link-2.xlsb.json',3,7,6,2),('S09-link-3.xlsb.json',5,9,8,3)]:
 p=base/filename;data=json.loads(p.read_text());groups=OrderedDict();missing=[];numeric=[]
 for sheet in data['sheets']:
  for row in sheet['rows']:
   if row['row']<first:continue
   values={c['column']:c['value'] for c in row['cells']};raw=values.get(number_col)
   if raw is None or not str(raw).strip():missing.append(row['row']);continue
   number=raw.strip() if isinstance(raw,str) else format(raw,'.15g')
   if not isinstance(raw,str):numeric.append(row['row'])
   key=hashlib.sha256((filename+'\0'+sheet['sheet']+'\0'+number).encode()).hexdigest()
   group=groups.setdefault(key,{'sourceKey':'fund-'+key[:24],'sourceFile':filename,'sourceSheet':sheet['sheet'],'number':number,'rawNumbers':[],'names':[],'status':'DRAFT','publicationAllowed':False,'allowDigitalCopy':False,'branchId':None,'inventoryIds':[],'caseIds':[],'documentIds':[]})
   if raw not in group['rawNumbers']:group['rawNumbers'].append(raw)
   group['names'].append({'name':values.get(name_col),'periodOriginal':values.get(period_col),'sourceRow':row['row'],'rawCells':row['cells']})
 result={'source':filename,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceAsOf':'unconfirmed; filenames2018 conflict with link labels2026','nonemptyRows':sum(s['nonemptyRows'] for s in data['sheets']),'distinctLiteralFundNumbers':len(groups),'historyGroups':sum(len(g['names'])>1 for g in groups.values()),'rowsMissingNumber':missing,'numericNumberRowsPotentialDisplayFormattingLoss':numeric}
 datasets.append({'source':result,'records':list(groups.values())});summary.append(result)
(out/'fund-history-drafts.json').write_text(json.dumps({'version':1,'draftsOnly':True,'datasets':datasets},ensure_ascii=False,indent=2)+'\n')
(out/'fund-mapping-report.json').write_text(json.dumps({'version':1,'sources':summary,'mapping':{'number':'literal string; no Unicode/accounting normalization','name':'historical names as separate source assertions; canonical current name requires review','period':'preserve original notation, not parsed precise dates','volume':'raw source column only; not individual document count','branch':'unknown; bind to reviewed real Branch id before commit','inventory/case/document':'not present; do not fabricate','rights':'all draft; metadata/copy approval separate','datesExcel':'raw serials retained; confirm epoch/cell display before conversion'}},ensure_ascii=False,indent=2)+'\n')
for s in summary:print(s['source'],s['distinctLiteralFundNumbers'],'distinct literal numbers;',s['historyGroups'],'with name history;',len(s['numericNumberRowsPotentialDisplayFormattingLoss']),'numeric number cells')
