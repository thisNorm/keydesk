import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

export type SelfHostedLicenseState = "unlicensed" | "online" | "offline" | "unavailable";

export const SELF_HOSTED_CONTACT_SALES_URL = "https://infisical.com/talk-to-us";
export const SELF_HOSTED_LICENSE_DOCS_URL = "https://infisical.com/docs/self-hosting/ee";

export const getSelfHostedLicenseState = (
  plan?: Pick<SubscriptionPlan, "isOffline" | "productPlans" | "slug"> | null
): SelfHostedLicenseState => {
  if (!plan) return "unavailable";
  if (plan.isOffline) return "offline";
  if (Array.isArray(plan.productPlans)) return "online";
  if (!plan.slug) return "unlicensed";
  return "unavailable";
};

type SelfHostedLicenseCopy = {
  method: string;
  methodHint: string;
  title: string;
  detail: string;
  pageDescription: string;
  inactiveProductNote: string;
};

export const SELF_HOSTED_LICENSE_COPY: Record<SelfHostedLicenseState, SelfHostedLicenseCopy> = {
  unlicensed: {
    method: "Free",
    methodHint: "No active license",
    title: "No License Active",
    detail:
      "No license is active, so paid features stay locked until you set LICENSE_KEY on the server and restart it.",
    pageDescription: "View products and usage for this unlicensed instance.",
    inactiveProductNote: "Requires a self-hosted license key from sales."
  },
  online: {
    method: "License",
    methodHint: "라이선스 서버에서 동기화됨",
    title: "Set by Your License",
    detail:
      "제품과 사용 한도는 라이선스에 따라 동기화됩니다. 변경하려면 라이선스 담당자에게 문의하세요.",
    pageDescription: "라이선스에 설정된 제품과 사용량을 확인합니다.",
    inactiveProductNote: "Not in your license, so contact sales to add it."
  },
  offline: {
    method: "Offline License",
    methodHint: "Set by your license key",
    title: "Offline License",
    detail:
      "To change your plan, get an updated key from sales, replace LICENSE_KEY on the server, and restart it.",
    pageDescription: "Your plan is set by an offline license.",
    inactiveProductNote: "Not in your offline license, so contact sales for an updated key."
  },
  unavailable: {
    method: "License",
    methodHint: "Details unavailable",
    title: "License Details Unavailable",
    detail: "License details couldn't be read, so contact sales to get or update a license key.",
    pageDescription: "View your products and usage.",
    inactiveProductNote: "Not active on this instance, so contact sales for licensing options."
  }
};
