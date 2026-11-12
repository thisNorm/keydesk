import type { GatewayMailBudget, GatewayRouteDraft } from '@keydesk/contracts';
import { Field } from './ui.tsx';

export function RouteMailBudget({
  route,
  onChange,
}: {
  route: GatewayRouteDraft;
  onChange: (budget: GatewayMailBudget | null) => void;
}) {
  const value = route.mailBudget;
  const base = URL.canParse(route.baseUrl) ? new URL(route.baseUrl) : undefined;
  const reported =
    route.adapter === 'openai' &&
    base?.origin === 'https://openrouter.ai' &&
    ['/api/v1', '/api/v1/'].includes(base.pathname) &&
    !base.search &&
    !base.hash &&
    !base.username &&
    !base.password;
  const estimate = route.adapter === 'openai' || route.adapter === 'anthropic';
  if (!estimate && !value) return null;
  return (
    <details className="editor-section">
      <summary>월 비용 예산</summary>
      <p className="hint">
        설정한 뒤 이 경로를 거친 요청의 비용을 집계합니다. 메일 설정에서 비용 알림을 켜면 80%와
        100%에서 받습니다.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={!estimate && !value}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { amount: '', currency: 'USD', basis: reported ? 'reported' : 'estimate' }
                : null,
            )
          }
        />
        월 비용 예산 사용
      </label>
      {value && (
        <div className="form-grid">
          <Field label="월 예산 금액">
            <input
              required
              inputMode="decimal"
              maxLength={16}
              pattern="[0-9]+([.][0-9]+)?"
              value={value.amount}
              onChange={(e) => onChange({ ...value, amount: e.target.value })}
              placeholder="10.00"
            />
          </Field>
          <Field label="예산 통화">
            <input
              required
              maxLength={3}
              pattern="[A-Z]{3}"
              readOnly={value.basis === 'reported'}
              value={value.currency}
              onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="비용 집계 근거">
            <select
              required
              value={
                value.basis === 'reported'
                  ? reported
                    ? 'reported'
                    : ''
                  : estimate
                    ? 'estimate'
                    : ''
              }
              onChange={(e) =>
                onChange(
                  e.target.value === 'reported'
                    ? { ...value, basis: 'reported', currency: 'USD' }
                    : { ...value, basis: 'estimate' },
                )
              }
            >
              <option value="" disabled>
                현재 경로에서 쓸 수 있는 근거 선택
              </option>
              {reported && <option value="reported">OpenRouter 보고 비용</option>}
              {estimate && <option value="estimate">Keydesk 단가 기반 추정 비용</option>}
            </select>
          </Field>
          {!estimate && <p className="hint">이 해석기로 바꾸려면 월 예산을 해제해 주세요.</p>}
        </div>
      )}
    </details>
  );
}
