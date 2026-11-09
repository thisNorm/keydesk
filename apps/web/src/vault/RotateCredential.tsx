import { useEffect, useRef, useState } from 'react';
import type { Credential, CredentialDraft, Entry } from '@keydesk/contracts';
import { api } from '../api.ts';
import { formatCredentialDate, validateDraft } from '../helpers.ts';
import { Confirm, Field, Form, Modal, statusLabel } from '../ui.tsx';
import { CredentialDateField } from './CredentialDateField.tsx';
import { createRotationDraft, finishSaved } from './editor-model.ts';

export function RotateCredential({
  entry,
  credential,
  zone,
  onClose,
  onSaved,
  notify,
}: {
  entry: Entry;
  credential: Credential;
  zone: string;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [replacement, setReplacement] = useState({
      value: '',
      status: 'active' as CredentialDraft['status'],
      issuedAt: '',
      expiresAt: '',
    }),
    initial = useRef(JSON.stringify(replacement)),
    expected = useRef({ id: credential.id, version: credential.version }),
    saving = useRef(false),
    [busy, setBusy] = useState(false),
    [discarding, setDiscarding] = useState(false);
  const dirty = initial.current !== JSON.stringify(replacement);
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
      <Modal title="인증값 교체" onClose={close} closeDisabled={busy}>
        <Form
          label="새 인증값으로 교체"
          onCancel={close}
          onSubmit={async () => {
            if (saving.current) return;
            if (!replacement.value) throw Error('새 인증값을 입력해 주세요.');
            saving.current = true;
            setBusy(true);
            try {
              const { entries } = await api<{ entries: Entry[] }>('/entries'),
                latest = entries.find((item) => item.id === entry.id);
              if (!latest)
                throw Error('항목이 삭제되었습니다. 창을 닫고 목록을 다시 확인해 주세요.');
              const draft = createRotationDraft(latest, expected.current, replacement),
                errors = validateDraft(draft);
              if (errors.length) throw Error(errors.join(' '));
              const result = await api<{ entry: Entry }>(`/entries/${latest.id}`, 'PUT', draft);
              setReplacement((previous) => ({ ...previous, value: '' }));
              notify('인증값을 교체했습니다.');
              await finishSaved(result.entry.id, onSaved, onClose, notify);
            } finally {
              saving.current = false;
              setBusy(false);
            }
          }}
        >
          <p>
            ‘{entry.name}’의 ‘{credential.label}’을 교체합니다. 현재 버전은 {credential.version}
            입니다.
          </p>
          <p className="field-help">
            기존 값은 교체 기록에 남습니다. 새 키의 날짜를 확인해 입력해 주세요. 만료일은 자동으로
            채우지 않습니다.
          </p>
          {credential.expiresAt && (
            <p className="field-help">
              현재 키 만료일: {formatCredentialDate(credential.expiresAt, zone)}
            </p>
          )}
          <Field label="새 인증값">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={replacement.value}
              onChange={(event) =>
                setReplacement((previous) => ({ ...previous, value: event.target.value }))
              }
            />
          </Field>
          <div className="form-grid">
            <CredentialDateField
              label="새 발급일"
              value={replacement.issuedAt}
              zone={zone}
              onChange={(value) => setReplacement((previous) => ({ ...previous, issuedAt: value }))}
            />
            <CredentialDateField
              label="새 만료일"
              value={replacement.expiresAt}
              zone={zone}
              onChange={(value) =>
                setReplacement((previous) => ({ ...previous, expiresAt: value }))
              }
            />
          </div>
          <Field label="교체 후 상태">
            <select
              value={replacement.status}
              onChange={(event) =>
                setReplacement((previous) => ({
                  ...previous,
                  status: event.target.value as CredentialDraft['status'],
                }))
              }
            >
              {Object.entries(statusLabel).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
        </Form>
      </Modal>
      {discarding && (
        <Confirm
          title="교체 내용 버리기"
          confirmLabel="내용 버리기"
          cancelLabel="계속 작성"
          onClose={() => setDiscarding(false)}
          onConfirm={async () => {
            if (!saving.current) onClose();
          }}
        >
          <p>저장하지 않은 새 인증값과 날짜를 버리고 창을 닫을까요?</p>
        </Confirm>
      )}
    </>
  );
}
