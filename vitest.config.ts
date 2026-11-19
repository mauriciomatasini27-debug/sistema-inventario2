import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/arch/**", "tests/pers2-arch.test.ts", "tests/e2e/**"],
    environment: "node",
    // P10-20: bajo la suite completa los tests PG compiten por las mismas
    // bases y un caso puede esperar más de los 5s default; 15s evita falsos
    // rojos por espera sin ocultar cuelgues reales.
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ["./tests/setup-pg-tenant.ts"],
  },
});
