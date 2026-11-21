// Ningún test hereda una URL de base del shell (p.ej. la de Supabase prod):
// sin esto, un repo con write-through escribe en la base real. Los tests con
// Postgres usan PG_TEST_URL_A/B y setean TENANT_DATABASE_URL a mano.
for (const clave of Object.keys(process.env)) {
  if (clave.includes("DATABASE_URL")) delete process.env[clave];
}
