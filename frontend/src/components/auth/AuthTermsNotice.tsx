const linkClassName =
  "underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45";

interface AuthTermsNoticeProps {
  showCaptchaNotice?: boolean;
}

export const AuthTermsNotice = ({ showCaptchaNotice = false }: AuthTermsNoticeProps) => (
  <div className="flex flex-col gap-1 text-xs text-pretty text-label">
    <p>
      Keydesk의 운영 안내와 사용 범위를 확인하세요:{" "}
      <a
        href="https://github.com/thisNorm/keydesk#readme"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        사용 안내
      </a>{" "}
      및{" "}
      <a
        href="https://github.com/thisNorm/keydesk/blob/keydesk/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        라이선스
      </a>
      .
    </p>
    {showCaptchaNotice && (
      <p>
        이 사이트는 hCaptcha로 보호되며 다음 정책이 적용됩니다:{" "}
        <a
          href="https://www.hcaptcha.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          개인정보 처리방침
        </a>{" "}
        및{" "}
        <a
          href="https://www.hcaptcha.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          이용 약관
        </a>{" "}
      </p>
    )}
  </div>
);
