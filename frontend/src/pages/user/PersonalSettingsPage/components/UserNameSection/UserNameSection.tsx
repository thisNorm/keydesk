import { type JSX, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useUser } from "@app/context";
import { useRenameUser } from "@app/hooks/api/users/queries";

const formSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요.")
});

type FormData = z.infer<typeof formSchema>;

export const UserNameSection = (): JSX.Element => {
  const { user } = useUser();

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty }
  } = useForm<FormData>({ resolver: zodResolver(formSchema) });
  const { mutateAsync, isPending } = useRenameUser();

  useEffect(() => {
    if (user) {
      reset({ name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") });
    }
  }, [user]);

  const onFormSubmit = async ({ name }: FormData) => {
    if (!user?.id) return;
    try {
      await mutateAsync({ newName: name });
      reset({ name });
      createNotification({
        text: "이름을 변경했습니다.",
        type: "success"
      });
    } catch {
      createNotification({
        text: "이름을 변경하지 못했습니다.",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">프로필</CardTitle>
          <CardDescription>Keydesk에 표시되는 이름을 변경하세요.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md px-6 pb-6">
          <Controller
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="personal-settings-name">이름</FieldLabel>
                <Input id="personal-settings-name" aria-invalid={Boolean(error)} {...field} />
                <FieldError errors={[error]} />
              </Field>
            )}
            control={control}
            name="name"
          />
        </CardContent>
        <CardFooter className="min-h-8 justify-end border-t border-neutral/15 bg-neutral/5 p-4">
          <Button
            variant="neutral"
            size="sm"
            type="submit"
            isPending={isPending}
            isDisabled={!isDirty}
          >
            변경 저장
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
