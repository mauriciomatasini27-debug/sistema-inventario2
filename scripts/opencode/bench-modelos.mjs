import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buscarBin } from "../../.opencode/modelos.mjs";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// P10-21: la misma resolución que modelos.mjs y pstack-run.sh (OPENCODE_BIN, PATH,
// ~/.opencode/bin, ~/.local/bin). El default fijo a ~/.local/bin rompía en WSL,
// donde el binario vive en el PATH.
const BIN = buscarBin();
const SALIDA = path.join(DIR, ".pstack-tmp/bench-modelos/resultados.jsonl");

const args = process.argv.slice(2);
let url = "http://127.0.0.1:4096";
const modelos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url") {
    url = args[++i];
    continue;
  }
  if (args[i].startsWith("--url=")) {
    url = args[i].slice("--url=".length);
    continue;
  }
  modelos.push(args[i]);
}
if (!modelos.length) {
  console.error("uso: node scripts/opencode/bench-modelos.mjs [--url <url>] <modelo> [...]");
  process.exit(2);
}
if (!BIN) {
  console.error(
    "bench-modelos: no encontré el binario de opencode (miré OPENCODE_BIN, PATH, ~/.opencode/bin y ~/.local/bin)",
  );
  process.exit(2);
}

const pre = "No uses herramientas ni leas archivos. Respondé directamente en texto.\n\n";
const tareas = {
  bug: `${pre}¿Qué bug tiene este TypeScript? Respondé en una línea.\n\nfunction sumaStock(items: {cant:number}[]) {\n  let t = 0;\n  for (let i = 0; i <= items.length; i++) t += items[i].cant;\n  return t;\n}`,
  bug2: `${pre}Este código TypeScript corre en un servidor en UTC y debe devolver la fecha del día en Argentina (UTC-3) como "YYYY-MM-DD". ¿Qué bug tiene? Una línea.\n\nexport function hoyAR(): string {\n  const d = new Date();\n  d.setHours(d.getHours() - 3);\n  return d.toISOString().slice(0, 10);\n}\nexport function esHoy(fecha: string) { return fecha === new Date().toISOString().slice(0,10); }`,
  codigo: `${pre}Escribí SOLO una función JavaScript (sin TypeScript, sin explicación, en un bloque \`\`\`js) llamada parsePrecioAR que convierta strings de precio argentinos a número: "1.234,56" -> 1234.56, "$ 12.000" -> 12000, "0,5" -> 0.5, "-3,10" -> -3.1. Si no es válido devuelve null ("abc" -> null, "" -> null).`,
  prosa: `${pre}Escribí un párrafo de 60-90 palabras en español rioplatense (voseo) para un dueño de kiosco explicando qué pasa si vende un producto sin stock cargado en el sistema: se da de alta provisorio y después completa el precio de costo. Sin títulos ni listas.`,
  razon: `${pre}Tres jobs A, B, C. A dura 3 min, B 2 min, C 4 min. C depende de A. B depende de A. Hay 2 workers en paralelo. ¿Tiempo mínimo total en minutos? Respondé "RESPUESTA: <n>" y una línea de por qué.`,
  razon2: `${pre}Un kiosco vende offline en 2 cajas. Cada venta guarda stock_local -= cant y al reconectar envía "set stock = stock_local". Producto X: stock servidor 10. Caja 1 vende 3 offline, caja 2 vende 4 offline, reconectan en ese orden. ¿Stock final en el servidor y cuál debería ser? Respondé "FINAL: <n> CORRECTO: <m>" y en una línea la corrección de diseño.`,
  juez: `${pre}Sos revisor. ¿Aprobás este diff? Respondé "VEREDICTO: APROBAR" o "VEREDICTO: RECHAZAR" y el motivo en una línea.\n\n- const total = items.reduce((a, i) => a + i.precio * i.cant, 0);\n+ const total = items.reduce((a, i) => a + i.precio * i.cant);\n  // items puede venir vacío cuando el carrito se limpia`,
  juez2: `${pre}Sos revisor. ¿Aprobás este diff de un endpoint multi-tenant? Respondé "VEREDICTO: APROBAR" o "VEREDICTO: RECHAZAR" y el motivo en una línea.\n\n  export async function borrarProducto(req, db) {\n-   await db.delete(productos).where(and(eq(productos.id, req.params.id), eq(productos.tenantId, req.tenant.id)));\n+   await db.delete(productos).where(eq(productos.id, req.params.id));\n    return { ok: true };\n  }`,
};

function correr(m, p) {
  const t0 = Date.now();
  const slug = m.startsWith("opencode/") ? m : "opencode/" + m;
  const r = spawnSync("timeout", ["150", BIN, "run", "--attach", url, "--dir", DIR, "-m", slug, p], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  return { s: (Date.now() - t0) / 1000, rc: r.status, out };
}

function puntaje(t, out) {
  if (t === "bug") return /<=|length\s*-?\s*1|fuera de rango|out of bounds|undefined|índice/i.test(out) ? 1 : 0;
  if (t === "bug2") return /toISOString|UTC|esHoy|zona|timezone|setHours.*local|getHours/i.test(out) && /esHoy|toISOString/.test(out) ? 1 : 0.5;
  if (t === "razon") return /RESPUESTA:\s*7\b/.test(out) ? 1 : 0;
  if (t === "razon2") return (/FINAL:\s*6\b/.test(out) ? 0.5 : 0) + (/CORRECTO:\s*3\b/.test(out) ? 0.5 : 0);
  if (t === "juez") return /RECHAZAR/.test(out) && /vac[ií]o|inicial|0\b|TypeError/i.test(out) ? 1 : 0;
  if (t === "juez2") return /RECHAZAR/.test(out) && /tenant/i.test(out) ? 1 : 0;
  if (t === "codigo") {
    const m = out.match(/```(?:js|javascript)?\n([\s\S]*?)```/);
    if (!m) return 0;
    try {
      const f = new Function(m[1] + "\n;return parsePrecioAR;")();
      const c = [["1.234,56", 1234.56], ["$ 12.000", 12000], ["0,5", 0.5], ["-3,10", -3.1], ["abc", null], ["", null]];
      return c.filter(([i, o]) => {
        try {
          return f(i) === o;
        } catch {
          return false;
        }
      }).length / c.length;
    } catch {
      return 0;
    }
  }
  if (t === "prosa") {
    const body = out.split("\n").filter((l) => l.trim() && !/^>|^\$|build|^@/.test(l)).join(" ");
    const voseo = /\b(vendés|tenés|podés|cargás|completás|vos|hacés|querés|vas a)\b/i.test(body) ? 0.5 : 0;
    const w = body.split(/\s+/).length;
    const largo = w >= 45 && w <= 120 ? 0.5 : 0;
    return voseo + largo;
  }
  return 0;
}

mkdirSync(path.dirname(SALIDA), { recursive: true });
for (const m of modelos) {
  for (const [t, p] of Object.entries(tareas)) {
    const r = correr(m, p);
    const sc = puntaje(t, r.out);
    appendFileSync(SALIDA, JSON.stringify({ m, t, s: r.s, rc: r.rc, sc, out: r.out.slice(-1500) }) + "\n");
    console.log(m, t, r.s, r.rc, sc);
  }
}
