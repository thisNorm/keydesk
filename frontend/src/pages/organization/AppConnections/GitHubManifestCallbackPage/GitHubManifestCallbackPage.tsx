import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { PageLoader } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  consumeCsrfToken,
  getConnectionFlowReturnNavigateOptions,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const GitHubManifestCallbackPage = () => {
  const navigate = useNavigate();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.GitHubManifestCallbackPage.id
  });
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const { gitHubAppId, slug, installState } = search;

    type TStoredGitHubConnectionForm = {
      credentials?: Record<string, unknown>;
      resumeWithGitHubAppId?: string;
      returnUrl?: string;
    };

    const storedForm = readConnectionFormData<TStoredGitHubConnectionForm>(
      GITHUB_CONNECTION_FORM_STORAGE_KEY
    );

    let connectionForm: TStoredGitHubConnectionForm | null;
    if (storedForm.status === "ok") {
      connectionForm = storedForm.data;
    } else if (storedForm.status === "missing") {
      connectionForm = {};
    } else {
      connectionForm = null;
    }

    const returnUrl = connectionForm?.returnUrl;

    const navigateBack = (reopenForm: boolean) => {
      if (returnUrl) {
        return navigate(
          getConnectionFlowReturnNavigateOptions({
            returnUrl,
            reopenFormApp: reopenForm ? AppConnection.GitHub : undefined
          })
        );
      }
      return navigate({
        to: "/organizations/$orgId/app-connections",
        params: { orgId },
        search: reopenForm ? { addConnectionApp: AppConnection.GitHub } : undefined
      });
    };

    if (!gitHubAppId || !slug || !installState) {
      createNotification({
        type: "error",
        text: "GitHub 매니페스트 콜백 매개변수가 올바르지 않습니다."
      });
      navigateBack(false);
      return;
    }

    // Confirm this callback corresponds to a flow this browser initiated. The install state is
    // round-tripped through the signed manifest token and echoed back here; it must match the CSRF
    // token stored when the user kicked off app creation. This blocks a crafted callback URL from
    // pre-seeding the connection form with an attacker-chosen app id.
    if (!consumeCsrfToken(installState)) {
      createNotification({
        type: "error",
        text: "GitHub 매니페스트 콜백 상태가 올바르지 않습니다."
      });
      navigateBack(false);
      return;
    }

    // The GitHub App is already created at this point. Mark the in-progress connection form so it
    // resumes with the new app selected, then send the user back to it to finish the connection.
    if (connectionForm) {
      connectionForm.credentials = {
        ...(connectionForm.credentials ?? {}),
        gitHubAppId
      };
      connectionForm.resumeWithGitHubAppId = gitHubAppId;
      localStorage.setItem(GITHUB_CONNECTION_FORM_STORAGE_KEY, JSON.stringify(connectionForm));
    }

    createNotification({
      type: "success",
      text: "GitHub App을 만들었습니다. 앱을 선택하고 연결 설정을 완료하세요."
    });
    navigateBack(true);
  }, []);

  return <PageLoader text="GitHub App을 만드는 중입니다. 잠시 기다려 주세요..." />;
};
