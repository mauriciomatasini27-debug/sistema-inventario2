// Ningún test hereda una URL de base del shell (p.ej. la de Supabase prod):
// sin esto, un repo con write-through escribe en la base real. Los tests con
// Postgres usan PG_TEST_URL_A/B y setean TENANT_DATABASE_URL a mano.
for (const clave of Object.keys(process.env)) {
  if (clave.includes("DATABASE_URL")) delete process.env[clave];
}

// #295: clave fake de test para el outbox. Producción falla cerrado si falta
// EMAIL_OUTBOX_CIPHER_KEY_B64; los tests no dependen de un secreto real.
process.env.EMAIL_OUTBOX_CIPHER_KEY_B64 ??= Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64");
