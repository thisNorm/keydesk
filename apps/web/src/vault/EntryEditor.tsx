import { useEffect, useRef, useState } from 'react';
import type { CredentialDraft, Entry, EntryDraft, Project } from '@keydesk/contracts';
import { api } from '../api.ts';
import { validateDraft } from '../helpers.ts';
import { Confirm, Field, Form, Modal, statusLabel } from '../ui.tsx';
import { CredentialDateField } from './CredentialDateField.tsx';
import { ProviderMetersEditor } from './ProviderMetersEditor.tsx';
import { createEditorDraft, finishSaved, updateCredential } from './editor-model.ts';

export function EntryEditor({
  entry,
  projects,
  onProjects,
  onClose,
  onSaved,
  defaultProjectId,
  focusExpiryFor,
  expiryContext,
  notify,
  zone = 'Asia/Seoul',
}: {
  entry?: Entry;
  projects: Project[];
  onProjects: () => Promise<void>;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  defaultProjectId?: string;
  focusExpiryFor?: string;
  expiryContext?: string;
  notify?: (message: string) => void;
  zone?: string;
}) {
  const [draft, setDraft] = useState(() => createEditorDraft(entry, defaultProjectId)),
    initial = useRef(JSON.stringify(draft)),
    [newProject, setNewProject] = useState(''),
    [addedProjects, setAddedProjects] = useState<Project[]>([]),
    [projectError, setProjectError] = useState(''),
    [creating, setCreating] = useState(false),
    creatingRef = useRef(false),
    saving = useRef(false),
    keysSection = useRef<HTMLElement>(null),
    [busy, setBusy] = useState(false),
    projectComposition = useRef(0),
    [discarding, setDiscarding] = useState(false),
    [removing, setRemoving] = useState<number | null>(null),
    [metadataOpen, setMetadataOpen] = useState(false);
  const dirty = initial.current !== JSON.stringify(draft) || !!newProject,
    availableProjects = [
      ...projects,
      ...addedProjects.filter((added) => !projects.some((p) => p.id === added.id)),
    ];
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving.current && !creatingRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const close = () => {
    if (saving.current || creatingRef.current) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const setKey = (index: number, change: Partial<CredentialDraft>) =>
    setDraft((previous) => updateCredential(previous, index, change));
  async function createProject() {
    if (!newProject.trim() || creatingRef.current || saving.current) return;
    creatingRef.current = true;
    setCreating(true);
    setProjectError('');
    try {
      const { project } = await api<{ project: Project }>('/projects', 'POST', {
        name: newProject.trim(),
      });
      setAddedProjects((previous) => [...previous, project]);
      setDraft((previous) => ({
        ...previous,
        projectIds: [...new Set([...previous.projectIds, project.id])],
      }));
      setNewProject('');
      try {
        await onProjects();
      } catch {
        notify?.('프로젝트를 만들고 선택했습니다. 프로젝트 목록을 다시 읽어 주세요.');
      }
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : '프로젝트를 만들지 못했습니다.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  return (
    <>
      <Modal
        title={entry ? '항목 수정' : '항목 추가'}
        onClose={close}
        closeDisabled={busy || creating}
        wide
      >
        {expiryContext && (
          <p className="field-help" id="expiry-edit-context">
            만료일 등록: {expiryContext}
          </p>
        )}
        <Form
          onCancel={close}
          submitDisabled={creating}
          onSubmit={async () => {
            if (saving.current) return;
            if (creatingRef.current) throw Error('프로젝트 만들기가 끝난 뒤 저장해 주세요.');
            const errors = validateDraft(draft);
            if (errors.length) {
              setMetadataOpen(true);
              keysSection.current?.querySelectorAll('details').forEach((details) => {
                details.open = true;
              });
              throw Error(errors.join(' '));
            }
            saving.current = true;
            setBusy(true);
            try {
              const { entry: saved } = await api<{ entry: Entry }>(
                entry ? `/entries/${entry.id}` : '/entries',
                entry ? 'PUT' : 'POST',
                draft,
              );
              setDraft((previous) => ({
                ...previous,
                credentials: previous.credentials?.map((key) => ({ ...key, value: undefined })),
              }));
              await finishSaved(saved.id, onSaved, onClose, notify);
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          <Field label="이름">
            <input
              required
              autoComplete="off"
              maxLength={200}
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
            />
          </Field>
          <section className="editor-section" aria-label="인증값" ref={keysSection}>
            {entry && (
              <p className="field-help">
                기존 인증값은 비워 두면 유지합니다. 새 값을 입력하면 다음 버전으로 교체합니다.
              </p>
            )}
            {draft.credentials?.map((credential, index) => (
              <section
                className="key-editor"
                key={credential.id ?? `new-${index}`}
                aria-label={`${index + 1}번 인증값`}
              >
                {(draft.credentials?.length ?? 0) > 1 && <h3>{index + 1}번 인증값</h3>}
                <Field label={credential.id ? '새 인증값 (교체할 때만 입력)' : '인증값'}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required={!credential.id}
                    value={credential.value ?? ''}
                    onChange={(event) =>
                      setKey(index, {
                        value: event.target.value || (credential.id ? undefined : ''),
                      })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="키 이름">
                    <input
                      required
                      maxLength={200}
                      value={credential.label}
                      onChange={(event) => setKey(index, { label: event.target.value })}
                    />
                  </Field>
                  <CredentialDateField
                    label="만료일"
                    initialFocus={Boolean(focusExpiryFor && credential.id === focusExpiryFor)}
                    aria-describedby={
                      expiryContext && credential.id === focusExpiryFor
                        ? 'expiry-edit-context'
                        : undefined
                    }
                    value={credential.expiresAt}
                    zone={zone}
                    onChange={(value) => setKey(index, { expiresAt: value })}
                  />
                </div>
                <details className="editor-section">
                  <summary>상태와 발급일</summary>
                  <div className="form-grid">
                    <Field label="상태">
                      <select
                        value={credential.status}
                        onChange={(event) =>
                          setKey(index, { status: event.target.value as CredentialDraft['status'] })
                        }
                      >
                        {Object.entries(statusLabel).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <CredentialDateField
                      label="발급일"
                      value={credential.issuedAt}
                      zone={zone}
                      onChange={(value) => setKey(index, { issuedAt: value })}
                    />
                  </div>
                </details>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => setRemoving(index)}
                >
                  이 키 제거
                </button>
              </section>
            ))}
            {!draft.credentials?.length && (
              <p className="field-help">
                인증값 없이 사용처만 저장하거나 인증값을 추가할 수 있습니다.
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                set('credentials', [
                  ...(draft.credentials ?? []),
                  { label: 'API 키', value: '', status: 'active', issuedAt: '', expiresAt: '' },
                ])
              }
            >
              인증값 추가
            </button>
          </section>
          <Field label="용도 (선택)">
            <input
              maxLength={10000}
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>
          <section className="editor-section" aria-labelledby="entry-project-heading">
            <h3 id="entry-project-heading">사용 프로젝트</h3>
            <div className="checkboxes">
              {availableProjects.map((project) => (
                <label key={project.id}>
                  <input
                    type="checkbox"
                    checked={draft.projectIds.includes(project.id)}
                    onChange={(event) =>
                      set(
                        'projectIds',
                        event.target.checked
                          ? [...new Set([...draft.projectIds, project.id])]
                          : draft.projectIds.filter((id) => id !== project.id),
                      )
                    }
                  />
                  {project.name}
                </label>
              ))}
            </div>
            {!availableProjects.length && (
              <p className="field-help">프로젝트 없이 저장하거나 여기서 새로 만들 수 있습니다.</p>
            )}
            <div className="inline">
              <input
                aria-label="새 프로젝트 이름"
                placeholder="새 프로젝트 이름"
                maxLength={100}
                value={newProject}
                disabled={creating}
                onChange={(event) => setNewProject(event.target.value)}
                onCompositionEnd={() => {
                  projectComposition.current = Date.now();
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229 &&
                    Date.now() - projectComposition.current >= 50
                  ) {
                    event.preventDefault();
                    void createProject();
                  }
                }}
              />
              <button
                type="button"
                disabled={creating || !newProject.trim()}
                onClick={() => void createProject()}
              >
                {creating ? '만드는 중…' : '프로젝트 만들기'}
              </button>
            </div>
            {projectError && (
              <p className="error" role="alert">
                {projectError}
              </p>
            )}
          </section>
          <details
            className="editor-section"
            open={metadataOpen}
            onToggle={(event) => setMetadataOpen(event.currentTarget.open)}
          >
            <summary>제공사·주소·관리 메모 (선택)</summary>
            <div className="form-grid">
              {(
                [
                  ['provider', '제공사'],
                  ['websiteUrl', '웹사이트'],
                  ['consoleUrl', '발급 콘솔'],
                  ['docsUrl', 'API 문서'],
                  ['endpointUrl', 'API 주소'],
                  ['owner', '소유자 메모'],
                  ['plan', '요금제 메모'],
                  ['quota', '제공사 한도 메모'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="text"
                    inputMode={key.endsWith('Url') ? 'url' : 'text'}
                    value={draft[key]}
                    onChange={(event) => set(key, event.target.value)}
                  />
                </Field>
              ))}
              <Field label="태그 (쉼표로 구분)">
                <input
                  value={draft.tags.join(', ')}
                  onChange={(event) =>
                    set(
                      'tags',
                      event.target.value.split(',').map((tag) => tag.trim()),
                    )
                  }
                />
              </Field>
            </div>
            <Field label="메모">
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(event) => set('notes', event.target.value)}
              />
            </Field>
          </details>
          <ProviderMetersEditor
            meters={draft.providerUsageMeters ?? []}
            onChange={(meters) => set('providerUsageMeters', meters)}
          />
        </Form>
      </Modal>
      {discarding && (
        <Confirm
          title="작성 내용 버리기"
          confirmLabel="내용 버리기"
          cancelLabel="계속 작성"
          onClose={() => setDiscarding(false)}
          onConfirm={async () => {
            if (!saving.current && !creatingRef.current) onClose();
          }}
        >
          <p>저장하지 않은 작성 내용을 버리고 창을 닫을까요?</p>
        </Confirm>
      )}
      {removing !== null && (
        <Confirm
          title="인증값 제거"
          confirmLabel="이 키 제거"
          cancelLabel="유지"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            setDraft((previous) => ({
              ...previous,
              credentials: previous.credentials?.filter((_, index) => index !== removing),
            }));
            setRemoving(null);
          }}
        >
          <p>
            ‘{draft.credentials?.[removing]?.label || `${removing + 1}번 인증값`}’을 항목에서
            제거합니다. 기존 키는 항목을 저장할 때 교체 기록도 함께 삭제됩니다.
          </p>
        </Confirm>
      )}
    </>
  );
}
