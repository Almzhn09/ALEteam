"""Prepare short multilingual editorial help copy, not a new frontend or publication."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];out=root/'data/artur/discovery'
translations={
'ru':{'entry':'Как пользоваться','intro':'Начните с поиска. Остальные возможности можно освоить по мере необходимости.','start':'Короткое знакомство','skip':'Пропустить','close':'Закрыть','next':'Далее','back':'Назад','finish':'Готово','repeat':'Посмотреть ещё раз','source':'Источник','automatic':'Сформировано автоматически','noAnswer':'Подходящих открытых материалов не найдено. Попробуйте другой период или название.','steps':[
 ['search','Найдите материал','Введите тему, место или архивный шифр. Затем при необходимости уточните годы и тип документа.','/catalog'],
 ['document','Изучите документ','Откройте карточку: прочитайте описание и посмотрите разрешённую копию. Архивный шифр помогает точно сослаться на материал.',None],
 ['assistant','Спросите помощника','Опишите, что хотите найти. Помощник предложит поиск и покажет доступные источники. Для диалога в текущем прототипе нужно войти.','/assistant'],
 ['reading','Настройте удобное чтение','В меню «Вид сайта» выберите тему и размер текста. Настройки можно изменить в любой момент.',None]],
 'hints':{'aliases':'Проверьте старые названия места: они могли использоваться в документах нужного периода.','explanation':'Автоматические выдержки и словарь помогают читать документ. Сверяйте цитаты со сканом.','related':'У каждой рекомендации указана причина. Сходство текста не доказывает историческую связь.','subscriptions':'Следить за темой можно в своём кабинете. Подписку можно отключить.','recommendations':'Выберите интересные темы или отключите персонализацию.'}},
'kk':{'entry':'Қалай пайдалануға болады','intro':'Іздеуден бастаңыз. Қалған мүмкіндіктерді қажет болғанда меңгеруге болады.','start':'Қысқаша танысу','skip':'Өткізіп жіберу','close':'Жабу','next':'Келесі','back':'Артқа','finish':'Дайын','repeat':'Қайта қарау','source':'Дереккөз','automatic':'Автоматты түрде жасалған','noAnswer':'Сәйкес ашық материалдар табылмады. Басқа кезеңді немесе атауды қолданып көріңіз.','steps':[
 ['search','Материалды табыңыз','Тақырыпты, орынды немесе архивтік шифрды енгізіңіз. Қажет болса, жылдар мен құжат түрін нақтылаңыз.','/catalog'],
 ['document','Құжатты зерттеңіз','Карточканы ашып, сипаттамасын және рұқсат етілген көшірмені қараңыз. Архивтік шифр материалға дәл сілтеме жасауға көмектеседі.',None],
 ['assistant','Көмекшіден сұраңыз','Не тапқыңыз келетінін жазыңыз. Көмекші іздеуді ұсынып, қолжетімді дереккөздерді көрсетеді. Қазіргі прототипте диалог үшін кіру қажет.','/assistant'],
 ['reading','Оқуды ыңғайлаңыз','«Сайт көрінісі» мәзірінен тақырып пен мәтін өлшемін таңдаңыз. Баптауларды кез келген уақытта өзгертуге болады.',None]],
 'hints':{'aliases':'Орынның бұрынғы атауларын тексеріңіз: қажетті кезеңдегі құжаттарда сол атаулар қолданылуы мүмкін.','explanation':'Автоматты үзінділер мен сөздік құжатты оқуға көмектеседі. Дәйексөздерді сканмен салыстырыңыз.','related':'Әр ұсыныстың себебі көрсетілген. Мәтін ұқсастығы тарихи байланысты дәлелдемейді.','subscriptions':'Жеке кабинетте тақырыпты бақылауға болады. Жазылымды өшіруге болады.','recommendations':'Қызықты тақырыптарды таңдаңыз немесе жекелендіруді өшіріңіз.'}},
'en':{'entry':'How to use this site','intro':'Start with search. Explore the other tools when you need them.','start':'Quick introduction','skip':'Skip','close':'Close','next':'Next','back':'Back','finish':'Done','repeat':'View again','source':'Source','automatic':'Generated automatically','noAnswer':'No matching public materials were found. Try another period or name.','steps':[
 ['search','Find a material','Enter a topic, place or archival reference. Narrow the years and document type if needed.','/catalog'],
 ['document','Explore a document','Open the record, read its description and view the permitted copy. Use the archival reference to cite it accurately.',None],
 ['assistant','Ask the assistant','Describe what you want to find. The assistant suggests searches and shows available sources. The current prototype requires sign-in for a conversation.','/assistant'],
 ['reading','Make reading comfortable','Choose a theme and text size in the reading settings. You can change them at any time.',None]],
 'hints':{'aliases':'Check historical place names: records from your period may use them.','explanation':'Automatic excerpts and the glossary help you read a document. Compare quotations with the scan.','related':'Each suggestion explains its reason. Similar wording does not prove a historical connection.','subscriptions':'Follow a topic in your account. You can unsubscribe at any time.','recommendations':'Choose topics you like or turn personalization off.'}},
}
for locale,data in translations.items():
 data['steps']=[{'id':id,'title':title,'description':description,'href':href,'requires':['displayPreferences'] if id=='reading' else ['assistant'] if id=='assistant' else []} for id,title,description,href in data['steps']]
package={'version':1,'status':'DRAFT','rights':'CC0-1.0; ALEteam editorial help copy, AI-assisted draft','review':{'ru':'editorial draft','kk':'native review pending','en':'native review pending'},'behavior':{'automaticStart':False,'requiresLogin':False,'stepsMayBeSkipped':True,'closeKeepsRouteAndInput':True,'restoreEntryFocus':True,'repeatAvailable':True,'persistTourProgress':False,'showOnlyAvailableCapabilities':True},'translations':translations}
(out/'help-copy.json').write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')
print('Prepared RU/KK/EN copy for four optional help steps; frontend implementation remains COL-F06.')
