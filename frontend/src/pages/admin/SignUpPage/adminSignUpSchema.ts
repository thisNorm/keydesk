import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";

export const createAdminSignUpSchema = (passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      firstName: z.string().trim().min(1, "이름을 입력하세요."),
      lastName: z.string().trim().optional(),
      email: z
        .string()
        .trim()
        .min(1, "이메일을 입력하세요.")
        .email("올바른 이메일 주소를 입력하세요."),
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "비밀번호를 다시 입력하세요.")
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "비밀번호가 일치하지 않습니다.",
      path: ["confirmPassword"]
    });

export type AdminSignUpFormData = z.infer<ReturnType<typeof createAdminSignUpSchema>>;
