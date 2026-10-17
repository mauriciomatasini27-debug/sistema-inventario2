import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/arch/**", "tests/pers2-arch.test.ts", "tests/e2e/**"],
    environment: "node",
  },
});
