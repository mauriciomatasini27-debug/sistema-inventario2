// Sin DEFAULT_TENANT_ID global: slice0/single en memoria no debe heredar el fixture PG.
// Los describes con DB usan filaPg() o activarTenantPgEnSingle() en beforeEach.