# Keydesk implementation plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task by task; independent subsystems use frozen contracts and separate file ownership under `superpowers:dispatching-parallel-agents`.

**Goal:** Replace the inherited application with independently implemented Korean Keydesk, including a usable vault first and gateway/usage/cost workflows.

**Architecture:** React/Vite client, Fastify/Node 26 server, SQLite WAL and AES-256-GCM secret storage. One owner, no hosted account service, no mandatory Redis. The server owns same-origin authenticated management APIs and separately authenticated gateway routes.

**Tech stack:** TypeScript, npm workspaces, Node built-in sqlite/crypto/http, Fastify 5, React 19, Vite, Zod, Nodemailer; native node:test integration tests.

**Spec:** `docs/superpowers/specs/2026-11-05-keydesk-rebuild-design.md`

## Global constraints

- All user-facing UI, errors, emails, docs and operating instructions are Korean
- Windows and macOS browser use and management scripts; AMD64/ARM64 deployment
- Default time zone Asia/Seoul; preserve original currency and explicitly estimated KRW conversion
- Use the restrained list/detail v2 mockup, no decorative statistic cards or marketing copy
- No inherited product source, assets, API, container, identity or runtime dependency in the final current tree
- Preserve original history, ignored user files, root keys and existing data; no force push or deployment
- Implement authentication and encryption now, not after network exposure
- No secret values in list endpoints, localStorage, URL or logs
- Tests exercise real crypto/SQLite and local mock providers; do not spend actual provider credentials

## Review focus

- An old database without its root key must refuse startup, not generate a new encryption key (core test)
- Restore with a corrupt file or wrong password must preserve current data and sessions (backup tests)
- Expiry dates at Korean midnight, including leap days, must be calendar-correct (date tests)
- A gateway key must not access owner APIs or an unassigned route, even with concurrent requests (gateway tests)
- Korean IME composition, long strings, clipboard denial and 390px browser width must remain usable (web/browser tests)

## Shared HTTP and module contracts

All management JSON uses `{message}` on error and bounded validated input. Mutations require the exact configured Origin and, after login, `X-CSRF-Token` from auth state. Cookies are HttpOnly/SameSite; Secure for HTTPS. APIs below are the source of truth for implementation tasks; runtime schemas and TypeScript types live in `packages/contracts/src/index.ts`.

- `GET /api/auth/state` → `{initialized,authenticated,user?:{name},csrfToken?:string}`
- `POST /api/auth/setup` `{token,name,password}`, `POST /api/auth/login` `{password}` → auth state plus cookie; `POST /api/auth/logout`; `POST /api/auth/password` `{currentPassword,newPassword}`
- `GET /api/projects` → `{projects}`; `POST /api/projects` `{name}` → `{project}`; `DELETE /api/projects/:id` (409 if still referenced)
- `GET /api/entries` → `{entries}`; `POST /api/entries` and `PUT /api/entries/:id` use `EntryDraft`; `DELETE /api/entries/:id`
- Entry fields: `id,name,provider,description,websiteUrl,consoleUrl,docsUrl,endpointUrl,owner,tags,plan,quota,notes,projectIds,credentials,createdAt,updatedAt`
- Credential metadata: `id,label,status,issuedAt,expiresAt,version,createdAt,updatedAt`; drafts add optional `value` and optional `id`; a new credential requires `value`, an existing credential without `value` preserves it
- `POST /api/credentials/:id/reveal` `{version?:number}` → `{value}` with no-store; `GET /api/credentials/:id/versions` → `{versions}` (metadata only)
- `POST /api/entries/import` `{entries:ImportEntryDraft[]}` imports a validated bounded batch atomically; optional `entryId` updates an existing item and omission creates one; client parses `.env` without execution and previews before calling this endpoint
- `GET /api/notifications` → `{notifications}`; `POST /api/notifications/refresh`; `PUT /api/notifications/:id` `{read:true}`
- `GET /api/settings` → `{settings}`; `PUT /api/settings` accepts settings; fields `timeZone,retentionDays,krwExchangeRate,exchangeRateDate,smtp:{host,port,secure,user,password?,from,to}`; SMTP password is write-only, read returns `passwordConfigured`
- `POST /api/settings/smtp/test` tests configured mail delivery with owner-selected recipient
- `POST /api/backups` `{password,ownerPassword}` → `{backup}`; `POST /api/backups/restore` `{password,ownerPassword,backup}` → `{restored:true}`, revoke sessions/clients only after successful atomic restoration
- `GET/POST /api/gateway/routes` → `{routes}` / `{route}`; `PUT/DELETE /api/gateway/routes/:id`
- Route fields: `id,name,slug,projectId,credentialId,baseUrl,allowedMethods,adapter,enabled,allowPrivateNetwork` where adapter is `generic|openai|anthropic`
- `GET/POST /api/gateway/clients` → `{clients}` / `{client,token}`; `PUT /api/gateway/clients/:id` updates `{revoked?,dailyRequestLimit?,dailyTokenAlert?,dailyCostAlertMicros?}`; drafts include `name,projectId,routeIds,expiresAt?`
- `GET/POST /api/gateway/prices` → `{prices}` / `{price}`; fields `adapter,model,currency,inputPerMillion,outputPerMillion,cachedInputPerMillion,startsAt`, prices supplied as decimal strings
- `GET /api/usage?projectId=&days=` → `{records,summary}`; summary includes requests, tokens, unknownUsageCount and per-currency costs
- `/gw/:slug/*` validates Bearer client token, only assigned routes/projects, injects current active stored credential, streams bounded provider traffic, records outcome with unknown usage distinct from zero

Server integration interface (`apps/server/src/context.ts`): `CoreContext {db:DatabaseSync; now:()=>Date; getSettings:()=>Settings; getCredential:(id:string)=>ResolvedCredential; audit:(action:string,details:Record<string,unknown>)=>void}`. `ResolvedCredential {id,entryId,version,value,status,expiresAt}`. `registerGateway(app:FastifyInstance,context:CoreContext):Promise<void>` owns gateway tables and routes. Parent server authenticates all `/api/*` management requests except auth state/setup/login, and enforces Origin/CSRF; `/gw/*` authenticates independently. Context and public contracts are frozen before domain agents start.

### Task 1: Foundation and recoverability

Files: root manifests, `packages/contracts`, `apps/server/src/context.ts`, `.local/rebuild/progress.md`.

- [x] Preserve original Git bundle, tracked tar snapshot, untracked design and mockups outside the checkout; verify the bundle and record original tracked paths
- [x] Create workspaces, frozen contracts and package scripts; run dependency install once under root ownership
- [x] Record project rulings, ownership and commands in the ledger so compaction cannot duplicate work

### Task 2: Owner server and vault

Files owned: `apps/server/src/{app,main,errors,db,crypto,auth,vault,dates,notifications,backup,settings,cli}.ts`, core tests; never edit gateway-owned directory or root contracts without coordinating.

- [x] Write and run failing HTTP tests for one-use bootstrap, login, session separation, CSRF and cross-origin rejection
- [x] Implement `createApp({dataDir,origin,now?,backgroundJobs?})` and fresh SQLite schema, root-key guard, scrypt password hashing and sessions
- [x] Write failing tests for no plaintext DB/list values, multiple key dates, replacement history, project references and batch import rollback; implement vault APIs to pass them
- [x] Write failing Korea-midnight and disabled-key tests; implement date validation and deduplicated app/mail reminders at 30/7/0 days
- [x] Write failing backup round-trip/wrong-password/tamper tests with a different target root key; implement bounded passphrase-encrypted logical backup and candidate-DB atomic restore
- [x] Test settings with write-only encrypted SMTP password, local SMTP test message and password reset CLI
- [x] Run native node:test core suite and TypeScript checks; report exact counts and unresolved issues

### Task 3: Gateway, limits and usage

Files owned: `apps/server/src/gateway/**`, gateway tests. Consumes frozen context; management security is inherited from Task 2.

- [x] Write failing tests for route/client scope, hashing, revocation, expiry, secret injection and provider auth-header replacement; implement route and client management
- [x] Write failing SSRF/path escape/redirect tests; implement pinned DNS validation, explicit private-destination opt-in, timeout/body bounds, and no automatic retry
- [x] Use real local HTTP mock providers for REST and incremental SSE, cancellation, OpenAI Responses/Chat Completions and Anthropic Messages usage parsing
- [x] Assert concurrent daily request admission cannot exceed the limit, count actual dispatched attempts and distinguish rejected requests
- [x] Implement immutable model price snapshots with exact decimal arithmetic, original currencies, unknown usage and explicitly soft token/cost alerts when no safe preflight upper bound exists
- [x] Run gateway tests, including malformed usage events and truncated streams; report counts and limitations

### Task 4: Korean web application

Files owned: `apps/web/**`. Consumes frozen contracts and HTTP APIs; no root lockfile edits.

- [x] Write failing tests for calendar expiry, Korean search, `.env` CRLF/BOM parsing without interpolation/execution, draft validation and currency formatting
- [x] Implement actual setup/login flows, vault list/detail/editor with per-key expiry, version reveal and clearing values on timer/lock
- [x] Implement project creation within entry edit, import preview/confirmation, notifications, settings with SMTP test and reauthentication for backup/restore
- [x] Implement gateway route/client UI, one-time token display, revoke, call limits, price input and usage/currency reports; distinguish memo quota from measured values
- [x] Apply the v2 restrained design, system Korean fonts, Ctrl/Command handling, IME guard, focus/keyboard handling, responsive details and fallback copy
- [x] Run unit/build/type checks and actual browser flows against Task 2+3; do not seed fake entries into the production store

### Task 5: Cross-platform operations and final cutover

Files: `tools/**`, `Dockerfile`, `compose.yaml`, `.github/workflows/keydesk.yml`, new root docs/license/instructions and `.gitignore`.

- [x] Write tests for portable management commands and Unicode/space paths; implement Node setup/start/stop/status/backup/reset commands
- [x] Build non-root AMD64/ARM64-capable container using verified TLS/CA/proxy configuration; run the locally supported architecture and disclose the others as unrun
- [x] Write Korean install/update/backup/restore guidance for PowerShell, macOS and Linux, plus TLS gateway-only exposure example
- [x] When the new app passes, remove original tracked product files and relocate original ignored build/dependency directories into the external preservation area; never remove `.git` or user data
- [x] Scan current tracked product tree for inherited product identifiers, domains, dependencies, assets and infrastructure
- [x] Run full tests/build/browser/container/restart checks, independently review security-sensitive paths, fix material findings and rerun affected checks
- [x] Replace reusable cloud install/start draft with tested new instructions; report snapshot/publication/fresh-task restoration separately

## Execution record

The user said to proceed after reviewing the restrained v2 mockup. Continue authorized implementation without additional confirmation between tasks. No network publish, remote push or migration of unknown user data is authorized by this plan. Root coordinates dependency installs and final cutover; domain work uses disjoint paths and frozen contracts.

## 검증 기록

전체 테스트 91개, 빌드·타입·포맷 검사, 실제 Chromium 흐름, Linux AMD64 컨테이너와 네이티브 재시작을 통과했다. 세부 결과는 `.local/rebuild/final-verification.md`에 있다. 게이트웨이 독립 검토와 확인된 기반 코드 지적은 수정했으나, 기반 검토의 후속 실행은 자동 콘텐츠 검토로 중단되어 전체 독립 검토 완료를 의미하지 않는다. Windows·macOS·ARM64 실기 및 새 클라우드 작업 복원은 미검증이며 원격 push·배포는 하지 않았다. 클라우드 설치·시작 설정은 초안에 저장했고 게시는 사용자가 수행한다.
