import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Credential, Entry } from '@keydesk/contracts';
import { emptyDraft, searchEntries, matchesVaultFilter, vaultExpiry, visibleVaultEntries, parseVaultPreferences } from '../src/helpers.ts';

const now = new Date('2026-11-06T03:00:00Z');
const zone = 'Asia/Seoul';
function key(id: string, expiresAt: string, status: Credential['status'] = 'active'): Credential {
  return { id, label: id, expiresAt, status, issuedAt: '', version: 1, createdAt: '', updatedAt: '' };
}
function entry(id: string, credentials: Credential[], extra: Partial<Entry> = {}): Entry {
  return { ...emptyDraft(), id, name: id, credentials, createdAt: '', updatedAt: '', ...extra };
}

test('한 항목의 지난 키·예정 키·미등록 키가 각 필터에서 발견된다', () => {
  const mixed = entry('mixed', [key('old', '2026-11-01'), key('next', '2026-11-20'), key('unknown', '')]);
  assert.equal(matchesVaultFilter(mixed, 'expired', zone, now), true);
  assert.equal(matchesVaultFilter(mixed, 'expiring', zone, now), true);
  assert.equal(matchesVaultFilter(mixed, 'unset', zone, now), true);
  assert.equal(vaultExpiry(mixed, 'expired', zone, now), '2026-11-01');
  assert.equal(vaultExpiry(mixed, 'expiring', zone, now), '2026-11-20');
  assert.equal(vaultExpiry(mixed, 'unset', zone, now), '');
});
test('중지·폐기한 키는 만료 작업 목록에서 제외하고 오늘 만료와 30일 경계를 포함한다', () => {
  const stopped = entry('stopped', [key('past', '2026-11-01', 'paused'), key('empty', '', 'revoked')]);
  assert.equal(matchesVaultFilter(stopped, 'all', zone, now), true);
  for (const filter of ['expired', 'expiring', 'unset'] as const) assert.equal(matchesVaultFilter(stopped, filter, zone, now), false);
  assert.equal(matchesVaultFilter(entry('today', [key('key', '2026-11-06')]), 'expiring', zone, now), true);
  assert.equal(matchesVaultFilter(entry('day30', [key('key', '2026-12-06')]), 'expiring', zone, now), true);
  assert.equal(matchesVaultFilter(entry('day31', [key('key', '2026-12-07')]), 'expiring', zone, now), false);
});
test('만료일 정렬은 ISO 오프셋과 날짜만 있는 값을 설정 시간대에서 비교하고 미등록을 뒤에 둔다', () => {
  const entries = [entry('unknown', [key('key', '')]), entry('calendar', [key('key', '2026-11-07')]), entry('late', [key('key', '2026-11-07T15:00:00+09:00')]), entry('early', [key('key', '2026-11-07T00:30:00Z')])];
  const result = visibleVaultEntries(entries, [], { query: '', project: '', filter: 'all', sort: 'expiry', zone, now });
  assert.deepEqual(result.map(e => e.id), ['early', 'late', 'calendar', 'unknown']);
});
test('필터에 맞는 날짜로 정렬하며 프로젝트와 검색 조건을 함께 적용한다', () => {
  const entries = [entry('mixed', [key('past', '2026-10-01'), key('upcoming', '2026-11-25')], { projectIds: ['p'] }), entry('first', [key('key', '2026-11-10')], { projectIds: ['p'] }), entry('outside', [key('key', '2026-11-08')])];
  const projects = [{ id: 'p', name: '핀메이트', createdAt: '' }];
  assert.deepEqual(visibleVaultEntries(entries, projects, { query: '핀메이트', project: 'p', filter: 'expiring', sort: 'expiry', zone, now }).map(e => e.id), ['first', 'mixed']);
});
test('인증값을 조회하지 않아도 키 이름과 관리 메모로 찾을 수 있다', () => {
  const item = entry('sample', [key('운영 서버', '')], { notes: '사진 정리용 보조 계정' });
  assert.equal(searchEntries([item], '운영 서버', []).length, 1);
  assert.equal(searchEntries([item], '사진 정리', []).length, 1);
});
test('보기 설정의 잘못된 저장값과 임의 속성을 무시하고 안전한 필터·정렬만 복원한다', () => {
  assert.deepEqual(parseVaultPreferences(null), { filter: 'all', sort: 'expiry' });
  assert.deepEqual(parseVaultPreferences('{broken'), { filter: 'all', sort: 'expiry' });
  assert.deepEqual(parseVaultPreferences('{"filter":"expiring","sort":"name","query":"should-not-be-retained","value":"do-not-copy"}'), { filter: 'expiring', sort: 'name' });
  assert.deepEqual(parseVaultPreferences('{"filter":"everything","sort":"random"}'), { filter: 'all', sort: 'expiry' });
});
