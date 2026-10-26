import { OrgAlertBanner } from "../OrgAlertBanner";

export const RedisBanner = () => {
  return (
    <OrgAlertBanner
      text="Attention: Updated versions of Keydesk now require Redis for full functionality."
      link="https://infisical.com/docs/self-hosting/configuration/requirements#redis"
    />
  );
};
