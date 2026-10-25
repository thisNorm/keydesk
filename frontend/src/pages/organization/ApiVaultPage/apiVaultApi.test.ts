import { beforeEach, describe, expect, it, vi } from "vitest";

import { Project, ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";

import {
  deleteApiVaultEntry,
  fetchApiVaultEntries,
  findApiVaultProject,
  getApiVaultEnvironment,
  saveApiVaultEntry
} from "./apiVaultApi";
import { createEmptyApiVaultDraft } from "./apiVaultModel";
import type { ApiVaultEntry } from "./apiVaultTypes";

const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn()
}));
vi.mock("@app/config/request", () => ({ apiRequest: { get, post, patch, delete: remove } }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  remove.mockReset();
});

const project = (overrides: Partial<Project> = {}) =>
  ({
    id: "vault-a",
    orgId: "org-a",
    name: "내 API 보관함",
    description: "personal-api-vault/v1",
    type: ProjectType.SecretManager,
    version: ProjectVersion.V3,
    createdAt: "2026-10-01T00:00:00.000Z",
    environments: [{ id: "env-dev", slug: "dev", name: "개발" }],
    ...overrides
  }) as Project;

describe("personal API vault project isolation", () => {
  it.each(["create", "update", "delete"])(
    "reports approval pending instead of claiming %s completed",
    async (operation) => {
      const response = { data: { approval: { id: "pending-approval" } } };
      post.mockResolvedValue(response);
      patch.mockResolvedValue(response);
      remove.mockResolvedValue(response);
      const draft = {
        ...createEmptyApiVaultDraft(),
        name: "지도 API",
        provider: "테스트",
        credentials: [{ label: "API Key", value: "fake-test-only" }]
      };
      const request =
        operation === "delete"
          ? deleteApiVaultEntry(project(), {
              id: "TEST_KEY",
              secretId: "secret-id"
            } as ApiVaultEntry)
          : saveApiVaultEntry(project(), draft, operation === "update" ? "TEST_KEY" : undefined);
      await expect(request).rejects.toThrow("승인");
    }
  );
  it("lists metadata without fetching values, references, or imported secrets", async () => {
    get.mockResolvedValue({ data: { secrets: [] } });
    await expect(fetchApiVaultEntries(project())).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith("/api/v4/secrets", {
      params: {
        projectId: "vault-a",
        environment: "dev",
        secretPath: "/",
        type: "shared",
        viewSecretValue: false,
        expandSecretReferences: false,
        includeImports: false
      }
    });
  });
  it("selects only the marked secret project in the active organization", () => {
    const expected = project();
    const candidates = [
      project({ id: "other-org", orgId: "org-b" }),
      project({ id: "same-name", description: "another project" }),
      project({ id: "wrong-product", type: ProjectType.KMS }),
      expected
    ];
    expect(findApiVaultProject(candidates, "org-a")).toBe(expected);
  });

  it("does not adopt unrelated projects or create a vault while listing", () => {
    expect(findApiVaultProject([project({ orgId: "org-b" })], "org-a")).toBeNull();
    expect(findApiVaultProject([], "org-a")).toBeNull();
  });

  it("selects a stable existing vault when duplicate markers are present", () => {
    const first = project();
    expect(
      findApiVaultProject(
        [project({ id: "newer", createdAt: "2026-10-20T00:00:00.000Z" }), first],
        "org-a"
      )
    ).toBe(first);
  });

  it("uses the project's real environment and rejects projects without one", () => {
    expect(getApiVaultEnvironment(project())).toBe("dev");
    expect(
      getApiVaultEnvironment(
        project({ environments: [{ id: "env-local", slug: "local", name: "개인용" }] })
      )
    ).toBe("local");
    expect(() => getApiVaultEnvironment(project({ environments: [] }))).toThrow("환경");
  });
});
