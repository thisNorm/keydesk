import { useState } from "react";
import { Helmet } from "react-helmet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ZodError } from "zod";

import { useOrganization } from "@app/context";

import {
  deleteApiVaultEntry,
  fetchApiVaultEntries,
  fetchApiVaultProject,
  initializeApiVault,
  readApiVaultCredentials,
  saveApiVaultEntry
} from "./apiVaultApi";
import type { ApiVaultDraft, ApiVaultEntry } from "./apiVaultTypes";
import { ApiVaultView } from "./ApiVaultView";

const vaultError = (error: unknown) => {
  if (error instanceof ZodError)
    return new Error(error.issues[0]?.message ?? "입력한 내용을 확인해 주세요.");
  if (error instanceof Error && !isAxiosError(error)) return error;
  return new Error("요청을 처리하지 못했습니다. 로그인 상태와 보관함 접근 권한을 확인해 주세요.");
};

export const ApiVaultPage = () => {
  const { currentOrg } = useOrganization();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const projectKey = ["personal-api-vault", "project", currentOrg.id];
  const projectQuery = useQuery({
    queryKey: projectKey,
    queryFn: () => fetchApiVaultProject(currentOrg.id)
  });
  const project = projectQuery.data;
  const entriesKey = ["personal-api-vault", "entries", currentOrg.id, project?.id];
  const entriesQuery = useQuery({
    queryKey: entriesKey,
    queryFn: () => (project ? fetchApiVaultEntries(project) : Promise.resolve([])),
    enabled: Boolean(project)
  });

  const requireProject = () => {
    if (!project || project.orgId !== currentOrg.id)
      throw new Error("먼저 API 보관함을 만들어 주세요.");
    return project;
  };

  const requireEntry = (entryId: string) => {
    if (!entriesQuery.data?.some((entry) => entry.id === entryId)) {
      throw new Error("현재 보관함에서 이 항목을 찾을 수 없습니다. 새로고침해 주세요.");
    }
  };

  const runWrite = async (operation: () => Promise<void>) => {
    setSaving(true);
    try {
      await operation();
    } catch (error) {
      throw vaultError(error);
    } finally {
      setSaving(false);
    }
  };

  const onInitialize = () =>
    runWrite(async () => {
      const created = await initializeApiVault(currentOrg.id);
      queryClient.setQueryData(projectKey, created);
    });

  const onSave = (draft: ApiVaultDraft, entryId?: string) =>
    runWrite(async () => {
      if (entryId) requireEntry(entryId);
      await saveApiVaultEntry(requireProject(), draft, entryId);
      await queryClient.invalidateQueries({ queryKey: entriesKey });
    });

  const onDelete = (entry: ApiVaultEntry) =>
    runWrite(async () => {
      requireEntry(entry.id);
      await deleteApiVaultEntry(requireProject(), entry);
      await queryClient.invalidateQueries({ queryKey: entriesKey });
    });

  const onReadCredentials = async (entry: ApiVaultEntry) => {
    try {
      requireEntry(entry.id);
      return await readApiVaultCredentials(requireProject(), entry);
    } catch (error) {
      throw vaultError(error);
    }
  };

  return (
    <>
      <Helmet>
        <title>내 API 보관함 | Keydesk</title>
      </Helmet>
      <ApiVaultView
        entries={entriesQuery.data ?? []}
        loading={projectQuery.isPending || Boolean(project && entriesQuery.isPending)}
        saving={saving}
        vaultReady={Boolean(project)}
        errorMessage={
          projectQuery.isError || entriesQuery.isError
            ? "보관함을 불러오지 못했습니다. 로그인 상태를 확인하고 새로고침해 주세요."
            : undefined
        }
        onInitialize={onInitialize}
        onSave={onSave}
        onDelete={onDelete}
        onReadCredentials={onReadCredentials}
        onRefresh={() => {
          projectQuery.refetch();
          entriesQuery.refetch();
        }}
      />
    </>
  );
};
