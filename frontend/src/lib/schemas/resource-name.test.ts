import { describe, expect, test } from "vitest";

import { GenericResourceNameSchema } from ".";

describe("Korean resource names", () => {
  test.each(["내 API 보관함", "개인프로젝트_2026-개발", "한글 조직", "가나다".normalize("NFD")])(
    "accepts Korean display names: %s",
    (name) => {
      expect(GenericResourceNameSchema.parse(name)).toBe(name);
    }
  );

  test("preserves existing ASCII names and trims outer spaces", () => {
    expect(GenericResourceNameSchema.parse("  Keydesk_2026-home  ")).toBe("Keydesk_2026-home");
  });

  test("retains the 64-character name boundary for Korean text", () => {
    expect(GenericResourceNameSchema.safeParse("한".repeat(64)).success).toBe(true);
    expect(GenericResourceNameSchema.safeParse("한".repeat(65)).success).toBe(false);
  });

  test.each(["", "   ", "보관함/개발", "조직<script>", "우리 조직😀", "관리자@example.com"])(
    "rejects empty names and unsupported punctuation: %s",
    (name) => {
      const result = GenericResourceNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/[가-힣]/);
    }
  );
});
