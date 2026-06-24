import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: ["main.js", "tests/**", "*.config.mjs", "*.config.ts", "vitest.setup.ts", ".yarn/**"],
  },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // "Fast 3D Graph"는 고유한 브랜드명이므로 sentence-case 강제를 끈다.
      "obsidianmd/ui/sentence-case": "off",
    },
  },
  {
    files: ["src/physics/physics.worker.ts"],
    rules: {
      "no-console": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
);
