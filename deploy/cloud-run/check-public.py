#!/usr/bin/env python3
"""Read-only post-deployment verification of public pages, aliases and source files."""
import concurrent.futures
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

origin = (sys.argv[1] if len(sys.argv) > 1 else 'https://ale-archive-preview-qwir3qwmza-ew.a.run.app').rstrip('/')
url = urllib.parse.urlparse(origin)
if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1')):
    raise SystemExit('Expected an HTTPS site URL or a local test server')
errors = []
checks = []
started = time.monotonic()

def fetch(path, as_json=True):
    request = urllib.request.Request(origin + path, headers={'User-Agent': 'ALEteam-public-release-check/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise ValueError('HTTP_' + str(response.status))
        body = response.read(21 * 1024 * 1024)
        return json.loads(body) if as_json else body

def require(condition, name):
    if not condition:
        raise ValueError(name)
    checks.append(name)

try:
    health = fetch('/api/health')
    require(health.get('status') == 'ok' and health.get('database') == 'ok', 'server_and_database_healthy')
    for page in ['/', '/register', '/materials/archive-paid-services-info', '/materials/archive-structure']:
        require(len(fetch(page, False)) > 1000, 'page_available:' + page)
    editions = []
    for locale in ['ru', 'kk', 'en']:
        data = fetch('/api/content?' + urllib.parse.urlencode({'locale': locale, 'pageSize': 50}))
        require(isinstance(data.get('items'), list), 'content_list:' + locale)
        editions.extend((item['id'], locale) for item in data['items'])
        if data.get('total', 0) > 50:
            raise ValueError('CONTENT_PAGINATION_EXCEEDS_RELEASE_FIXTURE')

    def attachments(edition):
        item, locale = edition
        return fetch('/api/discovery/materials/cms/' + urllib.parse.quote(item, safe='') + '/attachments?locale=' + locale).get('items', [])

    originals = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for refs in pool.map(attachments, editions):
            for ref in refs:
                href = ref.get('href', '')
                if not re.fullmatch(r'/api/material-files/[A-Za-z0-9_-]+', href):
                    raise ValueError('UNEXPECTED_SOURCE_FILE_LINK')
                originals[href] = ref
    require(len(originals) > 0, 'source_file_references_present')

    def verify_file(item):
        href, ref = item
        try:
            body = fetch(href, False)
            if len(body) != ref['bytes'] or hashlib.sha256(body).hexdigest() != ref['sha256']:
                return {'path': href, 'error': 'FILE_INTEGRITY_MISMATCH'}
        except urllib.error.HTTPError as error:
            return {'path': href, 'error': 'HTTP_' + str(error.code)}
        except Exception as error:
            return {'path': href, 'error': type(error).__name__}
        return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        errors.extend(error for error in pool.map(verify_file, originals.items()) if error)
    require(not errors, 'all_source_files_return_exact_original_bytes')

    totals = []
    for query in ['Усть-Каменогорск', 'Усть - Каменогорск', 'Өскемен', 'Оскемен']:
        result = fetch('/api/search?' + urllib.parse.urlencode({'q': query, 'locale': 'ru', 'pageSize': 1}))
        totals.append(result.get('total'))
    require(all(isinstance(n, int) and n > 0 for n in totals) and len(set(totals)) == 1, 'city_aliases_return_equivalent_real_results')
    print(json.dumps({'status': 'passed', 'checks': checks, 'editions': len(editions), 'verifiedFiles': len(originals), 'aliasTotals': totals, 'durationSeconds': round(time.monotonic() - started, 2)}, ensure_ascii=False))
except Exception as error:
    print(json.dumps({'status': 'failed', 'checks': checks, 'errors': errors, 'failure': str(error) if isinstance(error, ValueError) else type(error).__name__, 'durationSeconds': round(time.monotonic() - started, 2)}, ensure_ascii=False))
    sys.exit(1)
