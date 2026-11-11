"""Page-aware measured OCR for the supplied public decree; no invented confidence."""
import fitz,csv,hashlib,json,pathlib,subprocess,tempfile,io
root=pathlib.Path('sources/archive-public-20261111');manifest=json.load(open(root/'manifest.json'));record=next(r for r in manifest['records']if r['sourceId']=='S06');source=root/record['path'];assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sha256'];document=fitz.open(source);pages=[]
with tempfile.TemporaryDirectory(prefix='ale-real-ocr-') as folder:
 for index,page in enumerate(document):
  scale=2200/max(page.rect.width,page.rect.height);image=pathlib.Path(folder)/'page.png';page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False).save(image)
  tsv=subprocess.check_output(['tesseract',str(image),'stdout','--tessdata-dir','.local/ocr/models','-l','rus+kaz','--psm','3','-c','tessedit_create_tsv=1'],stderr=subprocess.DEVNULL).decode()
  rows=[r for r in csv.DictReader(io.StringIO(tsv),delimiter='\t',quoting=csv.QUOTE_NONE)if r.get('text','').strip() and float(r.get('conf','-1'))>=0];lines={}
  for r in rows:lines.setdefault((r['block_num'],r['par_num'],r['line_num']),[]).append(r['text'])
  text='\n'.join(' '.join(words)for words in lines.values());confidence=sum(float(r['conf'])for r in rows)/len(rows)if rows else None
  pages.append(dict(page=index+1,text=text,confidence=confidence,words=len(rows),corrected=False,textSha256=hashlib.sha256(text.encode()).hexdigest()))
  print('OCR page',index+1,'words',len(rows),'mean confidence',round(confidence,2)if confidence is not None else None,flush=True)
result={'sourceSha256':record['sha256'],'engine':subprocess.check_output(['tesseract','--version']).decode().splitlines()[0],'languages':['rus','kaz'],'confidenceMeaning':'Mean word-recognition confidence, not probability of historical correctness','pages':pages}
(root/'ocr-s06.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

artifact=hashlib.sha256((root/'ocr-s06.json').read_bytes()).hexdigest()
for row in manifest['records']:
 if row['sourceId']=='S06':row['ocrSha256']=artifact
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
