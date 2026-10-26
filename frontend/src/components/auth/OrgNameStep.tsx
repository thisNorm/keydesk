import type { JSX } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useCreateOrg } from "@app/hooks/api";
import { submitSignupOnboarding, useSelectOrganization } from "@app/hooks/api/auth/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AuthPagePanel } from "./AuthPagePanel";

const formSchema = z.object({
  organizationName: GenericResourceNameSchema,
  attributionSource: z.string().trim().max(512).optional()
});

type OrgNameFormData = z.infer<typeof formSchema>;

interface OrgNameStepProps {
  onComplete: (orgId: string) => void;
  callbackPort?: number;
}

export default function OrgNameStep({ onComplete, callbackPort }: OrgNameStepProps): JSX.Element {
  const navigate = useNavigate();
  const { mutateAsync: createOrg, isPending: isCreating } = useCreateOrg({ invalidate: false });
  const { mutateAsync: selectOrganization, isPending: isSelecting } = useSelectOrganization();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<OrgNameFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { organizationName: "", attributionSource: "" }
  });

  const onSubmit = async ({ organizationName, attributionSource }: OrgNameFormData) => {
    try {
      const organization = await createOrg({ name: organizationName });
      const { isMfaEnabled } = await selectOrganization({ organizationId: organization.id });
      if (isMfaEnabled) {
        navigate({
          to: "/login/select-organization",
          search: { org_id: organization.id, callback_port: callbackPort }
        });
        return;
      }
      localStorage.setItem("orgData.id", organization.id);
      if (attributionSource) {
        submitSignupOnboarding({ attributionSource }).catch(() => {});
      }
      onComplete(organization.id);
    } catch {
      // The global mutation error handler already surfaces a toast; stay on this step.
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-foreground-inverse to-foreground-soft bg-clip-text font-alliance text-2xl font-normal text-transparent">
            조직 이름 설정
          </CardTitle>
          <CardDescription className="text-sm text-label">
            시크릿을 보관할 조직입니다. 이름은 언제든지 변경할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
            <Field data-invalid={Boolean(errors.organizationName)}>
              <FieldLabel className="sr-only" htmlFor="sso-organization-name">
                조직 이름
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("organizationName")}
                id="sso-organization-name"
                placeholder="조직 이름"
                maxLength={64}
                autoComplete="organization"
                isError={Boolean(errors.organizationName)}
              />
              {errors.organizationName ? (
                <FieldError>{errors.organizationName.message}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-attribution-source">
                Keydesk를 알게 된 경로 <span className="font-normal text-muted"> (선택)</span>
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("attributionSource")}
                id="signup-attribution-source"
                autoComplete="off"
                placeholder="예: Hacker News, 지인, GitHub..."
                maxLength={512}
              />
            </Field>
            <Button
              type="submit"
              variant="project"
              size="lg"
              isFullWidth
              isPending={isCreating || isSelecting}
            >
              계속
            </Button>
          </form>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}
