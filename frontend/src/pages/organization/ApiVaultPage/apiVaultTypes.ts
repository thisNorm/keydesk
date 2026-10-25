export type ApiVaultStatus = "active" | "paused" | "revoked";

export type ApiCredential = {
  label: string;
  value: string;
};

export type ApiVaultMetadata = {
  name: string;
  provider: string;
  description: string;
  websiteUrl: string;
  consoleUrl: string;
  docsUrl: string;
  endpointUrl: string;
  projects: string;
  owner: string;
  tags: string[];
  issuedAt: string;
  expiresAt: string;
  plan: string;
  quota: string;
  status: ApiVaultStatus;
  notes: string;
};

export type ApiVaultEntry = ApiVaultMetadata & {
  id: string;
  secretId: string;
  credentialLabels: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApiVaultDraft = ApiVaultMetadata & {
  credentials: ApiCredential[];
};

export type ApiVaultViewProps = {
  entries: ApiVaultEntry[];
  loading: boolean;
  saving: boolean;
  vaultReady: boolean;
  errorMessage?: string;
  onInitialize: () => Promise<void>;
  onSave: (draft: ApiVaultDraft, entryId?: string) => Promise<void>;
  onDelete: (entry: ApiVaultEntry) => Promise<void>;
  onReadCredentials: (entry: ApiVaultEntry) => Promise<ApiCredential[]>;
  onRefresh: () => void;
};
