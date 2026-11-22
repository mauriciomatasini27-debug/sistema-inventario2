#!/usr/bin/env node
// AUD-VTA-05 T06: `npm run conciliar:stock` imprime JSON con Stock / Lotes /
// Historial por comercio y SKU. Sale 0 sin desvío, 1 con desvío, 2 si no
// pudo leer. No escribe: ver conciliar-stock-lib.mjs (transacciones READ ONLY).
import { conciliarTargets, descubrirTenants, targetsDesdeEnv } from "./conciliar-stock-lib.mjs";

async function main() {
  const modo = process.env.TENANT_MODE ?? "single";
  const base = targetsDesdeEnv(process.env);
  const targets =
    modo === "shared"
      ? (await descubrirTenants(base[0].url)).map((id) => ({ tenantId: id, etiqueta: id, url: base[0].url }))
      : base;
  const reporte = await conciliarTargets(targets);
  process.stdout.write(`${JSON.stringify(reporte, null, 2)}\n`);
  process.exitCode = reporte.desvio ? 1 : 0;
}

main().catch((e) => {
  process.stderr.write(`${JSON.stringify({ error: e instanceof Error ? e.message : String(e) })}\n`);
  process.exitCode = 2;
});
