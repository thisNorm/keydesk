"""실제 임시 Keydesk 서버와 Chromium을 사용하는 브라우저 회귀 검증."""
import json, os, pathlib, re, shutil, socket, subprocess, tempfile, time, urllib.request
from contextlib import contextmanager
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[3]
ARTIFACTS = pathlib.Path(os.environ.get('KEYDESK_BROWSER_ARTIFACTS', str(ROOT/'.local/rebuild/browser-artifacts')))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
PASSWORD = 'Browser-Check-2026!'
NEW_PASSWORD = 'Changed-Browser-2026!'
BACKUP_PASSWORD = 'Backup-Browser-2026!'
ENTRY = '한국어 실제 키'
PROJECT = '실제 브라우저 프로젝트'

@contextmanager
def test_server():
    # An explicitly supplied server must use disposable data, never production data.
    if os.environ.get('KEYDESK_BROWSER_ORIGIN'):
        yield os.environ['KEYDESK_BROWSER_ORIGIN'], pathlib.Path(os.environ['KEYDESK_BROWSER_DATA_DIR'])
        return
    node = os.environ.get('KEYDESK_NODE') or shutil.which('node')
    if not node:
        raise RuntimeError('Node.js 실행 파일을 지정해 주세요.')
    with tempfile.TemporaryDirectory(prefix='keydesk-browser-') as folder:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        origin = f'http://127.0.0.1:{port}'
        env = {**os.environ, 'KEYDESK_DATA_DIR': folder, 'KEYDESK_PORT': str(port),
               'KEYDESK_ORIGIN': origin, 'KEYDESK_HOST': '127.0.0.1'}
        with open(pathlib.Path(folder)/'server.log', 'w') as log:
            server = subprocess.Popen([node, 'apps/server/src/main.ts'], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        with urllib.request.urlopen(origin+'/api/status', timeout=1) as response:
                            if response.status == 200: break
                    except Exception:
                        time.sleep(.1)
                else:
                    raise RuntimeError('테스트 서버가 시작되지 않았습니다.')
                yield origin, pathlib.Path(folder)
            finally:
                server.terminate()
                try: server.wait(timeout=10)
                except subprocess.TimeoutExpired: server.kill(); server.wait()

def chromium_options():
    executable = os.environ.get('KEYDESK_CHROMIUM')
    candidates = [shutil.which('chromium'), shutil.which('google-chrome'),
                  'C:/Program Files/Google/Chrome/Application/chrome.exe',
                  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
    if not executable:
        executable = next((path for path in candidates if path and pathlib.Path(path).exists()), None)
    return {'executable_path': executable, 'args': ['--no-sandbox']} if executable else {}

with test_server() as (ORIGIN, DATA), sync_playwright() as p:
    browser = p.chromium.launch(**chromium_options())
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce', accept_downloads=True)
    # Do not write test secrets into the user's system clipboard.
    context.add_init_script("""window.clipboardWrites=0;Object.defineProperty(navigator,'clipboard',{
        configurable:true,value:{writeText:async()=>{window.clipboardWrites++}}})""")
    page = context.new_page(); errors = []
    page.set_default_timeout(10000); page.clock.install()
    page.on('pageerror', lambda error: errors.append(str(error)))

    def menu(name):
        if name in ('게이트웨이', '사용량·비용') and page.locator('.nav-menu').get_attribute('open') is None:
            page.locator('.nav-menu > summary').click()
        page.locator('.app-header').get_by_role('button', name=re.compile('^알림') if name=='알림' else name, exact=name!='알림').click()
        expect(page.locator('main h1')).to_have_text({'보관함':'전체 키','알림':'만료 알림','사용량·비용':'사용량과 비용'}.get(name,name))
        if name=='게이트웨이':
            expect(page.get_by_role('button',name='경로 추가',exact=True)).to_be_enabled()

    def api(path, method='GET', body=None):
        state = page.request.get(ORIGIN+'/api/auth/state').json()
        response = page.request.fetch(ORIGIN+'/api'+path, method=method, data=body,
            headers={'Origin':ORIGIN,'X-CSRF-Token':state['csrfToken']})
        assert response.ok, f'{method} {path}: {response.status}'
        return response.json() if response.body() else None

    def close_detail():
        detail = page.get_by_role('dialog',name=ENTRY,exact=True)
        if detail.is_visible(): detail.get_by_role('button',name='닫기',exact=True).click()

    def login(password=PASSWORD):
        page.get_by_label('비밀번호',exact=True).fill(password)
        page.get_by_role('button',name='로그인',exact=True).click()
        expect(page.locator('main h1')).to_have_text('전체 키')

    try:
        page.goto(ORIGIN)
        expect(page.get_by_role('heading',name='처음 설정',exact=True)).to_be_visible()
        page.get_by_label('초기 설정 토큰',exact=True).fill((DATA/'bootstrap-token').read_text().strip())
        page.get_by_label('소유자 이름',exact=True).fill('브라우저 검증')
        page.get_by_label('비밀번호 (12자 이상)',exact=True).fill(PASSWORD)
        page.get_by_role('button',name='계정 만들기',exact=True).click()
        expect(page.locator('main h1')).to_have_text('전체 키')
        page.get_by_role('button',name='키 추가',exact=True).click()
        dialog = page.get_by_role('dialog',name='항목 추가',exact=True)
        dialog.get_by_label('이름',exact=True).fill(ENTRY)
        dialog.locator('summary').filter(has_text='제공사·주소·관리 메모').click()
        dialog.get_by_label('제공사',exact=True).fill('Local Provider')
        dialog.get_by_label('용도 (선택)',exact=True).fill('한글 검색 및 인증값 버전 검증')
        dialog.get_by_label('새 프로젝트 이름',exact=True).fill(PROJECT)
        dialog.get_by_role('button',name='프로젝트 만들기',exact=True).click()
        expect(dialog.get_by_role('checkbox',name=PROJECT,exact=True)).to_be_checked()
        dialog.get_by_label('키 이름',exact=True).fill('운영용')
        dialog.locator('.key-editor').first.get_by_label('인증값',exact=True).fill('browser-test-key-v1')
        dialog.get_by_label('만료일',exact=True).fill('2026-11-12')
        dialog.locator('summary').filter(has_text='상태와 발급일').click()
        dialog.get_by_label('발급일',exact=True).fill('2026-11-01')
        dialog.get_by_role('button',name='인증값 추가',exact=True).click()
        dialog.get_by_label('키 이름',exact=True).nth(1).fill('개발용')
        dialog.locator('.key-editor').nth(1).get_by_label('인증값',exact=True).fill('browser-test-key-second')
        dialog.get_by_label('만료일',exact=True).nth(1).fill('2026-12-31')
        dialog.get_by_role('button',name='저장',exact=True).click(); expect(dialog).not_to_be_visible()
        close_detail()
        stored = api('/entries')['entries'][0]
        stored['credentials'][1]['expiresAt']='2026-12-31T12:30:00+09:00'
        stored['credentials'][1]['issuedAt']='2026-11-01T01:00:00Z'
        api('/entries/'+stored['id'],'PUT',stored); page.reload()
        page.get_by_role('button',name=ENTRY+' 상세 보기',exact=True).click()
        detail = page.get_by_role('dialog',name=ENTRY,exact=True)
        secret = detail.get_by_label('운영용 인증값',exact=True)
        expect(secret).to_have_value('•••• •••• •••• ••••')
        detail.get_by_role('button',name='보기',exact=True).first.click()
        expect(secret).to_have_value('browser-test-key-v1')
        page.evaluate("window.dispatchEvent(new Event('blur'))")
        expect(secret).to_have_value('•••• •••• •••• ••••')
        detail.get_by_role('button',name='수정',exact=True).click()
        dialog = page.get_by_role('dialog',name='항목 수정',exact=True)
        expect(dialog.get_by_label('만료일',exact=True).nth(1)).to_have_value('2026-12-31T12:30:00+09:00')
        dialog.get_by_label('새 인증값 (교체할 때만 입력)',exact=True).first.fill('browser-test-key-v2')
        dialog.get_by_role('button',name='저장',exact=True).click(); expect(dialog).not_to_be_visible()
        preserved=api('/entries')['entries'][0]['credentials'][1]
        assert preserved['expiresAt']=='2026-12-31T12:30:00+09:00'
        assert preserved['issuedAt']=='2026-11-01T01:00:00Z'
        if not detail.is_visible(): page.get_by_role('button',name=ENTRY+' 상세 보기',exact=True).click()
        detail.get_by_role('button',name='교체 기록 · 버전 2',exact=True).click()
        detail.locator('.versions select').first.select_option('1')
        detail.get_by_role('button',name='보기',exact=True).first.click()
        expect(secret).to_have_value('browser-test-key-v1')
        page.evaluate("""Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
            writeText:()=>Promise.reject(new Error('denied'))}});document.execCommand=()=>false""")
        detail.get_by_role('button',name='이전 값 복사',exact=True).first.click()
        expect(detail.get_by_role('status')).to_contain_text('직접 복사')
        page.clock.fast_forward(21000)
        expect(secret).to_have_value('•••• •••• •••• ••••')
        close_detail()
        page.keyboard.press('Control+k'); search=page.get_by_label('API 검색',exact=True)
        expect(search).to_be_focused(); search.fill('운영용')
        expect(page.get_by_role('button',name=ENTRY+' 상세 보기',exact=True)).to_be_visible()
        search.evaluate("""input=>{input.blur();window.dispatchEvent(new KeyboardEvent(
            'keydown',{key:'k',ctrlKey:true,isComposing:true,bubbles:true}))}""")
        expect(search).not_to_be_focused()
        page.evaluate("""Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
            writeText:async()=>{window.clipboardWrites++}}})""")
        search.focus(); page.keyboard.press('Enter'); assert page.evaluate('window.clipboardWrites')==0
        page.keyboard.press('Control+Enter'); page.wait_for_function('() => window.clipboardWrites === 1')
        search.fill('')
        print('PASS vault, dates/history, blur/timer masking, copy fallback and Ctrl K/IME',flush=True)

        page.get_by_role('button',name='가져오기',exact=True).click(); dialog=page.get_by_role('dialog',name='.env 가져오기',exact=True)
        dialog.get_by_label('또는 .env 내용 붙여넣기',exact=True).fill('export IMPORTED="'+ '$' + '{HOME}$(echo nope)"')
        dialog.get_by_label('저장할 항목',exact=True).select_option(label=ENTRY+'에 키 추가')
        dialog.get_by_role('checkbox',name='변수 이름과 저장할 항목을 확인했습니다.',exact=True).check()
        dialog.get_by_role('button',name='확인한 인증값 가져오기',exact=True).click()
        expect(dialog).not_to_be_visible(); close_detail()
        assert len(api('/entries')['entries'][0]['credentials'])==3
        menu('게이트웨이'); page.get_by_role('button',name='경로 추가',exact=True).click()
        dialog=page.get_by_role('dialog',name='중계 경로 추가',exact=True)
        dialog.get_by_label('경로 이름',exact=True).fill('브라우저 경로')
        dialog.get_by_label('별칭 (/gw/별칭/)',exact=False).fill('browser-check')
        dialog.get_by_label('프로젝트',exact=True).select_option(label=PROJECT)
        dialog.get_by_label('주입할 인증값',exact=True).select_option(label=ENTRY+' · 운영용')
        dialog.get_by_label('목적지 기본 주소',exact=True).fill('https://api.example.com/v1')
        dialog.get_by_label('인증 헤더',exact=True).fill('X-API-Key')
        dialog.get_by_label('인증값 형식',exact=True).select_option('raw')
        dialog.get_by_role('button',name='저장',exact=True).click(); expect(dialog).not_to_be_visible()
        expect(page.get_by_text('X-API-Key / 키 값 그대로',exact=False)).to_be_visible()
        page.get_by_role('tab',name='중계 경로',exact=True).focus()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab',name='클라이언트 키',exact=True)).to_have_attribute('aria-selected','true')
        page.get_by_role('button',name='클라이언트 키 발급',exact=True).click()
        dialog=page.get_by_role('dialog',name='클라이언트 키 발급',exact=True)
        dialog.get_by_label('클라이언트 이름',exact=True).fill('브라우저 클라이언트')
        dialog.get_by_label('프로젝트',exact=True).select_option(label=PROJECT)
        dialog.get_by_role('checkbox',name='브라우저 경로',exact=True).check()
        dialog.get_by_label('일일 호출 수 제한',exact=True).fill('10')
        def fail_refresh(route):
            if route.request.method=='GET':
                route.fulfill(status=503,content_type='application/json',body=json.dumps({'message':'검사용 목록 조회 실패'}))
            else: route.continue_()
        page.route('**/api/gateway/clients',fail_refresh)
        dialog.get_by_role('button',name='발급',exact=True).click()
        token_dialog=page.get_by_role('dialog',name='클라이언트 토큰 · 지금만 표시',exact=True)
        expect(token_dialog).to_be_visible()
        assert len(token_dialog.get_by_label('발급한 토큰',exact=True).input_value())>20
        token_dialog.get_by_role('button',name='저장했고 닫기',exact=True).click()
        expect(page.get_by_role('alert')).to_contain_text('목록을 불러오지 못했습니다')
        expect(page.get_by_text('발급한 클라이언트 키가 없습니다.',exact=True)).not_to_be_visible()
        page.unroute('**/api/gateway/clients',fail_refresh)
        page.get_by_role('button',name='다시 불러오기',exact=True).click()
        expect(page.get_by_role('button',name='클라이언트 키 발급',exact=True)).to_be_enabled()
        route=api('/gateway/routes')['routes'][0]
        api('/gateway/clients','POST',{'name':'만료된 브라우저 클라이언트','projectId':route['projectId'],
            'routeIds':[route['id']],'expiresAt':'2000-01-01','dailyRequestLimit':1,
            'dailyTokenAlert':None,'dailyCostAlertMicros':None})
        menu('프로젝트'); menu('게이트웨이')
        page.get_by_role('tab',name='클라이언트 키',exact=True).click()
        expect(page.get_by_role('row').filter(has_text='만료된 브라우저 클라이언트')).to_contain_text('만료됨')
        page.get_by_role('button',name='브라우저 클라이언트 클라이언트 키 폐기',exact=True).click()
        page.get_by_role('dialog').get_by_role('button',name='클라이언트 키 폐기',exact=True).click()
        expect(page.get_by_role('button',name='브라우저 클라이언트 클라이언트 키 폐기',exact=True)).to_be_disabled()
        page.get_by_role('tab',name='중계 경로',exact=True).click()
        page.get_by_role('button',name='브라우저 경로 중계 경로 삭제',exact=True).click()
        dialog=page.get_by_role('dialog',name='중계 경로 삭제',exact=True)
        dialog.get_by_role('button',name='중계 경로 삭제',exact=True).click()
        expect(dialog.get_by_role('alert')).to_be_visible()
        dialog.get_by_role('button',name='취소',exact=True).click()
        expect(page.get_by_role('button',name='브라우저 경로 중계 경로 수정',exact=True)).to_be_visible()
        page.get_by_role('tab',name='모델 단가',exact=True).click()
        page.get_by_role('button',name='모델 단가 추가',exact=True).click(); dialog=page.get_by_role('dialog')
        expect(dialog.get_by_label('100만 입력 토큰당',exact=True)).to_have_value('')
        dialog.get_by_label('모델 식별자',exact=True).fill('browser-model')
        dialog.get_by_label('100만 입력 토큰당',exact=True).fill('1.25')
        dialog.get_by_label('100만 출력 토큰당',exact=True).fill('5')
        dialog.get_by_label('100만 캐시 입력 토큰당',exact=True).fill('0')
        dialog.get_by_role('button',name='저장',exact=True).click(); expect(dialog).not_to_be_visible()
        menu('사용량·비용'); menu('알림')
        page.get_by_role('button',name='만료 상태 새로 확인',exact=True).click()
        expect(page.get_by_role('button',name='만료 상태 새로 확인',exact=True)).to_be_enabled()
        print('PASS import and gateway token retention, expired status, rejected deletion and prices',flush=True)

        for theme in ('light','dark'):
            menu('설정'); page.get_by_label('화면',exact=True).select_option(theme)
            for width in (390,768,1440):
                page.set_viewport_size({'width':width,'height':1000}); headings=[]
                for name in ('보관함','프로젝트','알림','게이트웨이','사용량·비용','설정'):
                    menu(name)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(theme,width,name)
                    headings.append(page.locator('main h1').evaluate(
                        'el=>({x:el.getBoundingClientRect().x,size:getComputedStyle(el).fontSize})'))
                assert max(h['x'] for h in headings)-min(h['x'] for h in headings)<1,headings
                assert len({h['size'] for h in headings})==1,headings
        page.screenshot(path=str(ARTIFACTS/'settings-dark-1440.png'),full_page=True)
        menu('보관함')
        macpage=context.new_page()
        macpage.add_init_script("Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'})")
        macpage.goto(ORIGIN); expect(macpage.locator('.rack-search kbd')).to_contain_text('⌘')
        macpage.get_by_role('heading',name='전체 키',exact=True).click()
        macpage.keyboard.press('Meta+k'); expect(macpage.get_by_label('API 검색',exact=True)).to_be_focused()
        macpage.close()
        print('PASS all menu headings/overflow at three widths and two themes; Command K',flush=True)

        menu('설정'); page.get_by_role('tab',name='백업',exact=True).click()
        page.get_by_label('현재 소유자 비밀번호',exact=True).fill(PASSWORD)
        page.get_by_label('새 백업 파일 암호 (12자 이상)',exact=True).fill(BACKUP_PASSWORD)
        with page.expect_download() as download_info:
            page.get_by_role('button',name='암호화 백업 내려받기',exact=True).click()
        backup_path=DATA/'browser-backup.json'; download_info.value.save_as(backup_path)
        assert json.loads(backup_path.read_text())['format']=='keydesk-backup'
        page.get_by_role('tab',name='복원',exact=True).click()
        page.get_by_label('복원할 암호화 백업 파일',exact=True).set_input_files(backup_path)
        expect(page.get_by_role('button',name='복원 내용 확인',exact=True)).to_be_enabled()
        page.get_by_label('현재 소유자 비밀번호',exact=True).fill('wrong-password')
        page.get_by_label('복원할 파일의 백업 암호',exact=True).fill(BACKUP_PASSWORD)
        page.get_by_role('button',name='복원 내용 확인',exact=True).click()
        dialog=page.get_by_role('dialog',name='현재 데이터를 백업으로 교체',exact=True)
        dialog.get_by_role('button',name='전체 복원 실행',exact=True).click()
        expect(dialog.get_by_role('alert')).to_be_visible()
        dialog.get_by_role('button',name='취소',exact=True).click()
        page.get_by_label('현재 소유자 비밀번호',exact=True).fill(PASSWORD)
        page.get_by_role('button',name='복원 내용 확인',exact=True).click()
        page.get_by_role('dialog').get_by_role('button',name='전체 복원 실행',exact=True).click()
        expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible(timeout=15000)
        login()
        page.get_by_role('button',name=ENTRY+' 상세 보기',exact=True).click()
        detail=page.get_by_role('dialog',name=ENTRY,exact=True)
        detail.get_by_role('button',name='보기',exact=True).first.click()
        expect(detail.get_by_label('운영용 인증값',exact=True)).to_have_value('browser-test-key-v2')
        close_detail(); menu('설정')
        page.get_by_label('현재 비밀번호',exact=True).fill(PASSWORD)
        page.get_by_label('새 비밀번호 (12자 이상)',exact=True).fill(NEW_PASSWORD)
        page.get_by_label('새 비밀번호 확인',exact=True).fill(NEW_PASSWORD)
        page.get_by_role('button',name='비밀번호 변경',exact=True).click()
        expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible(); login(NEW_PASSWORD)
        page.get_by_role('button',name='잠금·로그아웃',exact=True).click(); page.reload()
        expect(page.get_by_role('heading',name='보관함 열기',exact=True)).to_be_visible(); login(NEW_PASSWORD)
        assert not errors,errors
        print('PASS backup, wrong-owner rejection, restore/session revocation, password change and logout; browser errors=0',flush=True)
    finally:
        browser.close()
