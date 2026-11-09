# Keydesk

개인 API 키를 보관하고 프로젝트별 호출을 중계하는 한국어 웹 앱입니다. 하나의 서버에 보관함을 두고 Windows, macOS와 Linux의 브라우저에서 사용합니다. 별도 기기에 각각 설치하면 데이터가 자동으로 동기화되지 않습니다.

Node.js 26.12.1과 npm 11 이상을 준비하세요. 서버를 실행하는 계정만 데이터 디렉터리에 접근할 수 있도록 설정하세요.

```sh
npm ci
npm run setup
npm run build
npm start
npm run status
```

브라우저에서 <http://127.0.0.1:8088>을 여세요. 첫 설정 때 `.local/keydesk/bootstrap-token` 파일을 직접 읽고 화면에 입력해 소유자 이름과 비밀번호를 등록합니다. 토큰을 채팅, 이슈, 화면 캡처나 로그에 공유하지 마세요.

PowerShell에서는 `Get-Content .local\keydesk\bootstrap-token`, macOS와 Linux에서는 `cat .local/keydesk/bootstrap-token`으로 로컬 파일을 확인할 수 있습니다. 로그인 이후에는 키 등록, 프로젝트 연결, 키 교체와 만료 알림을 먼저 설정하세요. SMTP 메일과 호출 게이트웨이는 필요할 때 추가합니다.

```sh
npm run stop
npm run backup -- --output "내 백업.keydesk"
npm start
```

백업 명령은 현재 소유자 비밀번호와 별도의 백업 암호를 숨김 입력으로 받습니다. 예약 작업에는 `npm run backup:scheduled -- --directory "백업 보관함" --keep 7 --password-file "보호 폴더/백업 비밀번호.json"`을 사용할 수 있으며 서버를 중지하지 않습니다. 복원, 비밀번호 재설정, PowerShell 환경변수, Docker와 외부 게이트웨이 TLS 설정은 [운영 안내](docs/운영.md)를 참고하세요.

게이트웨이 사용량의 원래 통화를 보존하며 원화 환산은 설정한 환율을 적용한 추정치입니다. 실제 청구액은 제공사의 청구서에서 확인하세요. 보관함의 요금제·한도 메모는 실제 호출 측정값과 별개입니다.

개발할 때는 `npm run dev`로 API와 화면 개발 서버를 함께 실행합니다. 개발 화면은 <http://127.0.0.1:5173>이며 종료는 Ctrl+C입니다. `npm test`, `npm run typecheck`, `npm run build`로 검증합니다. 지원 플랫폼별 자동 검사는 GitHub Actions 구성에 정의되어 있으며 이 파일의 존재만으로 해당 환경에서 실행되었다고 볼 수는 없습니다.

MIT 라이선스. Copyright 2026 thisNorm.
