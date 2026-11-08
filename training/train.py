"""ALEteam query seq2seq: random initialization, no pretrained weights/tokenizer."""
import json, math, random, hashlib, time, pathlib, sys
import torch
from torch import nn
ROOT=pathlib.Path(__file__).resolve().parents[1]
torch.set_num_threads(2); torch.manual_seed(2026); random.seed(2026)
classes=[
('библиотека',['библиотека','библиотеки','библиотеке','читальный зал','читатели','кітапхана','оқырмандар','kitaphana']),
('площадь',['площадь','площади','городская площадь','благоустройство','алаң','абаттандыру']),
('школа',['школа','школы','школе','ученики','учебный класс','мектеп','оқушылар','сынып','mektep']),
('музей',['музей','музея','музее','выставка','экспонаты','мұражай','көрме','жәдігер']),
('станция',['железная дорога','железной дороге','станция','расписание','вокзал','транспорт','темір жол','бекет','көлік','temir zhol']),
('архивный фонд',['архивный фонд','архивного фонда','фонд','мұрағат қоры','мұрағаттық қор','қор']),
('архивный шифр',['архивный шифр','шифр','опись','мұрағаттық шифр','тізімдеме']),
('поиск документов',['каталог','каталоге','каталог документов','құжаттар каталогы','поиск документов','искать документы','найти документы','найти материалы','құжаттарды іздеу','құжатты табу']),
('правила комментариев',['комментарии','комментариях','правила комментариев','нельзя материться','пікір','пікірлер','пікір ережелері']),
('избранное',['избранное','избранного','синхронизировать избранное','таңдаулылар','таңдаулыларды сақтау']),
('уведомления',['уведомления','уведомлений','отключить уведомления','хабарландырулар','хабарландыруларды өшіру']),
('распознавание текста',['OCR','распознавание','распознавания','распознанный текст','танылған мәтін','мәтінді тану']),
('проверка источников',['источники','источников','проверить источники','дереккөздер','дереккөздерді тексеру']),
('приветствие',['привет','здравствуй','здравствуйте','добрый день','приветик','сәлем','сәлеметсіз бе','қайырлы күн']),
('благодарность',['спасибо','благодарю','спасибо большое','понятно спасибо','рақмет','рахмет','көп рақмет']),
('помощь по сайту',['кто ты','кто вы','как тебя зовут','ты кто','сен кімсің','помоги','что ты умеешь','чем можешь помочь','как пользоваться сайтом','расскажи о сайте','что здесь можно делать','помощь по сайту','сайт туралы','сен не істей аласың','көмектес']),
('вход на сайт',['вход','войти в аккаунт','как войти','авторизация','войти на сайт','жүйеге кіру','қалай кіру']),
('скачивание файлов',['скачать файл','скачивание','скачать документ','можно скачать','жүктеп алу','файлды жүктеу']),
('уточнение способа',['а как','как это сделать','как мне это сделать','как этим воспользоваться','что нажать','покажи шаги','оны қалай жасауға болады','қалай жасауға болады','қалай істеймін']),
('уточнение места',['а где','где это','где это находится','где его найти','в каком разделе','куда перейти','қайда','қай жерден табамын','ол қайда']),
('уточнение причины',['а почему','почему так','зачем это','почему это нужно','неге','неге олай']),
('повтор объяснения',['объясни подробнее','расскажи подробнее','можно попроще','не понял','объясни проще','толығырақ','түсінбедім','қарапайым түсіндір']),
('уточнение периода',['а за 1930 год','а в 1905','за 1965','а до 1940','а после 1970','ал 1930 жылы','1965 жылға дейін']),
('подтверждение',['да','давай','хорошо','ладно','продолжай','иә','жарайды']),
('нет ответа',['космонавты на Марсе','космонавтов','космос','Марс','на Марсе','планета Марс','свидетельство Иванова','зарплата','погода','футбол','рецепт супа','несуществующий материал','ғарышкерлер','ауа райы','туу туралы куәлік','билет на самолет'])]
wrappers={
 'train':['Найди {}','Покажи {}','{} туралы мәлімет керек','Есть ли материалы: {}?','Что означает {}?','{} құжаттары бар ма?','{}','Где посмотреть {}','Как работает {}','Информация о {}'],
 'validation':['Подбери сведения: {}','{} жөнінде ақпарат'],
 'test':['Меня интересует {}','{} бойынша көмек керек']}
external=json.loads((ROOT/'tests/fixtures/search-bilingual.json').read_text())['cases']
reserved={r['question'].strip().lower() for r in external}
for case in json.loads((ROOT/'tests/fixtures/site-dialog.json').read_text()):
 reserved.update(q.strip().lower() for q in case['turns'])
def norm(s): return ' '.join(s.lower().split())
def features(s):
 s=' '+norm(s)+' '; v=[0.0]*1024
 for n in range(2,6):
  for i in range(len(s)-n+1):
   h=2166136261
   for c in s[i:i+n]: h=((h^ord(c))*16777619)&0xffffffff
   v[h%1024]+=1
 length=math.sqrt(sum(x*x for x in v)) or 1
 return [x/length for x in v]
splits={}; seen=set()
for split,templates in wrappers.items():
 rows=[]
 for label,aliases in classes:
  for alias in aliases:
   for template in templates:
    for year in ['', ' 1905', ' 1965'] if split=='train' else ['']:
     q=template.format(alias)+year
     if norm(q) in reserved or norm(q) in seen: continue
     seen.add(norm(q)); rows.append({'question':q,'target':label,'group':split})
 # Explicit topic + temporal/navigation wording: distinguish follow-ups from a new topic.
 if split=='train':
  for label,aliases in classes[:13]:
   for alias in aliases:
    for template in ['Где находится {}','Как открыть {}','Расскажи о {}','{} деген не','{} туралы құжаттарды іздеп тап','Помоги разобраться: {}','Объясни, пожалуйста, {}','Найди {} до 1935','{} 1975 жылдан кейін','{} 1920 жылға дейін','{} 1910–1980','Нужен документ про {} за 1945 год']:
     q=template.format(alias)
     if norm(q) not in reserved and norm(q) not in seen:
      seen.add(norm(q));rows.append({'question':q,'target':label,'group':split})
  for alias in classes[-1][1]:
   for template in ['Документы про {}','Найди сведения: {}','Помоги найти {}','{} туралы құжаттар']:
    q=template.format(alias)
    if norm(q) not in reserved and norm(q) not in seen:
     seen.add(norm(q));rows.append({'question':q,'target':'нет ответа','group':split})
 # Multi-topic sequences train the decoder to emit more than one query.
 for i in range(5):
  for j in range(i+1,5):
   q=templates[0].format(classes[i][1][0]+' и '+classes[j][1][0])
   if norm(q) not in seen:
    seen.add(norm(q)); rows.append({'question':q,'target':classes[i][0]+' ; '+classes[j][0],'group':split})
 splits[split]=rows
vocab=['<bos>','<eos>']+sorted({w for rows in splits.values() for r in rows for w in r['target'].split()})
lookup={w:i for i,w in enumerate(vocab)}
class Model(nn.Module):
 def __init__(self):
  super().__init__(); self.encoder=nn.Linear(1024,96); self.embed=nn.Embedding(len(vocab),24); self.rnn=nn.RNNCell(24,96); self.out=nn.Linear(96,len(vocab))
 def forward(self,x,y):
  h=torch.tanh(self.encoder(x)); token=torch.zeros(len(x),dtype=torch.long); outputs=[]
  for t in range(y.shape[1]):
   h=self.rnn(self.embed(token),h); outputs.append(self.out(h)); token=y[:,t].clamp(min=0)
  return torch.stack(outputs,1)
def tensor(rows):
 x=torch.tensor([features(r['question']) for r in rows]); ids=[[lookup[w] for w in r['target'].split()]+[1] for r in rows]; size=max(map(len,ids)); y=torch.tensor([r+[-100]*(size-len(r)) for r in ids]); return x,y
def decode(model,question):
 with torch.no_grad():
  h=torch.tanh(model.encoder(torch.tensor([features(question)]))); token=torch.tensor([0]); words=[]; confidence=1.
  for _ in range(10):
   h=model.rnn(model.embed(token),h); p=torch.softmax(model.out(h),-1); token=p.argmax(-1); confidence=min(confidence,float(p[0,token.item()]))
   if token.item()==1: break
   words.append(vocab[token.item()])
  return ' '.join(words),confidence
model=Model(); initial=hashlib.sha256(b''.join(p.detach().numpy().tobytes() for p in model.parameters())).hexdigest(); optimizer=torch.optim.Adam(model.parameters(),lr=.006)
x,y=tensor(splits['train']); criterion=nn.CrossEntropyLoss(ignore_index=-100); history=[]; start=time.time(); best=float('inf'); best_state=None
vx,vy=tensor(splits['validation'])
for epoch in range(1,121):
 model.train(); order=torch.randperm(len(x)); total=0
 for batch in order.split(128):
  optimizer.zero_grad(); logits=model(x[batch],y[batch]); loss=criterion(logits.reshape(-1,len(vocab)),y[batch].reshape(-1)); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(),1); optimizer.step(); total+=loss.item()*len(batch)
 model.eval()
 with torch.no_grad(): val=criterion(model(vx,vy).reshape(-1,len(vocab)),vy.reshape(-1)).item()
 if val<best: best=val; best_state={k:v.detach().clone() for k,v in model.state_dict().items()}
 if epoch%20==0: print(epoch,round(total/len(x),5),round(val,5),flush=True)
 history.append({'epoch':epoch,'trainLoss':total/len(x),'validationLoss':val})
model.load_state_dict(best_state)
weights={k:v.tolist() for k,v in model.state_dict().items()}
artifact={'version':1,'architecture':'hashed-character-encoder-autoregressive-rnn','seed':2026,'inputSize':1024,'hiddenSize':96,'vocab':vocab,'weights':weights,'pretrained':False}
model_dir=ROOT/'training/models';model_dir.mkdir(exist_ok=True)
encoded=json.dumps(artifact,separators=(',',':')).encode();(model_dir/'query-model.json').write_bytes(encoded)
report={'seed':2026,'torch':torch.__version__,'device':'cpu','pretrained':False,'parameters':sum(p.numel() for p in model.parameters()),'seconds':time.time()-start,'initialWeightsSha256':initial,'artifactSha256':hashlib.sha256(encoded).hexdigest(),'history':history,'evaluation':{}}
for split,rows in splits.items():
 results=[]
 for r in rows:
  actual,confidence=decode(model,r['question']);results.append(dict(r,prediction=actual,confidence=confidence,passed=actual==r['target']))
 report['evaluation'][split]={'total':len(rows),'passed':sum(r['passed'] for r in results),'cases':results}
 (ROOT/f'training/data/router-{split}.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
report['datasetSha256']={split:hashlib.sha256((ROOT/f'training/data/router-{split}.jsonl').read_bytes()).hexdigest() for split in splits}
report['externalPredictions']=[dict(r,prediction=decode(model,r['question'])[0],confidence=decode(model,r['question'])[1]) for r in external]
(ROOT/'training/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:{a:b for a,b in v.items() if a!='cases'} for k,v in report['evaluation'].items()}),flush=True)
