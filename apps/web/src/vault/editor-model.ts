import type { CredentialDraft, Entry, EntryDraft, ImportEntryDraft } from '@keydesk/contracts';
import { emptyDraft } from '../helpers.ts';

export function createEditorDraft(entry?: Entry, defaultProjectId?: string): EntryDraft {
  if (!entry)
    return {
      ...emptyDraft(),
      projectIds: defaultProjectId ? [defaultProjectId] : [],
      credentials: [{ label: 'API 키', value: '', status: 'active', issuedAt: '', expiresAt: '' }],
    };
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, credentials, ...metadata } = entry;
  return {
    ...metadata,
    tags: [...entry.tags],
    projectIds: [...entry.projectIds],
    credentials: credentials.map(({ id, label, status, issuedAt, expiresAt }) => ({
      id,
      label,
      status,
      issuedAt,
      expiresAt,
    })),
  };
}

export function updateCredential(
  draft: EntryDraft,
  index: number,
  change: Partial<CredentialDraft>,
): EntryDraft {
  return {
    ...draft,
    credentials: draft.credentials?.map((credential, position) =>
      position === index ? { ...credential, ...change } : credential,
    ),
  };
}

export function createRotationDraft(
  latest: Entry,
  expected: { id: string; version: number },
  replacement: Pick<CredentialDraft, 'value' | 'status' | 'issuedAt' | 'expiresAt'>,
): EntryDraft {
  const index = latest.credentials.findIndex((credential) => credential.id === expected.id);
  if (index < 0)
    throw Error('이 키가 삭제되었거나 다른 항목으로 변경되었습니다. 목록을 다시 확인해 주세요.');
  if (latest.credentials[index]!.version !== expected.version)
    throw Error('다른 화면에서 이미 교체된 키입니다. 창을 닫고 최신 버전을 확인해 주세요.');
  return updateCredential(createEditorDraft(latest), index, replacement);
}

export function createImportDrafts(
  rows: { name: string; value: string }[],
  projectId: string,
  target?: Entry,
): ImportEntryDraft[] {
  const imported = rows.map(({ name, value }) => ({
    label: name,
    value,
    status: 'active' as const,
    issuedAt: '',
    expiresAt: '',
  }));
  if (target) {
    const draft = createEditorDraft(target);
    return [
      { ...draft, entryId: target.id, credentials: [...(draft.credentials ?? []), ...imported] },
    ];
  }
  return rows.map(({ name }, index) => ({
    ...emptyDraft(),
    name,
    projectIds: projectId ? [projectId] : [],
    credentials: [imported[index]!],
  }));
}

export async function finishSaved(
  id: string,
  onSaved: (id: string) => Promise<void>,
  onClose: () => void,
  notify?: (message: string) => void,
): Promise<void> {
  try {
    await onSaved(id);
  } catch {
    notify?.(
      '저장했습니다. 목록을 갱신하지 못했습니다. 목록을 다시 읽어 저장한 항목을 확인해 주세요.',
    );
  } finally {
    onClose();
  }
}
