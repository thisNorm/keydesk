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
export type Adapter = 'generic' | 'openai' | 'anthropic';
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
  adapter: Adapter;
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
