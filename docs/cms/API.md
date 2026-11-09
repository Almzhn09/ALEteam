# API CMS для Алинура и Артура

Продолжение: [редактирование, публикация и поиск каталога](../catalog/API.md).

Все пути ниже начинаются с `/api`. Контракты для клиента: [`src/contracts/cms.ts`](../../src/contracts/cms.ts). Запросы идут на тот же origin с cookie Better Auth; изменения требуют `Content-Type: application/json` и точный Origin из BETTER_AUTH_URL. `fetch(..., {credentials:'same-origin'})`. Секреты в клиентский код не передаются.

## Доступ и форматы

Любой `/admin/*` сначала проверяет активную сотрудническую сессию, затем право и область. `branchId:null` — глобальный материал; назначение на один филиал не даёт доступа к нему. Списки фильтруются по доступным филиалам, прямые изменения проверяются отдельно.

| Метод/путь | Право | Область |
|---|---|---|
| GET /admin/me | Любое назначенное право | Собственный аккаунт/актуальные grants |
| GET, PUT /admin/roles | staff.roles.manage | Глобально |
| GET, POST /admin/users; PATCH /admin/users/:id | staff.users.manage | Глобально |
| POST, DELETE /admin/assignments | staff.roles.manage | Глобально |
| GET /admin/audit | audit.read | Глобально |
| GET /admin/branches | branches.manage или catalog.read или content.read | Объединение областей |
| POST /admin/branches | branches.manage | Глобально |
| PATCH /admin/branches/:id | branches.manage | Филиал |
| GET /admin/catalog/{funds,inventories,cases,documents} | catalog.read | Филиал фонда |
| POST /admin/catalog/{funds,inventories,cases,documents} | catalog.write | Филиал фонда |
| GET /admin/content; GET /admin/content/:id | content.read | Материал |
| POST /admin/content | content.write | branchId; SETTING требует settings.manage |
| POST /admin/content/:id/revisions; PATCH /admin/revisions/:id | content.write | Материал; SETTING дополнительно settings.manage |
| POST /admin/revisions/:id/transition | По состоянию ниже | Материал; SETTING дополнительно settings.manage |
| GET /admin/revisions/:id/events | content.read | Материал |
| GET /admin/notices | Сотрудник + content.read | Только собственные доступные уведомления |
| GET /content; GET /content/:slug; GET /branches | Публично | Только PUBLISHED выбранного языка |

Списки: `page=1`, `pageSize=20` (1–50), ответ `{items,total,page,pageSize}`. GET /admin/content/:id также возвращает список, отфильтрованный по ID (пустой, если недоступен/отсутствует). Деталь публичной публикации — `{item}` или 404. Время в JSON — ISO 8601. Ответы no-store. Повторные/неизвестные параметры отклоняются.

Ошибка: `{"error":{"code":"STALE_REVISION","message":"Редакция изменилась или недоступна для правки."}}`. Валидация 400 может добавить `fields:[{path,code}]`; 401 — войти заново, 403 — нет прав/другой Origin, 404 — нет доступного ресурса, 409 — конфликт/недопустимый переход/последний администратор, 413 — превышен размер, 429 — повторить по Retry-After. При 409 перечитать редакцию и показать пользователю конфликт, автоматически не перезаписывать.

## Первый администратор

Сначала `npm run db:generate` и `npm run db:migrate`. В локальном приватном окружении (не в Git и не в чате) задать STAFF_ADMIN_EMAIL, STAFF_ADMIN_NAME, STAFF_ADMIN_PASSWORD (12–128 символов), затем `npm run staff:bootstrap`. Команда откажется при наличии активного глобального управляющего ролями или существующего аккаунта с таким email; существующий пользователь не повышается автоматически. Повторный bootstrap — ошибка, восстановление доступа отдельной процедурой.

В Docker команда запускается в tools-контейнере с DATABASE_URL основной БД и этими тремя переменными, переданными через частный `--env-file`; файл не коммитить и не выводить. runtime-контейнер не содержит административного CLI. Демоаккаунты автора/модератора не являются CMS-администраторами.

Вход: POST /auth/sign-in/email `{"email":"...","password":"..."}`; далее GET /admin/me для управления видимостью действий. Сервер всё равно перепроверяет права. Создание сотрудника: POST /admin/users `{email,name,password}`; назначение POST /admin/assignments `{userId,roleId,branchId:null}`. DELETE этого же пути принимает такое же тело. PATCH /admin/users/:id `{isActive:false}` отзывает сессии. PUT /admin/roles `{id,name,permissions:["content.read"]}` заменяет набор прав роли.

## Создание и редакционный путь

POST /admin/content:

```json
{
  "slug":"demo-news-2026",
  "kind":"NEWS",
  "branchId":null,
  "isDemo":true,
  "locale":"ru",
  "payload":{
    "title":"Учебная новость",
    "body":"Демонстрационный текст без HTML.",
    "rights":"ALEteam CC0-1.0",
    "sourceNote":"Оригинальный учебный материал"
  }
}
```

201 `{item}` содержит ContentItem и `revisions[0]` со статусом DRAFT. Для isDemo=false обязателен sourceUrl или sourceNote. Неизвестные поля отклоняются; нельзя передать status/authorId/isPublic/apiKey через payload.

PATCH /admin/revisions/:id принимает **весь** payload и `expectedUpdatedAt` из последнего ответа. Разрешено только в DRAFT/CHANGES_REQUESTED. POST /admin/content/:id/revisions `{locale:"en",payload:{...}}` создаёт следующую версию; незавершённую редакцию того же языка сначала нужно завершить. Payload не копируется и не переводится автоматически.

POST /admin/revisions/:id/transition:

```json
{"status":"IN_REVIEW","expectedUpdatedAt":"2026-11-09T10:00:00.000Z","reason":"Готово к проверке"}
```

| Из → в | Право |
|---|---|
| DRAFT/CHANGES_REQUESTED → IN_REVIEW | content.write |
| IN_REVIEW → CHANGES_REQUESTED/APPROVED | content.review |
| APPROVED → PUBLISHED | content.publish |
| PUBLISHED → ARCHIVED | content.publish |

reason обязателен (3–500 символов), приватен. Автор последней правки не может утвердить себя. Проверка/событие/уведомления фиксируются транзакционно. Предыдущая опубликованная версия того же языка архивируется при замене. Отмена утверждения/возврат опубликованного в черновик не предусмотрены: создайте следующую редакцию. Список редакций — GET /admin/content/:id; история причин — /admin/revisions/:id/events; /admin/notices пока только чтение, без отметки прочитанным.

## Типы материалов, ссылки, языки

PAGE, FAQ, NEWS, COLLECTION, PERSON, EVENT, MEMOIR, EXHIBITION, EXHIBIT, BRANCH_PROFILE, SETTING. Payload общий: title/body/rights, происхождение, date, yearFrom/yearTo, category, tags, SEO, links, documentIds/contentIds/fileIds и **упорядоченные** exhibitIds. Ограничения и точные поля — в контракте/схеме `src/server/cms.ts`; body plain text до 10000 символов, общий JSON до 16384 байт. sourceUrl/links допускают только http(s), без логина/пароля в URL. Контакты, даты и координаты не подтверждаются автоматически.

Для BRANCH_PROFILE обязательны branchId, address, phone, email, hours, latitude, longitude. Филиал создаётся POST /admin/branches `{code,name,isDemo:true}` закрытым; PATCH того же ID `{code,name,isDemo:true,isPublic:true,expectedUpdatedAt}` переключает видимость. Публичный профиль требует и PUBLISHED, и открытого филиала.

GET /content?locale=kk&kind=NEWS&branchId=...&q=...&page=1&pageSize=20. q ищет в title (регистрозависимый поиск); фильтры category/date и произвольная сортировка пока отсутствуют. GET /content/:slug?locale=en не подменяет язык: при отсутствии перевода 404. GET /branches?locale=ru — только видимые опубликованные профили; параметр kind здесь запрещён. Ответ PublicContentItem содержит payload/locale/availableLocales/isDemo без authorId/reviewerId и приватных причин.

Ссылки используют ID сущностей, не редакций. Публикация требует доступных документов/файлов и опубликованных материалов того же языка; exhibitIds допускает только EXHIBIT. Закрытый/снятый источник удаляется из публичных ссылок при чтении; порядок сохраняется. SETTING — только открытые текстовые настройки/ссылки, без ключей интеграций. Подключение меню/главной к этим записям — задача фронтенда.

## Архивная иерархия: первый этап

POST /admin/catalog/funds `{branchId,number:"0007",name,description}`.
POST /admin/catalog/inventories `{fundId,number:"0001",title}`.
POST /admin/catalog/cases `{fundId,inventoryId,number:"0003",title}`.
POST /admin/catalog/documents `{fundId,caseId,title,description,reference,year,type,rights,...}`.

Дополнительные поля документа: yearTo, authorName, organization, locality, originalLanguage, leafCount, storageLocation, accessConditions, internalNotes, isDemo. type пока LETTER/PHOTO/MAP/REPORT. Все номера/шифры строковые. Новая карточка всегда закрыта, копия запрещена. Второй этап добавил редактирование/корзину, согласование архивных карточек, категории/теги, RU/KK/EN тексты и расширенные фильтры: [актуальный контракт](../catalog/API.md). Для каталога используются отдельные строгие payload и внутренние ARCHIVE_DOCUMENT-редакции; общий POST информационной CMS их не создаёт.

Публичный GET /documents/:id выдаёт только явную безопасную проекцию; internalNotes исключены. Открытые метаданные с allowDigitalCopy=false доступны, но files=[], прямой файл и OCR дают 404. Старые API и интерфейс продолжают работать. Новые CMS-материалы ещё не входят в корпус ИИ (TZ-A06).
