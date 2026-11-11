# Реальные материалы: API v2

Контракт добавляет возможности поверх интеграции3869be7; MaterialKey по-прежнему document/cms. Все пути ниже с `/api`. Существующие document/catalog/CMS/upload/import endpoints сохранены.

## Справочники и общий поиск

GET `/directories/funds?q=&number=Р-1 ч.с.&sourceId=s09-funds-general&page=1&pageSize=20&sort=source` →items,total,page,pageSize,kind,sourceVersions. Страницы1–10000, pageSize1–100. sort=source|title, устойчивый ID в конце порядка. q ищет во всех исходных названиях/периодах; number — буквальное равенство, без удаления букв/нулей/пунктуации. GET `/:id` — полная группа строк одного буквального номера; это не утверждённая уникальная архивная сущность и не заявление, что все изменения текста — переименование.

GET `/directories/newspapers` — те же q/sourceId/page/pageSize/sort; заголовок/издатель/тома/годы/примечание — исходные строки. `-/-` сохраняется, физический sourceRow — происхождение строки, не номер архивного документа. В обоих справочниках `/export` — весь подходящий **публичный whitelist JSON** (≤10000), без rawCells/внутренних полей/путей. Пакет содержит1705 групп фондов и1466 газетных строк. Неизвестные держатель/branchId остаютсяnull. Версия2018/подпись2026 не скрывается и не объявляется обновлением на2026.

GET `/search?q=&scope=all|document|cms|fund|newspaper&locale=ru&page=1&pageSize=20` →SearchResult:items,total,counts:{materials,funds,newspapers},page,pageSize,locale. MaterialHit содержит material:MaterialRef +snippet; остальные kind=fund/newspaper — RegistryEntry. Порядок — материалы, фонды, газетные строки; внутри устойчивый порядок источника/ID. category/contentKind/yearFrom/yearTo — AND, исключают справочники, у которых нет этих сопоставимых структурных полей. Новый CMS-поиск допускает явно обозначенный оригинал при отсутствии перевода. Старый `/documents` остаётся поиском архивных документов.

GET `/admin/directories` — глобальный catalog.read, наборы/версия/количества. POST `/admin/directories/import` `{package:"archive-20261110",dryRun:true}` — глобальный catalog.write; dryRun=false требует content.publish, импортирует фиксированный проверенный пакет без дублей. Другой hash того же source ID →409 SOURCE_IMPORT_CONFLICT. Изменение пользователем/снятие набора не перезаписываются повтором. POST `/:datasetId/visibility` `{expectedVisible:true,isPublic:false}` — глобальные catalog.write+content.publish, немедленно убирает набор из выдачи/экспорта/поиска. Устаревшее ожидаемое состояние409.

Подписки `/me/topic-subscriptions` теперь принимают filters.scope=all|document|cms,contentKind,category. q без архивных структурных ограничений подходит и CMS. Фильтры fund/inventory/case/type/reference и несовместимые metadata не теряются: CMS им не соответствует. branchId/tag проверяются. locale подписки — точный язык публикации, язык просмотра уведомления может показывать оригинал. Пример: `{locale:"ru",filters:{scope:"cms",q:"Контакты",category:"contacts"}}`. Повтор source-import не создаёт новую публикацию/уведомление; собственность/отписка/отзыв сохранены.

## Общие материалы, файлы и объяснение

GET `/discovery/materials/cms/:id/attachments?locale=ru` →items:AttachmentRef[],source. DOCX/PDF/PNG/JPEG разрешаются отдельным CMSAttachment, без фиктивного Fund/Document. Master/preview имеют разные ID/href, preview.parentId указывает на master, downloadable=false. Файл привязан к конкретной опубликованной редакции; отзыв редакции/филиала/вложения немедленно закрывает выдачу. source.label/version и SHA — происхождение, а не присвоенная подпись госархива.

GET `/material-files/:id[?download=1]`: исходные байты с проверкой размера/SHA, nosniff/sandbox/no-store. DOCX всегда attachment, PDF/изображения могут открываться inline. Превью скачивать отдельным download нельзя. Внутренние storageKey/token клиент не задаёт и не получает.

GET `/material-files/:id/text[?page=6]`: реальный текст DOCX по paragraph или PDF/OCR по page, sourceSha256/textSha256,engine,isOcr,corrected,fragments,start/end,truncated,totalPages/publicationPages. Суммарно≤12000 символов; page позволяет прочитать отдельную действительную страницу. Номера страниц DOCX не выдумываются. S06 — исходный PDF из6 страниц, постановление№142 расположено на4–6: превью показывает4-ю страницу, выдержки выбираются из4–6. Сам оригинал не изменялся. OCR6 страниц выполнен Tesseract rus+kaz, оценка — измеренное среднее word-recognition confidence, не вероятность истинности факта; исправленное распознавание не имитируется.

POST `/discovery/materials/:kind/:id/explanation` `{locale:"ru",sourceRevision?:"sha256"}` →прежний Explanation. Для CMS доступны исходные вложения, иначе точный опубликованный body с абзацами. Артуров extractive/glossary engine сохранён; URL allowlist расширен только внутренним material-files/text. Содержание цитат/страницы/абзацы/смещения пересобираются и проверяются транспортом; версия/права/исходные байты сверяются повторно. Устаревшая версия409 SOURCE_CHANGED, отсутствующая копия404, отсутствие текста/качество — честный отказ. Свободного генеративного пересказа/внешней LLM не добавлено. Старый `/documents/:id/explanation` работает.

GET `/discovery/materials/:kind/:id/related?locale=ru&limit=5` — прежние MaterialRef/причины, теперь target и кандидаты обоих типов. Проверенные LINK отдельно от текстового сходства. Старый `/documents/:id/related` сохранён.

## Админское CMS-вложение

POST `/admin/content/:id/attachments`:

```json
{"revisionId":"<revision>","name":"Контакты.docx","mimeType":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","expectedBytes":12345,"expectedSha256":"<sha256>","rights":"<основание>","sourceNote":"S05","sourceLabel":"Контакты","sourceVersion":"Переданный файл"}
```

content.write в области материала; не SETTING/ARCHIVE_DOCUMENT, не больше20 активных вложений. DRAFT или действующая PUBLISHED редакция. GET списка — content.read. GET `/admin/material-files/:id` — приватный статус без storageKey/receiveToken/parsed bytes.

PUT `/:id/content` — raw bytes, MIME и `If-Match:"<updatedAt>"`, только uploader. Тот же immutable stageUpload,20MiB, SHA/размер/сигнатура; DOCX дополнительно проходит bounded ZIP/XML parser без DTD/макросов/встроенных OLE. Следует QUARANTINED. GET content — приватное скачивание рецензентом.

POST `/:id/review` `{expectedUpdatedAt,decision:"APPROVE",rightsConfirmed:true,reason}` — content.review, другой актор; полноценный parser/превью обязательны. REJECT разрешён явно. POST `/publish` `{expectedUpdatedAt,reason}` — content.publish и действующая опубликованная родительская редакция. `/withdraw` снимает файл. `/retry` — автор после FAILED/истёкшего RECEIVING, исходные SHA/размер не меняются. Неизвестные поля400, чужая область403, повтор устаревшего штампа409, неподходящий формат422. Дочерний процесс≤20s/128MiB JS heap,≤2 на процесс приложения; это не антивирус/ОС-песочница. Антивирус по-прежнему not-configured.
