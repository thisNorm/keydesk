import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { navigateUserToOrg } from "./Login.utils";

vi.mock("@app/context", () => ({ useServerConfig: vi.fn() }));
vi.mock("@app/hooks/api/organization/queries", () => ({ fetchOrganizations: vi.fn() }));
vi.mock("@app/hooks/api/reactQuery", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("@app/hooks/api/users", () => ({ userKeys: { getUser: ["user"] } }));

describe("initial organization navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the personal API vault after login", async () => {
    const navigate = vi.fn();
    await navigateUserToOrg({ navigate, organizationId: "personal-org" });
    expect(navigate).toHaveBeenCalledWith({
      to: "/organizations/$orgId/api-vault",
      params: { orgId: "personal-org" },
      search: { subOrganization: undefined }
    });
  });

  it("retains an explicit destination", async () => {
    const navigate = vi.fn();
    await navigateUserToOrg({
      navigate,
      organizationId: "personal-org",
      navigateTo: "/organizations/$orgId/settings"
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/organizations/$orgId/settings" })
    );
  });

  it("preserves the active section when switching organizations", async () => {
    const navigate = vi.fn();
    await navigateUserToOrg({
      navigate,
      organizationId: "other-org",
      switchFrom: {
        pathname: "/organizations/personal-org/settings",
        search: { selectedTab: "tab-org-general", action: "delete" }
      }
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/organizations/$orgId/settings",
      params: { orgId: "other-org" },
      search: { selectedTab: "tab-org-general", subOrganization: undefined }
    });
  });
});
