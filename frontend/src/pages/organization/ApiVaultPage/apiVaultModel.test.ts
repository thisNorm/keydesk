import { describe, expect, test } from "vitest";

import {
  createEmptyApiVaultDraft,
  isSafeApiVaultUrl,
  parseApiCredentials,
  parseApiVaultEntry,
  serializeApiVaultDraft,
  validateApiVaultDraft
} from "./apiVaultModel";
import { ApiVaultDraft } from "./apiVaultTypes";

const draft = (): ApiVaultDraft => ({
  name: "번역 API",
  provider: "서비스 제공자",
  description: "문서 번역",
  websiteUrl: "https://example.com",
  consoleUrl: "",
  docsUrl: "https://example.com/docs",
  endpointUrl: "https://api.example.com/v1",
  projects: "개인 프로젝트",
  owner: "나",
  tags: ["개인", "번역"],
  issuedAt: "2024-02-29",
  expiresAt: "2026-12-31",
  plan: "무료",
  quota: "월 100회",
  status: "active",
  notes: "개인 PC에서 사용",
  credentials: [{ label: "API Key", value: "  비밀 키\n원문  " }]
});

const secret = (secretComment?: string) => ({
  id: "secret-id",
  secretKey: "API_VAULT_record",
  secretComment,
  createdAt: "2026-10-24T00:00:00.000Z",
  updatedAt: "2026-10-24T01:00:00.000Z"
});

describe("API inventory storage", () => {
  test("round-trips metadata and credentials through separate storage fields", () => {
    const serialized = serializeApiVaultDraft(draft());
    const entry = parseApiVaultEntry(secret(serialized.secretComment));

    expect(entry).toMatchObject({
      id: "API_VAULT_record",
      secretId: "secret-id",
      name: "번역 API",
      credentialLabels: ["API Key"],
      createdAt: "2026-10-24T00:00:00.000Z"
    });
    expect(parseApiCredentials(serialized.secretValue)).toEqual(draft().credentials);
    expect(serialized.secretComment).not.toContain("비밀 키");
    expect(entry).not.toHaveProperty("credentials");
    expect(entry).not.toHaveProperty("value");
    expect(JSON.parse(serialized.secretValue)).toEqual({
      format: "personal-api-vault/v1",
      credentials: draft().credentials
    });
  });

  test.each([undefined, "", "ordinary comment", "null", "[]", "{}", '{"format":"v2"}'])(
    "ignores unrelated or malformed comments: %s",
    (comment) => {
      expect(parseApiVaultEntry(secret(comment))).toBeNull();
    }
  );

  test("ignores malformed metadata instead of showing a broken record", () => {
    const comment = JSON.stringify({
      format: "personal-api-vault/v1",
      metadata: { ...draft(), name: null },
      credentialLabels: ["API Key"]
    });
    expect(parseApiVaultEntry(secret(comment))).toBeNull();
  });

  test("rejects an unknown format even when the remaining bundle is valid", () => {
    const fields = serializeApiVaultDraft(draft());
    const comment = JSON.parse(fields.secretComment);
    const credentials = JSON.parse(fields.secretValue);
    comment.format = "personal-api-vault/v2";
    credentials.format = "personal-api-vault/v2";

    expect(parseApiVaultEntry(secret(JSON.stringify(comment)))).toBeNull();
    expect(() => parseApiCredentials(JSON.stringify(credentials))).toThrow(/자격 증명/);
  });

  test.each([undefined, null, {}, { secretComment: "null" }])(
    "ignores malformed secret records safely",
    (input) => {
      expect(parseApiVaultEntry(input as unknown as ReturnType<typeof secret>)).toBeNull();
    }
  );

  test("drops unrecognized metadata properties so credential values cannot enter the list", () => {
    const serialized = serializeApiVaultDraft(draft());
    const comment = JSON.parse(serialized.secretComment);
    comment.metadata.credentials = [{ label: "secret", value: "do-not-list" }];
    comment.metadata.value = "do-not-list";

    expect(JSON.stringify(parseApiVaultEntry(secret(JSON.stringify(comment))))).not.toContain(
      "do-not-list"
    );
  });

  test.each([undefined, "", "null", "[]", "{}", '{"format":"v2","credentials":[]}'])(
    "throws a Korean error for a corrupt credential bundle: %s",
    (value) => {
      expect(() => parseApiCredentials(value as string)).toThrow(/자격 증명/);
    }
  );

  test("rejects malformed credentials in an otherwise recognized bundle", () => {
    const bundle = JSON.stringify({
      format: "personal-api-vault/v1",
      credentials: [{ label: "key", value: null }]
    });
    expect(() => parseApiCredentials(bundle)).toThrow(/자격 증명/);
  });

  test("caps serialized secret bundles by UTF-8 bytes", () => {
    const input = draft();
    input.credentials = Array.from({ length: 10 }, (_, index) => ({
      label: `key ${index}`,
      value: "가".repeat(3000)
    }));
    expect(() => serializeApiVaultDraft(input)).toThrow(/크기/);
  });
});

describe("API inventory draft validation", () => {
  test("creates independent empty drafts with one credential input", () => {
    const first = createEmptyApiVaultDraft();
    first.credentials[0].value = "changed";
    first.tags.push("changed");

    expect(createEmptyApiVaultDraft()).toMatchObject({
      name: "",
      provider: "",
      websiteUrl: "",
      issuedAt: "",
      expiresAt: "",
      status: "active",
      tags: [],
      credentials: [{ label: "API Key", value: "" }]
    });
  });

  test("trims metadata and labels while preserving credential values exactly", () => {
    const input = draft();
    input.name = "  번역 API  ";
    input.websiteUrl = " https://example.com ";
    input.credentials[0].label = " API Key ";
    input.tags = [" 개인 ", "개인", "번역"];
    const result = validateApiVaultDraft(input);

    expect(result.name).toBe("번역 API");
    expect(result.websiteUrl).toBe("https://example.com");
    expect(result.tags).toEqual(["개인", "번역"]);
    expect(result.credentials).toEqual(draft().credentials);
    expect(input.name).toBe("  번역 API  ");
  });

  test("accepts blank optional URLs and dates", () => {
    const input = draft();
    input.websiteUrl = "";
    input.docsUrl = "";
    input.endpointUrl = "";
    input.issuedAt = "";
    input.expiresAt = "";
    expect(validateApiVaultDraft(input)).toMatchObject({ issuedAt: "", expiresAt: "" });
  });

  test.each(["name", "provider"] as const)("requires %s", (field) => {
    expect(() => validateApiVaultDraft({ ...draft(), [field]: "  " })).toThrow(/입력/);
  });

  test.each(["2025-02-29", "2026-02-30", "2026-13-01", "2026-1-01", "invalid"])(
    "rejects an impossible or malformed calendar date: %s",
    (issuedAt) => {
      expect(() => validateApiVaultDraft({ ...draft(), issuedAt })).toThrow(/날짜/);
    }
  );

  test("rejects expiry before issue date but accepts the same day", () => {
    expect(() =>
      validateApiVaultDraft({ ...draft(), issuedAt: "2026-10-24", expiresAt: "2026-10-23" })
    ).toThrow(/만료일/);
    expect(
      validateApiVaultDraft({ ...draft(), issuedAt: "2026-10-24", expiresAt: "2026-10-24" })
        .expiresAt
    ).toBe("2026-10-24");
  });

  test("requires one to ten unique labeled credentials", () => {
    expect(() => validateApiVaultDraft({ ...draft(), credentials: [] })).toThrow(/자격 증명/);
    expect(() =>
      validateApiVaultDraft({ ...draft(), credentials: [{ label: " ", value: "secret" }] })
    ).toThrow(/이름/);
    expect(() =>
      validateApiVaultDraft({ ...draft(), credentials: [{ label: "key", value: "" }] })
    ).toThrow(/값/);
    expect(() =>
      validateApiVaultDraft({
        ...draft(),
        credentials: [
          { label: "key", value: "a" },
          { label: " key ", value: "b" }
        ]
      })
    ).toThrow(/중복/);
    expect(() =>
      validateApiVaultDraft({
        ...draft(),
        credentials: Array.from({ length: 11 }, (_, index) => ({ label: `${index}`, value: "a" }))
      })
    ).toThrow(/10/);
  });

  test("accepts all ten credential slots without trimming their raw values", () => {
    const input = draft();
    input.credentials = Array.from({ length: 10 }, (_, index) => ({
      label: `key ${index}`,
      value: "  "
    }));
    expect(parseApiCredentials(serializeApiVaultDraft(input).secretValue)).toEqual(
      input.credentials
    );
  });

  test.each([undefined, null, [], { name: 42 }])("rejects malformed draft input", (input) => {
    expect(() => validateApiVaultDraft(input as unknown as ApiVaultDraft)).toThrow(/입력/);
  });
});

describe("API inventory links", () => {
  test.each(["", "https://example.com/docs", "http://localhost:8080/api"])(
    "accepts an optional blank or absolute HTTP URL: %s",
    (url) => expect(isSafeApiVaultUrl(url)).toBe(true)
  );

  test.each([
    // eslint-disable-next-line no-script-url -- Deliberately unsafe URL fixture.
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///secret",
    "//example.com",
    "/relative",
    "https://user:pass@example.com",
    "https://user@example.com",
    "https://example.com/\npath"
  ])("rejects unsafe or nonabsolute URLs: %s", (url) => {
    expect(isSafeApiVaultUrl(url)).toBe(false);
    expect(() => validateApiVaultDraft({ ...draft(), consoleUrl: url })).toThrow(/URL/);
  });
});
