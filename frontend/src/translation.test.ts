import { describe, expect, it } from "vitest";

import english from "../public/locales/en/translations.json";
import korean from "../public/locales/ko/translations.json";
import i18n from "./translation";

const flatten = (value: Record<string, unknown>, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof entry === "string"
        ? [[path, entry]]
        : Object.entries(flatten(entry as Record<string, unknown>, path));
    })
  );

describe("Korean localization", () => {
  it("loads Korean as the default namespace without fetching catalogs", () => {
    expect(i18n.language).toBe("ko");
    expect(i18n.t("login.login")).toBe("로그인");
    expect(i18n.t("common.head-title", { title: "내 API 보관함" })).toBe(
      "내 API 보관함 | Infisical"
    );
  });

  it("covers English catalog keys and preserves interpolation parameters", () => {
    const source = flatten(english);
    const localized = flatten(korean);
    Object.entries(source).forEach(([key, value]) => {
      expect(key in localized, key).toBe(true);
      expect(localized[key]?.match(/\{\{[^}]+\}\}/g) ?? [], key).toEqual(
        value.match(/\{\{[^}]+\}\}/g) ?? []
      );
    });
  });
});
