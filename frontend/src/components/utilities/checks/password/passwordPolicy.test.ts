import { describe, expect, test } from "vitest";

import { TPasswordPolicy } from "@app/hooks/api/admin/types";

import { createPasswordSchema, getPasswordRequirements } from "./passwordPolicy";

const policy: TPasswordPolicy = {
  requirements: [
    {
      code: "minimumLength",
      patterns: [String.raw`^[\s\S]{10,}$`],
      flags: "u",
      shouldMatch: true,
      message: "10자 이상",
      validationMessage: "비밀번호는 10자 이상이어야 합니다",
      isPrimary: true
    }
  ]
};

describe("createPasswordSchema", () => {
  test.each(["Abcdefgh7!", "가나다라마바사아7!"])(
    "accepts ten characters using the server policy: %s",
    (password) => {
      expect(createPasswordSchema(policy).safeParse(password).success).toBe(true);
    }
  );

  test.each(["Abcdefg7!", "😀😃😄😁😆😅1a"])(
    "rejects fewer than ten Unicode characters: %s",
    (password) => {
      const result = createPasswordSchema(policy).safeParse(password);

      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected password validation to fail");
      expect(result.error.issues[0]?.message).toBe("비밀번호는 10자 이상이어야 합니다");
    }
  );

  test("returns a Korean required-field message", () => {
    const result = createPasswordSchema(policy).safeParse("");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected password validation to fail");
    expect(result.error.issues[0]?.message).toBe("비밀번호를 입력하세요");
  });
});

describe("getPasswordRequirements", () => {
  test("updates the displayed requirement at the ten-character boundary", () => {
    expect(getPasswordRequirements("Abcdefg7!", policy)[0]?.isMet).toBe(false);
    expect(getPasswordRequirements("Abcdefgh7!", policy)[0]?.isMet).toBe(true);
  });
});
