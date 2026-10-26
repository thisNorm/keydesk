import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  VerificationCodeForm
} from "@app/components/v3";
import { useUser } from "@app/context";
import {
  useRequestEmailChangeOTP,
  useUpdateUserEmail,
  useVerifyCurrentEmailOTP
} from "@app/hooks/api/users";
import { clearSession } from "@app/hooks/api/users/queries";
import { AuthMethod } from "@app/hooks/api/users/types";

const emailSchema = z
  .object({
    newEmail: z.string().email("올바른 이메일 주소를 입력하세요.")
  })
  .required();

export type EmailFormData = z.infer<typeof emailSchema>;

type OtpStep = "currentEmail" | "newEmail";

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const hasEmailAuth = user?.authMethods?.includes(AuthMethod.EMAIL) ?? false;
  const [otpStep, setOtpStep] = useState<OtpStep | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [typedOTP, setTypedOTP] = useState("");
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  const emailForm = useForm<EmailFormData>({
    defaultValues: { newEmail: "" },
    resolver: zodResolver(emailSchema)
  });

  const { mutateAsync: requestEmailChangeOTP, isPending: isRequestingOTP } =
    useRequestEmailChangeOTP();
  const { mutateAsync: verifyCurrentEmailOTP, isPending: isVerifyingCurrent } =
    useVerifyCurrentEmailOTP();
  const { mutateAsync: updateUserEmail, isPending: isUpdatingEmail } = useUpdateUserEmail();

  const watchedEmail = useWatch({
    control: emailForm.control,
    name: "newEmail",
    defaultValue: ""
  });

  const isEmailValid = (email: string): boolean => {
    try {
      emailSchema.parse({ newEmail: email });
      return true;
    } catch {
      return false;
    }
  };

  const closeOtpModal = () => {
    setOtpStep(null);
    setTypedOTP("");
  };

  const resetFlow = () => {
    closeOtpModal();
    setPendingEmail("");
    emailForm.reset();
  };

  const handleEmailSubmit = async ({ newEmail }: EmailFormData) => {
    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      createNotification({
        text: "현재 이메일과 다른 주소를 입력하세요.",
        type: "error"
      });
      return;
    }

    await requestEmailChangeOTP({ newEmail });

    setPendingEmail(newEmail);
    setTypedOTP("");
    setOtpStep("currentEmail");

    createNotification({
      text: "현재 이메일 주소로 인증 코드를 보냈습니다.",
      type: "success"
    });
  };

  const handleCurrentOtpSubmit = async () => {
    if (typedOTP.length !== 6) {
      createNotification({
        text: "6자리 인증 코드를 모두 입력하세요.",
        type: "error"
      });
      return;
    }

    try {
      await verifyCurrentEmailOTP({ otpCode: typedOTP });
    } catch {
      // The OTP token is single-use (triesLeft = 1) — any failure consumes it server-side,
      // so the user must restart the flow to request a fresh code.
      resetFlow();
      return;
    }

    setTypedOTP("");
    setOtpStep("newEmail");

    createNotification({
      text: "확인했습니다. 새 이메일의 받은 편지함에서 계속 진행하세요.",
      type: "success"
    });
  };

  const handleNewOtpSubmit = async () => {
    if (typedOTP.length !== 6) {
      createNotification({
        text: "6자리 인증 코드를 모두 입력하세요.",
        type: "error"
      });
      return;
    }

    try {
      await updateUserEmail({ newEmail: pendingEmail, otpCode: typedOTP });
    } catch {
      resetFlow();
      return;
    }

    createNotification({
      text: "이메일을 변경했습니다. 로그인 화면으로 이동합니다.",
      type: "success"
    });

    resetFlow();
    clearSession();

    redirectTimer.current = setTimeout(() => {
      navigate({ to: "/login" });
    }, 2000);
  };

  const isOtpModalOpen = otpStep !== null;
  const otpRecipient = otpStep === "currentEmail" ? (user?.email ?? "") : pendingEmail;
  const otpDescription =
    otpStep === "currentEmail"
      ? "현재 이메일로 보낸 6자리 코드를 입력하세요."
      : "새 이메일로 보낸 6자리 코드를 입력하세요.";
  const otpTitle = otpStep === "currentEmail" ? "현재 이메일로 확인" : "새 이메일로 확인";
  const isOtpSubmitLoading = otpStep === "currentEmail" ? isVerifyingCurrent : isUpdatingEmail;
  const onOtpSubmit = otpStep === "currentEmail" ? handleCurrentOtpSubmit : handleNewOtpSubmit;

  return (
    <>
      <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
        <Card className="gap-0 overflow-hidden p-0">
          <CardHeader className="p-6">
            <CardTitle className="font-alliance">이메일 변경</CardTitle>
            <CardDescription>
              현재 이메일과 새 이메일을 모두 인증하세요. 변경하면 로그아웃됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-md px-6 pb-6">
            <Controller
              control={emailForm.control}
              name="newEmail"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="new-email-address">새 이메일 주소</FieldLabel>
                  <Input
                    id="new-email-address"
                    {...field}
                    placeholder="새 이메일 주소 입력"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                  />
                  <FieldDescription>
                    {hasEmailAuth
                      ? "변경 후에도 이메일 로그인을 사용할 수 있습니다."
                      : "이메일 로그인이 자동으로 활성화됩니다. 새 이메일로 로그인한 후 변경할 수 있습니다."}
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
            <Button
              type="submit"
              variant="neutral"
              size="sm"
              isPending={isRequestingOTP}
              isDisabled={!isEmailValid(watchedEmail) || isOtpModalOpen}
            >
              인증 코드 보내기
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog
        open={isOtpModalOpen}
        onOpenChange={(open) => {
          if (!open && !isOtpSubmitLoading) closeOtpModal();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => isOtpSubmitLoading && event.preventDefault()}
          onInteractOutside={(event) => isOtpSubmitLoading && event.preventDefault()}
          showCloseButton={!isOtpSubmitLoading}
        >
          <DialogHeader>
            <DialogTitle>{otpTitle}</DialogTitle>
            <DialogDescription>
              {otpDescription} <span className="font-medium text-foreground">{otpRecipient}</span>
            </DialogDescription>
          </DialogHeader>
          <VerificationCodeForm
            key={otpStep ?? "closed"}
            name="email-change-verification-code"
            value={typedOTP}
            onChange={setTypedOTP}
            onSubmit={onOtpSubmit}
            submitVariant="neutral"
            isPending={isOtpSubmitLoading}
          >
            {otpStep === "newEmail" && (
              <p className="text-center text-xs text-muted">
                코드를 받지 못했나요? 새 주소가 이미 다른 Keydesk 계정에 사용 중이면 해당 주소로
                변경할 수 없는 이유를 안내했습니다.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeOtpModal}
                isDisabled={isOtpSubmitLoading}
              >
                취소
              </Button>
            </DialogFooter>
          </VerificationCodeForm>
        </DialogContent>
      </Dialog>
    </>
  );
};
