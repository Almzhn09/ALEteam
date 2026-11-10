"""Read Word97+ main-story text from a DOC piece table without running macros.
Optional tooling dependency: olefile==0.47 in a task-local venv. Not an application dependency.
Formatting, text boxes and footnotes are not reconstructed. Output needs source review.
"""
import struct,sys
from pathlib import Path
import olefile

def extract(path):
 with olefile.OleFileIO(path) as ole:
  wd=ole.openstream('WordDocument').read()
  if len(wd)<426 or struct.unpack_from('<H',wd,0)[0]!=0xA5EC:raise ValueError('Unsupported Word FIB')
  flags=struct.unpack_from('<H',wd,10)[0]
  if flags&0x0100:raise ValueError('Encrypted DOC not processed')
  table=ole.openstream('1Table' if flags&0x0200 else '0Table').read()
  fc,size=struct.unpack_from('<II',wd,418);clx=table[fc:fc+size];offset=0
  while offset<len(clx) and clx[offset]==1:offset+=3+struct.unpack_from('<H',clx,offset+1)[0]
  if offset>=len(clx) or clx[offset]!=2:raise ValueError('Missing piece table')
  length=struct.unpack_from('<I',clx,offset+1)[0];plc=clx[offset+5:offset+5+length]
  if len(plc)!=length or (length-4)%12:raise ValueError('Invalid piece table length')
  count=(length-4)//12;positions=struct.unpack_from('<'+'I'*(count+1),plc);main=struct.unpack_from('<I',wd,76)[0]
  if count>100000 or main>5000000:raise ValueError('Main story too large')
  chunks=[]
  for i in range(count):
   start,end=positions[i],min(positions[i+1],main)
   if start>=main:break
   if end<start:raise ValueError('Invalid CP range')
   packed=struct.unpack_from('<I',plc,4*(count+1)+8*i+2)[0];compressed=bool(packed&0x40000000);begin=packed&0x3fffffff
   if compressed:begin//=2
   width=1 if compressed else 2;raw=wd[begin:begin+(end-start)*width]
   if len(raw)!=(end-start)*width:raise ValueError('Invalid text span')
   chunks.append(raw.decode('cp1251' if compressed else 'utf-16le',errors='strict'))
  return ''.join(chunks).replace('\r','\n').replace('\x07',' | ').replace('\x0b','\n')
if __name__=='__main__':
 text=extract(Path(sys.argv[1]));Path(sys.argv[2]).write_text(text,encoding='utf-8');print('Extracted main-story characters:',len(text))
