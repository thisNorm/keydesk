import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '@keydesk/contracts';
import { emptyDraft } from '../src/helpers.ts';
import {
  createEditorDraft,
  updateCredential,
  createRotationDraft,
  createImportDrafts,
  finishSaved,
} from '../src/vault/editor-model.ts';

function savedEntry(): Entry {
  return {
    ...emptyDraft(),
    id: 'entry',
    name: '최근 이름',
    provider: '제공사',
    description: '다른 화면에서 바꾼 용도',
    owner: '소유자',
    plan: '유료',
    quota: '한도 메모',
    notes: '최근 메모',
    websiteUrl: 'https://example.test',
    consoleUrl: 'https://example.test/console',
    docsUrl: 'https://example.test/docs',
    endpointUrl: 'https://example.test/api',
    tags: ['운영'],
    projectIds: ['new-project'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-06T01:00:00Z',
    credentials: [
      {
        id: 'target',
        label: '현재 키 이름',
        status: 'paused',
        issuedAt: '2026-10-01T10:11:12.123+09:00',
        expiresAt: '2027-10-01T01:11:12Z',
        version: 4,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-11-06T01:00:00Z',
      },
      {
        id: 'other',
        label: '다른 키',
        status: 'revoked',
        issuedAt: '2025-01-01T00:00:00-05:00',
        expiresAt: '2025-12-31',
        version: 2,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-12-31T00:00:00Z',
      },
    ],
  };
}

test('편집 초안은 기존 모든 메타데이터와 날짜 원문을 독립적으로 보존한다', () => {
  const entry = savedEntry();
  const draft = createEditorDraft(entry, 'ignored-project');
  assert.equal(draft.credentials?.[0]?.issuedAt, '2026-10-01T10:11:12.123+09:00');
  assert.equal(draft.credentials?.[1]?.issuedAt, '2025-01-01T00:00:00-05:00');
  assert.equal(draft.endpointUrl, 'https://example.test/api');
  assert.deepEqual(draft.projectIds, ['new-project']);
  draft.tags.push('편집');
  draft.projectIds.push('다른 프로젝트');
  draft.credentials![0]!.label = '수정';
  assert.deepEqual(entry.tags, ['운영']);
  assert.deepEqual(entry.projectIds, ['new-project']);
  assert.equal(entry.credentials[0]?.label, '현재 키 이름');
  assert.equal(draft.credentials?.[1]?.value, undefined);
});

test('새 등록은 현재 프로젝트를 적용하고 매번 독립된 인증값을 만든다', () => {
  const first = createEditorDraft(undefined, 'selected-project');
  const second = createEditorDraft();
  assert.deepEqual(first.projectIds, ['selected-project']);
  assert.equal(first.credentials?.length, 1);
  assert.equal(first.credentials?.[0]?.value, '');
  first.credentials![0]!.value = 'unusable-test-value';
  assert.equal(second.credentials?.[0]?.value, '');
  assert.deepEqual(second.projectIds, []);
});

test('한 키 편집은 이전 초안과 다른 키의 정확한 시각을 변경하지 않는다', () => {
  const initial = createEditorDraft(savedEntry());
  const edited = updateCredential(initial, 0, { label: '새 이름', value: 'unusable-next-value' });
  assert.equal(initial.credentials?.[0]?.label, '현재 키 이름');
  assert.equal(initial.credentials?.[0]?.value, undefined);
  assert.equal(edited.credentials?.[0]?.label, '새 이름');
  assert.equal(edited.credentials?.[0]?.expiresAt, '2027-10-01T01:11:12Z');
  assert.deepEqual(edited.credentials?.[1], {
    id: 'other',
    label: '다른 키',
    status: 'revoked',
    issuedAt: '2025-01-01T00:00:00-05:00',
    expiresAt: '2025-12-31',
  });
});

test('교체 요청은 최신 메타데이터와 다른 키를 유지하고 새 만료일을 추측하지 않는다', () => {
  const latest = savedEntry();
  const draft = createRotationDraft(
    latest,
    { id: 'target', version: 4 },
    {
      value: 'unusable-rotation-value',
      status: 'active',
      issuedAt: '2026-11-06T12:13:14+09:00',
      expiresAt: '',
    },
  );
  assert.equal(draft.name, '최근 이름');
  assert.equal(draft.description, '다른 화면에서 바꾼 용도');
  assert.equal(draft.owner, '소유자');
  assert.equal(draft.plan, '유료');
  assert.equal(draft.quota, '한도 메모');
  assert.equal(draft.notes, '최근 메모');
  assert.equal(draft.docsUrl, 'https://example.test/docs');
  assert.deepEqual(draft.projectIds, ['new-project']);
  assert.deepEqual(draft.tags, ['운영']);
  assert.deepEqual(draft.credentials?.[0], {
    id: 'target',
    label: '현재 키 이름',
    status: 'active',
    issuedAt: '2026-11-06T12:13:14+09:00',
    expiresAt: '',
    value: 'unusable-rotation-value',
  });
  assert.deepEqual(draft.credentials?.[1], {
    id: 'other',
    label: '다른 키',
    status: 'revoked',
    issuedAt: '2025-01-01T00:00:00-05:00',
    expiresAt: '2025-12-31',
  });
  assert.equal(latest.credentials[0]?.version, 4);
  assert.equal(latest.credentials[0]?.expiresAt, '2027-10-01T01:11:12Z');
});

test('이미 교체되었거나 삭제된 키로는 교체 초안을 만들지 않는다', () => {
  const replacement = {
    value: 'unusable-next-value',
    status: 'active' as const,
    issuedAt: '',
    expiresAt: '',
  };
  assert.throws(
    () => createRotationDraft(savedEntry(), { id: 'target', version: 3 }, replacement),
    /교체|버전/,
  );
  assert.throws(
    () => createRotationDraft(savedEntry(), { id: 'missing', version: 4 }, replacement),
    /없|삭제/,
  );
});

test('기존 항목 가져오기는 기존 키를 보존한 한 원자적 업데이트로 만든다', () => {
  const rows = [
    { name: 'FIRST', value: 'unusable-first' },
    { name: 'SECOND', value: 'unusable-second' },
  ];
  const drafts = createImportDrafts(rows, 'ignored', savedEntry());
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.entryId, 'entry');
  assert.equal(drafts[0]?.credentials?.length, 4);
  assert.equal(drafts[0]?.credentials?.[0]?.expiresAt, '2027-10-01T01:11:12Z');
  assert.equal(drafts[0]?.credentials?.[1]?.value, undefined);
  assert.equal(drafts[0]?.credentials?.[2]?.value, 'unusable-first');
  assert.equal(drafts[0]?.credentials?.[3]?.label, 'SECOND');
  assert.deepEqual(drafts[0]?.projectIds, ['new-project']);
  const fresh = createImportDrafts(rows, 'selected-project');
  assert.equal(fresh.length, 2);
  assert.equal(fresh[0]?.name, 'FIRST');
  assert.deepEqual(fresh[1]?.projectIds, ['selected-project']);
  assert.equal(fresh[0]?.entryId, undefined);
});

test('저장 응답 뒤 목록 읽기가 실패해도 폼을 닫아 중복 저장을 막고 경고한다', async () => {
  const events: string[] = [];
  await finishSaved(
    'saved-entry',
    async (id) => {
      events.push(`reload:${id}`);
      throw Error('시험용 목록 오류');
    },
    () => events.push('close'),
    (message) => events.push(message),
  );
  assert.equal(events[0], 'reload:saved-entry');
  assert.equal(events.filter((event) => event === 'close').length, 1);
  assert.ok(events.some((event) => /저장/.test(event) && /목록/.test(event)));
});
