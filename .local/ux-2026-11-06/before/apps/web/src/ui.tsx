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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    close = useRef(onClose),
    composing = useRef(false),
    titleId = useId();
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    (
      ref.current?.querySelector<HTMLElement>('input,select,textarea') ??
      ref.current?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      previous?.isConnected && previous.focus();
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
      className={wide ? 'dialog wide' : 'dialog'}
      onCancel={(e) => {
        if (
          composing.current ||
          (e.nativeEvent instanceof KeyboardEvent && e.nativeEvent.isComposing)
        ) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="닫기" onClick={onClose}>
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
}: {
  onSubmit: () => Promise<void>;
  children: ReactNode;
  label?: string;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    composing = useRef(false),
    lastComposition = useRef(0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || composing.current || Date.now() - lastComposition.current < 50) return;
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
              취소
            </button>
          )}
          <button className="primary" disabled={busy}>
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
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <Form onSubmit={onConfirm} label="확인" onCancel={onClose}>
        {children}
      </Form>
    </Modal>
  );
}
export const statusLabel = { active: '사용 중', paused: '중지', revoked: '폐기' };
