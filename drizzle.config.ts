import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.TENANT_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/tenant_demo",
  },
});
