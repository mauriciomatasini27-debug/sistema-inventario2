import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/arch/**/*.test.ts", "tests/pers2-arch.test.ts"],
    environment: "node",
    setupFiles: ["./tests/setup-sin-db-real.ts"],
  },
});
