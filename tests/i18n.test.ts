import { describe, expect, it } from "vitest";

import { getStrings, localeFromLanguage, STRINGS } from "../src/i18n";

describe("i18n", () => {
  it("uses Korean for Korean locales", () => {
    expect(localeFromLanguage("ko")).toBe("ko");
    expect(localeFromLanguage("ko-KR")).toBe("ko");
    expect(localeFromLanguage("ko_KR")).toBe("ko");
  });

  it("uses English for non-Korean or missing locales", () => {
    expect(localeFromLanguage("en")).toBe("en");
    expect(localeFromLanguage("en-US")).toBe("en");
    expect(localeFromLanguage("fr")).toBe("en");
    expect(localeFromLanguage(null)).toBe("en");
  });

  it("keeps Korean strings while adding English settings strings", () => {
    expect(STRINGS.ko.settings.groupByName).toBe("색상 그룹 기준");
    expect(STRINGS.en.settings.groupByName).toBe("Color grouping");
    expect(STRINGS.en.settings.groupByOptions.folder).toBe("Folder");
  });

  it("reads the current Obsidian locale through moment", () => {
    expect(getStrings().commandOpenGraph).toBe("Open 3D graph");
  });
});
