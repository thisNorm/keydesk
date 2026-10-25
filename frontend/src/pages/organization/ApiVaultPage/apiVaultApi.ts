import { Project, ProjectType } from "@app/hooks/api/projects/types";
import type { SecretV3Raw, SecretV3RawResponse } from "@app/hooks/api/secrets/types";

import { parseApiCredentials, parseApiVaultEntry, serializeApiVaultDraft } from "./apiVaultModel";
import type { ApiVaultDraft, ApiVaultEntry } from "./apiVaultTypes";

const VAULT_MARKER = "personal-api-vault/v1";

export const findApiVaultProject = (projects: Project[], orgId: string): Project | null =>
  projects
    .filter(
      (project) =>
        project.orgId === orgId &&
        project.type === ProjectType.SecretManager &&
        project.description === VAULT_MARKER
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    )[0] ?? null;

export const getApiVaultEnvironment = (project: Project): string => {
  const environment =
    project.environments.find((item) => item.slug === "dev") ?? project.environments[0];
  if (!environment)
    throw new Error("보관함에 저장 환경이 없습니다. 프로젝트 환경 설정을 확인해 주세요.");
  return environment.slug;
};

const getClient = async () => (await import("@app/config/request")).apiRequest;

const requireAppliedChange = (data: { approval?: unknown }) => {
  if (data.approval) {
    throw new Error(
      "변경 승인 요청이 등록되었습니다. 아직 저장 내용에는 반영되지 않았습니다. 전체 프로젝트에서 승인 상태를 확인한 뒤 보관함을 새로고침하세요."
    );
  }
};

export const fetchApiVaultProject = async (orgId: string): Promise<Project | null> => {
  const client = await getClient();
  const { data } = await client.get<{ projects: Project[] }>("/api/v1/projects", {
    params: { type: ProjectType.SecretManager }
  });
  return findApiVaultProject(data.projects, orgId);
};

export const initializeApiVault = async (orgId: string): Promise<Project> => {
  const existing = await fetchApiVaultProject(orgId);
  if (existing) return existing;
  const client = await getClient();
  const { data } = await client.post<{ project: Project }>("/api/v1/projects", {
    projectName: "내 API 보관함",
    projectDescription: VAULT_MARKER,
    type: ProjectType.SecretManager
  });
  const { data: detail } = await client.get<{ project: Project }>(
    `/api/v1/projects/${data.project.id}`
  );
  if (detail.project.orgId !== orgId)
    throw new Error("현재 조직의 보관함을 확인할 수 없습니다. 다시 로그인해 주세요.");
  getApiVaultEnvironment(detail.project);
  return detail.project;
};

const vaultScope = (project: Project) => ({
  projectId: project.id,
  environment: getApiVaultEnvironment(project),
  secretPath: "/",
  type: "shared"
});

export const fetchApiVaultEntries = async (project: Project): Promise<ApiVaultEntry[]> => {
  const client = await getClient();
  const { data } = await client.get<SecretV3RawResponse>("/api/v4/secrets", {
    params: {
      ...vaultScope(project),
      viewSecretValue: false,
      expandSecretReferences: false,
      includeImports: false
    }
  });
  return data.secrets
    .filter((secret) => secret.type === "shared")
    .map(parseApiVaultEntry)
    .filter((entry): entry is ApiVaultEntry => entry !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

export const readApiVaultCredentials = async (project: Project, entry: ApiVaultEntry) => {
  const client = await getClient();
  const { data } = await client.get<{ secret: SecretV3Raw }>(
    `/api/v4/secrets/${encodeURIComponent(entry.id)}`,
    {
      params: {
        ...vaultScope(project),
        viewSecretValue: true,
        expandSecretReferences: false,
        includeImports: false
      }
    }
  );
  if (data.secret.secretValueHidden || typeof data.secret.secretValue !== "string") {
    throw new Error("이 인증값을 볼 수 있는 권한이 없습니다.");
  }
  return parseApiCredentials(data.secret.secretValue);
};

export const saveApiVaultEntry = async (
  project: Project,
  draft: ApiVaultDraft,
  entryId?: string
): Promise<void> => {
  const serialized = serializeApiVaultDraft(draft);
  const client = await getClient();
  const key = entryId ?? `PERSONAL_API_${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
  const body = { ...vaultScope(project), ...serialized, skipMultilineEncoding: true };
  const path = `/api/v4/secrets/${encodeURIComponent(key)}`;
  const { data } = entryId
    ? await client.patch<{ approval?: unknown }>(path, body)
    : await client.post<{ approval?: unknown }>(path, body);
  requireAppliedChange(data);
};

export const deleteApiVaultEntry = async (
  project: Project,
  entry: ApiVaultEntry
): Promise<void> => {
  const client = await getClient();
  const { data } = await client.delete<{ approval?: unknown }>(
    `/api/v4/secrets/${encodeURIComponent(entry.id)}`,
    {
      data: { ...vaultScope(project), secretId: entry.secretId }
    }
  );
  requireAppliedChange(data);
};
