import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IntegrationsPage } from "./IntegrationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/integrations"
)({
  component: IntegrationsPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "관리자",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "연동",
          link: linkOptions({
            to: "/admin/integrations"
          })
        }
      ]
    };
  }
});
