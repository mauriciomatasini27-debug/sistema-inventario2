// RETRO-AUD-01: los issues del tracker local pueden quedar `ready-for-agent`
// después de que el avance diga `estado: hecho`. Chequea los dos sentidos:
// un avance hecho exige el issue cerrado, y un issue cerrado exige avance
// hecho y todas sus casillas tachadas. No toca nada: solo reporta.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = join(RAIZ, ".scratch");

function archivosMd(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entrada of readdirSync(dir).sort()) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) out.push(...archivosMd(ruta));
    else if (entrada.endsWith(".md")) out.push(ruta);
  }
  return out;
}

export function chequearIssues(dirScratch = SCRATCH, raiz = RAIZ) {
  const problemas = [];
  for (const archivo of archivosMd(dirScratch)) {
    const rel = relative(raiz, archivo).replace(/\\/g, "/");
    if (!rel.includes("/issues/")) continue;
    const texto = readFileSync(archivo, "utf8");
    const estado = texto.match(/^\*\*Status:\*\*\s*(\S+)/m)?.[1] ?? "sin status";
    const avance = texto.match(/^\*\*Avance:\*\*\s*(\S+)/m)?.[1] ?? "";
    const sinTachar = (texto.match(/^- \[ \]/gm) ?? []).length;
    const cerrado = estado === "cerrado";

    if (cerrado && sinTachar > 0) {
      problemas.push(`${rel}: dice cerrado pero quedan ${sinTachar} criterios sin tachar`);
    }
    if (cerrado && !avance) {
      problemas.push(`${rel}: dice cerrado pero no declara **Avance:**`);
    }
    if (avance) {
      const rutaAvance = resolve(raiz, avance);
      const hecho =
        existsSync(rutaAvance) && /^estado:\s*hecho\s*$/m.test(readFileSync(rutaAvance, "utf8"));
      if (hecho && !cerrado) {
        problemas.push(`${rel}: el avance ${avance} dice hecho pero el issue sigue '${estado}'`);
      }
      if (cerrado && !hecho) {
        problemas.push(`${rel}: cerrado pero ${avance} no existe o no dice estado: hecho`);
      }
    }
  }
  return problemas;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problemas = chequearIssues();
  if (problemas.length > 0) {
    console.error("issues locales desactualizados:");
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("issues locales: estado coherente con los avances");
}
