import { Plus } from "lucide-react";

import { Button, DocumentationLinkBadge } from "@app/components/v3";
import { useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { usePopUp, useScopeVariant } from "@app/hooks";

import { SelectImportFromPlatformModal } from "./components/SelectImportFromPlatformModal";

const EXTERNAL_MIGRATIONS_DOCS_HREF =
  "https://infisical.com/docs/documentation/platform/external-migrations/overview";

export const ExternalMigrationsTab = () => {
  const scopeVariant = useScopeVariant();
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["selectImportPlatform"] as const);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <h2 className="text-xl font-normal text-foreground">대량 데이터 가져오기</h2>
          <p className="mt-1 mb-6 text-sm text-muted">
            외부 플랫폼의 데이터를 한 번에 대량으로 가져옵니다.
          </p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-medium text-foreground">외부 소스에서 가져오기</p>
              <DocumentationLinkBadge href={EXTERNAL_MIGRATIONS_DOCS_HREF} />
            </div>
            <p className="mt-1 text-sm text-muted">다른 플랫폼의 데이터를 Keydesk로 가져옵니다.</p>
          </div>

          <Button
            variant={scopeVariant}
            type="button"
            className="gap-1.5"
            onClick={() => {
              handlePopUpOpen("selectImportPlatform");
            }}
            isDisabled={!hasOrgRole(OrgMembershipRole.Admin)}
          >
            <Plus className="size-4 shrink-0" />
            가져오기
          </Button>
        </div>

        <SelectImportFromPlatformModal
          isOpen={popUp.selectImportPlatform.isOpen}
          onToggle={(state) => handlePopUpToggle("selectImportPlatform", state)}
        />
      </div>
    </div>
  );
};
