import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ESTADO_SKIP = new Set(["skipped", "pending", "todo"]);

export function analizarReporte(json) {
  const j = json ?? {};
  const pendientes = Number(j.numPendingTests ?? 0) + Number(j.numTodoTests ?? 0);
  const saltados = [];
  const suites = Array.isArray(j.testResults) ? j.testResults : [];
  for (const suite of suites) {
    const asserts = Array.isArray(suite?.assertionResults) ? suite.assertionResults : [];
    for (const a of asserts) {
      if (ESTADO_SKIP.has(String(a?.status ?? ""))) {
        saltados.push(`${suite?.name ?? "?"} | ${a?.fullName ?? a?.title ?? "?"}`);
      }
    }
    if (ESTADO_SKIP.has(String(suite?.status ?? "")) && asserts.length === 0) {
      saltados.push(`${suite?.name ?? "?"}`);
    }
  }
  return { pendientes, saltados, ok: pendientes === 0 && saltados.length === 0 };
}

function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("uso: node scripts/check-skips.mjs <vitest-report.json>");
    process.exit(2);
  }
  let json;
  try {
    json = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (e) {
    console.error(`check-skips: no se pudo leer ${ruta}: ${e.message}`);
    process.exit(2);
  }
  const { pendientes, saltados, ok } = analizarReporte(json);
  if (!ok) {
    for (const s of saltados) console.log(`skipped: ${s}`);
    console.log(`check-skips: ${saltados.length} saltados, pendientes+todo=${pendientes}`);
    process.exit(1);
  }
  console.log("check-skips: sin skips");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
