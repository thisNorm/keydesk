import { OrgAlertBanner } from "../OrgAlertBanner";

export const SmtpBanner = () => {
  return (
    <OrgAlertBanner
      text="이메일 전송(SMTP)이 설정되지 않았습니다. 이메일 초대·복구 기능을 사용하려면 설정이 필요합니다."
      link="https://infisical.com/docs/self-hosting/configuration/envars#email-service"
    />
  );
};
