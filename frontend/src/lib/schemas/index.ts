import { z } from "zod";

export * from "./slugSchema";

export const GenericResourceNameSchema = z
  .string()
  .trim()
  .min(1, { message: "이름은 1자 이상 입력하세요." })
  .max(64, { message: "이름은 64자 이내로 입력하세요." })
  .regex(
    /^[\p{L}\p{N}\-_\s]+$/u,
    "이름에는 한글을 포함한 문자, 숫자, 하이픈(-), 밑줄(_), 공백을 사용할 수 있습니다."
  );

export const BaseSecretNameSchema = z.string().trim().min(1);

export const SecretNameSchema = BaseSecretNameSchema.refine(
  (el) => !el.includes(" "),
  "Secret name cannot contain spaces."
).refine((el) => !el.includes(":"), "Secret name cannot contain colon.");

export const safeJWTSchema = z
  .string()
  .trim()
  .min(1, { message: "Token is required" })
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Token contains invalid characters. Only letters, numbers, dots, hyphens, and underscores are allowed."
  );
