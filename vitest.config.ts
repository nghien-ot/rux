import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", ".qa/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["tests/**/*.test.ts", ".qa/**/*.test.ts"],
      tsconfig: "tsconfig.json",
    },
  },
});
