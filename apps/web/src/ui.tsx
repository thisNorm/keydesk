import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from 'react';
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  closeDisabled = false,
  className = '',
  focusTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeDisabled?: boolean;
  className?: string;
  focusTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    close = useRef(onClose),
    composing = useRef(false),
    titleId = useId();
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    (
      dialog?.querySelector<HTMLElement>('[data-dialog-focus]') ??
      dialog?.querySelector<HTMLElement>('input, select, textarea') ??
      dialog?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus();
      else document.getElementById('main')?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      ref={ref}
      className={['dialog', wide ? 'wide' : '', className].filter(Boolean).join(' ')}
      onCancel={(e) => {
        if (
          composing.current ||
          (e.nativeEvent instanceof KeyboardEvent && e.nativeEvent.isComposing)
        ) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (!closeDisabled) close.current();
      }}
      onClick={(e) => {
        if (!closeDisabled && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close.current();
        }
      }}
    >
      <header className="modal-head">
        <h2
          id={titleId}
          tabIndex={focusTitle ? -1 : undefined}
          data-dialog-focus={focusTitle || undefined}
        >
          {title}
        </h2>
        <button type="button" aria-label="닫기" disabled={closeDisabled} onClick={onClose}>
          닫기
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
  label = '저장',
  onCancel,
  cancelLabel = '취소',
  submitDisabled = false,
}: {
  onSubmit: () => Promise<void>;
  children: ReactNode;
  label?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  submitDisabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    composing = useRef(false),
    lastComposition = useRef(0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || submitDisabled || composing.current || Date.now() - lastComposition.current < 50)
      return;
    setBusy(true);
    setError('');
    try {
      await onSubmit();
    } catch (error) {
      setError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onInvalidCapture={(event) => {
        const control = event.target as HTMLInputElement;
        let details = control.closest('details');
        while (details) {
          details.open = true;
          details = details.parentElement?.closest('details') ?? null;
        }
        const label = control.labels?.[0]?.textContent?.trim();
        setError(label ? `‘${label}’ 입력 내용을 확인해 주세요.` : '입력 내용을 확인해 주세요.');
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        lastComposition.current = Date.now();
      }}
      onSubmit={submit}
    >
      <fieldset disabled={busy}>
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button className="primary" disabled={busy || submitDisabled}>
            {busy ? '처리 중…' : label}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-describedby': hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Confirm({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = '확인',
  cancelLabel = '취소',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <Form
        onSubmit={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
          }
        }}
        label={confirmLabel}
        cancelLabel={cancelLabel}
        onCancel={onClose}
      >
        {children}
      </Form>
    </Modal>
  );
}
export const statusLabel = { active: '사용 중', paused: '중지', revoked: '폐기' };
