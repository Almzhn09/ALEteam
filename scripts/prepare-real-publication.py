"""R-A01/A03: deterministic editorial publication packet from preserved user sources.

Does not connect to a database, invent archive records or change CMS permissions.
The packet is ready for the existing author/reviewer publication workflow.
"""
from pathlib import Path
import ctypes as C
import hashlib
import json
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/artur/real-content-v2'
SRC = ROOT / 'sources/archive-20261110'
REG = json.loads((SRC / 'manifest.json').read_text())['sources']
SOURCES = {s['id']: s for s in REG}
OUT.mkdir(parents=True, exist_ok=True)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def archive_members(path):
    """Read-only 7z extraction using libarchive; no shell, links or path traversal."""
    lib = C.CDLL('libarchive.so.13')
    def bind(name, result, args):
        f = getattr(lib, name); f.restype = result; f.argtypes = args
        return f
    new = bind('archive_read_new', C.c_void_p, [])
    support = bind('archive_read_support_format_all', C.c_int, [C.c_void_p])
    filters = bind('archive_read_support_filter_all', C.c_int, [C.c_void_p])
    open_ = bind('archive_read_open_filename', C.c_int, [C.c_void_p, C.c_char_p, C.c_size_t])
    next_ = bind('archive_read_next_header', C.c_int, [C.c_void_p, C.POINTER(C.c_void_p)])
    name = bind('archive_entry_pathname', C.c_char_p, [C.c_void_p])
    size = bind('archive_entry_size', C.c_int64, [C.c_void_p])
    type_ = bind('archive_entry_filetype', C.c_uint, [C.c_void_p])
    read = bind('archive_read_data', C.c_ssize_t, [C.c_void_p, C.c_void_p, C.c_size_t])
    free = bind('archive_read_free', C.c_int, [C.c_void_p])
    handle = new(); support(handle); filters(handle)
    assert open_(handle, str(path).encode(), 65536) == 0
    result = {}; total = 0
    try:
        entry = C.c_void_p()
        while True:
            code = next_(handle, C.byref(entry))
            if code == 1: break
            assert code >= 0
            key = name(entry).decode(); expected = size(entry)
            assert not Path(key).is_absolute() and '..' not in Path(key).parts
            if type_(entry) == 0o040000: continue
            assert type_(entry) == 0o100000 and 0 <= expected <= 32 * 1024 * 1024
            total += expected; assert total <= 100 * 1024 * 1024
            buffer = C.create_string_buffer(65536); chunks = []
            while True:
                count = read(handle, buffer, len(buffer)); assert count >= 0
                if not count: break
                chunks.append(buffer.raw[:count])
            content = b''.join(chunks); assert len(content) == expected
            result[key] = content
    finally:
        free(handle)
    return result


files = []
archive_data = {}


def attachment(source_id, member=None):
    """Return a logical file key; IDs/URLs are resolved only by the import adapter."""
    s = SOURCES[source_id]
    if member:
        if source_id not in archive_data:
            archive_data[source_id] = archive_members(SRC / s['original'])
        data = archive_data[source_id][member]
        expected = next(m for m in s['members'] if m['path'] == member)
        assert sha(data) == expected['sha256']
        text = next((t for t in s['texts'] if t['member'] == member), None)
        filename = Path(member).name
        dest = ROOT / 'sources/archive-publication-20261111/attachments' / filename
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    else:
        dest = SRC / s['original']; data = dest.read_bytes()
        assert sha(data) == s['sha256']
        filename = s['file']; text = next(iter(s.get('texts', [])), None)
    key = source_id + ':' + (member or s['file'])
    if not any(f['key'] == key for f in files):
        files.append({'key': key, 'sourceId': source_id, 'sourceMember': member,
                      'path': str(dest.relative_to(ROOT)), 'filename': filename,
                      'sha256': sha(data), 'bytes': len(data),
                      'textPath': str((SRC / text['path']).relative_to(ROOT)) if text else None,
                      'textQuality': 'machine_unverified' if filename.endswith('.pdf') else 'source_text',
                      'access': {'view': True, 'download': True},
                      'note': 'Use existing file policy; no fictitious ArchiveDocument parent.'})
    return key


rights = 'Материал предоставлен пользователем для наполнения сайта Государственного архива ВКО; оригинал сохранён.'
records = []


def add(key, group, section, source_ids, locale, payload, file_keys=(), branch=None):
    assert 0 < len(payload['body']) <= 10000
    assert not re.search('DEMO-|ДЕМОНСТРАЦИОННЫЙ МАТЕРИАЛ', payload['body'])
    source_rights = ('Материал официального сайта Государственного архива ВКО; ссылка и сохранённая редакция указаны у источника.' if all(s.startswith('R') for s in source_ids) else rights)
    source_names = list(dict.fromkeys(f['filename'] for f in files if f['key'] in file_keys))
    if not source_names:
        source_names = [SOURCES[s]['file'] for s in source_ids if s in SOURCES]
    source_note = '; '.join(source_names)
    if branch:
        source_note += ', лист «Книга», строка ' + branch.split('-')[-1]
    payload = dict(payload, rights=source_rights, sourceNote=source_note + '. Материалы архива.')
    records.append({'sourceKey': key, 'materialKey': group, 'section': section,
                    'decision': 'PUBLISH', 'sourceIds': source_ids,
                    'contentSha256': sha(payload['body'].encode()),
                    'request': {'slug': group, 'kind': 'BRANCH_PROFILE' if branch else 'PAGE',
                                'branchId': None, 'isDemo': False, 'locale': locale, 'payload': payload},
                    'attachments': list(file_keys), 'branchSourceKey': branch,
                    'publication': {'workflow': 'existing_author_reviewer',
                                    'requestedBy': 'user', 'externalBlanketApprovalRequired': False}})


old = json.loads((ROOT / 'data/archive-20261110/cms-draft-requests.json').read_text())['records']
for row in old:
    key = row['sourceKey']; sid = row['sourceId'].split('/')[0]; locale = row['request']['locale']
    group = row['request']['slug']; section = {'S02': 'history', 'S03': 'calendar', 'S04': 'compliance', 'S05': 'contacts', 'S07': 'structure'}[sid]
    p = row['request']['payload'].copy()
    if sid == 'S03':
        year = re.search(r'20\d\d', key)[0]
        member = next(m['path'] for m in SOURCES[sid]['members'] if year in m['path'])
        group = 'archive-calendar-' + year
        p['category'] = 'calendar'; p['tags'] = ['calendar', year]
        if year in ['2025', '2026']:
            p['body'] += '\n\n' + ('В отдельных юбилейных числах и биографических датах исходника есть разночтения. Текст сохранён; спорные сведения не используются как проверенные события хронологии.' if locale == 'ru' else 'Түпнұсқаның кейбір мерейтойлық сандары мен өмірбаяндық даталарында қайшылықтар бар. Мәтін сақталған; даулы мәліметтер хронологияның тексерілген оқиғалары ретінде қолданылмайды.')
    elif sid == 'S04':
        member = next(t['member'] for t in SOURCES[sid]['texts'] if t['path'].endswith(row['sourceId'].split('/')[-1] + '.txt')) if '/' in row['sourceId'] else None
        # The original preparation identifies the four DOCX sources by ordinal keys.
        if not member:
            name = {'compliance-14': 'Информация каз.docx', 'compliance-15': 'Информация о работе комплаенс службы.docx', 'compliance-16': 'О проведении внутреннего анализа коррупционных рисков.docx', 'compliance-17': 'Сыбайлас жемқорлық тәуекелдеріне ішкі талдау жүргізу туралы.docx'}[key]
            member = next(m['path'] for m in SOURCES[sid]['members'] if Path(m['path']).name == name)
        group = 'archive-compliance-information' if key in ['compliance-14', 'compliance-15'] else 'archive-compliance-analysis-notice'
        if key == 'compliance-14': p['title'] = 'Комплаенс қызметінің жұмысы туралы ақпарат'
    else:
        member = None
    if sid == 'S05':
        p.update(address='Республика Казахстан, 070000, г. Усть-Каменогорск, ул. Бейбітшілік, 26/1 (Головкова, 26/1)', phone='8 (7232) 25-59-76', email='arhiv-ukg@yandex.kz', hours='Понедельник–пятница: архив 8:00–17:00; читальный зал 9:00–16:00.')
        p['links'] = [{'label': 'Instagram · @arhiv_vko', 'url': 'https://www.instagram.com/arhiv_vko/'}, {'label': 'Facebook', 'url': 'https://www.facebook.com/vkoarhiv'}]
        # A temporary invitation URL is not a stable profile link or contact fact.
        p['body'] = re.sub(r'Ссылка:\s*https://www\.instagram\.com/invites/contact/[^\s]+', 'Профиль: @arhiv_vko', p['body'])
    add(key, group, section, [sid], locale, p, [attachment(sid, member)])

# Original PDF plus concise visually checked description; full OCR is not made a verified text.
decree = json.loads((ROOT / 'data/artur/discovery/branch-decree-review.json').read_text())
for locale, title, body in [
    ('ru', decree['title'], 'Постановление акимата Восточно-Казахстанской области от 2 июня 2026 года №142 о создании и переименовании филиалов Государственного архива ВКО. Полный текст на казахском и русском языках доступен в приложенном PDF. Русская часть — страницы 4–6.'),
    ('kk', 'Шығыс Қазақстан облысының архив мекемелерінің кейбір мәселелері туралы', 'Шығыс Қазақстан облысы әкімдігінің 2026 жылғы 2 маусымдағы №142 қаулысы. Құжат мемлекеттік архив филиалдарын құру және қайта атау туралы. Қазақша және орысша толық мәтін PDF файлында берілген. Қазақша бөлігі — 1–3-беттер.')]:
    add('decree-142-' + locale, 'archive-decree-142', 'structure', ['S06'], locale,
        {'title': title, 'body': body, 'date': '2026-06-02', 'tags': ['branches', 'decree-142']}, [attachment('S06')])

# The eight scanned compliance PDFs are actual downloadable sources, not fabricated cases.
pdf_groups = [
    ('analysis-2026', 'Аналитическая справка ВАКР 2026.pdf', 'Аналитикалық анықтама СЖТІТ 2026.pdf', 'Аналитическая справка по итогам внутреннего анализа коррупционных рисков', 'Сыбайлас жемқорлық тәуекелдеріне ішкі талдау қорытындысы бойынша аналитикалық анықтама'),
    ('positions', 'Перечень должностей.pdf', 'Перечень должностей каз.pdf', 'Перечень должностей, подверженных коррупционным рискам', 'Сыбайлас жемқорлық тәуекелдеріне бейім лауазымдардың тізбесі'),
    ('action-plan', 'План мероприятий рус.pdf', 'План мероприятий каз.pdf', 'План мероприятий по результатам внутреннего анализа', 'Ішкі талдау нәтижелері бойынша іс-шаралар жоспары'),
    ('regulation', 'Положение об антикор..pdf', 'Сыбайлас жемқорлыққа қарсы комплаене қызметі туралы ереже.pdf', 'Положение об антикоррупционной комплаенс-службе', 'Сыбайлас жемқорлыққа қарсы комплаенс қызметі туралы ереже')]
for group, ru, kk, title_ru, title_kk in pdf_groups:
    for locale, filename, title in [('ru', ru, title_ru), ('kk', kk, title_kk)]:
        member = next(m['path'] for m in SOURCES['S04']['members'] if Path(m['path']).name == filename)
        body = title + ('. Полный документ доступен в приложенном PDF.' if locale == 'ru' else '. Толық құжат PDF файлында берілген.')
        add('compliance-' + group + '-' + locale, 'archive-compliance-' + group, 'compliance', ['S04'], locale, {'title': title, 'body': body, 'tags': ['compliance']}, [attachment('S04', member)])

officer = next(t for t in SOURCES['S04']['texts'] if t['member'].endswith('Комплаенс-офицер.txt'))
name = (SRC / officer['path']).read_text().strip()
for locale, title in [('ru', 'Комплаенс-служба'), ('kk', 'Комплаенс қызметі')]:
    body = ('Комплаенс-офицер: ' if locale == 'ru' else 'Комплаенс-офицер: ') + name
    add('compliance-index-' + locale, 'archive-compliance', 'compliance', ['S04'], locale, {'title': title, 'body': body, 'tags': ['compliance']})

# No S01 original attachment: its unrelated VPN worksheet must never be served as contacts.
branch_rows = json.loads((ROOT / 'data/archive-20261110/branches.json').read_text())['records']
for row in branch_rows:
    key = row['sourceKey']; p = {'title': re.sub(r'\s+', ' ', row['name']).strip(), 'body': '\n'.join(filter(None, [re.sub(r'\s+', ' ', row['name']).strip(), row['address'], row.get('phone')])), 'address': row['address']}
    if row.get('phone'): p['phone'] = row['phone']
    if row.get('email') and 'email-domain-needs-confirmation' not in row['issues']:
        p['email'] = row['email']; p['body'] += '\n' + row['email']
    if row.get('director'): p['body'] += '\n' + row['director']
    add(key, 'archive-branch-' + str(row['source']['row']), 'branches', ['S01'], 'ru', p, branch=key)

links = json.loads((SRC / 'linked-fetch.json').read_text())
for row in links:
    key = 'S09:' + row['path']; path = SRC / row['path']; data = path.read_bytes(); assert sha(data) == row['sha256']
    files.append({'key': key, 'sourceId': 'S09', 'path': str(path.relative_to(ROOT)), 'filename': Path(unquote(urlsplit(row['url']).path)).name, 'sha256': row['sha256'], 'bytes': len(data), 'sourceUrl': row['url'], 'textQuality': 'source_table', 'access': {'view': True, 'download': True}})
add('fonds-guide', 'archive-fonds-guide', 'fonds', ['S09'], 'ru', {'title': 'Фонды и газетные издания', 'body': 'Справочники фондов содержат учётные номера и названия, в том числе исторические. Отдельный перечень описывает хранение газет. Это справочные сведения, а не цифровые копии архивных дел.\n\nВ названиях ссылок указан 2026 год, но имена фондовых выгрузок относятся к 2018 году; газетный перечень прямо указывает состояние на 1 января 2018 года. Версия сохраняется по исходнику.', 'tags': ['fonds', 'newspapers']}, ['S09:' + r['path'] for r in links])

refroot = ROOT / 'sources/archive-reference-20261110'
refs = json.loads((refroot / 'manifest.json').read_text())['files']
for f in refs:
    p = refroot / f['original']; data = p.read_bytes(); assert sha(data) == f['sha256']
    files.append({'key': f['id'], 'sourceId': f['id'], 'path': str(p.relative_to(ROOT)), 'filename': Path(unquote(urlsplit(f['sourceUrl']).path)).name, 'label': f['label'], 'sourceUrl': f['sourceUrl'], 'sha256': f['sha256'], 'bytes': len(data), 'textPath': str((refroot / f['text']).relative_to(ROOT)), 'textQuality': 'machine_unverified' if p.suffix == '.pdf' else 'source_text', 'access': {'view': True, 'download': True}})
for row in json.loads((ROOT / 'data/artur/discovery/reference-page-drafts.json').read_text())['records']:
    for locale, p in [(row['create']['locale'], row['create']['payload'])] + [(t['locale'], t['payload']) for t in row['translations']]:
        ids = re.findall(r'R0\d', p['sourceNote']); ids = list(dict.fromkeys(ids))
        p = dict(p); p['links'] = [dict(l, label=l['label'][:120]) for l in p.get('links', [])]
        add(row['sourceKey'] + '-' + locale, row['create']['slug'], 'services', ids, locale, p, ids)

decisions = [
    {'id': 'S08', 'decision': 'DEVELOPMENT_ONLY', 'reason': 'Optional specification is not historical website content.'},
    {'id': 'S01-worksheet-vpn', 'decision': 'EXCLUDE', 'reason': 'Unrelated rural IP/VPN worksheet; not exposed or attached.'},
    {'id': 'S01-contact-email', 'decision': 'PUBLISH_PARTIAL', 'keys': [r['sourceKey'] for r in branch_rows if 'email-domain-needs-confirmation' in r['issues']], 'reason': 'Publish real branch/address/phone; omit suspect email without guessing a replacement.'},
    {'id': 'S01-missing-fields', 'decision': 'PUBLISH_PARTIAL', 'reason': 'Missing branch hours/coordinates/Markakol phone stay absent; text profiles are available.'},
    {'id': 'S07-empty-deputy', 'decision': 'PUBLISH_PARTIAL', 'reason': 'Do not describe an empty source field as a vacancy.'},
    {'id': 'S03-date-conflicts', 'decision': 'PUBLISH_WITH_SOURCE_NOTE', 'reason': 'Keep original calendars; conflicting Permitin dates, Kurdakov anniversary, telephone/school anniversary counts excluded from structured assertions.'},
    {'id': 'S09-versions', 'decision': 'PUBLISH_WITH_SOURCE_VERSION', 'reason': '2018 source versions retained; not a claim of 2026 updates or digitization.'},
    {'id': 'S09-personal-fonds', 'decision': 'MISSING_SOURCE', 'reason': 'No source link supplied; no invented personal-fonds records.'},
    {'id': 'R01-R05', 'decision': 'PUBLISH_WITH_SOURCE_VERSION', 'reason': 'Preserved editions are identified; not asserted to be current legislation or current prices.'}]
write('publication-manifest.json', {'version': 2, 'namespace': 'archive-real-20261111', 'prepared': '2026-11-11', 'publicationAuthorized': True, 'published': False, 'status': 'READY_FOR_IMPORT', 'records': records, 'decisions': decisions, 'filesManifest': 'files.json', 'counts': {'languageRecords': len(records), 'materials': len(set(r['materialKey'] for r in records)), 'branches': len(branch_rows), 'files': len(files)}, 'importRules': ['Resolve logical file keys to existing-policy file IDs, never fake document IDs.', 'Group identical materialKey across locales as one CMS item.', 'Keep all original sourceKey bindings for place/history evidence.', 'No database changes were performed by this preparation script.', 'Use existing author/reviewer roles; do not forge archive employee approval.']})
write('files.json', {'version': 2, 'files': files})
print(f'Ready: {len(records)} language records / {len(set(r["materialKey"] for r in records))} materials, {len(files)} source files; no DB mutation.')
