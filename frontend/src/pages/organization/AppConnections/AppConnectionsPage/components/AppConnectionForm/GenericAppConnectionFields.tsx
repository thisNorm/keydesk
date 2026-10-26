import { useFormContext, useWatch } from "react-hook-form";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { slugSchema } from "@app/lib/schemas";

export const rotationSchema = z.object({
  rotationInterval: z
    .number()
    .min(1)
    .max(365 * 2.5),
  rotateAtUtc: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59)
  })
});

export const genericAppConnectionFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "연결 식별자" }),
  description: z.string().trim().max(256, "설명은 256자를 초과할 수 없습니다").nullish(),
  gatewayId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  gatewayPoolId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  isAutoRotationEnabled: z.boolean().optional(),
  rotation: rotationSchema.optional()
});

const getSuggestedConnectionName = (app?: AppConnection, method?: TAppConnection["method"]) => {
  if (!app || !method || !APP_CONNECTION_MAP[app]) return "";

  const providerSlug = slugify(APP_CONNECTION_MAP[app].name, {
    lowercase: true,
    decamelize: false
  });
  const providerWords = providerSlug.split("-");
  const methodWords = slugify(method, { lowercase: true }).split("-");
  while (methodWords.length > 1 && providerWords.includes(methodWords[0])) methodWords.shift();

  return [providerSlug, ...methodWords].join("-").slice(0, 64).replace(/-+$/, "");
};

export const GenericAppConnectionsFields = () => {
  const {
    register,
    control,
    formState: { errors }
  } = useFormContext<{
    name: string;
    description?: string | null;
    app?: AppConnection;
    method?: TAppConnection["method"];
  }>();
  const [app, method] = useWatch({ control, name: ["app", "method"] });
  const suggestedName = getSuggestedConnectionName(app, method);

  return (
    <>
      <Field className="mb-4">
        <FieldLabel htmlFor="app-connection-name">연결 식별자</FieldLabel>
        <Input
          id="app-connection-name"
          autoFocus
          placeholder="my-app-connection"
          suggestedValue={suggestedName}
          isError={Boolean(errors.name?.message)}
          {...register("name")}
          autoComplete="off"
        />
        {!errors.name?.message && (
          <FieldDescription>
            연결을 참조하는 식별자입니다. 영문 소문자, 숫자, 하이픈(-)을 1~64자로 입력하세요.
          </FieldDescription>
        )}
        <FieldError errors={[errors.name]} />
      </Field>
      <Field className="mb-4">
        <FieldLabel htmlFor="app-connection-description">
          설명 <span className="text-muted">(선택 사항)</span>
        </FieldLabel>
        <TextArea
          id="app-connection-description"
          className="resize-none"
          rows={2}
          placeholder="연결 설명을 입력하세요..."
          isError={Boolean(errors.description?.message)}
          {...register("description")}
        />
        <FieldError errors={[errors.description]} />
      </Field>
    </>
  );
};
