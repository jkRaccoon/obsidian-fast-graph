import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: ["main.js", "tests/**", "*.config.mjs", "*.config.ts", "vitest.setup.ts", ".yarn/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // 소스의 no-unsafe-* 억제 주석은 의존성을 설치하지 않는 외부 lint 도구를 위한 것이라,
    // 타입이 해석되는 로컬에서는 "unused directive"가 된다 — 이를 경고로 띄우지 않는다.
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // "Fast 3D Graph"는 고유한 브랜드명이므로 sentence-case 강제를 끈다.
      "obsidianmd/ui/sentence-case": "off",
    },
  },
);
