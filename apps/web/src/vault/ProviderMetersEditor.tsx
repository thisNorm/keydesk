import type { ProviderUsageMeter } from '@keydesk/contracts';
import { Field } from '../ui.tsx';

function localTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
}

export function ProviderMetersEditor({
  meters,
  onChange,
}: {
  meters: ProviderUsageMeter[];
  onChange: (meters: ProviderUsageMeter[]) => void;
}) {
  return (
    <details className="editor-section">
      <summary>제공사 사용량 기록</summary>
      <p className="hint">
        콘솔에서 확인한 사용량과 한도입니다. 실제 적용되는 앱·프로젝트·모델 또는 API 기능을 적어
        주세요.
      </p>
      {meters.map((meter, index) => {
        const update = (fields: Partial<ProviderUsageMeter>) =>
          onChange(meters.map((item, i) => (i === index ? { ...item, ...fields } : item)));
        const n = index + 1;
        return (
          <div className="key-editor" key={index}>
            <div className="form-grid">
              {(
                [
                  ['name', '집계 이름', 120, '예: 월간 호출, 입력 TPM'],
                  ['scope', '적용 범위', 200, '예: Maps 앱 · 주소 검색'],
                  ['period', '기간', 120, '예: 2026년 11월 (KST)'],
                  ['unit', '단위', 24, '예: 회, 토큰'],
                ] as const
              ).map(([field, label, maxLength, placeholder]) => (
                <Field key={field} label={label + ' ' + n}>
                  <input
                    required
                    value={meter[field]}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    onChange={(e) => update({ [field]: e.target.value })}
                  />
                </Field>
              ))}
              <Field
                label={'사용량 ' + n}
                hint="확인하지 못한 값은 비워두세요. 사용량이 0이면 0을 입력하세요."
              >
                <input
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]+)?"
                  maxLength={26}
                  value={meter.used ?? ''}
                  onChange={(e) => update({ used: e.target.value || null })}
                />
              </Field>
              <Field label={'한도 상태 ' + n}>
                <select
                  value={meter.limitStatus}
                  onChange={(e) => {
                    const limitStatus = e.target.value as ProviderUsageMeter['limitStatus'];
                    update({ limitStatus, max: limitStatus === 'set' ? (meter.max ?? '') : null });
                  }}
                >
                  <option value="unknown">미확인</option>
                  <option value="set">한도 확인</option>
                  <option value="unset">한도 미설정</option>
                </select>
              </Field>
              {meter.limitStatus === 'set' && (
                <Field label={'최대치 ' + n}>
                  <input
                    required
                    inputMode="decimal"
                    pattern="[0-9]+(\.[0-9]+)?"
                    maxLength={26}
                    value={meter.max ?? ''}
                    onChange={(e) => update({ max: e.target.value })}
                  />
                </Field>
              )}
              <Field
                label={'요금 티어 ' + n}
                hint="해당 프로젝트나 모델에 적용되는 티어를 확인한 경우에만 선택하세요."
              >
                <select
                  value={meter.tier ?? ''}
                  onChange={(e) =>
                    update({ tier: (e.target.value || undefined) as ProviderUsageMeter['tier'] })
                  }
                >
                  <option value="">미확인</option>
                  <option value="free">무료 티어</option>
                  <option value="paid">유료 티어</option>
                </select>
              </Field>
              <Field label={'확인 시각 ' + n} hint="이 기기의 시간">
                <input
                  required
                  type="datetime-local"
                  value={localTime(meter.checkedAt)}
                  onChange={(e) =>
                    update({
                      checkedAt: e.target.value ? new Date(e.target.value).toISOString() : '',
                    })
                  }
                />
              </Field>
            </div>
            <button type="button" onClick={() => onChange(meters.filter((_, i) => i !== index))}>
              기록 {n} 삭제
            </button>
          </div>
        );
      })}
      <button
        type="button"
        disabled={meters.length >= 20}
        onClick={() =>
          onChange([
            ...meters,
            {
              name: '',
              scope: '',
              period: '',
              unit: '회',
              used: null,
              max: null,
              limitStatus: 'unknown',
              checkedAt: new Date().toISOString(),
            },
          ])
        }
      >
        사용량 기록 추가
      </button>
    </details>
  );
}
