#!/usr/bin/env node
// NAV-S5 (PRD-NAV-03, ADR-0132): mide INP/CLS y costo de pintado por pantalla.
// No modifica el repo. Requiere la app levantada con control-app (CONTROL_APP_DEV=1).
//
// Uso:
//   node scripts/control-app/control-app.mjs levantar --puerto 4321
//   node scripts/control-app/control-app.mjs seed
//   node scripts/medir-pintado.mjs --corridas 3
//   node scripts/medir-pintado.mjs --json > .pstack-tmp/pintado-antes.json
//
// Comparar "antes" y "después" con la misma app sembrada, la misma máquina y
// el mismo Chromium. La pantalla se fuerza a tema claro porque es donde el
// blur de las tarjetas está activo.
import { chromium } from "@playwright/test";

const AYUDA = `medir:pintado: INP/CLS y costo de pintado por pantalla (NAV-S5)

Requiere Chromium de Playwright (npx playwright install chromium) y la app
levantada con control-app (CONTROL_APP_DEV=1).

Opciones:
  --base-url <url>   URL de la app (default: CONTROL_APP_BASE_URL o http://localhost:4321)
  --rutas <lista>    rutas separadas por coma
                     (default: /panel/caja,/panel/stock,/panel/precios,/panel/reportes,/panel,/venta)
  --corridas <n>     corridas por ruta (default 3)
  --escala <n>       deviceScaleFactor para amplificar el costo de raster (default 1)
  --cpu <n>          throttling de CPU del CDP, 4 = 4x más lento (default 1)
  --json             imprime el JSON completo en vez de la tabla
  --help             esta ayuda

Mide por ruta: elementos con backdrop-filter, tarjetas con blur, INP aproximado
(max duration de eventos reales tras un clic), CLS, long tasks, p95 de frames
durante scroll y tiempos de layout/recalc del CDP.`;

function parsearArgs(argv) {
  const args = { corridas: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--help") args.help = true;
    else if (a.startsWith("--")) {
      const clave = a.slice(2);
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith("--")) throw new Error(`falta el valor de ${a}`);
      args[clave] = valor;
      i += 1;
    }
  }
  return args;
}

const args = parsearArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${AYUDA}\n`);
  process.exit(0);
}

const BASE = (args["base-url"] || process.env.CONTROL_APP_BASE_URL || "http://localhost:4321").replace(/\/$/, "");
const RUTAS = (args.rutas
  || "/panel/caja,/panel/stock,/panel/precios,/panel/reportes,/panel,/venta").split(",").map((r) => r.trim()).filter(Boolean);
const CORRIDAS = Math.max(1, Number(args.corridas) || 3);
const ESCALA = Math.max(1, Number(args.escala) || 1);
const CPU = Math.max(1, Number(args.cpu) || 1);

const mediana = (xs) => {
  const validos = xs.filter((x) => typeof x === "number");
  if (validos.length === 0) return null;
  const orden = [...validos].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
};

const redondear = (n) => (n === null ? null : Math.round(n * 100) / 100);

async function medirRuta(browser, ruta) {
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: ESCALA });
  await contexto.addInitScript(() => {
    try {
      localStorage.setItem("tema", "claro");
    } catch {
      // Sin localStorage la medición sigue con el tema del sistema.
    }
    window.__nav5 = { cls: 0, longMs: 0, longMax: 0, eventos: [] };
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) if (!e.hadRecentInput) window.__nav5.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__nav5.longMs += e.duration;
        window.__nav5.longMax = Math.max(window.__nav5.longMax, e.duration);
      }
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        if (e.name === "click" || e.name === "pointerup" || e.name === "pointerdown") {
          window.__nav5.eventos.push({ duration: e.duration, interactionId: e.interactionId ?? 0 });
        }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });

  const page = await contexto.newPage();
  const cdp = await contexto.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  await page.goto(`${BASE}${ruta}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(800);

  const render = await page.evaluate(() => ({
    titulo: document.querySelector("h1")?.textContent?.trim() ?? "",
    cuerpo: document.body.innerText.trim().length,
  }));
  if (!render.titulo || render.cuerpo < 100) {
    throw new Error(
      `${ruta} no renderizó (título="${render.titulo}", texto=${render.cuerpo}). ¿control-app levantado y sembrado?`,
    );
  }

  const eventosTraza = [];
  cdp.on("Tracing.dataCollected", (evento) => eventosTraza.push(...(evento.value ?? [])));
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline,cc,gpu,viz",
    transferMode: "ReportEvents",
  });

  const frames = await page.evaluate(async () => {
    const deltas = [];
    let ultimo = performance.now();
    for (let i = 0; i < 40; i += 1) {
      await new Promise(requestAnimationFrame);
      const ahora = performance.now();
      deltas.push(ahora - ultimo);
      ultimo = ahora;
      window.scrollBy(0, 180);
    }
    window.scrollTo(0, 0);
    return deltas;
  });

  const finTraza = cdp.send("Tracing.end");
  await new Promise((resolve) => {
    cdp.once("Tracing.tracingComplete", resolve);
    finTraza.catch(() => resolve());
  });
  const nombresPintado = new Set(["Paint", "RasterTask", "CompositeLayers", "UpdateLayer", "Layerize"]);
  const pintado = eventosTraza.filter((e) => e.ph === "X" && nombresPintado.has(e.name));
  const paintMs = pintado.reduce((acc, e) => acc + (e.dur ?? 0), 0) / 1000;
  const rasterMs = pintado.filter((e) => e.name === "RasterTask").reduce((acc, e) => acc + (e.dur ?? 0), 0) / 1000;

  const objetivos = ["h1", ".sub", ".panel-shell .card h2"];
  for (const selector of objetivos) {
    const objetivo = page.locator(selector).first();
    if ((await objetivo.count()) === 0) continue;
    // Best-effort: si el elemento no es clickeable, la corrida sigue con las otras interacciones.
    await objetivo.click({ position: { x: 4, y: 4 }, timeout: 3000 }).catch(() => undefined);
  }
  await page.waitForTimeout(400);

  const capturas = [];
  for (let i = 0; i < 3; i += 1) {
    const inicio = performance.now();
    await page.screenshot({ animations: "disabled" });
    capturas.push(performance.now() - inicio);
  }

  const datos = await page.evaluate(() => {
    const conBlur = [...document.querySelectorAll("*")].filter((el) => {
      const estilo = getComputedStyle(el);
      const webkit = estilo.webkitBackdropFilter;
      return (estilo.backdropFilter && estilo.backdropFilter !== "none")
        || (webkit && webkit !== "none");
    });
    const tarjetas = [...document.querySelectorAll(".card")].filter((el) => getComputedStyle(el).backdropFilter !== "none");
    const porInteraccion = new Map();
    for (const evento of window.__nav5.eventos) {
      porInteraccion.set(evento.interactionId, Math.max(porInteraccion.get(evento.interactionId) ?? 0, evento.duration));
    }
    const interacciones = [...porInteraccion.values()].sort((a, b) => a - b);
    const indiceP98 = Math.floor((interacciones.length - 1) * 0.98);
    return {
      blurTotal: conBlur.length,
      blurMuestra: conBlur.slice(0, 5).map((el) => el.className || el.tagName),
      cardBlur: tarjetas.length,
      cls: window.__nav5.cls,
      longMs: window.__nav5.longMs,
      longMax: window.__nav5.longMax,
      inp: interacciones.length > 0 ? interacciones[indiceP98] : null,
      inpMax: interacciones.length > 0 ? interacciones[interacciones.length - 1] : null,
      interacciones: interacciones.length,
      eventos: window.__nav5.eventos.length,
      desborde: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  const { metrics } = await cdp.send("Performance.getMetrics");
  const metrica = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  const ordenados = [...frames].sort((a, b) => a - b);
  const p95 = ordenados[Math.floor((ordenados.length - 1) * 0.95)] ?? 0;

  await contexto.close();
  return {
    ...datos,
    frameP95: p95,
    shotMs: mediana(capturas),
    paintMs,
    rasterMs,
    framesLentos: frames.filter((d) => d > 33).length,
    layoutMs: (metrica.LayoutDuration ?? 0) * 1000,
    recalcMs: (metrica.RecalcStyleDuration ?? 0) * 1000,
    tareaMs: (metrica.TaskDuration ?? 0) * 1000,
  };
}

const browser = await chromium.launch();
const resultados = [];

for (const ruta of RUTAS) {
  const corridas = [];
  for (let i = 0; i < CORRIDAS; i += 1) corridas.push(await medirRuta(browser, ruta));
  const campos = ["blurTotal", "cardBlur", "inp", "inpMax", "interacciones", "cls", "longMs", "longMax", "frameP95", "shotMs", "paintMs", "rasterMs", "framesLentos", "layoutMs", "recalcMs", "tareaMs", "desborde"];
  const resumen = { ruta, corridas: corridas.length };
  for (const campo of campos) resumen[campo] = redondear(mediana(corridas.map((c) => c[campo])));
  resumen.muestraBlur = corridas[0]?.blurMuestra ?? [];
  resultados.push(resumen);
}

await browser.close();

if (args.json) {
  process.stdout.write(`${JSON.stringify({ fecha: new Date().toISOString(), base: BASE, corridas: CORRIDAS, escala: ESCALA, cpu: CPU, resultados }, null, 2)}\n`);
} else {
  const filas = resultados.map((r) => ({
    ruta: r.ruta,
    blur: r.blurTotal,
    cards: r.cardBlur,
    "INP ms": r.inp === null ? "sin eventos >=16" : r.inp,
    CLS: r.cls,
    "long ms": r.longMs,
    "frame p95": r.frameP95,
    "shot ms": r.shotMs,
    "paint suma ms": r.paintMs,
    "raster suma ms": r.rasterMs,
    "layout ms": r.layoutMs,
    "recalc ms": r.recalcMs,
    desborde: r.desborde,
  }));
  console.table(filas);
  const total = resultados.reduce(
    (acc, r) => ({
      blur: acc.blur + r.blurTotal,
      cards: acc.cards + r.cardBlur,
      long: acc.long + r.longMs,
      layout: acc.layout + r.layoutMs,
    }),
    { blur: 0, cards: 0, long: 0, layout: 0 },
  );
  process.stdout.write(
    `\nTotales por corrida (mediana de ${CORRIDAS}, escala ${ESCALA}, cpu ${CPU}x): blur=${total.blur} cards=${total.cards} long=${redondear(total.long)}ms layout=${redondear(total.layout)}ms\n`,
  );
}
