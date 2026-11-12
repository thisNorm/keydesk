export type CredentialStatus = 'active' | 'paused' | 'revoked';
export interface Project {
  id: string;
  name: string;
  createdAt: string;
}
export interface Credential {
  id: string;
  label: string;
  status: CredentialStatus;
  issuedAt: string;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface CredentialDraft {
  id?: string;
  label: string;
  value?: string;
  status: CredentialStatus;
  issuedAt: string;
  expiresAt: string;
}
export interface ProviderUsageMeter {
  name: string;
  scope: string;
  period: string;
  unit: string;
  used: string | null;
  max: string | null;
  limitStatus: 'set' | 'unset' | 'unknown';
  checkedAt: string;
  tier?: 'free' | 'paid';
}
export interface EntryDraft {
  name: string;
  provider: string;
  description: string;
  websiteUrl: string;
  consoleUrl: string;
  docsUrl: string;
  endpointUrl: string;
  owner: string;
  tags: string[];
  plan: string;
  quota: string;
  notes: string;
  projectIds: string[];
  providerUsageMeters?: ProviderUsageMeter[];
  credentials?: CredentialDraft[];
}
export interface Entry extends Omit<EntryDraft, 'credentials'> {
  id: string;
  credentials: Credential[];
  createdAt: string;
  updatedAt: string;
}
export interface ImportEntryDraft extends EntryDraft {
  entryId?: string;
}
export interface CredentialVersion {
  version: number;
  createdAt: string;
  reason: string;
}
export interface AuthState {
  initialized: boolean;
  authenticated: boolean;
  user?: { name: string };
  csrfToken?: string;
}
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  passwordConfigured?: boolean;
  from: string;
  to: string;
}
export interface Settings {
  timeZone: string;
  retentionDays: number;
  krwExchangeRate: string;
  exchangeRateDate: string;
  smtp: SmtpSettings;
  mailAlerts?: MailAlertSettings;
}
export interface MailAlertSettings {
  registration: boolean;
  requestLimit: boolean;
  budget: boolean;
  openRouterKeys: string[];
}
export interface MailDelivery {
  id: string;
  kind: 'registration' | 'requestLimit' | 'budget' | 'providerLimit' | 'expiry';
  subject: string;
  createdAt: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled';
}
export interface MailOverview {
  deliveries: MailDelivery[];
  openRouterKeys: { credentialId: string; name: string; project: string }[];
}
export interface VaultNotification {
  id: string;
  entryId: string;
  credentialId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  mailStatus: 'unconfigured' | 'pending' | 'sent' | 'failed';
}
export type Adapter = 'generic' | 'openai' | 'anthropic' | 'gemini';
export interface GatewayOperationRule {
  name: string;
  method: string;
  path: string;
}
export interface GatewayAuthBinding {
  credentialId: string;
  location: 'header' | 'query';
  name: string;
  prefix?: string;
}
export interface GatewayRouteDraft {
  name: string;
  slug: string;
  projectId: string;
  credentialId: string;
  baseUrl: string;
  allowedMethods: string[];
  adapter: Adapter;
  enabled: boolean;
  allowPrivateNetwork: boolean;
  authHeader?: string;
  authScheme?: 'bearer' | 'raw';
  authBindings?: GatewayAuthBinding[];
  detectJsonError?: boolean;
  operationRules?: GatewayOperationRule[];
  mailBudget?: GatewayMailBudget | null;
}
export interface GatewayMailBudget {
  amount: string;
  currency: string;
  basis: 'reported' | 'estimate';
}
export interface GatewayRoute extends GatewayRouteDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface GatewayClientDraft {
  name: string;
  projectId: string;
  routeIds: string[];
  expiresAt: string;
  dailyRequestLimit: number | null;
  dailyTokenAlert: number | null;
  dailyCostAlertMicros: number | null;
}
export interface GatewayClient extends GatewayClientDraft {
  id: string;
  prefix: string;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
export interface PriceDraft {
  adapter: Exclude<Adapter, 'gemini'>;
  model: string;
  currency: string;
  inputPerMillion: string;
  outputPerMillion: string;
  cachedInputPerMillion: string;
  startsAt: string;
}
export interface ModelPrice extends PriceDraft {
  id: string;
  createdAt: string;
}
export interface UsageRecord {
  id: string;
  createdAt: string;
  projectId: string;
  clientId: string;
  routeId: string;
  credentialId: string;
  credentialVersion: number;
  model: string | null;
  statusCode: number | null;
  durationMs: number;
  outcome: 'success' | 'error' | 'cancelled';
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  usageSource: string;
  currency: string | null;
  costMicros: number | null;
  costExactMicros?: string | null;
  costStatus?: 'estimated' | 'unpriced' | 'unknown-usage' | 'unsupported-cache-write' | 'overflow';
  cacheCreationInputTokens?: number | null;
  adapter?: Adapter;
  provider?: UsageProvider;
  originId?: string;
  operation?: { id: string; name: string };
  totalTokens?: number | null;
  reasoningTokens?: number | null;
  reportedCostUsd?: string;
}
export type UsageProvider =
  | 'naver-maps'
  | 'kakao-local'
  | 'kakao-mobility'
  | 'openrouter'
  | 'gemini'
  | 'openai'
  | 'anthropic';
interface UsageGroup {
  projectId: string;
  routeId: string;
  requests: number;
}
export interface UsageOperationSummary extends UsageGroup {
  operationId: string | null;
  name: string | null;
  provider: UsageProvider | null;
}
export interface UsageModelSummary extends UsageGroup {
  adapter: Adapter | null;
  originId: string | null;
  provider: UsageProvider | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  tokenReports: number;
  reportedCostUsd: string | null;
  costReports: number;
}
export interface UsageReport {
  records: UsageRecord[];
  summary: UsageSummary;
  routeTotals: (UsageGroup & { name: string | null; currentProvider: UsageProvider | null })[];
  operations: UsageOperationSummary[];
  models: UsageModelSummary[];
  dailyLimits: {
    clientId: string;
    name: string;
    projectId: string;
    used: number;
    max: number | null;
  }[];
  day: string;
  timeZone: string;
  retentionDays: number;
  openRouterSources: { routeId: string; name: string; projectId: string }[];
}
export interface OpenRouterUsage {
  checkedAt: string;
  freeRequests: { used: number | null; max: number | null; remaining: number | null } | null;
  usage: string | null;
  usageDaily: string | null;
  usageWeekly: string | null;
  usageMonthly: string | null;
  limit: string | null;
  limitStatus: 'set' | 'unset' | 'unknown';
  limitRemaining: string | null;
  limitReset: 'daily' | 'weekly' | 'monthly' | null;
}
export interface UsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  unknownUsageCount: number;
  costs: {
    currency: string;
    amountMicros: number | null;
    amountExactMicros: string;
    overflow: boolean;
    krwEstimate?: number | null;
  }[];
}
export interface EncryptedBackup {
  format: 'keydesk-backup';
  version: 1;
  kdf: 'scrypt-131072-8-1';
  salt: string;
  iv: string;
  tag: string;
  data: string;
}
