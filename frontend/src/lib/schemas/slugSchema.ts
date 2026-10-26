import slugify from "@sindresorhus/slugify";
import { z } from "zod";

interface SlugSchemaInputs {
  min?: number;
  max?: number;
  field?: string;
}

export const normalizeSlugInput = (value: string) => value.toLowerCase().replace(/\s+/g, "-");

export const slugSchema = ({ min = 1, max = 64, field = "주소 식별자" }: SlugSchemaInputs = {}) => {
  return z
    .string()
    .trim()
    .min(min, {
      message: `${field}는 ${min}자 이상 입력하세요.`
    })
    .max(max, {
      message: `${field}는 ${max}자 이내로 입력하세요.`
    })
    .refine((v) => slugify(v, { lowercase: true }) === v, {
      message: `${field}에는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.`
    });
};
