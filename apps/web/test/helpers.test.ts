import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarDay,
  formatCredentialDate,
  expiryDays,
  expiryText,
  firstExpiry,
  searchEntries,
  parseEnv,
  validateDraft,
  formatMoney,
  formatExactMoney,
  usageCost,
  routePayload,
  emptyDraft,
} from '../src/helpers.ts';
test('한국 자정과 윤년 만료일을 달력 날짜로 계산한다', () => {
  assert.equal(calendarDay(new Date('2028-02-28T15:00:00Z'), 'Asia/Seoul'), '2028-02-29');
  assert.equal(expiryDays('2028-03-01', new Date('2028-02-28T15:00:00Z')), 1);
  assert.equal(expiryDays('2027-02-29'), null);
});
test('검색은 한글 정규화와 제공사·태그·프로젝트 이름을 포함한다', () => {
  const entry = {
    ...emptyDraft(),
    id: 'a',
    name: '한글',
    provider: 'OpenAI',
    tags: ['음성'],
    projectIds: ['p'],
    credentials: [],
    createdAt: '',
    updatedAt: '',
  };
  assert.equal(searchEntries([entry], '한글', []).length, 1);
  assert.equal(
    searchEntries([entry], '개발', [{ id: 'p', name: '개발', createdAt: '' }]).length,
    1,
  );
  assert.equal(searchEntries([entry], 'OPENAI', []).length, 1);
});
test('.env BOM과 CRLF를 읽고 보간·명령을 문자열로 보존한다', () => {
  const result = parseEnv(
    '\uFEFFexport KEY="${HOME}$(touch /tmp/no)"\r\nOTHER=abc # 설명\r\nSINGLE=\'x # y\'\r\n',
  );
  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.rows.map((x) => [x.name, x.value]),
    [
      ['KEY', '${HOME}$(touch /tmp/no)'],
      ['OTHER', 'abc'],
      ['SINGLE', 'x # y'],
    ],
  );
});
test('.env 중복·잘못된 줄·닫히지 않은 따옴표를 줄 번호와 함께 거절한다', () => {
  const result = parseEnv('A=1\nA=2\nbroken\nQ="abc');
  assert.deepEqual(
    result.errors.map((x) => x.line),
    [2, 3, 4],
  );
});
test('인증값 유지와 교체를 구분하고 독립된 날짜를 검증한다', () => {
  const draft = {
    ...emptyDraft(),
    name: '항목',
    credentials: [
      {
        id: 'a',
        label: '운영',
        status: 'active' as const,
        issuedAt: '2028-02-29',
        expiresAt: '2028-03-01',
      },
    ],
  };
  assert.deepEqual(validateDraft(draft), []);
  assert.match(
    validateDraft({ ...draft, credentials: [{ ...draft.credentials[0], id: undefined }] })[0]!,
    /인증값/,
  );
  assert.match(
    validateDraft({
      ...draft,
      credentials: [{ ...draft.credentials[0], expiresAt: '2027-02-29' }],
    })[0]!,
    /날짜/,
  );
});
test('금액은 원래 통화와 미확인을 구분한다', () => {
  assert.match(formatMoney(1234567, 'USD'), /1\.234567/);
  assert.equal(formatMoney(null, 'KRW'), '미확인');
  assert.match(formatMoney(2000000, 'KRW'), /2/);
});
test('비용은 1마이크로 미만과 안전한 정수 범위 초과도 0이나 반올림으로 숨기지 않는다', () => {
  assert.equal(formatExactMoney('0.000000001', 'USD'), 'USD 0.000000000000001');
  assert.equal(
    formatExactMoney('9007199254740992.123456789', 'KRW'),
    'KRW 9,007,199,254.740992123456789',
  );
  assert.equal(formatExactMoney('1000000.000000000', 'USD'), 'USD 1');
  assert.equal(formatExactMoney(null, 'USD'), '미확인');
});

test('토큰 미확인·모델 단가 없음·캐시 쓰기 미지원은 비용에서 따로 설명한다', () => {
  const record = { currency: 'USD', costMicros: null };
  assert.equal(
    usageCost({
      ...record,
      costStatus: 'unknown-usage',
    } as import('@keydesk/contracts').UsageRecord),
    '미확인 (토큰 사용량 없음)',
  );
  assert.equal(
    usageCost({ ...record, costStatus: 'unpriced' } as import('@keydesk/contracts').UsageRecord),
    '미확인 (모델 단가 없음)',
  );
  assert.equal(
    usageCost({
      ...record,
      costStatus: 'unsupported-cache-write',
    } as import('@keydesk/contracts').UsageRecord),
    '미확인 (캐시 쓰기 단가 미지원)',
  );
  assert.equal(
    usageCost({
      ...record,
      costMicros: 0,
      costExactMicros: '0.000000001',
      costStatus: 'estimated',
    } as import('@keydesk/contracts').UsageRecord),
    'USD 0.000000000000001',
  );
  assert.match(
    usageCost({
      ...record,
      costExactMicros: '9007199254740992.0',
      costStatus: 'overflow',
    } as import('@keydesk/contracts').UsageRecord),
    /표시 범위 초과/,
  );
});

test('제공사 전용 경로에는 일반 REST 설정을 전송하지 않는다', () => {
  const generic = {
    name: '경로',
    slug: 'path',
    projectId: 'p',
    credentialId: 'c',
    baseUrl: 'https://example.com',
    allowedMethods: ['POST'],
    adapter: 'generic' as const,
    enabled: true,
    allowPrivateNetwork: false,
    authHeader: 'X-API-Key',
    authScheme: 'raw' as const,
    authBindings: [{ credentialId: 'c', location: 'query' as const, name: 'apiKey' }],
    detectJsonError: true,
  };
  assert.equal(routePayload(generic).authHeader, undefined);
  assert.equal(routePayload(generic).authScheme, undefined);
  const { authBindings, ...legacy } = generic;
  assert.equal(routePayload(legacy).authHeader, 'X-API-Key');
  assert.deepEqual(routePayload(generic).authBindings, generic.authBindings);
  assert.equal(routePayload(generic).detectJsonError, true);
  assert.equal(routePayload({ ...generic, adapter: 'openai' }).authHeader, undefined);
  assert.equal(routePayload({ ...generic, adapter: 'anthropic' }).authScheme, undefined);
  assert.equal(routePayload({ ...generic, adapter: 'openai' }).authBindings, undefined);
  assert.equal(routePayload({ ...generic, adapter: 'anthropic' }).authBindings, undefined);
  assert.equal(routePayload({ ...generic, adapter: 'openai' }).detectJsonError, undefined);
});

test('명시한 ISO 시각은 오프셋을 보존하고 정확한 만료 순간부터 만료로 분류한다', () => {
  const timestamp = '2026-11-05T23:30:00+09:00';
  assert.equal(expiryDays(timestamp, new Date('2026-11-05T14:29:59Z'), 'Asia/Seoul'), 0);
  assert.equal(expiryDays(timestamp, new Date('2026-11-05T14:30:00Z'), 'Asia/Seoul'), -1);
  assert.equal(expiryText(timestamp, 'Asia/Seoul', new Date('2026-11-05T14:30:00Z')), '만료됨');
  assert.equal(expiryDays('2026-11-05', new Date('2026-11-05T14:59:59Z'), 'Asia/Seoul'), 0);
  assert.equal(expiryDays('2026-11-05', new Date('2026-11-05T15:00:00Z'), 'Asia/Seoul'), -1);
  const draft = {
    ...emptyDraft(),
    name: '시각 항목',
    credentials: [
      {
        id: 'a',
        label: '키',
        status: 'active' as const,
        issuedAt: '2026-11-01T01:00:00Z',
        expiresAt: timestamp,
      },
    ],
  };
  assert.deepEqual(validateDraft(draft), []);
  assert.equal(draft.credentials[0].expiresAt, timestamp);
});
test('ISO 만료 시각은 설정된 시간대의 날짜로 검색 필터를 계산한다', () => {
  assert.equal(
    expiryDays('2026-11-06T00:30:00+09:00', new Date('2026-11-05T14:00:00Z'), 'Asia/Seoul'),
    1,
  );
  assert.equal(
    expiryDays('2026-11-06T00:30:00+09:00', new Date('2026-11-05T14:00:00Z'), 'America/New_York'),
    0,
  );
  assert.equal(expiryDays('2027-02-29T00:30:00+09:00'), null);
  assert.equal(expiryDays('2026-11-05T24:30:00+09:00'), null);
});

test('가장 빠른 만료는 ISO 문자열 순서 대신 설정 시간대와 정확한 시각으로 정한다', () => {
  const credentials = [
    { status: 'active' as const, expiresAt: '2026-11-05' },
    { status: 'active' as const, expiresAt: '2026-11-06T01:00:00+12:00' },
    { status: 'paused' as const, expiresAt: '2026-01-01' },
  ];
  assert.equal(firstExpiry(credentials, 'Asia/Seoul'), '2026-11-06T01:00:00+12:00');
  assert.equal(
    firstExpiry(
      [
        { status: 'active', expiresAt: '2026-11-05T20:00:00-05:00' },
        { status: 'active', expiresAt: '2026-11-06T00:00:00+09:00' },
      ],
      'Asia/Seoul',
    ),
    '2026-11-06T00:00:00+09:00',
  );
});

test('읽기 전용 날짜는 원본 오프셋을 한국어 설정 시간대로 표시하고 날짜만 있으면 시각을 만들지 않는다', () => {
  const utc = '2026-11-01T01:00:00Z';
  assert.equal(
    formatCredentialDate(utc, 'Asia/Seoul'),
    '2026년 11월 1일 오전 10:00:00 (한국 시간)',
  );
  assert.equal(
    formatCredentialDate('2026-12-31T12:30:00+09:00', 'Asia/Seoul'),
    '2026년 12월 31일 오후 12:30:00 (한국 시간)',
  );
  assert.equal(formatCredentialDate('2026-11-01', 'America/New_York'), '2026년 11월 1일');
  assert.equal(formatCredentialDate(utc, 'UTC'), '2026년 11월 1일 오전 1:00:00 (UTC 기준)');
  assert.equal(utc, '2026-11-01T01:00:00Z');
});
