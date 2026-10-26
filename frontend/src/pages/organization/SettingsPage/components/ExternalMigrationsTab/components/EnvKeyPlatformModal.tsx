import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Field, FieldContent, FieldError, FieldLabel, Input } from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { useImportEnvKey } from "@app/hooks/api/migration/mutations";

import { GenericDropzone } from "./GenericDropzone";

type Props = {
  id?: string;
  onClose: () => void;
};

export const EnvKeyPlatformModal = ({ onClose }: Props) => {
  const scopeVariant = useScopeVariant();
  const formSchema = z.object({
    encryptionKey: z.string().min(1),
    file: z.instanceof(File)
  });
  type TFormData = z.infer<typeof formSchema>;

  const fileUploadRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: importEnvKey } = useImportEnvKey();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { isLoading, isDirty, isSubmitting, isValid }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async (data: TFormData) => {
    if (!data.file) {
      setError("file", {
        type: "required",
        message: "파일을 선택하세요"
      });
      return;
    }

    await importEnvKey({
      file: data.file,
      decryptionKey: data.encryptionKey
    });
    createNotification({
      title: "가져오기 시작",
      text: "데이터를 가져오는 중입니다. 완료되거나 실패하면 이메일로 알려드립니다. 최대 10분이 걸릴 수 있습니다.",
      type: "info"
    });

    onClose();
    reset();

    if (fileUploadRef.current) {
      fileUploadRef.current.value = "";
    }
  };

  const onImportFileDrop = (file?: File) => {
    if (!file) {
      createNotification({
        text: "선택한 파일이 없습니다.",
        type: "error"
      });
      return;
    }

    setValue("file", file, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      <Controller
        control={control}
        name="encryptionKey"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>암호화 키</FieldLabel>
            <FieldContent>
              <Input type="password" placeholder="" {...field} isError={Boolean(error)} />
            </FieldContent>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <GenericDropzone
        ref={fileUploadRef}
        text="EnvKey 내보내기 파일 선택"
        onData={onImportFileDrop}
        isSmaller
      />
      <div className="flex items-center gap-2 pt-2">
        <Button
          type="submit"
          variant={scopeVariant}
          isPending={isLoading || isSubmitting}
          isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
        >
          데이터 가져오기
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
      </div>
    </form>
  );
};
