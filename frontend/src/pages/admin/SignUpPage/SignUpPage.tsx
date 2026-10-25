import { useState } from "react";
import { Helmet } from "react-helmet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { OnboardingPageLayout } from "@app/components/auth/OnboardingPageLayout";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Alert,
  AlertDescription,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  Input
} from "@app/components/v3";
import { useCreateAdminUser, useSelectOrganization } from "@app/hooks/api";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AdminSignUpForm } from "./components/AdminSignUpForm";
import { AdminSignUpFormData } from "./adminSignUpSchema";

enum BootstrapStep {
  Account,
  Organization
}

const organizationSchema = z.object({
  organizationName: GenericResourceNameSchema
});

type TOrganizationForm = z.infer<typeof organizationSchema>;

const stepContent = {
  [BootstrapStep.Account]: {
    title: "최고 관리자 계정 만들기",
    description: "이 계정으로 Infisical 서버를 관리하세요."
  },
  [BootstrapStep.Organization]: {
    title: "조직 만들기",
    description: "프로젝트와 시크릿을 보관할 첫 공간을 설정하세요."
  }
} satisfies Record<BootstrapStep, { title: string; description: string }>;

export const SignUpPage = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(BootstrapStep.Account);
  const [accountData, setAccountData] = useState<AdminSignUpFormData>();
  const [formError, setFormError] = useState<string>();
  const { mutateAsync: createAdminUser, isPending } = useCreateAdminUser();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<TOrganizationForm>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      organizationName: ""
    }
  });

  const handleAccountContinue = (values: AdminSignUpFormData) => {
    setAccountData(values);
    setFormError(undefined);
    setActiveStep(BootstrapStep.Organization);
  };

  const handleOrganizationSubmit = handleSubmit(async ({ organizationName }) => {
    if (!accountData) {
      setActiveStep(BootstrapStep.Account);
      return;
    }

    setFormError(undefined);

    try {
      const result = await createAdminUser({
        email: accountData.email,
        password: accountData.password,
        firstName: accountData.firstName,
        lastName: accountData.lastName || undefined,
        organizationName
      });

      SecurityClient.setToken(result.token);
      await selectOrganization({ organizationId: result.organization.id });
      localStorage.setItem("orgData.id", result.organization.id);
      await router.invalidate();
      await navigate({ to: "/admin/setup" });
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setFormError(message || "서버를 초기화하지 못했습니다. 다시 시도하세요.");
    }
  });

  return (
    <OnboardingPageLayout currentStep={activeStep + 1} totalSteps={4}>
      <Helmet>
        <title>서버 초기 설정 | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2">
          <CardTitle className="font-alliance text-2xl font-normal">
            {stepContent[activeStep].title}
          </CardTitle>
          <CardDescription className="font-sans text-base">
            {stepContent[activeStep].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeStep === BootstrapStep.Account ? (
            <AdminSignUpForm defaultValues={accountData} onContinue={handleAccountContinue} />
          ) : (
            <form className="flex flex-col gap-6" noValidate onSubmit={handleOrganizationSubmit}>
              {formError && (
                <Alert variant="danger">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Field data-invalid={Boolean(errors.organizationName)}>
                <Input
                  variant="outlined"
                  {...register("organizationName")}
                  id="admin-signup-organization"
                  aria-label="조직 이름"
                  placeholder="조직 이름"
                  autoComplete="organization"
                  autoFocus
                  isError={Boolean(errors.organizationName)}
                />
                {errors.organizationName ? (
                  <FieldError>{errors.organizationName.message}</FieldError>
                ) : null}
              </Field>
              <div className="flex justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveStep(BootstrapStep.Account)}
                >
                  <ChevronLeft />
                  이전
                </Button>
                <Button type="submit" variant="project" isPending={isPending}>
                  조직 만들기
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </AuthPagePanel>
    </OnboardingPageLayout>
  );
};
