import { z } from "zod";

export const BaseSqlUsernameAndPasswordConnectionSchema = z.object({
  host: z.string().trim().min(1, "호스트를 입력하세요"),
  port: z.coerce.number().default(5432),
  database: z.string().trim().min(1, "데이터베이스를 입력하세요").default("default"),
  username: z.string().trim().min(1, "사용자 이름을 입력하세요"),
  password: z.string().trim().min(1, "비밀번호를 입력하세요"),
  sslEnabled: z.boolean().default(true),
  sslRejectUnauthorized: z.boolean().default(true),
  sslCertificate: z
    .string()
    .trim()
    .transform((value) => value || undefined)
    .optional()
});
