import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Credential, Entry } from '@keydesk/contracts';
import { emptyDraft } from '../src/helpers.ts';
import { deskKeyContext, deskMatches, deskQueue, type DeskKey } from '../src/vault/desk-work.ts';

function key(id: string, expiresAt = '', status: Credential['status'] = 'active'): Credential {
  return {
    id,
    label: id,
    expiresAt,
    status,
    issuedAt: '',
    version: 1,
    createdAt: '',
    updatedAt: '',
  };
}

function entry(id: string, credentials: Credential[], extra: Partial<Entry> = {}): Entry {
  return { ...emptyDraft(), id, name: id, credentials, createdAt: '', updatedAt: '', ...extra };
}

test('desk queue groups active keys at the exact expiry boundary and sorts in the selected zone', () => {
  const mixed = entry('mixed', [
    key('date-only', '2026-11-07'),
    key('later', '2026-11-06T16:00:00Z'),
    key('boundary', '2026-11-06T15:30:00Z'),
    key('unset'),
    key('paused', '2026-11-06', 'paused'),
    key('invalid', '2026-11-31'),
    key('day31', '2026-12-08'),
  ]);
  const other = entry('other', [
    key('older', '2026-11-06'),
    key('soon', '2026-11-07T00:30:01+09:00'),
    key('day30', '2026-12-07'),
    key('revoked', '', 'revoked'),
  ]);
  const queue = deskQueue(
    [mixed, other, entry('empty', [])],
    'Asia/Seoul',
    new Date('2026-11-06T15:30:00Z'),
  );
  const rows = (keys: DeskKey[]) =>
    keys.map(({ entry, credential, day, days }) => [entry.id, credential.id, day, days]);
  assert.deepEqual(rows(queue.expired), [
    ['other', 'older', '2026-11-06', -1],
    ['mixed', 'boundary', '2026-11-07', -1],
  ]);
  assert.deepEqual(rows(queue.expiring), [
    ['other', 'soon', '2026-11-07', 0],
    ['mixed', 'later', '2026-11-07', 0],
    ['mixed', 'date-only', '2026-11-07', 0],
    ['other', 'day30', '2026-12-07', 30],
  ]);
  assert.deepEqual(rows(queue.unset), [['mixed', 'unset', '', null]]);
});

test('desk search finds the exact normalized key label and keeps metadata matches whole', () => {
  const target = { ...key('target'), label: 'OpenAI 운영 키', value: 'fake-secret-test-value' };
  const item = entry('item', [key('OpenAI 운영 키 백업'), target], { notes: '관리 문서' });
  const projects = [{ id: 'p', name: '개발 프로젝트', createdAt: '' }];

  assert.deepEqual(deskMatches(item, '  OPENAI 운영 키  '.normalize('NFD'), projects), [target]);
  assert.deepEqual(deskMatches(item, '백업', projects), [item.credentials[0]]);
  assert.equal(deskMatches(item, '문서', projects), null);
  assert.equal(deskMatches(entry('empty', [], { projectIds: ['p'] }), '개발', projects), null);
  assert.equal(deskMatches(item, ' ', projects), null);
  assert.deepEqual(deskMatches(item, 'fake-secret-test-value', projects), []);
});

test('same-named credentials identify their project or distinguish an otherwise identical row', () => {
  const projects = [
    { id: 'p', name: 'PinMate', createdAt: '' },
    { id: 'q', name: 'Keydesk', createdAt: '' },
  ];
  const first = entry('entry-001', [key('운영 키')], { name: 'OpenAI', projectIds: ['p'] });
  const other = entry('entry-002', [key('운영 키')], { name: 'OpenAI', projectIds: ['q'] });
  assert.deepEqual(deskKeyContext(first, first.credentials[0], [first, other], projects), {
    caption: 'PinMate',
    ambiguous: true,
  });
  assert.deepEqual(deskKeyContext(other, other.credentials[0], [first, other], projects), {
    caption: 'Keydesk',
    ambiguous: true,
  });
  const same = { ...other, projectIds: ['p'] };
  assert.notEqual(
    deskKeyContext(first, first.credentials[0], [first, same], projects).caption,
    deskKeyContext(same, same.credentials[0], [first, same], projects).caption,
  );
});
