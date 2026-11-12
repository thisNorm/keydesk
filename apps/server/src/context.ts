import type { DatabaseSync } from 'node:sqlite';
import type { CredentialStatus, Settings } from '@keydesk/contracts';
import type { MailAlerts } from './mail-alerts.ts';
export interface ResolvedCredential {
  id: string;
  entryId: string;
  version: number;
  value: string;
  status: CredentialStatus;
  expiresAt: string;
}
export interface CoreContext {
  db: DatabaseSync;
  now: () => Date;
  getSettings: () => Settings;
  getCredential: (id: string) => ResolvedCredential;
  audit: (action: string, details: Record<string, unknown>) => void;
  mailAlerts?: MailAlerts;
}
