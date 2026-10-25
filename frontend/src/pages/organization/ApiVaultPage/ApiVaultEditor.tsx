import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

import { API_STATUS_LABELS, isCalendarDate, safeApiUrl } from "./apiVaultPresentation";
import type { ApiVaultDraft } from "./apiVaultTypes";

const optionalUrl = z
  .string()
  .max(2048, "주소는 2,048자 이내로 입력하세요.")
  .refine((value) => !value || Boolean(safeApiUrl(value)), {
    message: "로그인 정보가 없는 http:// 또는 https:// 주소를 입력하세요."
  });
const optionalDate = z.string().refine((value) => !value || isCalendarDate(value), {
  message: "올바른 날짜를 입력하세요."
});
const formSchema = z
  .object({
    name: z
      .string()
      .max(160, "API 이름은 160자 이내로 입력하세요.")
      .refine((value) => Boolean(value.trim()), "API 이름을 입력하세요."),
    provider: z
      .string()
      .max(160, "제공사는 160자 이내로 입력하세요.")
      .refine((value) => Boolean(value.trim()), "제공사를 입력하세요."),
    description: z.string().max(2000, "API 용도는 2,000자 이내로 입력하세요."),
    websiteUrl: optionalUrl,
    consoleUrl: optionalUrl,
    docsUrl: optionalUrl,
    endpointUrl: optionalUrl,
    projects: z.string().max(1000, "사용 프로젝트는 1,000자 이내로 입력하세요."),
    owner: z.string().max(160, "관리자·소유자는 160자 이내로 입력하세요."),
    tagsText: z.string().refine((value) => {
      const tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      return tags.length <= 20 && tags.every((tag) => tag.length <= 64);
    }, "태그는 20개까지, 각 64자 이내로 입력하세요."),
    issuedAt: optionalDate,
    expiresAt: optionalDate,
    plan: z.string().max(160, "요금제는 160자 이내로 입력하세요."),
    quota: z.string().max(500, "한도·할당량은 500자 이내로 입력하세요."),
    status: z.enum(["active", "paused", "revoked"]),
    notes: z.string().max(8000, "관리 메모는 8,000자 이내로 입력하세요."),
    credentials: z
      .array(
        z.object({
          label: z
            .string()
            .max(80, "키 이름은 80자 이내로 입력하세요.")
            .refine((value) => Boolean(value.trim()), "키 이름을 입력하세요."),
          value: z
            .string()
            .min(1, "키 값을 입력하세요.")
            .max(16384, "키 값은 16,384자 이내로 입력하세요.")
        })
      )
      .min(1, "키를 하나 이상 등록하세요.")
      .max(10, "인증 키는 API 하나당 10개까지 등록할 수 있습니다.")
  })
  .superRefine((data, context) => {
    if (data.issuedAt && data.expiresAt && data.expiresAt < data.issuedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "만료일은 발급일보다 빠를 수 없습니다."
      });
    }
    const labels = new Set<string>();
    data.credentials.forEach((credential, index) => {
      if (labels.has(credential.label.trim().toLowerCase())) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credentials", index, "label"],
          message: "키 이름이 중복됩니다."
        });
      }
      labels.add(credential.label.trim().toLowerCase());
    });
  });

type FormValues = z.infer<typeof formSchema>;
type TextFieldName = Exclude<keyof FormValues, "credentials" | "status" | "tagsText"> | "tagsText";

export const ApiVaultEditor = ({
  draft,
  entryId,
  saving,
  onClose,
  onSave
}: {
  draft: ApiVaultDraft;
  entryId?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ApiVaultDraft, entryId?: string) => Promise<void>;
}) => {
  const [submitError, setSubmitError] = useState("");
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { ...draft, tagsText: draft.tags.join(", ") }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "credentials" });
  const pending = saving || isSubmitting;
  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: onClose });

  const renderField = (
    name: TextFieldName,
    label: string,
    options?: {
      multiline?: boolean;
      placeholder?: string;
      type?: "date" | "text";
    }
  ) => (
    <Field data-invalid={Boolean(errors[name])} key={name}>
      <FieldLabel size="sm" htmlFor={`api-${name}`}>
        {label}
      </FieldLabel>
      {options?.multiline ? (
        <TextArea
          id={`api-${name}`}
          {...register(name)}
          isError={Boolean(errors[name])}
          placeholder={options.placeholder}
          rows={3}
        />
      ) : (
        <Input
          id={`api-${name}`}
          {...register(name)}
          isError={Boolean(errors[name])}
          type={options?.type ?? "text"}
          placeholder={options?.placeholder}
          autoComplete="off"
        />
      )}
      <FieldError>{errors[name]?.message}</FieldError>
    </Field>
  );

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !pending) requestDiscard();
        }}
      >
        <SheetContent
          size="form"
          isPending={pending}
          lang="ko"
          className="keydesk-sheet sm:max-w-2xl"
        >
          <SheetHeader className="bg-card">
            <span className="font-mono text-[10px] tracking-widest text-muted">
              KEYDESK / {entryId ? "EDIT API" : "NEW API"}
            </span>
            <SheetTitle className="text-xl">{entryId ? "API 정보 수정" : "API 등록"}</SheetTitle>
            <SheetDescription>
              키와 함께 용도, 발급 위치, 사용 프로젝트를 기록하세요.
            </SheetDescription>
          </SheetHeader>
          <form
            className="ph-no-capture flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={handleSubmit(async ({ tagsText, ...values }) => {
              setSubmitError("");
              try {
                await onSave(
                  {
                    ...values,
                    tags: tagsText
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  },
                  entryId
                );
                onClose();
              } catch (error) {
                setSubmitError(
                  error instanceof Error
                    ? error.message
                    : "저장하지 못했습니다. 입력 내용을 유지했습니다. 연결 상태를 확인하고 다시 시도하세요."
                );
              }
            })}
          >
            <fieldset
              disabled={pending}
              className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-5"
            >
              {submitError && (
                <Alert variant="danger">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <section
                className="keydesk-editor-section flex flex-col gap-4"
                aria-labelledby="api-basics-title"
              >
                <h3 id="api-basics-title" className="text-sm">
                  <span className="keydesk-section-index" aria-hidden>
                    01
                  </span>
                  기본 정보
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderField("name", "API 이름 (필수)", { placeholder: "예: 지도 검색 API" })}
                  {renderField("provider", "제공사 (필수)", { placeholder: "예: Google Maps" })}
                </div>
                {renderField("description", "API 용도", {
                  multiline: true,
                  placeholder: "어떤 기능에 사용하는 API인지 기록하세요."
                })}
                <Field>
                  <FieldLabel size="sm" htmlFor="api-status">
                    사용 상태
                  </FieldLabel>
                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                        <SelectTrigger id="api-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(API_STATUS_LABELS).map(([value, label]) => (
                            <SelectItem value={value} key={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </section>
              <section
                className="keydesk-editor-section flex flex-col gap-4"
                aria-labelledby="api-credentials-title"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="api-credentials-title" className="text-sm">
                    <span className="keydesk-section-index" aria-hidden>
                      02
                    </span>
                    인증 키
                  </h3>
                  <Button
                    size="sm"
                    disabled={fields.length >= 10}
                    onClick={() => append({ label: "", value: "" })}
                  >
                    <PlusIcon />키 추가
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  API 키, 토큰, 클라이언트 비밀값을 이름별로 등록하세요. 값은 기본으로 가려집니다.
                </p>
                {fields.map((field, index) => (
                  <div
                    className="flex flex-col gap-3 rounded-md border border-border bg-card p-3"
                    key={field.id}
                  >
                    <div className="flex items-start gap-2">
                      <Field>
                        <FieldLabel size="sm" htmlFor={`credential-label-${field.id}`}>
                          키 이름 {index + 1}
                        </FieldLabel>
                        <Input
                          id={`credential-label-${field.id}`}
                          {...register(`credentials.${index}.label`)}
                          placeholder="예: API_KEY, CLIENT_SECRET"
                          autoComplete="off"
                          isError={Boolean(errors.credentials?.[index]?.label)}
                        />
                        <FieldError>{errors.credentials?.[index]?.label?.message}</FieldError>
                      </Field>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-6"
                        aria-label={`키 ${index + 1} 삭제`}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                    <Field>
                      <FieldLabel size="sm" htmlFor={`credential-value-${field.id}`}>
                        키 값 {index + 1}
                      </FieldLabel>
                      <div className="flex gap-2">
                        <Controller
                          control={control}
                          name={`credentials.${index}.value`}
                          render={({ field: credentialField }) => (
                            <SecretInput
                              {...credentialField}
                              id={`credential-value-${field.id}`}
                              aria-label={`키 값 ${index + 1}`}
                              placeholder="키 값을 입력하세요."
                              containerClassName="ph-no-capture"
                              isVisible={Boolean(visibleFields[field.id])}
                              valueAlwaysHidden
                              maskEachCharacter
                              isMultiline
                              autoComplete="off"
                              isDisabled={pending}
                              isError={Boolean(errors.credentials?.[index]?.value)}
                            />
                          )}
                        />
                        <Button
                          variant="outline"
                          aria-label={
                            visibleFields[field.id]
                              ? `키 ${index + 1} 숨기기`
                              : `키 ${index + 1} 보기`
                          }
                          onClick={() =>
                            setVisibleFields((current) => ({
                              ...current,
                              [field.id]: !current[field.id]
                            }))
                          }
                        >
                          {visibleFields[field.id] ? <EyeOffIcon /> : <EyeIcon />}
                        </Button>
                      </div>
                      <FieldError>{errors.credentials?.[index]?.value?.message}</FieldError>
                    </Field>
                  </div>
                ))}
                <FieldError>{errors.credentials?.root?.message}</FieldError>
              </section>
              <section
                className="keydesk-editor-section flex flex-col gap-4"
                aria-labelledby="api-links-title"
              >
                <h3 id="api-links-title" className="text-sm">
                  <span className="keydesk-section-index" aria-hidden>
                    03
                  </span>
                  제공사와 발급 위치
                </h3>
                <p className="text-xs leading-relaxed text-muted">
                  웹 주소에는 키나 비밀값을 넣지 마세요. http:// 또는 https:// 주소만 사용할 수
                  있습니다.
                </p>
                {renderField("websiteUrl", "제공사 사이트", { placeholder: "https://example.com" })}
                {renderField("consoleUrl", "발급·관리 콘솔", {
                  placeholder: "https://example.com/dashboard/keys"
                })}
                {renderField("docsUrl", "API 문서", { placeholder: "https://example.com/docs" })}
                {renderField("endpointUrl", "API 엔드포인트", {
                  placeholder: "https://api.example.com/v1"
                })}
              </section>
              <section
                className="keydesk-editor-section flex flex-col gap-4"
                aria-labelledby="api-usage-title"
              >
                <h3 id="api-usage-title" className="text-sm">
                  <span className="keydesk-section-index" aria-hidden>
                    04
                  </span>
                  사용처와 관리
                </h3>
                {renderField("projects", "사용 프로젝트", {
                  multiline: true,
                  placeholder: "프로젝트 이름과 사용 기능을 기록하세요."
                })}
                <div className="grid gap-4 sm:grid-cols-2">
                  {renderField("owner", "관리자·소유자")}
                  {renderField("tagsText", "태그", {
                    placeholder: "개인, 개발, 지도 (쉼표로 구분)"
                  })}
                  {renderField("issuedAt", "발급일", { type: "date" })}
                  {renderField("expiresAt", "만료일", { type: "date" })}
                  {renderField("plan", "요금제", { placeholder: "예: 무료, 종량제" })}
                  {renderField("quota", "한도·할당량", { placeholder: "예: 월 10,000회, 일 $5" })}
                </div>
                {renderField("notes", "관리 메모", {
                  multiline: true,
                  placeholder:
                    "갱신 방법, 비용 주의사항, 폐기 예정 등을 기록하세요. 비밀값은 인증 키에 등록하세요."
                })}
              </section>
            </fieldset>
            <SheetFooter className="justify-end border-t bg-card">
              <Button variant="ghost" disabled={pending} onClick={requestDiscard}>
                취소
              </Button>
              <Button type="submit" variant="org" isPending={pending}>
                저장
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입력 내용을 버릴까요?</AlertDialogTitle>
            <AlertDialogDescription>
              저장하지 않은 API 정보와 키 입력 내용이 사라집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 수정</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={confirmDiscard}>
              내용 버리기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
