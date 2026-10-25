# Keydesk 개인 UI

Keydesk는 제공사 정보와 인증 키를 확인하는 개인 작업대다. 장식보다 API의 용도, 발급 위치, 사용처와 만료 상태를 빨리 읽는 것이 우선이다.

## 근거

thisNorm 계정의 레포 34개에서 파일 구조를 확인하고, 화면이 있는 프로젝트의 디자인 문서와 스타일을 검토했다. 빈 저장소 하나와 알고리즘·백엔드·학습용 레포는 UI 비교에서 제외했다. 하나의 고정된 취향이라고 단정하지 않고, 관리 도구에 반복되는 특징을 적용했다.

- [HarnessVault 디자인](https://github.com/thisNorm/HarnessVault/blob/main/DESIGN.md): 흑연 표면, 밝기 단계로 나눈 패널, 파란 동작, 얇은 상태 막대, 작은 글자와 모서리.
- [Agent Office 디자인](https://github.com/thisNorm/agent-office/blob/main/DESIGN.md): 작은 헤더와 정밀한 정보 배치, 얇은 경계선, 선택과 상태에 사용하는 색상.
- [포트폴리오 스타일](https://github.com/thisNorm/my-portfolio/blob/main/app/globals.css): 네이비 바탕, 녹색 시그니처, 고정 탐색과 정리된 관리 패널.
- [Finance Agent 스타일](https://github.com/thisNorm/finance-agent/blob/master/src/style.css): 한국어 중심의 개인용 도구, 절제된 색상과 입력·목록의 명확한 구분.
- [Tailscale Monitor 스타일](https://github.com/thisNorm/tailscale-monitor/blob/main/public/style.css): 작고 명확한 조작부, 표 중심 정보, 숫자·식별자의 고정폭 글꼴.

## 적용

- 이름은 Keydesk, 개인 서명은 Norm. 기반 프로젝트 Infisical 표시와 라이선스를 유지한다.
- 기본 어두운 화면은 흑연·네이비 표면을 쓴다. 기존 밝은 테마의 가독성을 유지한다.
- 기본 전경·구분선·입력창은 기존 v3 의미 토큰에 연결한다. 색상은 선택, 동작과 실제 상태를 구분하는 데 사용한다.
- API 목록에는 제공사 사이트와 용도·사용 프로젝트·만료 상태를 먼저 배치한다. 키 값은 목록과 통계에 표시하지 않는다.
- URL·인증값·수치에는 고정폭과 줄바꿈을 사용한다. 한글 문장에는 운영체제 한글 글꼴 대체 경로를 둔다.
- 패널, 입력창, 상세·수정 창의 구조와 키보드 동작은 기존 v3 컴포넌트를 재사용한다. 외부 폰트와 새 런타임 의존성을 추가하지 않는다.
- 작은 화면에서는 목록 열과 조작부가 겹치지 않게 재배치한다.

## 동작 유지

디자인 변경으로 저장 형식, 조직별 접근 권한, 키의 명시적 읽기, 수정 취소·삭제 확인, 기존 프로젝트 메뉴를 바꾸지 않는다. 제공사의 실시간 요금·사용량을 자동 조회하는 기능은 없으며, 사용자가 입력한 관리 정보로 표시한다.
