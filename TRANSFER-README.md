> GitHub 전달 브랜치: `thisNorm/keydesk` → `keydesk-transfer-2026-11-09`.
> 브랜치의 Code → Download ZIP 또는 Git clone으로 받을 수 있다.
> 다운로드 후 브랜치를 삭제하거나 그대로 작업용으로 재활용해도 된다.
> `KEYDESK-HANDOFF.md`의 맨 앞에 최신 전달 승인과 상태를 추가했다.

# 최신 Keydesk 작업본 이전

이 압축본은 2026-11-09 Cloud의 `/workspace/keydesk` 작업 트리를 담는다.
GitHub의 과거 Infisical 기반 사본이 아니라 `apps/web`이 있는 독립 앱이다.
최신 CSS 개편과 전체 통합 검증은 아직 끝나지 않은 개발 중 작업본이다.

## Windows에서 사용

1. ZIP을 새 폴더에 압축 해제한다. 기존 구버전 앱에 덮어쓰지 않는다.
2. 압축을 푼 `keydesk-current-2026-11-09` 폴더에서 PowerShell을 연다.
3. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Import-ToWindows.ps1`
   을 실행하면 `%USERPROFILE%\source\keydesk-current-2026-11-09`에 새 사본을 만들고
   모든 목록 파일의 SHA-256을 검사한다. 이미 대상 폴더가 있으면 거부한다.
   다른 대상은 `-Destination "D:\개발\keydesk-current"`로 지정할 수 있다.
4. 압축 해제한 위치를 그대로 사용할 경우 `-VerifyOnly`로 검사하고 그 폴더를 열어도 된다.
5. 새 Codex 세션에서 실제 생성된 폴더를 연 다음 `KEYDESK-HANDOFF.md`를 읽게 한다.

## 들어 있는 내용

- 현재 서버·웹·계약·관리 도구 코드, 의존성 잠금 파일, 운영 문서.
- 디자인 조사·HTML·시안 이미지. 과거 거부 시안도 있으니 인계문의 구분을 읽는다.
- `.local/ux-2026-11-06` 아래 명시적으로 선택한 사전 코드·보고·시험 기록.
- 최신 인계문과 파일별 해시 목록.

## 들어 있지 않은 내용

- 실제 보관함 DB, 암호화 루트 키, 초기 등록 토큰, 세션, 실제 백업, `.env`.
- `.git` 이력, `node_modules`, 빌드 결과 `dist`.

사용자 보관함 데이터의 마이그레이션과 소스 코드 이전은 별개다.
이 압축본을 설치한다고 기존 보관함 데이터가 자동으로 옮겨지지 않는다.

Node 26과 npm 버전은 `package.json`을 확인한다.
필요한 의존성을 설치한 뒤 `npm test`, `npm run build`, `npm run format:check`로 검증한다.
이전 Cloud의 절대 경로를 Windows 코드에 그대로 사용하지 않는다.

이전 도우미는 Linux에서 패키지 무결성을 확인했지만 PowerShell/Windows 실기로 실행하지 않았다.
사용자가 이 전달 브랜치의 GitHub 업로드를 별도로 허용했다. 환경 게시와 제품 배포는 하지 않는다.
