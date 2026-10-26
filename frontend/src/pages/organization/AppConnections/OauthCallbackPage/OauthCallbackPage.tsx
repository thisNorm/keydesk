import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { PageLoader } from "@app/components/v3/platform/PageLoader";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  APP_CONNECTION_MAP,
  consumeCsrfToken,
  getConnectionFlowReturnNavigateOptions,
  getIntegrationsListTab,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData
} from "@app/helpers/appConnections";
import {
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureDevOpsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  GitHubConnectionMethod,
  GitLabConnectionMethod,
  HerokuConnectionMethod,
  StripeConnectionMethod,
  TAppConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ApplicationTab } from "@app/pages/cert-manager/ApplicationDetailsByIDPage/application-tabs";

import { FormDataMap } from "./OauthCallbackPage.types";

const formDataStorageFieldMap: Partial<Record<AppConnection, string>> = {
  [AppConnection.GitHub]: GITHUB_CONNECTION_FORM_STORAGE_KEY,
  [AppConnection.GitHubRadar]: "githubRadarConnectionFormData",
  [AppConnection.GitLab]: "gitlabConnectionFormData",
  [AppConnection.AzureKeyVault]: "azureKeyVaultConnectionFormData",
  [AppConnection.AzureAppConfiguration]: "azureAppConfigurationConnectionFormData",
  [AppConnection.AzureClientSecrets]: "azureClientSecretsConnectionFormData",
  [AppConnection.AzureDevOps]: "azureDevOpsConnectionFormData",
  [AppConnection.Heroku]: "herokuConnectionFormData",
  [AppConnection.Stripe]: "stripeConnectionFormData"
};

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.OauthCallbackPage.id
  });

  const rawAppConnection = useParams({
    strict: false,
    select: (el) => el?.appConnection as AppConnection
  });

  const updateAppConnection = useUpdateAppConnection();
  const createAppConnection = useCreateAppConnection();

  const { code, state: rawState, installation_id: installationId } = search;

  const state = rawState.includes("<:>") ? rawState.split("<:>")[0] : rawState;
  const appConnection = rawState.includes("<:>") ? rawState.split("<:>")[1] : rawAppConnection;

  const clearState = (app: AppConnection) => {
    if (!consumeCsrfToken(state)) {
      throw new Error("유효하지 않은 CSRF 토큰입니다");
    }

    const dataFieldName = formDataStorageFieldMap[app];

    localStorage.removeItem(dataFieldName!);
  };

  // Shared post-success step: notify and navigate back to where the connection flow started.
  const finalizeConnection = async (data: {
    returnUrl: string;
    appConnectionName: string;
    connectionId?: string;
    projectId?: string;
    connection: TAppConnection;
  }) => {
    createNotification({
      text: `연결 처리 완료: ${data.connectionId ? "수정" : "추가"} ${data.appConnectionName ? APP_CONNECTION_MAP[data.appConnectionName as AppConnection].name : ""} 연결`,
      type: "success"
    });

    await navigate({
      to: data.returnUrl,
      params: {
        projectId: data.projectId ?? undefined
      },
      search: data.returnUrl.includes("app-connections")
        ? undefined
        : {
            connectionId: data.connection.id,
            connectionName: data.connection.name,
            ...(data.returnUrl.includes("integrations")
              ? { selectedTab: getIntegrationsListTab() }
              : {}),
            ...(data.returnUrl.includes("/cert-manager/applications/") &&
            localStorage.getItem("pkiSyncFormData")
              ? { selectedTab: ApplicationTab.Syncs }
              : {})
          }
    });
  };

  const getFormData = <T extends keyof FormDataMap>(app: T): FormDataMap[T] | null => {
    const dataFieldName = formDataStorageFieldMap[app];

    const result = readConnectionFormData<FormDataMap[T]>(dataFieldName!);

    if (result.status === "missing") {
      createNotification({
        type: "error",
        text: `${app ? APP_CONNECTION_MAP[app as AppConnection].name : ""} 연결 세션이 만료되었거나 이미 완료되었습니다. 연결을 다시 시작하세요.`
      });
      navigate({ to: "/" });
      return null;
    }

    if (result.status === "corrupt") {
      createNotification({
        type: "error",
        text: `잘못된 ${app || ""} 양식 상태입니다. 이동 중...`
      });
      navigate({ to: "/" });
      return null;
    }

    return {
      ...result.data,
      app
    } as FormDataMap[T];
  };

  const handleGitLab = useCallback(async () => {
    const formData = getFormData(AppConnection.GitLab);
    if (formData === null) return null;

    clearState(AppConnection.GitLab);

    const { connectionId, name, description, returnUrl, isUpdate, projectId, credentials } =
      formData;

    let connection: TAppConnection;

    try {
      if (isUpdate && connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          connectionId,
          credentials: {
            code: code as string,
            instanceUrl: credentials.instanceUrl as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitLab,
          name,
          description,
          projectId,
          method: GitLabConnectionMethod.OAuth,
          credentials: {
            code: code as string,
            instanceUrl: credentials.instanceUrl as string
          }
        });
      }

      return {
        connectionId,
        returnUrl,
        appConnectionName: formData.app,
        projectId,
        connection
      };
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }
  }, []);

  const handleAzureKeyVault = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureKeyVault);
    if (formData === null) return null;

    clearState(AppConnection.AzureKeyVault);

    const { connectionId, name, description, returnUrl, projectId, gatewayId, gatewayPoolId } =
      formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureKeyVault,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          },
          gatewayId,
          gatewayPoolId
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.AzureKeyVault,
          name,
          description,
          projectId,
          method: AzureKeyVaultConnectionMethod.OAuth,
          credentials: {
            tenantId: formData.tenantId,
            code: code as string
          },
          gatewayId,
          gatewayPoolId
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleAzureAppConfiguration = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureAppConfiguration);
    if (formData === null) return null;

    clearState(AppConnection.AzureAppConfiguration);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureAppConfiguration,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.AzureAppConfiguration,
          name,
          description,
          projectId,
          method: AzureAppConfigurationConnectionMethod.OAuth,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleAzureClientSecrets = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureClientSecrets);
    if (formData === null) return null;

    clearState(AppConnection.AzureClientSecrets);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureClientSecrets,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.AzureClientSecrets,
          name,
          description,
          method: AzureClientSecretsConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleAzureDevOps = useCallback(async () => {
    const formData = getFormData(AppConnection.AzureDevOps);
    if (formData === null) return null;

    clearState(AppConnection.AzureDevOps);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (!("tenantId" in formData)) {
        throw new Error("OAuth 양식 데이터가 필요하지만 액세스 토큰 데이터를 받았습니다");
      }

      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.AzureDevOps,
          connectionId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId as string,
            orgName: formData.orgName
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.AzureDevOps,
          name,
          description,
          method: AzureDevOpsConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string,
            tenantId: formData.tenantId as string,
            orgName: formData.orgName
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleGitHub = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHub);
    if (formData === null) return null;

    clearState(AppConnection.GitHub);

    const {
      connectionId,
      name,
      description,
      returnUrl,
      gatewayId,
      gatewayPoolId,
      credentials,
      projectId
    } = formData;

    const storedGitHubAppId = (credentials as { gitHubAppId?: string | null } | undefined)
      ?.gitHubAppId;

    const isAppMethod = formData.method === GitHubConnectionMethod.App;

    // App connections go through GitHub's install flow, which redirects back with the chosen
    // installation_id. If it's missing, the app wasn't installed — e.g. a non-admin org member
    // triggered a pending install request that an owner must approve — so there's nothing to connect.
    if (isAppMethod && !installationId) {
      createNotification({
        type: "error",
        text: "GitHub App이 설치되지 않았습니다. 조직에 설치를 요청한 경우 먼저 소유자의 승인이 필요할 수 있습니다. 설치를 완료한 뒤 다시 시도하세요."
      });
      navigate(getConnectionFlowReturnNavigateOptions({ returnUrl, projectId }));
      return null;
    }

    let connection: TAppConnection;

    try {
      const gitHubAppId = storedGitHubAppId;

      const appCredentials = {
        code: code as string,
        installationId: installationId as string,
        ...(gitHubAppId !== undefined && { gitHubAppId }),
        ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
        ...(credentials?.host && { host: credentials.host })
      };

      const oauthCredentials = {
        code: code as string,
        ...(credentials?.instanceType && { instanceType: credentials.instanceType }),
        ...(credentials?.host && { host: credentials.host })
      };

      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          connectionId,
          credentials: isAppMethod ? appCredentials : oauthCredentials,
          gatewayId,
          gatewayPoolId
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitHub,
          name,
          description,
          projectId,
          ...(isAppMethod
            ? {
                method: GitHubConnectionMethod.App,
                credentials: appCredentials,
                gatewayId,
                gatewayPoolId
              }
            : {
                method: GitHubConnectionMethod.OAuth,
                credentials: oauthCredentials,
                gatewayId,
                gatewayPoolId
              })
        });
      }
    } catch (err) {
      createNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          `실패한 작업: ${connectionId ? "수정" : "생성"} GitHub 연결`
      });
      navigate(getConnectionFlowReturnNavigateOptions({ returnUrl, projectId }));
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleGitHubRadar = useCallback(async () => {
    const formData = getFormData(AppConnection.GitHubRadar);
    if (formData === null) return null;

    clearState(AppConnection.GitHubRadar);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.GitHubRadar,
          connectionId,
          credentials: {
            code: code as string,
            installationId: installationId as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.GitHubRadar,
          name,
          description,
          method: GitHubConnectionMethod.App,
          projectId,
          credentials: {
            code: code as string,
            installationId: installationId as string
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleHeroku = useCallback(async () => {
    const formData = getFormData(AppConnection.Heroku);
    if (formData === null) return null;

    clearState(AppConnection.Heroku);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.Heroku,
          connectionId,
          credentials: {
            code: code as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.Heroku,
          name,
          description,
          method: HerokuConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  const handleStripe = useCallback(async () => {
    const formData = getFormData(AppConnection.Stripe);
    if (formData === null) return null;

    clearState(AppConnection.Stripe);

    const { connectionId, name, description, returnUrl, projectId } = formData;

    let connection: TAppConnection;

    try {
      if (connectionId) {
        connection = await updateAppConnection.mutateAsync({
          app: AppConnection.Stripe,
          connectionId,
          credentials: {
            code: code as string
          }
        });
      } else {
        connection = await createAppConnection.mutateAsync({
          app: AppConnection.Stripe,
          name,
          description,
          method: StripeConnectionMethod.OAuth,
          projectId,
          credentials: {
            code: code as string
          }
        });
      }
    } catch {
      navigate({
        to: returnUrl,
        params: {
          projectId
        }
      });
      return null;
    }

    return {
      connectionId,
      returnUrl,
      appConnectionName: formData.app,
      projectId,
      connection
    };
  }, []);

  // Ensure that the localstorage is ready for use, to avoid the form data being malformed
  useEffect(() => {
    if (!isReady) {
      setIsReady(!!localStorage.length);
    }
  }, [localStorage.length]);

  useEffect(() => {
    if (!isReady) return;

    (async () => {
      let data: {
        returnUrl: string;
        appConnectionName: string;
        connectionId?: string;
        projectId?: string;
        connection: TAppConnection;
      } | null = null;

      try {
        if (appConnection === AppConnection.GitHub) {
          data = await handleGitHub();
        } else if (appConnection === AppConnection.GitHubRadar) {
          data = await handleGitHubRadar();
        } else if (appConnection === AppConnection.GitLab) {
          data = await handleGitLab();
        } else if (appConnection === AppConnection.AzureKeyVault) {
          data = await handleAzureKeyVault();
        } else if (appConnection === AppConnection.AzureAppConfiguration) {
          data = await handleAzureAppConfiguration();
        } else if (appConnection === AppConnection.AzureClientSecrets) {
          data = await handleAzureClientSecrets();
        } else if (appConnection === AppConnection.AzureDevOps) {
          data = await handleAzureDevOps();
        } else if (appConnection === AppConnection.Heroku) {
          data = await handleHeroku();
        } else if (appConnection === AppConnection.Stripe) {
          data = await handleStripe();
        }
      } catch {
        createNotification({
          type: "error",
          text: "연결 세션이 유효하지 않거나 만료되었습니다. 연결을 다시 시작하세요."
        });
        await navigate({ to: "/" });
        return;
      }

      if (data) {
        await finalizeConnection(data);
      }
    })();
  }, [isReady]);

  return <PageLoader />;
};
