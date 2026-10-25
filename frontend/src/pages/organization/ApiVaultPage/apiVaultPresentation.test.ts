import { describe, expect, it } from "vitest";

import {
  emptyApiDraft,
  expiryDays,
  expiryLabel,
  filterApiEntries,
  isCalendarDate,
  safeApiUrl
} from "./apiVaultPresentation";
import type { ApiVaultEntry } from "./apiVaultTypes";

const entry: ApiVaultEntry = {
  ...emptyApiDraft(),
  id: "1",
  secretId: "secret-1",
  name: "Maps API",
  provider: "Example",
  projects: "지도 앱",
  tags: ["위치"],
  owner: "나",
  credentialLabels: ["ACCESS_TOKEN"],
  createdAt: "",
  updatedAt: "",
  expiresAt: "2026-10-25"
};
const today = new Date(2026, 9, 24, 23, 59);

describe("API inventory presentation", () => {
  it("only creates HTTP(S) links without embedded credentials or control characters", () => {
    expect(safeApiUrl("https://example.com/docs?q=api")).toBe("https://example.com/docs?q=api");
    expect(safeApiUrl("http://localhost:8080/api")).toBe("http://localhost:8080/api");
    [
      // eslint-disable-next-line no-script-url -- Executable schemes must fail URL validation.
      "javascript:alert(1)",
      "data:text/html,test",
      "//example.com",
      "https://user:password@example.com",
      "https://example.com\n",
      "https://example.com\\path",
      "https://",
      "example.com"
    ].forEach((url) => expect(safeApiUrl(url)).toBeUndefined());
  });
  it("preserves calendar dates and treats today as due, not already expired", () => {
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(expiryDays("2026-10-24", today)).toBe(0);
    expect(expiryDays("2026-10-25", today)).toBe(1);
    expect(expiryLabel("2026-10-23", today)).toBe("만료됨");
    expect(expiryLabel("", today)).toBe("만료일 미등록");
  });
  it("combines metadata search with status and expiration filters", () => {
    expect(filterApiEntries([entry], "example 지도 위치", "active", "expiring", today)).toEqual([
      entry
    ]);
    expect(filterApiEntries([entry], "access_token", "all", "all", today)).toEqual([entry]);
    expect(filterApiEntries([entry], "", "paused", "all", today)).toEqual([]);
    expect(filterApiEntries([entry], "", "all", "expired", today)).toEqual([]);
    expect(filterApiEntries([{ ...entry, expiresAt: "" }], "", "all", "unset", today)).toHaveLength(
      1
    );
    expect(
      filterApiEntries([{ ...entry, expiresAt: "2026-11-24" }], "", "all", "expiring", today)
    ).toEqual([]);
  });
});
