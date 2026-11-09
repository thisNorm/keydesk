from pathlib import Path
import json, os, socket, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright, expect

root = Path('/workspace/keydesk')
with tempfile.TemporaryDirectory(prefix='keydesk-history-ux-') as folder:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    env = {**os.environ, 'KEYDESK_DATA_DIR': folder, 'KEYDESK_PORT': str(port), 'KEYDESK_ORIGIN': origin}
    with open(Path(folder) / 'server.log', 'w') as log:
        server = subprocess.Popen(['node', 'apps/server/src/main.ts'], cwd=root, env=env, stdout=log, stderr=log)
        try:
            for _ in range(100):
                try:
                    with urllib.request.urlopen(origin + '/api/status', timeout=1) as response:
                        if response.status == 200: break
                except Exception: time.sleep(.1)
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
                context = browser.new_context()
                response = context.request.post(origin + '/api/auth/setup', headers={'Origin': origin}, data={'token': (Path(folder) / 'bootstrap-token').read_text().strip(), 'name': '이력 검사', 'password': 'Unusable-History-Test-2026'})
                assert response.ok
                headers = {'Origin': origin, 'X-CSRF-Token': context.request.get(origin + '/api/auth/state').json()['csrfToken']}
                draft = dict(name='이력 회귀 검사', provider='', description='', websiteUrl='', consoleUrl='', docsUrl='', endpointUrl='', owner='', tags=[], plan='', quota='', notes='', projectIds=[], credentials=[dict(label='운영 키', value='unusable-previous-value', status='active', issuedAt='', expiresAt='')])
                created = context.request.post(origin + '/api/entries', headers=headers, data=draft).json()['entry']
                draft['credentials'][0]['id'] = created['credentials'][0]['id']
                draft['credentials'][0]['value'] = 'unusable-current-value'
                assert context.request.put(origin + '/api/entries/' + created['id'], headers=headers, data=draft).ok
                page = context.new_page(); page.goto(origin)
                page.get_by_role('button', name='이력 회귀 검사', exact=True).click()
                detail = page.get_by_role('complementary', name='선택한 API 상세')
                detail.get_by_role('button', name='교체 기록 · 버전 2', exact=True).click()
                detail.get_by_label('조회할 버전', exact=True).select_option('1')
                detail.get_by_role('button', name='보기', exact=True).first.click()
                expect(detail.get_by_label('운영 키 인증값', exact=True)).to_have_value('unusable-previous-value')
                detail.get_by_role('button', name='교체 기록 · 버전 2', exact=True).click()
                detail.get_by_role('button', name='보기', exact=True).first.click()
                expect(detail.get_by_label('운영 키 인증값', exact=True)).to_have_value('unusable-current-value', timeout=2000)
                print('PASS: 이력을 닫은 뒤 현재 버전으로 복귀')
                browser.close()
        finally:
            server.terminate(); server.wait(timeout=10)
