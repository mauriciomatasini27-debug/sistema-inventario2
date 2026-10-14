// Seco por defecto: con base cuenta nulas e imprime sentencias sin escribir.
// Solo ejecuta con --apply en base de un comercio. Nunca imprime el entorno.
import { planBackfill, aplicarBackfill, contarNulos } from "./backfill-tenant-id-lib.mjs";

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
const resumen = `comercios_en_base=${comerciosEnBase} apply=${apply ? "si" : "no"}`;
const baseUrl = process.env.TENANT_DATABASE_URL ?? "";
const { default: postgres } = baseUrl ? await import("postgres") : { default: null };

if (!apply) {
  if (!baseUrl || !postgres) {
    console.log(resumen);
    console.log(plan.sql);
    console.log("seco: sin escritura (usa --apply para ejecutar)");
    process.exit(0);
  }
  const sql = postgres(baseUrl);
  try {
    const nulos = await contarNulos(sql);
    console.log(resumen);
    for (const s of plan.sentencias) console.log(`nulas ${s.tabla}=${nulos[s.tabla]}`);
    console.log(plan.sql);
    console.log("seco: sin escritura (usa --apply para ejecutar)");
  } finally {
    await sql.end();
  }
  process.exit(0);
}

if (!baseUrl || !postgres) {
  console.error("FAIL falta base del comercio para --apply");
  process.exit(1);
}
const sql = postgres(baseUrl);
try {
  const cambios = await aplicarBackfill(sql, plan);
  const resto = await sql.unsafe("SELECT COUNT(*)::int AS n FROM fiscal_settings WHERE tenant_id IS NULL");
  console.log(resumen);
  for (const s of plan.sentencias) console.log(`cambiadas ${s.tabla}=${cambios[s.tabla]}`);
  console.log(`nulas_restantes fiscal_settings=${resto[0].n}`);
  console.log("ok: backfill aplicado");
} finally {
  await sql.end();
}
