import { useEffect, useRef, useState } from 'react';
import type { Entry, Project } from '@keydesk/contracts';
import { api } from '../api.ts';
import { parseEnv } from '../helpers.ts';
import { Confirm, Field, Form, Modal } from '../ui.tsx';
import { createImportDrafts, finishSaved } from './editor-model.ts';

export function ImportEntries({
  entries,
  projects,
  onClose,
  onSaved,
  notify,
}: {
  entries: Entry[];
  projects: Project[];
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [source, setSource] = useState(''),
    [project, setProject] = useState(''),
    [target, setTarget] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [fileError, setFileError] = useState(''),
    [reading, setReading] = useState(false),
    [busy, setBusy] = useState(false),
    [discarding, setDiscarding] = useState(false),
    saving = useRef(false),
    fileGeneration = useRef(0);
  const parsed = parseEnv(source),
    dirty = !!(source || project || target);
  useEffect(
    () => () => {
      fileGeneration.current++;
    },
    [],
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  const close = () => {
    if (saving.current) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };
  return (
    <>
      <Modal title=".env 가져오기" onClose={close} closeDisabled={busy} wide>
        <Form
          label="확인한 인증값 가져오기"
          onCancel={close}
          submitDisabled={reading || !confirmed || !parsed.rows.length || !!parsed.errors.length}
          onSubmit={async () => {
            if (saving.current) return;
            if (reading) throw Error('파일을 읽은 뒤 미리보기를 확인해 주세요.');
            if (!confirmed || !parsed.rows.length || parsed.errors.length)
              throw Error('오류를 해결하고 미리보기를 확인해 주세요.');
            saving.current = true;
            setBusy(true);
            try {
              let existing: Entry | undefined;
              if (target) {
                const latest = await api<{ entries: Entry[] }>('/entries');
                existing = latest.entries.find((entry) => entry.id === target);
                if (!existing)
                  throw Error('선택한 항목이 삭제되었습니다. 저장할 항목을 다시 선택해 주세요.');
              }
              const result = await api<{ entries: Entry[] }>('/entries/import', 'POST', {
                entries: createImportDrafts(parsed.rows, project, existing),
              });
              setSource('');
              setConfirmed(false);
              notify('인증값을 가져왔습니다.');
              await finishSaved(result.entries[0]!.id, onSaved, onClose, notify);
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          <p className="field-help">
            변수마다 새 항목을 만들거나 기존 항목에 키를 추가합니다. 모든 줄을 확인한 뒤 한 번에
            저장하며, 오류가 있으면 전체를 가져오지 않습니다.
          </p>
          <p className="field-help">
            파일을 실행하거나 변수를 치환하지 않습니다. 미리보기에서는 인증값을 숨깁니다.
          </p>
          <Field label=".env 파일">
            <input
              type="file"
              accept=".env,text/plain"
              onChange={async (event) => {
                const request = ++fileGeneration.current;
                setConfirmed(false);
                setFileError('');
                const file = event.target.files?.[0];
                if (!file) {
                  setReading(false);
                  return;
                }
                setSource('');
                if (file.size > 1024 * 1024) {
                  setFileError('1MB 이하의 파일을 선택해 주세요.');
                  setReading(false);
                  return;
                }
                setReading(true);
                try {
                  const text = await file.text();
                  if (request === fileGeneration.current) setSource(text);
                } catch {
                  if (request === fileGeneration.current) setFileError('파일을 읽을 수 없습니다.');
                } finally {
                  if (request === fileGeneration.current) setReading(false);
                }
              }}
            />
          </Field>
          {reading && (
            <p role="status" className="field-help">
              파일을 읽는 중…
            </p>
          )}
          {fileError && (
            <p className="error" role="alert">
              {fileError}
            </p>
          )}
          <Field label="또는 .env 내용 붙여넣기">
            <textarea
              rows={5}
              value={source}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                fileGeneration.current++;
                setReading(false);
                setFileError('');
                setSource(event.target.value);
                setConfirmed(false);
              }}
            />
          </Field>
          <div className="form-grid">
            <Field label="저장할 항목">
              <select
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">변수마다 새 항목 만들기</option>
                {entries.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}에 키 추가
                  </option>
                ))}
              </select>
            </Field>
            {!target && (
              <Field label="연결할 프로젝트">
                <select
                  value={project}
                  onChange={(event) => {
                    setProject(event.target.value);
                    setConfirmed(false);
                  }}
                >
                  <option value="">연결하지 않음</option>
                  {projects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <section className="editor-section" aria-label="가져오기 미리보기">
            <h3>미리보기 · {parsed.rows.length}개</h3>
            {!parsed.rows.length && !parsed.errors.length && (
              <p className="field-help">
                파일을 고르거나 내용을 붙여넣으면 변수 이름이 표시됩니다.
              </p>
            )}
            <ul className="plain-list">
              {parsed.rows.map((row) => (
                <li key={row.line}>
                  {row.line}행 · {row.name}{' '}
                  <span className="muted" aria-label="인증값 숨김">
                    ••••••••
                  </span>
                </li>
              ))}
            </ul>
            {parsed.errors.map((error, index) => (
              <p className="error" key={index} role="alert">
                {error.line > 0 ? `${error.line}행: ` : ''}
                {error.message}
              </p>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={reading || !parsed.rows.length || !!parsed.errors.length}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              변수 이름과 저장할 항목을 확인했습니다.
            </label>
          </section>
        </Form>
      </Modal>
      {discarding && (
        <Confirm
          title="가져오기 내용 버리기"
          confirmLabel="내용 버리기"
          cancelLabel="계속 확인"
          onClose={() => setDiscarding(false)}
          onConfirm={async () => {
            if (!saving.current) onClose();
          }}
        >
          <p>아직 저장하지 않은 .env 내용과 선택을 버리고 창을 닫을까요?</p>
        </Confirm>
      )}
    </>
  );
}
