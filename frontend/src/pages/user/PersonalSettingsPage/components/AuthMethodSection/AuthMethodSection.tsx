import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { jwtDecode } from "jwt-decode";
import { ChromeIcon, GithubIcon, GitlabIcon, LucideIcon, MailIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Toggle
} from "@app/components/v3";
import { useServerConfig, useUser } from "@app/context";
import { useUpdateUserAuthMethods } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { AuthMethod } from "@app/hooks/api/users/types";

interface AuthMethodOption {
  label: string;
  value: AuthMethod;
  icon: LucideIcon;
  loginMethod: LoginMethod;
}

const authMethodOpts: AuthMethodOption[] = [
  { label: "이메일", value: AuthMethod.EMAIL, icon: MailIcon, loginMethod: LoginMethod.EMAIL },
  { label: "Google", value: AuthMethod.GOOGLE, icon: ChromeIcon, loginMethod: LoginMethod.GOOGLE },
  { label: "GitHub", value: AuthMethod.GITHUB, icon: GithubIcon, loginMethod: LoginMethod.GITHUB },
  { label: "GitLab", value: AuthMethod.GITLAB, icon: GitlabIcon, loginMethod: LoginMethod.GITLAB }
];
const schema = z.object({
  authMethods: z.nativeEnum(AuthMethod).array()
});

export type FormData = z.infer<typeof schema>;

const getCurrentAuthMethod = () => {
  const authToken = getAuthToken();
  if (!authToken) return undefined;

  try {
    return jwtDecode<{ authMethod?: AuthMethod }>(authToken).authMethod;
  } catch {
    return undefined;
  }
};

export const AuthMethodSection = () => {
  const { user } = useUser();
  const { config } = useServerConfig();
  const { mutateAsync, isPending } = useUpdateUserAuthMethods();

  const { reset, setValue, watch } = useForm<FormData>({
    defaultValues: {
      authMethods: user.authMethods
    },
    resolver: zodResolver(schema)
  });

  const authMethods = watch("authMethods");
  const currentAuthMethod = getCurrentAuthMethod();

  useEffect(() => {
    if (user) {
      reset({
        authMethods: user.authMethods
      });
    }
  }, [user]);

  const onAuthMethodToggle = async (value: boolean, authMethodOpt: AuthMethodOption) => {
    const newAuthMethods = value
      ? [...authMethods, authMethodOpt.value]
      : authMethods.filter((auth) => auth !== authMethodOpt.value);

    try {
      const newUser = await mutateAsync({
        authMethods: newAuthMethods
      });

      setValue("authMethods", newUser.authMethods);
      createNotification({
        text: `${authMethodOpt.label} 로그인을 ${value ? "활성화했습니다" : "비활성화했습니다"}.`,
        type: "success"
      });
    } catch {
      // MutationCache.onError handles the error notification.
    }
  };

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle className="font-alliance">인증 방식</CardTitle>
        <CardDescription>
          같은 이메일로 Keydesk에 로그인할 수 있는 서비스를 선택하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border px-6 pb-6">
        {user &&
          authMethodOpts.map((authMethodOpt) => {
            // only filter when enabledLoginMethods is explicitly configured by admin
            if (
              config.enabledLoginMethods &&
              !config.enabledLoginMethods.includes(authMethodOpt.loginMethod)
            ) {
              return null;
            }

            const isEnabled = authMethods?.includes(authMethodOpt.value) ?? false;
            const isOnlyMethod = isEnabled && authMethods.length === 1;
            const descriptionId = `enable-${authMethodOpt.value}-auth-description`;
            const Icon = authMethodOpt.icon;

            return (
              <Field
                orientation="horizontal"
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 py-4"
                key={`auth-method-${authMethodOpt.value}`}
                data-disabled={isPending || isOnlyMethod}
              >
                <Icon className="row-span-2 row-start-1 size-6 text-muted" />
                <FieldContent className="contents">
                  <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2">
                    <FieldLabel
                      htmlFor={`enable-${authMethodOpt.value}-auth`}
                      className="cursor-pointer text-sm font-medium text-foreground"
                    >
                      {authMethodOpt.label}
                    </FieldLabel>
                    {currentAuthMethod === authMethodOpt.value && (
                      <Badge variant="neutral">현재 세션</Badge>
                    )}
                  </div>
                  <FieldDescription id={descriptionId} className="col-start-2 row-start-2 text-sm">
                    {isOnlyMethod
                      ? "최소 하나의 로그인 방식을 활성화해야 합니다."
                      : `${authMethodOpt.label} 로그인을 허용합니다.`}
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  className="col-start-3 row-span-2 row-start-1 self-center"
                  id={`enable-${authMethodOpt.value}-auth`}
                  onCheckedChange={(value) => onAuthMethodToggle(value, authMethodOpt)}
                  checked={isEnabled}
                  disabled={isPending || isOnlyMethod}
                  aria-describedby={descriptionId}
                  variant="project"
                />
              </Field>
            );
          })}
      </CardContent>
    </Card>
  );
};
