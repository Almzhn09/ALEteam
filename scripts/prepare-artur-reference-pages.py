"""Prepare brief informational pages from inspected official-source files; drafts only."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];folder=root/'sources/archive-reference-20261110';manifest=json.loads((folder/'manifest.json').read_text());refs={f['id']:f for f in manifest['files']}
def link(id,label):return {'label':label,'url':refs[id]['sourceUrl']}
copy={
'paid-services-info':{'sources':['R01'],'texts':{
 'ru':('Платные услуги: справочная информация','На официальном сайте архива размещено постановление об утверждении прейскуранта. На первой странице скана читаются реквизиты: 15 декабря 2023 года №289. Документ и цены представлены для ознакомления; актуальность и применимость нужно уточнять у архива. Этот сайт не оформляет заказы, не рассчитывает стоимость и не принимает оплату.'),
 'kk':('Ақылы қызметтер туралы анықтамалық ақпарат','Архивтің ресми сайтында прейскурантты бекіту туралы қаулы жарияланған. Сканның бірінші бетінде 2023 жылғы15 желтоқсандағы №289 деректемелері көрінеді. Құжат пен бағалар танысу үшін берілген; өзектілігі мен қолданылуын архивтен нақтылау қажет. Бұл сайт тапсырыс рәсімдемейді, құнын есептемейді және төлем қабылдамайды.'),
 'en':('Paid services: reference information','The archive website provides a resolution approving a price list. The first scanned page reads15 December2023, No.289. The document and prices are for reference; confirm their currency and applicability with the archive. This site does not place orders, calculate charges or accept payments.')}},
'public-services-info':{'sources':['R03','R04','R05'],'texts':{
 'ru':('Государственная услуга: где найти официальную информацию','На сайте архива доступны закон о государственных услугах в редакции2018 года, правила по приказу №159 от29 мая2020 года и отчёт за2025 год. Эти сохранённые версии не подтверждают действующую редакцию законодательства на сегодня. Проверьте актуальные условия в официальном источнике или у архива. Для оформления используйте обозначенный внешний государственный ресурс. Этот сайт не принимает заявления и не отслеживает обращения.'),
 'kk':('Мемлекеттік қызмет: ресми ақпаратты қайдан табуға болады','Архив сайтында мемлекеттік қызметтер туралы заңның2018 жылғы редакциясы,2020 жылғы29 мамырдағы №159 бұйрыққа сәйкес қағидалар және2025 жылғы есеп бар. Бұл сақталған нұсқалар заңнаманың бүгінгі қолданыстағы редакциясын растамайды. Өзекті талаптарды ресми дереккөзден немесе архивтен тексеріңіз. Рәсімдеу үшін көрсетілген сыртқы мемлекеттік ресурсқа өтіңіз. Бұл сайт өтініш қабылдамайды және олардың мәртебесін қадағаламайды.'),
 'en':('Public services: finding official information','The archive website provides a2018 version of the public-services law, rules under Order No.159 of29 May2020, and a2025 report. These saved versions do not establish the law currently in force. Check current conditions with an official source or the archive. Use the clearly labelled external government resource to apply. This site does not accept or track applications.')}},
'reading-room-info':{'sources':['R02'],'texts':{
 'ru':('Читальный зал','В предоставленном документе «Контакты» указан график читального зала: понедельник–пятница,9:00–16:00. На старом сайте опубликованы правила, утверждённые приказом №58 от2 октября2000 года. Их актуальность требует проверки; эта сохранённая версия не объявляется действующим регламентом. Перед посещением уточните график и правила у архива. Запись и заказ дел на этом сайте не выполняются.'),
 'kk':('Оқу залы','Берілген «Контакты» құжатында оқу залының кестесі көрсетілген: дүйсенбі–жұма,9:00–16:00. Ескі сайтта2000 жылғы2 қазандағы №58 бұйрықпен бекітілген қағидалар жарияланған. Олардың өзектілігін тексеру қажет; сақталған нұсқа қолданыстағы регламент ретінде ұсынылмайды. Келмес бұрын кесте мен қағидаларды архивтен нақтылаңыз. Бұл сайтта жазылу және істерге тапсырыс беру жүргізілмейді.'),
 'en':('Reading room','The supplied Contacts document lists reading-room hours as Monday–Friday,9:00–16:00. The old website publishes rules approved by Order No.58 of2 October2000. Their current validity requires checking; the saved version is not presented as the current regulation. Confirm hours and rules with the archive before visiting. This site does not book visits or order files.')}}
}
records=[]
for key,item in copy.items():
 def payload(locale):
  title,body=item['texts'][locale]
  # Add ordinary spaces around dates/numbers for readable prose; editorial copy is separate from source transcription.
  import re
  body=re.sub(r'(?<=[а-яА-Яa-zA-ZәғқңөұүһіӘҒҚҢӨҰҮҺІ])(?=\d)', ' ',body)
  body=re.sub(r'(?<=\d)(?=[а-яА-Яa-zA-ZәғқңөұүһіӘҒҚҢӨҰҮҺІ])', ' ',body)
  body=body.replace(',9:',', 9:').replace('No.289','No. 289').replace('15 December2023','15 December 2023').replace('of29','of 29').replace('May2020','May 2020').replace('of2','of 2').replace('October2000','October 2000')
  notes='; '.join(i+': '+refs[i]['sha256'] for i in item['sources'])
  links=[link(i,refs[i]['label'][:120]) for i in item['sources']]
  if key=='public-services-info':links += [{'label':{'ru':'Внешний портал eGov','kk':'Сыртқы eGov порталы','en':'External eGov portal'}[locale],'url':'https://egov.kz/'},{'label':{'ru':'Официальная база «Әділет»','kk':'Ресми «Әділет» базасы','en':'Official Adilet legal database'}[locale],'url':'https://adilet.zan.kz/rus'}]
  if key=='reading-room-info':notes+='; S05 Контакты.docx; hours differ from old website, confirmation pending'
  return {'title':title,'body':body,'rights':'Открытые материалы официального сайта архива; актуальность, права и перевод проверяет редактор.','sourceUrl':refs[item['sources'][0]]['parentUrl'],'sourceNote':notes[:1000],'links':links}
 records.append({'sourceKey':key,'requiresReview':True,'publicationAllowed':False,'create':{'slug':'archive-'+key,'kind':'PAGE','branchId':None,'isDemo':False,'locale':'ru','payload':payload('ru')},'translations':[{'locale':l,'payload':payload(l)} for l in ['kk','en']]})
(root/'data/artur/discovery/reference-page-drafts.json').write_text(json.dumps({'version':1,'draftsOnly':True,'records':records,'review':{'legalCurrency':'not independently verified; original document dates disclosed','translation':'KK/EN editorial drafts; native review pending'}},ensure_ascii=False,indent=2)+'\n')
print('Prepared3 informational pages /9 language drafts; no publication or service workflows.')
