import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });
const state = join(raiz, ".pstack-tmp/control-app/sesion-duenio.json");
const base = process.env.CONTROL_APP_URL ?? "http://127.0.0.1:4321";
const rutas = [
  { path: "/panel/stock", nombre: "stock" },
  { path: "/panel/fiado", nombre: "fiado" },
  { path: "/panel/caja", nombre: "caja" },
];

const browser = await chromium.launch();
for (const viewport of [
  { tag: "390", width: 390, height: 844 },
  { tag: "escritorio", width: 1280, height: 900 },
]) {
  const context = await browser.newContext({
  ...(viewport.tag === "390" ? devices["Pixel 5"] : { viewport: { width: viewport.width, height: viewport.height } }),
    storageState: state,
  });
  const page = await context.newPage();
  for (const r of rutas) {
    await page.goto(base + r.path, { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(out, `tb163-${r.nombre}-${viewport.tag}.png`),
      fullPage: true,
    });
  }
  await context.close();
}
await browser.close();
console.log("capturas en", out);
