"""설정 전용 Chromium 흐름. 임시 API 저장소와 Vite 소스 서버만 사용한다."""
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from contextlib import contextmanager

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
PASSWORD = 'Settings-Test-2026!'
BACKUP_PASSWORD = 'Settings-Backup-2026!'


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def ready(url):
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.1)
    raise RuntimeError('임시 시험 서버가 시작되지 않았습니다.')


@contextmanager
def servers():
    node = os.environ.get('KEYDESK_NODE') or shutil.which('node')
    api_port, web_port = port(), port()
    origin = f'http://127.0.0.1:{web_port}'
    with tempfile.TemporaryDirectory(prefix='keydesk-settings-') as folder:
        data = pathlib.Path(folder)
        env = {
            **os.environ,
            'KEYDESK_DATA_DIR': folder,
            'KEYDESK_HOST': '127.0.0.1',
            'KEYDESK_PORT': str(api_port),
            'KEYDESK_ORIGIN': origin,
        }
        with open(data / 'api.log', 'w') as api_log, open(data / 'vite.log', 'w') as vite_log:
            api = subprocess.Popen([node, 'apps/server/src/main.ts'], cwd=ROOT,
                                   env=env, stdout=api_log, stderr=api_log)
            vite = subprocess.Popen([node, str(ROOT / 'node_modules/vite/bin/vite.js'),
                                     '--host', '127.0.0.1', '--port', str(web_port), '--strictPort'],
                                    cwd=ROOT / 'apps/web', env=env, stdout=vite_log, stderr=vite_log)
            try:
                ready(f'http://127.0.0.1:{api_port}/api/status')
                ready(origin)
                yield origin, data
            finally:
                for process in [vite, api]:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


with servers() as (origin, data), sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    page = context.new_page()
    page.set_default_timeout(10000)
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append((request.method, request.url)))
    page.goto(origin)
    page.get_by_label('초기 설정 토큰', exact=True).fill((data / 'bootstrap-token').read_text().strip())
    page.get_by_label('소유자 이름', exact=True).fill('설정 시험 소유자')
    page.get_by_label('비밀번호 (12자 이상)', exact=True).fill(PASSWORD)
    page.get_by_role('button', name='계정 만들기', exact=True).click()
    expect(page.get_by_role('heading', name='보관함', exact=True)).to_be_visible()
    page.get_by_role('button', name='설정', exact=True).click()
    tabs = page.get_by_role('tablist', name='설정 항목', exact=True)
    expect(tabs).to_be_visible()
    expect(page.get_by_role('tab', name='일반', exact=True)).to_have_attribute('aria-selected', 'true')

    def tab(label):
        page.get_by_role('tab', name=label, exact=True).click()

    def auth():
        return page.request.get(origin + '/api/auth/state').json()

    def settings():
        return page.request.get(origin + '/api/settings').json()['settings']

    # The settings-side navigation boundary prevents loss and resumes only after discard.
    page.get_by_label('시간대', exact=True).fill('Europe/London')
    allowed = page.evaluate("""() => {
        window.settingsNavigationResumed = 0;
        return window.dispatchEvent(new CustomEvent('keydesk:before-navigate', {
            cancelable: true,
            detail: {resume: () => window.settingsNavigationResumed++},
        }));
    }""")
    assert not allowed
    discard = page.get_by_role('dialog', name='작성 내용 버리기', exact=True)
    discard.get_by_role('button', name='계속 작성', exact=True).click()
    assert page.evaluate('window.settingsNavigationResumed') == 0
    expect(page.get_by_label('시간대', exact=True)).to_have_value('Europe/London')
    page.evaluate("""() => window.dispatchEvent(new CustomEvent('keydesk:before-navigate', {
        cancelable: true,
        detail: {resume: () => window.settingsNavigationResumed++},
    }))""")
    discard.get_by_role('button', name='버리고 이동', exact=True).click()
    assert page.evaluate('window.settingsNavigationResumed') == 1
    expect(page.get_by_label('시간대', exact=True)).to_have_value('Asia/Seoul')

    # The actual main-menu route uses the same guard and only resumes after confirmation.
    page.get_by_label('시간대', exact=True).fill('Europe/London')
    page.get_by_role('button', name='보관함', exact=True).click()
    expect(discard).to_be_visible()
    discard.get_by_role('button', name='계속 작성', exact=True).click()
    expect(page.get_by_label('시간대', exact=True)).to_have_value('Europe/London')
    page.get_by_role('button', name='보관함', exact=True).click()
    discard.get_by_role('button', name='버리고 이동', exact=True).click()
    expect(page.get_by_role('heading', name='보관함', exact=True)).to_be_visible()
    page.get_by_role('button', name='설정', exact=True).click()
    expect(page.get_by_label('시간대', exact=True)).to_have_value('Asia/Seoul')
    page.get_by_role('tab', name='일반', exact=True).focus()
    page.keyboard.press('End')
    expect(page.get_by_role('tab', name='서버 사용량 설정', exact=True)).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Home')
    expect(page.get_by_role('tab', name='일반', exact=True)).to_have_attribute('aria-selected', 'true')

    # Draft cancellation preserves values; discard resets only the departing section.
    page.get_by_label('시간대', exact=True).fill('America/New_York')
    tab('알림 메일')
    discard = page.get_by_role('dialog', name='작성 내용 버리기', exact=True)
    expect(discard).to_be_visible()
    discard.get_by_role('button', name='계속 작성', exact=True).click()
    expect(page.get_by_label('시간대', exact=True)).to_have_value('America/New_York')
    tab('알림 메일')
    discard.get_by_role('button', name='버리고 이동', exact=True).click()
    expect(page.get_by_text('메일을 설정하지 않아도 앱의 만료 알림을 사용할 수 있습니다.', exact=True)).to_be_visible()
    page.get_by_label('SMTP 서버', exact=True).fill('unsaved.invalid')
    page.get_by_label('SMTP 비밀번호', exact=True).fill('unused-smtp-test-password')
    expect(page.get_by_text('저장하지 않은 변경 사항이 있습니다.', exact=True)).to_be_visible()
    tab('일반')
    discard.get_by_role('button', name='버리고 이동', exact=True).click()
    expect(page.get_by_label('시간대', exact=True)).to_have_value('Asia/Seoul')
    page.get_by_label('시간대', exact=True).fill('Asia/Tokyo')
    page.get_by_role('button', name='일반 설정 저장', exact=True).click()
    expect(page.get_by_text('일반 설정을 저장했습니다.', exact=True)).to_be_visible()
    assert settings()['timeZone'] == 'Asia/Tokyo'
    assert settings()['smtp']['host'] == ''
    assert not settings()['smtp']['passwordConfigured']
    tab('서버 사용량 설정')
    page.get_by_label('호출 기록 보존 (일)', exact=True).fill('45')
    page.get_by_role('button', name='서버 사용량 설정 저장', exact=True).click()
    expect(page.get_by_text('서버 사용량 설정을 저장했습니다.', exact=True)).to_be_visible()
    assert settings()['retentionDays'] == 45
    assert settings()['timeZone'] == 'Asia/Tokyo'

    # Test SMTP uses the saved endpoint without sending drafts or a real external mail.
    tab('알림 메일')
    page.get_by_label('SMTP 서버', exact=True).fill('unused-test.invalid')
    page.get_by_label('보내는 주소', exact=True).fill('from@example.invalid')
    page.get_by_label('받는 주소', exact=True).fill('to@example.invalid')
    page.get_by_role('button', name='메일 설정 저장', exact=True).click()
    expect(page.get_by_text('메일 설정을 저장했습니다.', exact=True)).to_be_visible()
    page.get_by_label('SMTP 서버', exact=True).fill('unsaved.invalid')
    smtp_requests = []

    def smtp_test(route):
        smtp_requests.append(route.request.post_data)
        route.fulfill(status=200, content_type='application/json', body='{"sent":true}')

    page.route('**/api/settings/smtp/test', smtp_test)
    page.get_by_role('button', name='저장된 설정으로 테스트 메일 보내기', exact=True).click()
    expect(page.get_by_text('저장된 받는 주소로 테스트 메일을 보냈습니다.', exact=True)).to_be_visible()
    assert smtp_requests == [None]
    assert settings()['smtp']['host'] == 'unused-test.invalid'
    tab('백업')
    discard.get_by_role('button', name='버리고 이동', exact=True).click()

    # Backup has its own credentials and no restore file picker.
    expect(page.get_by_label('복원할 암호화 백업 파일', exact=True)).not_to_be_visible()
    page.get_by_label('현재 소유자 비밀번호', exact=True).fill(PASSWORD)
    page.get_by_label('새 백업 파일 암호 (12자 이상)', exact=True).fill(BACKUP_PASSWORD)
    with page.expect_download() as download_info:
        page.get_by_role('button', name='암호화 백업 내려받기', exact=True).click()
    backup_path = data / 'encrypted-backup.json'
    download_info.value.save_as(backup_path)
    assert json.loads(backup_path.read_text())['format'] == 'keydesk-backup'
    expect(page.get_by_label('현재 소유자 비밀번호', exact=True)).to_have_value('')
    expect(page.get_by_label('새 백업 파일 암호 (12자 이상)', exact=True)).to_have_value('')
    tab('서버 사용량 설정')
    page.get_by_label('호출 기록 보존 (일)', exact=True).fill('46')
    page.get_by_role('button', name='서버 사용량 설정 저장', exact=True).click()
    expect(page.get_by_text('서버 사용량 설정을 저장했습니다.', exact=True)).to_be_visible()
    assert settings()['retentionDays'] == 46
    tab('복원')
    expect(page.get_by_label('현재 소유자 비밀번호', exact=True)).to_have_value('')
    expect(page.get_by_label('복원할 파일의 백업 암호', exact=True)).to_have_value('')
    backups_before = len([item for item in requests if item == ('POST', origin + '/api/backups')])
    file_input = page.get_by_label('복원할 암호화 백업 파일', exact=True)
    file_input.set_input_files({'name': 'invalid.json', 'mimeType': 'application/json',
                                'buffer': b'{"format":"keydesk-backup","version":1}'})
    expect(page.get_by_role('alert')).to_contain_text('백업 파일')
    expect(page.get_by_role('button', name='복원 내용 확인', exact=True)).to_be_disabled()
    file_input.set_input_files(backup_path)
    expect(page.get_by_text('encrypted-backup.json · 파일 형식 확인 완료', exact=True)).to_be_visible()
    assert len([item for item in requests if item == ('POST', origin + '/api/backups')]) == backups_before

    # Both reauthentication and wrong passphrase keep the current app session.
    for owner, passphrase, message in [
        ('wrong-test-password', BACKUP_PASSWORD, '비밀번호'),
        (PASSWORD, 'wrong-backup-password', '백업 암호'),
    ]:
        page.get_by_label('현재 소유자 비밀번호', exact=True).fill(owner)
        page.get_by_label('복원할 파일의 백업 암호', exact=True).fill(passphrase)
        page.get_by_role('button', name='복원 내용 확인', exact=True).click()
        confirm = page.get_by_role('dialog', name='현재 데이터를 백업으로 교체', exact=True)
        expect(confirm.get_by_text('기존 세션과 클라이언트 키는 폐기합니다.', exact=False)).to_be_visible()
        confirm.get_by_role('button', name='전체 복원 실행', exact=True).click()
        expect(confirm.get_by_role('alert')).to_contain_text(message)
        assert auth()['authenticated']
        assert settings()['retentionDays'] == 46
        confirm.get_by_role('button', name='취소', exact=True).click()

    # Leaving the sensitive operation clears its secrets and any restore error.
    tab('백업')
    discard.get_by_role('button', name='버리고 이동', exact=True).click()
    expect(page.get_by_role('alert')).not_to_be_visible()
    expect(page.get_by_label('현재 소유자 비밀번호', exact=True)).to_have_value('')
    tab('복원')
    expect(page.get_by_label('복원할 파일의 백업 암호', exact=True)).to_have_value('')
    expect(page.get_by_role('button', name='복원 내용 확인', exact=True)).to_be_disabled()
    file_input.set_input_files(backup_path)
    page.get_by_label('현재 소유자 비밀번호', exact=True).fill(PASSWORD)
    page.get_by_label('복원할 파일의 백업 암호', exact=True).fill(BACKUP_PASSWORD)
    page.get_by_role('button', name='복원 내용 확인', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='전체 복원 실행', exact=True).click()
    expect(page.get_by_role('heading', name='보관함 열기', exact=True)).to_be_visible(timeout=15000)
    page.get_by_label('비밀번호', exact=True).fill(PASSWORD)
    page.get_by_role('button', name='로그인', exact=True).click()
    expect(page.get_by_role('heading', name='보관함', exact=True)).to_be_visible()
    assert settings()['retentionDays'] == 45

    # A mismatching confirmation never changes the password or revokes the session.
    page.get_by_role('button', name='설정', exact=True).click()
    page.get_by_label('현재 비밀번호', exact=True).fill(PASSWORD)
    page.get_by_label('새 비밀번호 (12자 이상)', exact=True).fill('Changed-Settings-2026!')
    page.get_by_label('새 비밀번호 확인', exact=True).fill('Wrong-Confirmation-2026!')
    password_requests = len([item for item in requests if item == ('POST', origin + '/api/auth/password')])
    page.get_by_role('button', name='비밀번호 변경', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('일치')
    assert len([item for item in requests if item == ('POST', origin + '/api/auth/password')]) == password_requests
    assert auth()['authenticated']
    page.get_by_label('새 비밀번호 확인', exact=True).fill('Changed-Settings-2026!')
    page.get_by_role('button', name='비밀번호 변경', exact=True).click()
    expect(page.get_by_role('heading', name='보관함 열기', exact=True)).to_be_visible(timeout=15000)
    page.get_by_label('비밀번호', exact=True).fill('Changed-Settings-2026!')
    page.get_by_role('button', name='로그인', exact=True).click()
    expect(page.get_by_role('heading', name='보관함', exact=True)).to_be_visible()
    page.get_by_role('button', name='설정', exact=True).click()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), '설정 390px 가로 넘침'
    local_values = page.evaluate('JSON.stringify(localStorage)')
    assert all(value not in local_values for value in [PASSWORD, BACKUP_PASSWORD, 'unused-smtp-test-password'])
    assert not errors, errors
    print('PASS settings: section drafts/save, navigation boundary, optional SMTP saved-config test (intercepted; no mail), '
          'independent backup/restore forms and secrets, file gate, failed restore session preservation, '
          'valid restore/session revocation, password confirmation/revocation, 390px; page errors=0', flush=True)
    browser.close()
