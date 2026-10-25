import { z } from "zod";

import { ApiCredential, ApiVaultDraft, ApiVaultEntry } from "./apiVaultTypes";

const FORMAT = "personal-api-vault/v1";
const MAX_SERIALIZED_BYTES = 64 * 1024;

const text = (label: string, max: number) =>
  z
    .string({
      required_error: `${label} 입력값을 확인하세요`,
      invalid_type_error: `${label} 입력값을 확인하세요`
    })
    .trim()
    .max(max, `${label}은(는) ${max}자 이하여야 합니다`);

export const isSafeApiVaultUrl = (value: string): boolean => {
  if (typeof value !== "string") return false;
  if (!value.trim()) return true;
  if (
    value.includes("\\") ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  ) {
    return false;
  }
  if (!/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

const urlField = (label: string) =>
  text(label, 2048).refine(
    isSafeApiVaultUrl,
    `${label} URL은 로그인 정보가 없는 HTTP 또는 HTTPS 주소여야 합니다`
  );

const dateField = text("날짜", 10).refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "날짜는 실제로 존재하는 YYYY-MM-DD 형식이어야 합니다");

const metadataSchema = z
  .object({
    name: text("API 이름", 160).min(1, "API 이름을 입력하세요"),
    provider: text("제공자", 160).min(1, "제공자를 입력하세요"),
    description: text("용도", 2000),
    websiteUrl: urlField("제공자 웹사이트"),
    consoleUrl: urlField("관리 콘솔"),
    docsUrl: urlField("문서"),
    endpointUrl: urlField("API 엔드포인트"),
    projects: text("사용 프로젝트", 1000),
    owner: text("관리 담당자", 160),
    tags: z
      .array(text("태그", 64).min(1, "태그를 입력하세요"))
      .max(20, "태그는 20개까지 등록할 수 있습니다")
      .transform((tags) => [...new Set(tags)]),
    issuedAt: dateField,
    expiresAt: dateField,
    plan: text("요금제", 160),
    quota: text("사용 한도", 500),
    status: z.enum(["active", "paused", "revoked"], {
      errorMap: () => ({ message: "상태 입력값을 확인하세요" })
    }),
    notes: text("메모", 8000)
  })
  .superRefine((metadata, context) => {
    if (metadata.issuedAt && metadata.expiresAt && metadata.expiresAt < metadata.issuedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "만료일은 발급일보다 빠를 수 없습니다"
      });
    }
  });

const credentialLabelSchema = text("자격 증명 이름", 80).min(1, "자격 증명 이름을 입력하세요");

const credentialsSchema = z
  .array(
    z.object({
      label: credentialLabelSchema,
      value: z
        .string({
          invalid_type_error: "자격 증명 값을 확인하세요",
          required_error: "자격 증명 값을 입력하세요"
        })
        .min(1, "자격 증명 값을 입력하세요")
        .max(16384, "자격 증명 값은 16384자 이하여야 합니다")
    })
  )
  .min(1, "자격 증명을 1개 이상 등록하세요")
  .max(10, "자격 증명은 10개까지 등록할 수 있습니다")
  .refine(
    (credentials) =>
      new Set(credentials.map(({ label }) => label.toLowerCase())).size === credentials.length,
    "자격 증명 이름은 중복될 수 없습니다"
  );

const isWithinSizeLimit = (value: string) =>
  new TextEncoder().encode(value).byteLength <= MAX_SERIALIZED_BYTES;

const storageFields = (input: ApiVaultDraft) => {
  const { credentials, ...metadata } = input;
  return {
    secretValue: JSON.stringify({ format: FORMAT, credentials }),
    secretComment: JSON.stringify({
      format: FORMAT,
      metadata,
      credentialLabels: credentials.map(({ label }) => label)
    })
  };
};

export const createEmptyApiVaultDraft = (): ApiVaultDraft => ({
  name: "",
  provider: "",
  description: "",
  websiteUrl: "",
  consoleUrl: "",
  docsUrl: "",
  endpointUrl: "",
  projects: "",
  owner: "",
  tags: [],
  issuedAt: "",
  expiresAt: "",
  plan: "",
  quota: "",
  status: "active",
  notes: "",
  credentials: [{ label: "API Key", value: "" }]
});

export const validateApiVaultDraft = (input: ApiVaultDraft): ApiVaultDraft => {
  const metadata = metadataSchema.safeParse(input);
  if (!metadata.success) {
    const issue = metadata.error.issues[0];
    throw new Error(
      issue?.code === "invalid_type"
        ? "API 입력값을 확인하세요"
        : issue?.message || "API 입력값을 확인하세요"
    );
  }
  const credentials = credentialsSchema.safeParse(input.credentials);
  if (!credentials.success) {
    const issue = credentials.error.issues[0];
    throw new Error(
      issue?.code === "invalid_type"
        ? "자격 증명 입력값을 확인하세요"
        : issue?.message || "자격 증명 입력값을 확인하세요"
    );
  }
  const result = { ...metadata.data, credentials: credentials.data };
  const fields = storageFields(result);
  if (!isWithinSizeLimit(fields.secretValue) || !isWithinSizeLimit(fields.secretComment)) {
    throw new Error("저장할 API 정보 또는 자격 증명의 크기는 각각 64KiB 이하여야 합니다");
  }
  return result;
};

export const serializeApiVaultDraft = (
  input: ApiVaultDraft
): { secretValue: string; secretComment: string } => storageFields(validateApiVaultDraft(input));

export const parseApiVaultEntry = (secret: {
  id: string;
  secretKey: string;
  secretComment?: string;
  createdAt: string;
  updatedAt: string;
}): ApiVaultEntry | null => {
  if (
    !secret ||
    typeof secret.secretComment !== "string" ||
    !isWithinSizeLimit(secret.secretComment) ||
    typeof secret.id !== "string" ||
    typeof secret.secretKey !== "string" ||
    !secret.id ||
    !secret.secretKey ||
    typeof secret.createdAt !== "string" ||
    typeof secret.updatedAt !== "string"
  ) {
    return null;
  }
  try {
    const bundle: unknown = JSON.parse(secret.secretComment);
    const result = z
      .object({
        format: z.literal(FORMAT),
        metadata: metadataSchema,
        credentialLabels: z.array(credentialLabelSchema).min(1).max(10)
      })
      .safeParse(bundle);
    if (!result.success) return null;
    return {
      ...result.data.metadata,
      id: secret.secretKey,
      secretId: secret.id,
      credentialLabels: result.data.credentialLabels,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt
    };
  } catch {
    return null;
  }
};

export const parseApiCredentials = (secretValue: string): ApiCredential[] => {
  const errorMessage = "저장된 API 자격 증명을 읽을 수 없습니다. 자격 증명 데이터를 확인하세요";
  if (typeof secretValue !== "string" || !isWithinSizeLimit(secretValue)) {
    throw new Error(errorMessage);
  }
  try {
    const bundle: unknown = JSON.parse(secretValue);
    const result = z
      .object({ format: z.literal(FORMAT), credentials: credentialsSchema })
      .safeParse(bundle);
    if (!result.success) throw new Error(errorMessage);
    return result.data.credentials;
  } catch {
    throw new Error(errorMessage);
  }
};
