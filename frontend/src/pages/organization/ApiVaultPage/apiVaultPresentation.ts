import type { ApiVaultDraft, ApiVaultEntry, ApiVaultStatus } from "./apiVaultTypes";

export const API_STATUS_LABELS: Record<ApiVaultStatus, string> = {
  active: "사용 중",
  paused: "사용 중지",
  revoked: "폐기됨"
};

export const safeApiUrl = (value: string): string | undefined => {
  if (
    !/^https?:\/\//i.test(value) ||
    value.includes("\\") ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127
    )
  )
    return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export const isCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const expiryDays = (expiresAt: string, now = new Date()): number | undefined => {
  if (!isCalendarDate(expiresAt)) return undefined;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(`${expiresAt}T00:00:00Z`).getTime() - today) / 86_400_000);
};

export const expiryLabel = (expiresAt: string, now = new Date()) => {
  const days = expiryDays(expiresAt, now);
  if (days === undefined) return "만료일 미등록";
  if (days < 0) return "만료됨";
  if (days === 0) return "오늘 만료";
  return `${days}일 후 만료`;
};

export type ApiExpiryFilter = "all" | "expiring" | "expired" | "unset";

export const filterApiEntries = (
  entries: ApiVaultEntry[],
  search: string,
  status: ApiVaultStatus | "all",
  expiry: ApiExpiryFilter,
  now = new Date()
) => {
  const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (status !== "all" && entry.status !== status) return false;
    const days = expiryDays(entry.expiresAt, now);
    if (expiry === "expired" && (days === undefined || days >= 0)) return false;
    if (expiry === "expiring" && (days === undefined || days < 0 || days > 30)) return false;
    if (expiry === "unset" && days !== undefined) return false;
    const text = [
      entry.name,
      entry.provider,
      entry.description,
      entry.projects,
      entry.owner,
      entry.plan,
      entry.notes,
      ...entry.tags,
      ...entry.credentialLabels
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
};

export const emptyApiDraft = (): ApiVaultDraft => ({
  name: "",
  provider: "",
  description: "",
  websiteUrl: "",
  consoleUrl: "",
  docsUrl: "",
  endpointUrl: "",
  projects: "",
  owner: "",
  tags: [],
  issuedAt: "",
  expiresAt: "",
  plan: "",
  quota: "",
  status: "active",
  notes: "",
  credentials: [{ label: "API_KEY", value: "" }]
});
