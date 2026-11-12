"""Rebuild source-grounded discovery drafts. Standard library only; never publishes."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'sources/archive-20261110'; OUT=ROOT/'data/artur/discovery'
OUT.mkdir(parents=True,exist_ok=True)
def evidence(source,anchor):
 p=next((SRC/'text').glob(source+'*'));lines=p.read_text().splitlines();matches=[(i+1,l) for i,l in enumerate(lines) if anchor in l]
 assert len(matches)==1,(source,anchor,len(matches))
 line,quote=matches[0]
 return {'sourceId':source,'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'line':line,'quote':quote.strip()}
def alias(name,locale,forms=(),historical=False,transliteration=False):
 return {'name':name,'locale':locale,'forms':list(forms),'historical':historical,'transliteration':transliteration}
history=evidence('S02','На основании Указа Президента Республики Казахстан от 28 декабря 2018 года № 821')
places=[
 {'id':'ust-kamenogorsk','name':{'ru':'Усть-Каменогорск','kk':'Өскемен','en':'Ust-Kamenogorsk'},'ambiguousNames':[], 'aliases':[alias('Усть-Каменогорск','ru',['Усть-Каменогорска','Усть-Каменогорске','Усть Каменогорск']),alias('Өскемен','kk',['Өскеменде','Өскеменнің','Өскеменге']),alias('Ust-Kamenogorsk','en',['Ust Kamenogorsk'],transliteration=True),alias('Oskemen','en',['Öskemen'],transliteration=True)],'evidence':[evidence('S05','Адрес: Республика Казахстан'),evidence('S03--календарь 2026','3 қазан | Өскеменде')]},
 {'id':'ridder','name':{'ru':'Риддер','kk':'Риддер','en':'Ridder'},'ambiguousNames':[],'aliases':[alias('Риддер','ru',['Риддера','Риддере']),alias('Лениногорск','ru',['Лениногорска','Лениногорске'],True),alias('Ridder','en',transliteration=True),alias('Leninogorsk','en',historical=True,transliteration=True)],'evidence':[evidence('S03--календарь 2026','со дня переименования г.Риддер в Лениногорск')],'nameChange':{'year':1941,'direction':'Риддер → Лениногорск','returnToRidderYear':None,'note':'Year of return not established by this evidence; do not invent alias validity end.'}},
 {'id':'altay-city','name':{'ru':'Алтай','kk':'Алтай','en':'Altay'},'ambiguousNames':['Алтай','Алтая','Алтае','Алтайда','Altay','Altai'],'aliases':[alias('Алтай','ru',['Алтая','Алтае']),alias('Зыряновск','ru',['Зыряновска','Зыряновске'],True),alias('Зырян','kk',['Зырянда'],True),alias('Алтай','kk',['Алтайда']),alias('Altay','en',['Altai'],transliteration=True),alias('Zyryanovsk','en',historical=True,transliteration=True)],'evidence':[history,evidence('S03--календарь 2026','1791 ж.')],'nameChange':{'year':2018,'direction':'Зыряновск → Алтай','note':'S02 cites decree of 2018-12-28; 2019-02-11 is branch registration, not city renaming.'}},
]
for p in places:p.update(status='DRAFT',coordinates=None,review='source_checked_not_archive_approved',translationReview='en project transliterations; native review pending')
events=[]
def event(id,place,source,anchor,year,month=None,day=None):
 ref=evidence(source,anchor);title=ref['quote'].split(' | ',1)[-1]
 events.append({'id':id,'placeId':place,'status':'DRAFT','publicationAllowed':False,'locale':'ru','title':title,'date':{'year':year,**({'month':month} if month else {}),**({'day':day} if day else {}),'precision':'day' if day else 'month' if month else 'year'},'dateBasis':'source assertion; calendar entries are anniversary descriptions, not original archival documents','evidence':[ref],'documentIds':[],'coordinates':None})
event('ust-founded','ust-kamenogorsk','S03--календарь 2025','305 лет (1720)',1720,8,30)
event('ust-school','ust-kamenogorsk','S03--календарь 2026','со дня открытия в г.Усть-Каменогорске Мариинского',1901,8)
event('ust-titanium','ust-kamenogorsk','S03--календарь 2025','сдачи в эксплуатацию Усть-Каменогорского титаномагниевого комбината',1965,3,27)
event('ridder-founded','ridder','S03--календарь 2026','со дня основания г.Риддер',1786,5)
event('ridder-renamed','ridder','S03--календарь 2026','со дня переименования г.Риддер в Лениногорск',1941,2,6)
event('ridder-museum','ridder','S03--календарь 2026','со дня образования историко- краеведческого музея',1961,7,1)
event('altay-founded','altay-city','S03--календарь 2026','235 лет со дня основания г.Зыряновск',1791)
event('altay-city-status','altay-city','S03--календарь 2026','со дня преобразования п.Зыряновск в город',1941,1,17)
events.append({'id':'altay-renamed','placeId':'altay-city','status':'DRAFT','publicationAllowed':False,'locale':'ru','title':'Переименование Зыряновска в Алтай по указу №821','date':{'year':2018,'month':12,'day':28,'precision':'day'},'dateBasis':'S02 cites decree date; branch re-registration is a different event','evidence':[history],'documentIds':[],'coordinates':None})
issues=[
 {'id':'CAL-01','sourceId':'S03','record':'2026 / Ефим Пермитин','issue':'RU lifetime1896–1971; KK1896–1917','action':'exclude biography inference until review'},
 {'id':'CAL-02','sourceId':'S03','record':'2025 / Евгений Курдаков','issue':'RU and KK both80 лет/жыл(1940); arithmetic2025–1940=85; previous audit incorrectly said KK85','action':'retain original; review before public correction'},
 {'id':'CAL-03','sourceId':'S03','record':'2026 / телефонная станция Усть-Каменогорска','issue':'RU70 лет(1946), KK80; arithmetic2026–1946=80','action':'exclude anniversary count until review'},
 {'id':'CAL-04','sourceId':'S03','record':'2026 / высшая начальная школа1886','issue':'RU130 лет, KK140; arithmetic2026–1886=140','action':'exclude anniversary count until review'},
 {'id':'FUND-01','sourceId':'S09','record':'Фонды/газеты','issue':'Link labels2026; downloaded newspapers explicitly2018, XLSB filenames2018; historical titles repeat fund number','action':'no fabricated2026 refresh; group history, not rows as documents'},
 {'id':'BRANCH-01','sourceId':'S01','record':'Глубокое/Зайсан/Марқакөл','issue':'Suspicious email domains in first2, missing phone in third; no coordinates/hours','action':'preserve raw values; require contact review'},
 {'id':'DECREE-01','sourceId':'S06','record':'Постановление142','issue':'Creates/renames branches, not price list; OCR handwritten requisites uncertain','action':'not used as prices'},
 {'id':'ALIAS-01','sourceId':'S02','record':'Алтай/Зыряновск','issue':'2018 city decree vs2019 branch registration','action':'do not conflate event dates; Altay region/city needs clarification'},
]
topics=[{'id':i,'labels':dict(zip(['ru','kk','en'],names)),'review':'KK/EN editorial draft'} for i,names in [('cities',['История городов','Қалалар тарихы','City history']),('photos',['Фотографии','Фотосуреттер','Photographs']),('newspapers',['Газеты','Газеттер','Newspapers']),('education',['Школы и образование','Мектептер мен білім','Schools and education']),('industry',['Промышленность','Өнеркәсіп','Industry']),('people',['Люди региона','Өңір тұлғалары','People of the region']),('archives',['История архива','Архив тарихы','Archive history'])]]
titles={'ust-founded':'Основание Усть-Каменогорска','ust-school':'Открытие Мариинского женского училища в Усть-Каменогорске','ust-titanium':'Ввод в эксплуатацию Усть-Каменогорского титаномагниевого комбината','ridder-founded':'Основание Риддера','ridder-renamed':'Переименование Риддера в Лениногорск','ridder-museum':'Открытие историко-краеведческого музея Риддера','altay-founded':'Основание Зыряновска','altay-city-status':'Преобразование посёлка Зыряновск в город','altay-renamed':'Переименование Зыряновска в Алтай'}
for e in events:
 e['sourceAnniversaryText']=e['title'];e['title']=titles[e['id']];e['titleProvenance']='ALEteam editorial heading; facts in exact source quotation'
for filename,value in [('places.json',places),('place-events.json',events),('issues.json',issues),('topics.json',topics)]:
 (OUT/filename).write_text(json.dumps({'version':1,'draftsOnly':True,'records':value},ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(places),'place drafts,',len(events),'source-grounded event drafts,',len(issues),'issues,',len(topics),'topics. No database writes/publication.')
