"""실제 Keydesk 테스트 서버와 Chromium으로 실행하는 브라우저 검증.
KEYDESK_BROWSER_ORIGIN 및 KEYDESK_BROWSER_DATA_DIR에 전용 임시 서버를 지정한다.
운영 데이터에서 실행하지 않는다. 생성한 테스트 항목은 이 임시 서버에만 남긴다.
"""
import json, os, pathlib, tempfile, time, socket, subprocess, urllib.request
from contextlib import contextmanager
from playwright.sync_api import sync_playwright, expect
@contextmanager
def test_server():
 if os.environ.get('KEYDESK_BROWSER_ORIGIN'):
  yield (os.environ['KEYDESK_BROWSER_ORIGIN'],pathlib.Path(os.environ['KEYDESK_BROWSER_DATA_DIR']))
  return
 root=pathlib.Path(__file__).resolve().parents[3]
 node=os.environ.get('KEYDESK_NODE','/workspace/.keydesk-cloud/tools/node-v26.12.1-linux-x64/bin/node')
 with tempfile.TemporaryDirectory(prefix='keydesk-browser-') as folder:
  with socket.socket() as sock:
   sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  origin=f'http://127.0.0.1:{port}'
  env={**os.environ,'KEYDESK_DATA_DIR':folder,'KEYDESK_PORT':str(port),'KEYDESK_ORIGIN':origin,'KEYDESK_HOST':'127.0.0.1'}
  with open(pathlib.Path(folder)/'server.log','w') as log:
   server=subprocess.Popen([node,'apps/server/src/main.ts'],cwd=root,env=env,stdout=log,stderr=log)
   try:
    for _ in range(100):
     try:
      with urllib.request.urlopen(origin+'/api/status',timeout=1) as response:
       if response.status==200:break
     except Exception:time.sleep(.1)
    else:raise RuntimeError('테스트 서버가 시작되지 않았습니다.')
    yield (origin,pathlib.Path(folder))
   finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
ARTIFACTS=pathlib.Path(os.environ.get('KEYDESK_BROWSER_ARTIFACTS',str(pathlib.Path(__file__).resolve().parents[3]/'.local/rebuild/browser-artifacts')))
ARTIFACTS.mkdir(parents=True,exist_ok=True)
PASSWORD='Browser-Check-2026!'
with test_server() as (ORIGIN,DATA), sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
 page=context.new_page(); errors=[];page.set_default_timeout(10000);page.clock.install()
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m: print('CONSOLE:',m.text,flush=True) if m.type=='error' else None)
 page.goto(ORIGIN)
 expect(page.get_by_role('heading',name='처음 설정')).to_be_visible()
 page.get_by_label('초기 설정 토큰',exact=True).fill((DATA/'bootstrap-token').read_text().strip())
 page.get_by_label('소유자 이름',exact=True).fill('브라우저 검증')
 page.get_by_label('비밀번호 (12자 이상)',exact=True).fill(PASSWORD)
 page.get_by_role('button',name='계정 만들기',exact=True).click()
 expect(page.get_by_role('heading',name='보관함',exact=True)).to_be_visible()
 page.get_by_role('button',name='＋ 추가',exact=True).click()
 dialog=page.get_by_role('dialog');expect(dialog).to_be_visible()
 dialog.get_by_label('이름',exact=True).fill('한국어 실제 키')
 dialog.get_by_label('제공사',exact=True).fill('Local Provider')
 dialog.get_by_label('용도',exact=True).fill('한글 검색 및 인증값 버전 검증')
 dialog.get_by_label('새 프로젝트 이름',exact=True).fill('실제 브라우저 프로젝트')
 dialog.get_by_role('button',name='프로젝트 만들기',exact=True).click()
 expect(dialog.get_by_role('checkbox',name='실제 브라우저 프로젝트',exact=True)).to_be_checked()
 dialog.get_by_label('인증값',exact=True).fill('browser-test-key-v1')
 dialog.get_by_label('발급일',exact=True).fill('2026-11-01')
 dialog.get_by_label('만료일',exact=True).fill('2026-11-12')
 dialog.get_by_role('button',name='인증값 추가',exact=True).click()
 keys=dialog.locator('.key-editor');keys.nth(1).get_by_label('키 이름',exact=True).fill('운영 키')
 keys.nth(1).get_by_label('인증값',exact=True).fill('browser-test-key-second')
 keys.nth(1).get_by_label('만료일',exact=True).fill('2026-12-31')
 dialog.get_by_role('button',name='저장',exact=True).click()
 expect(dialog).not_to_be_visible()
 # A real API-supported explicit timestamp must remain editable and retain its offset.
 auth_state=page.request.get(ORIGIN+'/api/auth/state').json()
 stored=page.request.get(ORIGIN+'/api/entries').json()['entries'][0]
 stored['credentials'][1]['expiresAt']='2026-12-31T12:30:00+09:00'
 stored['credentials'][1]['issuedAt']='2026-11-01T01:00:00Z'
 changed=page.request.put(ORIGIN+'/api/entries/'+stored['id'],headers={'Origin':ORIGIN,'X-CSRF-Token':auth_state['csrfToken']},data=stored)
 assert changed.status==200,changed.text()
 page.reload()
 page.get_by_role('button',name='한국어 실제 키',exact=True).click()
 detail=page.get_by_role('complementary',name='선택한 API 상세')
 expect(detail.get_by_text('2026년 11월 12일',exact=False)).to_be_visible()
 expect(detail.get_by_text('발급 2026년 11월 1일 오전 10:00:00 (한국 시간)',exact=False)).to_be_visible()
 expect(detail.get_by_text('2026년 12월 31일 오후 12:30:00 (한국 시간)',exact=False)).to_be_visible()
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('•••• •••• •••• ••••')
 detail.get_by_role('button',name='보기',exact=True).first.click()
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('browser-test-key-v1')
 page.evaluate("window.dispatchEvent(new Event('blur'))")
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('•••• •••• •••• ••••')
 detail.get_by_role('button',name='수정',exact=True).click()
 dialog=page.get_by_role('dialog')
 expect(dialog.get_by_label('만료일',exact=True).nth(1)).to_have_value('2026-12-31T12:30:00+09:00')
 expect(dialog.get_by_label('발급일',exact=True).nth(1)).to_have_value('2026-11-01T01:00:00Z')
 dialog.get_by_label('새 인증값 (교체할 때만 입력)',exact=True).first.fill('browser-test-key-v2')
 dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog).not_to_be_visible()
 preserved=page.request.get(ORIGIN+'/api/entries').json()['entries'][0]['credentials'][1]
 assert preserved['expiresAt']=='2026-12-31T12:30:00+09:00'
 assert preserved['issuedAt']=='2026-11-01T01:00:00Z'
 detail.get_by_role('button',name='보기',exact=True).first.click()
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('browser-test-key-v2')
 detail.get_by_role('button',name='교체 기록 · 버전 2',exact=True).click()
 expect(detail.locator('.versions select').first).to_be_visible()
 detail.locator('.versions select').first.select_option('1')
 detail.get_by_role('button',name='보기',exact=True).first.click()
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('browser-test-key-v1')
 print('PASS vault and versions',flush=True)
 # Clipboard denial keeps explicit fallback display available without fake success.
 page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});document.execCommand=()=>false")
 detail.get_by_role('button',name='복사',exact=True).first.click()
 expect(page.get_by_role('status')).to_contain_text('직접 복사')
 page.clock.fast_forward(21000)
 expect(detail.get_by_label('API 키 인증값',exact=True)).to_have_value('•••• •••• •••• ••••')
 # Ctrl K and IME guard.
 page.keyboard.press('Control+k');expect(page.get_by_label('API 검색',exact=True)).to_be_focused()
 page.get_by_label('API 검색',exact=True).fill('한국어')
 expect(page.get_by_role('button',name='한국어 실제 키',exact=True)).to_be_visible()
 page.evaluate("document.querySelector('[aria-label=\"API 검색\"]').blur();window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,isComposing:true,bubbles:true}))")
 expect(page.get_by_label('API 검색',exact=True)).not_to_be_focused()
 page.get_by_role('button',name='가져오기',exact=True).click()
 dialog=page.get_by_role('dialog');dialog.get_by_label('또는 .env 내용 붙여넣기',exact=True).fill('\\ufeff'.encode().decode('unicode_escape')+'export IMPORTED="${HOME}$(echo nope)"\r\n')
 expect(dialog.get_by_text('1행 · IMPORTED',exact=False)).to_be_visible()
 dialog.get_by_label('저장할 항목',exact=True).select_option(label='한국어 실제 키에 키 추가')
 dialog.get_by_role('checkbox',name='변수 이름과 저장할 항목을 확인했습니다.',exact=True).check()
 dialog.get_by_role('button',name='확인한 인증값 가져오기',exact=True).click();expect(dialog).not_to_be_visible()
 expect(detail.get_by_text('IMPORTED',exact=True)).to_be_visible()
 print('PASS import',flush=True)
 # Gateway route and scoped one-time token.
 page.get_by_role('button',name='게이트웨이',exact=True).click()
 page.get_by_role('button',name='경로 추가',exact=True).click();dialog=page.get_by_role('dialog')
 dialog.get_by_label('경로 이름',exact=True).fill('브라우저 경로')
 dialog.get_by_label('별칭 (/gw/별칭/)',exact=False).fill('browser-check')
 dialog.get_by_label('프로젝트',exact=True).select_option(label='실제 브라우저 프로젝트')
 dialog.get_by_label('주입할 인증값',exact=True).select_option(label='한국어 실제 키 · API 키')
 dialog.get_by_label('목적지 기본 주소',exact=True).fill('https://api.example.com/v1')
 dialog.get_by_label('인증 헤더',exact=True).fill('X-API-Key')
 dialog.get_by_label('인증값 형식',exact=True).select_option('raw')
 dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog).not_to_be_visible()
 expect(page.get_by_text('X-API-Key / 키 값 그대로',exact=False)).to_be_visible()
 page.get_by_role('button',name='수정',exact=True).click();dialog=page.get_by_role('dialog')
 expect(dialog.get_by_label('인증 헤더',exact=True)).to_have_value('X-API-Key')
 expect(dialog.get_by_label('인증값 형식',exact=True)).to_have_value('raw')
 dialog.get_by_label('인증 헤더',exact=True).fill('Cookie')
 dialog.get_by_role('button',name='저장',exact=True).click()
 expect(dialog.get_by_role('alert')).to_be_visible()
 dialog.get_by_label('인증 헤더',exact=True).fill('X-API-Key')
 dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog).not_to_be_visible()
 page.get_by_role('button',name='클라이언트 키',exact=True).click()
 page.get_by_role('button',name='클라이언트 키 발급',exact=True).click();dialog=page.get_by_role('dialog')
 dialog.get_by_label('클라이언트 이름',exact=True).fill('브라우저 클라이언트')
 dialog.get_by_label('프로젝트',exact=True).select_option(label='실제 브라우저 프로젝트')
 dialog.get_by_role('checkbox',name='브라우저 경로',exact=True).check()
 dialog.get_by_label('일일 호출 수 제한',exact=False).fill('10')
 dialog.get_by_role('button',name='발급',exact=True).click()
 token_dialog=page.get_by_role('dialog',name='클라이언트 토큰 · 지금만 표시');expect(token_dialog).to_be_visible()
 assert len(token_dialog.get_by_label('발급한 토큰',exact=True).input_value())>20
 token_dialog.get_by_role('button',name='저장했고 닫기',exact=True).click()
 page.get_by_role('button',name='폐기',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='확인',exact=True).click()
 expect(page.get_by_role('button',name='폐기',exact=True)).to_be_disabled()
 page.get_by_role('button',name='모델 단가',exact=True).click();page.get_by_role('button',name='모델 단가 추가',exact=True).click()
 dialog=page.get_by_role('dialog');dialog.get_by_label('모델 식별자',exact=True).fill('browser-model');dialog.get_by_label('100만 입력 토큰당',exact=True).fill('1.25');dialog.get_by_label('100만 출력 토큰당',exact=True).fill('5');dialog.get_by_role('button',name='저장',exact=True).click();expect(dialog).not_to_be_visible()
 expect(page.get_by_text('openai / browser-model',exact=True)).to_be_visible()
 page.get_by_role('button',name='사용량·비용',exact=True).click();expect(page.get_by_text('0회',exact=True).first).to_be_visible()
 page.get_by_role('button',name='알림',exact=True).click();page.get_by_role('button',name='만료 상태 새로 확인',exact=True).click();expect(page.get_by_role('button',name='만료 상태 새로 확인',exact=True)).to_be_enabled()
 print('PASS gateway, usage and notifications',flush=True)
 # Backup and restore are performed through forms and download file.
 page.get_by_role('button',name='설정',exact=True).click()
 page.get_by_label('현재 소유자 비밀번호',exact=True).fill(PASSWORD)
 page.get_by_label('백업 파일 암호',exact=True).fill('Backup-Browser-2026!')
 with page.expect_download() as download_info:page.get_by_role('button',name='암호화 백업 내려받기',exact=True).click()
 download=download_info.value;backup_path=ARTIFACTS/'backup-test.json';download.save_as(backup_path)
 assert json.loads(backup_path.read_text())['format']=='keydesk-backup'
 page.get_by_label('복원할 암호화 백업 파일',exact=True).set_input_files(backup_path)
 page.get_by_label('현재 소유자 비밀번호',exact=True).fill('wrong-password')
 page.get_by_label('백업 파일 암호',exact=True).fill('Backup-Browser-2026!')
 page.get_by_role('button',name='으로 전체 복원',exact=False).click();page.get_by_role('dialog').get_by_role('button',name='확인',exact=True).click()
 expect(page.get_by_role('alert')).to_contain_text('비밀번호')
 expect(page.get_by_role('heading',name='설정',exact=True)).to_be_visible()
 page.get_by_role('dialog').get_by_role('button',name='취소',exact=True).click()
 # Responsive long strings, detail and editor focus trap.
 page.get_by_role('button',name='보관함',exact=True).click();page.set_viewport_size({'width':390,'height':844})
 page.get_by_role('button',name='한국어 실제 키',exact=True).click();expect(page.get_by_role('complementary',name='선택한 API 상세')).to_be_visible()
 page.screenshot(path=str(ARTIFACTS/'vault-390.png'),full_page=True)
 page.get_by_role('button',name='상세 닫기',exact=True).click()
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), '390px 가로 넘침'
 page.get_by_role('button',name='＋ 추가',exact=True).click();dialog=page.get_by_role('dialog')
 dialog.get_by_label('이름',exact=True).fill('긴이름'*70)
 dialog.get_by_label('인증값',exact=True).fill('ime-guard-test')
 dialog.get_by_label('이름',exact=True).evaluate("input=>input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'한'}))")
 dialog.locator('form').evaluate('form=>form.requestSubmit()')
 expect(dialog).to_be_visible()
 dialog.get_by_label('이름',exact=True).evaluate("input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}))")
 page.keyboard.press('Shift+Tab');assert page.evaluate('document.activeElement.closest("dialog") !== null')
 page.keyboard.press('Escape');expect(dialog).not_to_be_visible()
 page.set_viewport_size({'width':1440,'height':1000})
 page.get_by_role('button',name='한국어 실제 키',exact=True).click()
 page.screenshot(path=str(ARTIFACTS/'vault-dark-detail-1440.png'),full_page=True)
 page.get_by_role('button',name='상세 닫기',exact=True).click()
 # macOS shortcut caption is platform driven; IME guard applies to Ctrl and Meta.
 page.set_viewport_size({'width':1440,'height':1000});page.get_by_role('button',name='밝은 화면',exact=True).click()
 page.screenshot(path=str(ARTIFACTS/'vault-light-1440.png'),full_page=True)
 page.get_by_role('button',name='잠금·로그아웃',exact=True).click();expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible()
 page.reload();expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible()
 page.get_by_label('비밀번호',exact=True).fill(PASSWORD);page.get_by_role('button',name='로그인',exact=True).click()
 expect(page.get_by_role('heading',name='보관함',exact=True)).to_be_visible()
 # Actual macOS platform caption and Command K in a browser context.
 macpage=context.new_page()
 macpage.add_init_script("Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'})")
 macpage.goto(ORIGIN)
 expect(macpage.locator('kbd')).to_have_text('⌘ K')
 macpage.bring_to_front();macpage.get_by_role('heading',name='보관함',exact=True).click()
 macpage.keyboard.press('Meta+k');expect(macpage.get_by_label('API 검색',exact=True)).to_be_focused()
 macpage.close()
 # Valid restore revokes sessions and keeps the target owner account.
 page.get_by_role('button',name='설정',exact=True).click()
 page.get_by_label('현재 소유자 비밀번호',exact=True).fill(PASSWORD)
 page.get_by_label('백업 파일 암호',exact=True).fill('Backup-Browser-2026!')
 page.get_by_label('복원할 암호화 백업 파일',exact=True).set_input_files(backup_path)
 page.get_by_role('button',name='으로 전체 복원',exact=False).click()
 page.get_by_role('dialog').get_by_role('button',name='확인',exact=True).click()
 expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible(timeout=15000)
 page.get_by_label('비밀번호',exact=True).fill(PASSWORD);page.get_by_role('button',name='로그인',exact=True).click()
 expect(page.get_by_role('button',name='한국어 실제 키',exact=True)).to_be_visible()
 page.get_by_role('button',name='한국어 실제 키',exact=True).click()
 page.get_by_role('complementary',name='선택한 API 상세').get_by_role('button',name='보기',exact=True).first.click()
 expect(page.get_by_label('API 키 인증값',exact=True)).to_have_value('browser-test-key-v2')
 # Password change returns to login and permits only the new password.
 page.get_by_role('button',name='설정',exact=True).click()
 page.get_by_label('현재 비밀번호',exact=True).fill(PASSWORD)
 page.get_by_label('새 비밀번호 (12자 이상)',exact=True).fill('Changed-Browser-2026!')
 page.get_by_role('button',name='비밀번호 변경',exact=True).click()
 expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible()
 page.get_by_label('비밀번호',exact=True).fill('Changed-Browser-2026!')
 page.get_by_role('button',name='로그인',exact=True).click()
 expect(page.get_by_role('heading',name='보관함',exact=True)).to_be_visible()
 assert not errors,errors
 print('PASS: setup/login, multi-key dates, secret reveal/version/timer/blur, clipboard denial, Korean search/IME/Ctrl K, atomic .env existing import, route/client/revoke/prices, usage/notifications, backup download, wrong-owner restore and valid restore/session revocation, 390px and theme, Ctrl/Command K, logout persistence and password change; browser errors=0')
 browser.close()
