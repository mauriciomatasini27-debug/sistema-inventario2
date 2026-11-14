import { PG_TENANT_FIXTURE } from "./helpers/pg-tenant-fixture.js";

/** Vitest: PG con single necesita DEFAULT_TENANT_ID uuid para filaConTenant en tests. */
if (process.env.PG_TEST_URL_A && !process.env.DEFAULT_TENANT_ID) {
  process.env.DEFAULT_TENANT_ID = PG_TENANT_FIXTURE;
}