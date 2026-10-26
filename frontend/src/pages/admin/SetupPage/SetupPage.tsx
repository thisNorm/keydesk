import { Helmet } from "react-helmet";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { Check, ChevronLeft, ChevronRight, type LucideIcon, Mail } from "lucide-react";
import { z } from "zod";

import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { OnboardingPageLayout } from "@app/components/auth/OnboardingPageLayout";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Separator
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useOrganization, useServerConfig, useUser } from "@app/context";
import { allowedEmailDomainsSchema, normalizeAllowedEmailDomains } from "@app/helpers/email";
import { useOnboarding } from "@app/hooks";
import { useRenameUser, useUpdateOrg, useUpdateServerConfig } from "@app/hooks/api";
import { LoginMethod, SuperAdminErrorCode } from "@app/hooks/api/admin/types";
import { GenericResourceNameSchema, normalizeSlugInput, slugSchema } from "@app/lib/schemas";

enum SetupStep {
  Account = "account",
  Organization = "organization",
  Access = "access",
  Review = "review"
}

enum SignUpMode {
  Disabled = "disabled",
  Anyone = "anyone"
}

const steps = [
  SetupStep.Account,
  SetupStep.Organization,
  SetupStep.Access,
  SetupStep.Review
] as const;
const setupFormId = "self-hosted-server-setup-form";

const formSchema = z.object({
  firstName: z.string().trim().min(1, "이름을 입력하세요."),
  lastName: z.string().trim().optional(),
  organizationName: GenericResourceNameSchema,
  organizationSlug: slugSchema({ field: "조직 URL 식별자" }),
  signUpMode: z.nativeEnum(SignUpMode),
  allowedSignUpDomain: allowedEmailDomainsSchema,
  enabledLoginMethods: z
    .nativeEnum(LoginMethod)
    .array()
    .min(1, "로그인 방식을 하나 이상 선택하세요.")
});

type TSetupForm = z.infer<typeof formSchema>;

const stepSchemas = {
  [SetupStep.Account]: formSchema.pick({ firstName: true, lastName: true }).passthrough(),
  [SetupStep.Organization]: formSchema
    .pick({ organizationName: true, organizationSlug: true })
    .passthrough(),
  [SetupStep.Access]: formSchema
    .pick({ signUpMode: true, allowedSignUpDomain: true, enabledLoginMethods: true })
    .passthrough(),
  [SetupStep.Review]: formSchema
};

const loginMethods: Array<{
  value: LoginMethod;
  label: string;
  icon?: LucideIcon;
  imageSrc?: string;
}> = [
  {
    value: LoginMethod.EMAIL,
    label: "이메일",
    icon: Mail
  },
  {
    value: LoginMethod.GOOGLE,
    label: "Google",
    imageSrc: "/images/sso/Google.png"
  },
  {
    value: LoginMethod.GITHUB,
    label: "GitHub",
    imageSrc: "/images/integrations/GitHub.png"
  },
  {
    value: LoginMethod.GITLAB,
    label: "GitLab",
    imageSrc: "/images/integrations/GitLab.png"
  }
];

const formatAllowedDomains = (domains: string) =>
  normalizeAllowedEmailDomains(domains)
    .split(", ")
    .filter(Boolean)
    .map((domain) => `@${domain}`)
    .join(", ");

const stepContent = {
  [SetupStep.Account]: {
    title: "최고 관리자 계정 만들기",
    description: "이 계정은 서버 관리자 권한을 갖습니다."
  },
  [SetupStep.Organization]: {
    title: "첫 조직 설정",
    description: "한 서버에 여러 조직을 만들 수 있습니다. 먼저 사용할 조직을 설정하세요."
  },
  [SetupStep.Access]: {
    title: "가입 권한 설정",
    description: "이 서버에서 새 계정을 만들 수 있는 사용자를 정하세요."
  },
  [SetupStep.Review]: {
    title: "설정 확인",
    description: "초기 접근 권한과 로그인 설정을 확인하세요."
  }
} satisfies Record<SetupStep, { title: string; description: string }>;

export const SetupPage = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const { config } = useServerConfig();
  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const { mutateAsync: renameUser } = useRenameUser();
  const { mutateAsync: updateOrg } = useUpdateOrg();
  const { mutateAsync: updateServerConfig } = useUpdateServerConfig({
    handledErrorCodes: [SuperAdminErrorCode.AuthMethodLockout]
  });

  const { activeStep, activeStepIndex, back, complete, isCompleting, next, setActiveStep } =
    useOnboarding({
      id: "self-hosted-server-setup",
      progressScope: user.id,
      steps,
      initialStep: SetupStep.Access,
      persistLocally: true,
      completionFlag: true,
      onPersistCompletion: async () => {
        await updateServerConfig({ onboardingCompleted: true });
      },
      onComplete: async () => {
        await router.invalidate();
        await navigate({ to: "/admin/welcome" });
      }
    });

  const {
    clearErrors,
    control,
    handleSubmit,
    register,
    setError,
    watch,
    formState: { dirtyFields, errors, isSubmitting }
  } = useForm<TSetupForm>({
    resolver: zodResolver(stepSchemas[activeStep]) as Resolver<TSetupForm>,
    defaultValues: {
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      organizationName: currentOrg.name,
      organizationSlug: currentOrg.slug,
      signUpMode: config.allowSignUp ? SignUpMode.Anyone : SignUpMode.Disabled,
      allowedSignUpDomain: config.allowedSignUpDomain ?? "",
      enabledLoginMethods:
        config.enabledLoginMethods === null
          ? loginMethods.map(({ value }) => value)
          : config.enabledLoginMethods
    }
  });

  const values = watch();
  const onSubmit = handleSubmit(async (formData) => {
    if (activeStep === SetupStep.Account) {
      await renameUser({
        newName: [formData.firstName, formData.lastName].filter(Boolean).join(" ")
      });
      next();
      return;
    }

    if (activeStep === SetupStep.Organization) {
      await updateOrg({
        orgId: currentOrg.id,
        name: formData.organizationName,
        slug: formData.organizationSlug
      });
      next();
      return;
    }

    if (activeStep === SetupStep.Access) {
      try {
        await updateServerConfig({
          allowSignUp: formData.signUpMode === SignUpMode.Anyone,
          allowedSignUpDomain:
            formData.signUpMode === SignUpMode.Anyone
              ? formData.allowedSignUpDomain.trim() || null
              : null,
          ...((config.enabledLoginMethods !== null || dirtyFields.enabledLoginMethods) && {
            enabledLoginMethods: formData.enabledLoginMethods
          })
        });
      } catch (error) {
        if (
          axios.isAxiosError<{ error?: string }>(error) &&
          error.response?.data?.error === SuperAdminErrorCode.AuthMethodLockout
        ) {
          setError("enabledLoginMethods", {
            message: "로그인 방식을 하나 이상 선택하세요."
          });
          return;
        }

        throw error;
      }

      next();
      return;
    }

    await complete();
  });

  const renderStep = () => {
    if (activeStep === SetupStep.Account) {
      return (
        <FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.firstName)}>
              <FieldLabel className="sr-only" htmlFor="setup-first-name">
                이름
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("firstName")}
                id="setup-first-name"
                placeholder="이름"
                autoComplete="given-name"
                autoFocus
                isError={Boolean(errors.firstName)}
              />
              <FieldError>{errors.firstName?.message}</FieldError>
            </Field>
            <Field data-invalid={Boolean(errors.lastName)}>
              <FieldLabel className="sr-only" htmlFor="setup-last-name">
                성
              </FieldLabel>
              <Input
                variant="outlined"
                {...register("lastName")}
                id="setup-last-name"
                placeholder="성"
                autoComplete="family-name"
                isError={Boolean(errors.lastName)}
              />
              <FieldError>{errors.lastName?.message}</FieldError>
            </Field>
          </div>
          <Field>
            <FieldLabel className="sr-only" htmlFor="setup-email">
              이메일
            </FieldLabel>
            <Input
              variant="outlined"
              id="setup-email"
              type="email"
              value={user.email ?? user.username}
              autoComplete="email"
              disabled
            />
            <FieldDescription>
              이메일 변경에는 인증이 필요하며 나중에 개인 설정에서 변경할 수 있습니다.
            </FieldDescription>
          </Field>
        </FieldGroup>
      );
    }

    if (activeStep === SetupStep.Organization) {
      return (
        <FieldGroup>
          <Field data-invalid={Boolean(errors.organizationName)}>
            <FieldLabel className="sr-only" htmlFor="setup-organization-name">
              조직 이름
            </FieldLabel>
            <Input
              variant="outlined"
              {...register("organizationName")}
              id="setup-organization-name"
              aria-label="조직 이름"
              placeholder="조직 이름"
              autoComplete="organization"
              autoFocus
              isError={Boolean(errors.organizationName)}
            />
            <FieldError>{errors.organizationName?.message}</FieldError>
          </Field>
          <Controller
            control={control}
            name="organizationSlug"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="setup-organization-slug">조직 URL 식별자</FieldLabel>
                <Input
                  variant="outlined"
                  {...field}
                  id="setup-organization-slug"
                  aria-describedby="setup-organization-slug-feedback"
                  placeholder="acme"
                  autoComplete="off"
                  isError={Boolean(error)}
                  onChange={(event) => onChange(normalizeSlugInput(event.target.value))}
                />
                <FieldFeedback
                  id="setup-organization-slug-feedback"
                  description="영문 소문자, 숫자, 하이픈만 사용할 수 있습니다. 공백은 하이픈으로 바뀝니다."
                  error={error?.message}
                />
              </Field>
            )}
          />
        </FieldGroup>
      );
    }

    if (activeStep === SetupStep.Access) {
      return (
        <FieldGroup>
          <Controller
            control={control}
            name="signUpMode"
            render={({ field }) => (
              <Field>
                <h3 className="font-alliance text-base font-normal text-foreground">
                  계정을 만들 수 있는 사용자
                </h3>
                <RadioGroup
                  value={field.value}
                  className="grid-cols-2"
                  onValueChange={field.onChange}
                >
                  <FieldLabel htmlFor="signup-disabled">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="font-sans text-base">초대 전용</FieldTitle>
                        <FieldDescription>대부분의 서버에 권장합니다.</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={SignUpMode.Disabled} id="signup-disabled" />
                    </Field>
                  </FieldLabel>
                  <FieldLabel htmlFor="signup-anyone">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="gap-1 font-sans text-base">
                          누구나
                          <span aria-hidden="true" className="font-sans text-xs text-danger">
                            *
                          </span>
                        </FieldTitle>
                        <FieldDescription>
                          필요하면 가입 경로·도메인을 제한할 수 있습니다.
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={SignUpMode.Anyone} id="signup-anyone" />
                    </Field>
                  </FieldLabel>
                </RadioGroup>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="enabledLoginMethods"
            render={({ field }) => (
              <Field>
                <div className="flex items-center gap-3">
                  <h3 className="shrink-0 font-alliance text-base font-normal text-foreground">
                    허용할 로그인 방식
                  </h3>
                  <Separator className="flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {loginMethods.map((method) => {
                    const isChecked = field.value.includes(method.value);
                    const MethodIcon = method.icon;

                    return (
                      <FieldLabel
                        key={method.value}
                        htmlFor={`login-method-${method.value}`}
                        className={cn(
                          "h-full transition-opacity",
                          !isChecked && "border-transparent opacity-60 hover:opacity-80"
                        )}
                      >
                        <Field orientation="horizontal" className="h-full items-center gap-2">
                          <div className="flex size-4 shrink-0 items-center justify-center text-muted">
                            {method.imageSrc ? (
                              <img
                                src={method.imageSrc}
                                alt=""
                                aria-hidden="true"
                                className="size-4 object-contain"
                              />
                            ) : (
                              MethodIcon && <MethodIcon className="size-4" />
                            )}
                          </div>
                          <FieldTitle className="h-4 text-sm leading-none">
                            {method.label}
                          </FieldTitle>
                          <Checkbox
                            id={`login-method-${method.value}`}
                            aria-label={method.label}
                            variant="project"
                            isChecked={isChecked}
                            onCheckedChange={(checked) => {
                              clearErrors("enabledLoginMethods");
                              field.onChange(
                                checked
                                  ? [...field.value, method.value]
                                  : field.value.filter((value) => value !== method.value)
                              );
                            }}
                          />
                        </Field>
                      </FieldLabel>
                    );
                  })}
                </div>
                <FieldDescription>
                  SAML, LDAP, OIDC는 초기 설정 후 서버 관리 화면에서 설정할 수 있습니다.
                </FieldDescription>
                <FieldError>{errors.enabledLoginMethods?.message}</FieldError>
              </Field>
            )}
          />

          <AnimatedCollapse
            isOpen={values.signUpMode === SignUpMode.Anyone}
            contentClassName="-m-2 p-2"
          >
            <Controller
              control={control}
              name="allowedSignUpDomain"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="allowed-signup-domain" className="text-xs">
                    <span>
                      <span aria-hidden="true" className="mr-1 text-danger">
                        *
                      </span>
                      Limit allowed email domains{" "}
                      <span className="opacity-60">(권장, 모든 가입 방식에 적용)</span>
                    </span>
                  </FieldLabel>
                  <Input
                    variant="outlined"
                    {...field}
                    id="allowed-signup-domain"
                    aria-describedby="allowed-signup-domain-feedback"
                    isError={Boolean(error)}
                    placeholder="acme.com, example.com"
                  />
                  <FieldFeedback
                    id="allowed-signup-domain-feedback"
                    description="비워 두면 모든 이메일 도메인을 허용합니다."
                    error={error?.message}
                  />
                </Field>
              )}
            />
          </AnimatedCollapse>
        </FieldGroup>
      );
    }

    const enabledMethodLabels = loginMethods
      .filter(({ value }) => values.enabledLoginMethods.includes(value))
      .map(({ label }) => label)
      .join(", ");
    const allowedDomains = formatAllowedDomains(values.allowedSignUpDomain);
    let signUpSummary = "누구나 가입 가능";
    if (values.signUpMode === SignUpMode.Disabled) {
      signUpSummary = "초대 전용";
    } else if (allowedDomains) {
      signUpSummary = `가입 허용 도메인: ${allowedDomains}`;
    }
    const reviewItems = [
      {
        step: SetupStep.Account,
        title: "최고 관리자 계정",
        description: [
          [values.firstName, values.lastName].filter(Boolean).join(" "),
          user.email ?? user.username
        ]
          .filter(Boolean)
          .join(" · ")
      },
      {
        step: SetupStep.Organization,
        title: "첫 조직",
        description: `${values.organizationName} · ${values.organizationSlug}`
      },
      {
        step: SetupStep.Access,
        title: "사용자 접근 권한",
        description: signUpSummary
      },
      {
        step: SetupStep.Access,
        title: "로그인 방식",
        description: enabledMethodLabels
      }
    ];

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {reviewItems.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={cn(
              "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4 text-left transition-colors hover:bg-container-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              index < reviewItems.length - 1 && "border-b border-border"
            )}
            onClick={() => setActiveStep(item.step)}
          >
            <Check className="mt-0.5 size-4 text-success" />
            <span>
              <span className="block text-sm font-medium text-foreground">{item.title}</span>
              <span className="block text-sm leading-relaxed text-muted">{item.description}</span>
            </span>
            <ChevronRight className="size-4 self-center text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        ))}
      </div>
    );
  };

  return (
    <OnboardingPageLayout
      variant="focused"
      currentStep={activeStepIndex + 1}
      totalSteps={steps.length}
      contentClassName="max-w-xl"
      showFooter={false}
      anchorBottomContent
      bottomContent={
        <div className="mx-auto flex w-full max-w-xl justify-between gap-3">
          {activeStepIndex > 0 && (
            <Button type="button" variant="outline" onClick={back}>
              <ChevronLeft />
              이전
            </Button>
          )}
          <Button
            type="submit"
            form={setupFormId}
            variant="project"
            isPending={isSubmitting || isCompleting}
            className={cn(activeStepIndex === 0 && "ml-auto")}
          >
            {activeStep === SetupStep.Review ? "설정 완료" : "계속"}
          </Button>
        </div>
      }
    >
      <Helmet>
        <title>서버 설정 | Keydesk</title>
        <link rel="icon" href="/keydesk.svg" />
      </Helmet>
      <AuthPagePanel>
        <form id={setupFormId} onSubmit={onSubmit}>
          <CardHeader className="mb-8 gap-2">
            <CardTitle className="font-alliance text-3xl leading-tight font-normal">
              {stepContent[activeStep].title}
            </CardTitle>
            <CardDescription className="font-sans text-base leading-relaxed">
              {stepContent[activeStep].description}
            </CardDescription>
          </CardHeader>

          <CardContent>{renderStep()}</CardContent>
        </form>
      </AuthPagePanel>
    </OnboardingPageLayout>
  );
};
