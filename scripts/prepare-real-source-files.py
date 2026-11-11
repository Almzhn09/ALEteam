"""Allowlisted member extraction; preserves bytes and hashes, never executes document content."""
import ctypes as c,hashlib,json,pathlib,shutil
root=pathlib.Path('sources/archive-20261110');out=pathlib.Path('sources/archive-public-20261111');(out/'files').mkdir(parents=True,exist_ok=True)
a=c.CDLL('libarchive.so.13');a.archive_read_new.restype=c.c_void_p
a.archive_read_support_filter_all.argtypes=[c.c_void_p];a.archive_read_support_format_all.argtypes=[c.c_void_p];a.archive_read_open_filename.argtypes=[c.c_void_p,c.c_char_p,c.c_size_t];a.archive_read_next_header.argtypes=[c.c_void_p,c.POINTER(c.c_void_p)];a.archive_entry_pathname.argtypes=[c.c_void_p];a.archive_entry_pathname.restype=c.c_char_p;a.archive_read_data.argtypes=[c.c_void_p,c.c_void_p,c.c_size_t];a.archive_read_data.restype=c.c_ssize_t;a.archive_read_free.argtypes=[c.c_void_p]
sha=lambda b:hashlib.sha256(b).hexdigest();manifest=json.load(open(root/'manifest.json'));records=[]
def save(source,member,data):
 suffix=pathlib.Path(member).suffix.lower();digest=sha(data);rel='files/'+digest+suffix;target=out/rel
 if target.exists():assert sha(target.read_bytes())==digest
 else:target.write_bytes(data)
 records.append(dict(**({'publicationPages':[4,5,6]}if source['id']=='S06'else{}),sourceId=source['id'],archiveSha256=source['sha256'],member=member,name=pathlib.Path(member).name,path=rel,sha256=digest,bytes=len(data)))
public_compliance={'Информация о работе комплаенс службы.docx','Информация каз.docx','План мероприятий каз.pdf','План мероприятий рус.pdf','Перечень должностей каз.pdf','Перечень должностей.pdf','Положение об антикор..pdf','Сыбайлас жемқорлыққа қарсы комплаене қызметі туралы ереже.pdf'}
# The supplied compliance notice explicitly says the analysis documents are posted
# on the archive information site. "Internal analysis" is their subject, not a
# blanket instruction to withhold user-provided public documents.
public_compliance.update({'Аналитическая справка ВАКР 2026.pdf','Аналитикалық анықтама СЖТІТ 2026.pdf','О проведении внутреннего анализа коррупционных рисков.docx','Сыбайлас жемқорлық тәуекелдеріне ішкі талдау жүргізу туралы.docx'})
for source in manifest['sources']:
 original=root/source['original'];data=original.read_bytes();assert sha(data)==source['sha256']
 if source['id'] in ['S02','S05','S06','S07']:save(source,source['file'],data)
 if source['id'] in ['S03','S04']:
  reader=a.archive_read_new();a.archive_read_support_filter_all(reader);a.archive_read_support_format_all(reader);assert a.archive_read_open_filename(reader,str(original).encode(),10240)==0
  try:
   entry=c.c_void_p()
   while a.archive_read_next_header(reader,c.byref(entry))==0:
    name=a.archive_entry_pathname(entry).decode();base=pathlib.PurePosixPath(name).name
    allowed=(source['id']=='S03' and name.lower().endswith('.docx'))or(source['id']=='S04' and base in public_compliance)
    if not allowed:continue
    chunks=[];buf=c.create_string_buffer(65536);total=0
    while True:
     size=a.archive_read_data(reader,buf,len(buf))
     if size==0:break
     assert size>0;total+=size;assert total<=20*1024*1024;chunks.append(buf.raw[:size])
    save(source,name,b''.join(chunks))
  finally:a.archive_read_free(reader)
if (out/'ocr-s06.json').exists():
 ocr_bytes=(out/'ocr-s06.json').read_bytes();ocr=json.loads(ocr_bytes)
 for r in records:
  if r['sourceId']=='S06':
   assert ocr['sourceSha256']==r['sha256'];r['ocrSha256']=sha(ocr_bytes)
(out/'manifest.json').write_text(json.dumps({'version':1,'records':records,'excluded':['S01 original contains unrelated VPN sheet; publish only selected contact fields','S08 development specification; not public archive content'],'review':'Technical allowlist for user-authorized project publication; not an archive signature'},ensure_ascii=False,indent=2)+'\n')
print('Preserved',len(records),'allowlisted source files; S01/VPN and development specification remain excluded')
