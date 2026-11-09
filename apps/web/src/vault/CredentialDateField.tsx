import { useEffect, useId, useRef, useState } from 'react';
import { calendarDay, formatCredentialDate, validDate } from '../helpers.ts';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function dayFor(value: string, zone: string) {
  return validDate(value)
    ? value.length === 10
      ? value
      : calendarDay(new Date(value), zone)
    : calendarDay(new Date(), zone);
}

export function CredentialDateField({
  label,
  value,
  onChange,
  zone = 'Asia/Seoul',
  id: suppliedId,
  initialFocus = false,
  'aria-describedby': describedBy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  zone?: string;
  id?: string;
  initialFocus?: boolean;
  'aria-describedby'?: string;
}) {
  const generatedId = useId(),
    id = suppliedId ?? generatedId,
    wrapper = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false),
    [focused, setFocused] = useState(() => dayFor(value, zone));
  const exact = value.includes('T'),
    month = focused.slice(0, 7),
    first = new Date(`${month}-01T00:00:00Z`),
    count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(),
    cells = Array.from({ length: Math.ceil((first.getUTCDay() + count) / 7) * 7 }, (_, i) => {
      const day = i - first.getUTCDay() + 1;
      return day > 0 && day <= count ? `${month}-${String(day).padStart(2, '0')}` : '';
    });
  useEffect(() => {
    if (open) picker.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus();
  }, [open, focused]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  function move(days: number) {
    const next = new Date(`${focused}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + days);
    if (next.getUTCFullYear() >= 1900 && next.getUTCFullYear() <= 9999) setFocused(isoDay(next));
  }
  function moveMonth(delta: number) {
    const current = new Date(`${focused}T00:00:00Z`),
      day = current.getUTCDate();
    current.setUTCDate(1);
    current.setUTCMonth(current.getUTCMonth() + delta);
    const last = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
    ).getUTCDate();
    current.setUTCDate(Math.min(day, last));
    if (current.getUTCFullYear() >= 1900 && current.getUTCFullYear() <= 9999)
      setFocused(isoDay(current));
  }
  return (
    <div className="field date-field" ref={wrapper}>
      <label htmlFor={id}>{label}</label>
      <div className="inline">
        <input
          id={id}
          type="text"
          data-dialog-focus={initialFocus || undefined}
          inputMode={exact ? 'text' : 'numeric'}
          autoComplete="off"
          spellCheck={false}
          placeholder="YYYY-MM-DD (연-월-일)"
          aria-describedby={[describedBy, `${id}-help`].filter(Boolean).join(' ')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          ref={trigger}
          aria-label={`${label} 달력 열기`}
          aria-expanded={open}
          aria-controls={`${id}-calendar`}
          onClick={() => {
            setFocused(dayFor(value, zone));
            setOpen((previous) => !previous);
          }}
        >
          달력
        </button>
      </div>
      <small className="field-help" id={`${id}-help`}>
        {exact
          ? '정확한 시각과 시간대 원문입니다. 수정하지 않으면 그대로 유지합니다.'
          : '연-월-일 순서로 입력합니다. 예: 2027-03-15. 비워 두어도 됩니다.'}
      </small>
      {exact && validDate(value) && (
        <small className="field-help">{formatCredentialDate(value, zone)}</small>
      )}
      {open && (
        <div
          id={`${id}-calendar`}
          className="calendar-popover"
          role="dialog"
          aria-label={`${label} 날짜 선택`}
          ref={picker}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="calendar-head">
            <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>
              이전
            </button>
            <strong id={`${id}-month`} aria-live="polite">
              {first.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
            </strong>
            <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>
              다음
            </button>
          </div>
          {exact && (
            <p className="field-help">날짜를 선택하면 시각·시간대 없이 해당 날짜로 저장합니다.</p>
          )}
          <table
            className="calendar-grid"
            role="grid"
            aria-labelledby={`${id}-month`}
            onKeyDown={(event) => {
              if (!(event.target instanceof HTMLButtonElement) || !event.target.dataset.day) return;
              const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
              if (offset !== undefined) {
                event.preventDefault();
                move(offset);
              } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const day = new Date(`${focused}T00:00:00Z`).getUTCDay();
                move(event.key === 'Home' ? -day : 6 - day);
              } else if (event.key === 'PageUp' || event.key === 'PageDown') {
                event.preventDefault();
                moveMonth(event.key === 'PageUp' ? -1 : 1);
              }
            }}
          >
            <thead>
              <tr>
                {weekdays.map((day) => (
                  <th key={day} scope="col" aria-label={`${day}요일`}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, week) => (
                <tr key={week}>
                  {cells.slice(week * 7, week * 7 + 7).map((day, column) => (
                    <td
                      key={day || `blank-${column}`}
                      aria-selected={day ? day === value : undefined}
                    >
                      {day && (
                        <button
                          type="button"
                          data-day={day}
                          tabIndex={day === focused ? 0 : -1}
                          aria-label={formatCredentialDate(day, zone)}
                          aria-current={day === calendarDay(new Date(), zone) ? 'date' : undefined}
                          onClick={() => {
                            onChange(day);
                            close();
                          }}
                        >
                          {Number(day.slice(8))}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="calendar-actions">
            <button
              type="button"
              onClick={() => {
                onChange(calendarDay(new Date(), zone));
                close();
              }}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                close();
              }}
            >
              날짜 지우기
            </button>
            <button type="button" onClick={close}>
              닫기
            </button>
          </div>
          <small className="field-help">방향키로 날짜, Page Up·Down으로 월을 이동합니다.</small>
        </div>
      )}
    </div>
  );
}
