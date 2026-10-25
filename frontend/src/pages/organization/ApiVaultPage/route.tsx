import { createFileRoute } from "@tanstack/react-router";

import { ApiVaultPage } from "./ApiVaultPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/api-vault"
)({
  context: () => ({ breadcrumbs: [{ label: "내 API 보관함" }] }),
  component: ApiVaultPage
});
