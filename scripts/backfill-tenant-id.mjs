// Backfill de fiscal_documents.tenant_id nulo. Seco por defecto: imprime el
// conteo y la sentencia sin conectar. Solo ejecuta con --apply en base de un
// comercio. Nunca imprime valores de entorno.
import { planBackfill } from "./backfill-tenant-id-lib.mjs";

function valorDe(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const apply = process.argv.includes("--apply");
const tenantId = valorDe("--tenant-id") ?? "slice0";
const comerciosEnBase = Number(valorDe("--comercios") ?? "1");

const plan = planBackfill({ apply, tenantId, comerciosEnBase });
if (!plan.ok) {
  console.error(`FAIL ${plan.error}`);
  process.exit(1);
}
console.log(`comercios_en_base=${comerciosEnBase} apply=${apply ? "si" : "no"}`);
console.log(plan.sql);
if (!apply) {
  console.log("seco: sin escritura (usa --apply para ejecutar)");
  process.exit(0);
}

const dbUrl = process.env.TENANT_DATABASE_URL ?? "";
if (!dbUrl) {
  console.error("FAIL falta base del comercio para --apply");
  process.exit(1);
}
const { default: postgres } = await import("postgres");
const sql = postgres(dbUrl);
try {
  await sql.unsafe(plan.sql);
  console.log("ok: backfill aplicado");
} finally {
  await sql.end();
}
