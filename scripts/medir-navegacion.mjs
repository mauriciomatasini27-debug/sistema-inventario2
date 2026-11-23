#!/usr/bin/env node
// NAV-S1 (PRD-NAV-01, ADR-0130): mide TTFB/LCP de una navegación del panel
// antes/después de habilitar prefetch y View Transitions. No modifica el repo.
//
// Uso:
//   control-app seed                      (o el script lo intenta vía /api/dev)
//   CONTROL_APP_DEV=1 npm run dev
//   node scripts/medir-navegacion.mjs --base-url http://localhost:4321
//   node scripts/medir-navegacion.mjs --base-url http://localhost:4321 --json
//
// Comparar "antes" y "después": corré el script sobre el commit base y sobre la
// rama, con la misma app sembrada y el mismo `--latencia`.
//
// Opciones:
//   --base-url <url>        default CONTROL_APP_BASE_URL o http://localhost:4321
//   --ruta <ruta>           destino caliente (default /panel/stock)
//   --frio <ruta>           destino frío, sin prefetch (default /panel/reportes)
//   --latencia <ms>         latencia de red simulada (default 150, 0 = sin throttle)
//   --corridas <n>          corridas por modo (default 3)
//   --json                  imprime el JSON completo en vez de la tabla
//
// Requiere Chromium de Playwright (`npx playwright install chromium`) y la app
// levantada con CONTROL_APP_DEV=1 para poder sembrar e iniciar sesión.
import { chromium } from "@playwright/test";

const AYUDA = `medir:navegacion — TTFB/LCP de la navegación del panel (NAV-S1)

Opciones:
  --base-url <url>   URL de la app (default: CONTROL_APP_BASE_URL o http://localhost:4321)
  --ruta <ruta>      destino caliente con prefetch (default /panel/stock)
  --frio <ruta>      destino sin hover previo (default /panel/reportes)
  --latencia <ms>    latencia simulada por request (default 150; 0 la desactiva)
  --corridas <n>     corridas por modo (default 3)
  --json             imprime el JSON completo
  --help             esta ayuda

Salida: TTFB y LCP (mediana) de la navegación caliente y fría, si hubo View
Transition cross-document y si el panel navega sin JavaScript.`;

function parsearArgs(argv) {
  const args = { corridas: 3, latencia: 150, ruta: "/panel/stock", frio: "/panel/reportes" };
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

const BASE = String(args["base-url"] ?? process.env.CONTROL_APP_BASE_URL ?? "http://localhost:4321").replace(/\/$/, "");
const LATENCIA = Number.parseInt(String(args.latencia), 10);
const CORRIDAS = Number.parseInt(String(args.corridas), 10);
if (!Number.isFinite(LATENCIA) || LATENCIA < 0) throw new Error("--latencia debe ser un entero >= 0");
if (!Number.isFinite(CORRIDAS) || CORRIDAS < 1) throw new Error("--corridas debe ser un entero >= 1");

async function pedirDev(accion) {
  const r = await fetch(`${BASE}/api/dev/control-app`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(accion),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await r.json().catch(() => null);
  return { ok: r.ok, json };
}

const seed = await pedirDev({ accion: "seed" });
if (!seed.ok) {
  throw new Error(
    `No pude sembrar el tenant (${seed.json?.error ?? "sin detalle"}). Levantá la app con CONTROL_APP_DEV=1.`,
  );
}
const login = await pedirDev({ accion: "login", rol: "duenio" });
if (!login.ok || !login.json?.cookie) {
  throw new Error(`No pude iniciar sesión (${login.json?.error ?? "sin cookie"}).`);
}
const cookieCruda = String(login.json.cookie).split(";")[0];
const [cookieNombre, ...cookieResto] = cookieCruda.split("=");
const cookieValor = cookieResto.join("=");

const mediana = (valores) => {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? Math.round((orden[medio - 1] + orden[medio]) / 2) : orden[medio];
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([
    { name: cookieNombre, value: cookieValor, domain: "localhost", path: "/", secure: true, sameSite: "Lax" },
  ]);
  await ctx.addInitScript(() => {
    window.__nav = { lcp: 0 };
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) window.__nav.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    addEventListener("pagereveal", (event) => {
      const vt = event.viewTransition;
      try {
        sessionStorage.setItem("__vt", vt ? "1" : "0");
      } catch {}
    });
  });
  const page = await ctx.newPage();

  const metricas = () =>
    page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        ttfb: Math.round(nav.responseStart - nav.startTime),
        lcp: Math.round(window.__nav?.lcp ?? 0),
        viewTransition: sessionStorage.getItem("__vt") === "1",
        prefetchLinks: document.querySelectorAll('link[rel="prefetch"]').length,
      };
    });

  // Calentar compilación de las rutas antes de medir.
  for (const ruta of ["/panel", args.ruta, args.frio]) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
  }

  if (LATENCIA > 0) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: LATENCIA,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
  }

  const calientes = [];
  const frios = [];
  for (let i = 0; i < CORRIDAS; i += 1) {
    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    const enlace = page.locator(`a[href="${args.ruta}"]:visible`).first();
    await enlace.hover();
    await page.waitForTimeout(2_500);
    const prefetchLinks = await page.evaluate(
      () => document.querySelectorAll('link[rel="prefetch"]').length,
    );
    await Promise.all([page.waitForURL(`**${args.ruta}`), enlace.click()]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    calientes.push({ ...(await metricas()), prefetchLinks });

    await page.goto(`${BASE}/panel`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL(`**${args.frio}`),
      page.evaluate((ruta) => {
        location.href = ruta;
      }, args.frio),
    ]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    frios.push(await metricas());
  }

  const sinJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
  await sinJs.addCookies([
    { name: cookieNombre, value: cookieValor, domain: "localhost", path: "/", secure: true, sameSite: "Lax" },
  ]);
  const paginaSinJs = await sinJs.newPage();
  await paginaSinJs.goto(`${BASE}/panel`, { waitUntil: "domcontentloaded" });
  await Promise.all([
    paginaSinJs.waitForURL(`**${args.ruta}`),
    paginaSinJs.locator(`a[href="${args.ruta}"]:visible`).first().click(),
  ]);
  const h1SinJs = (await paginaSinJs.locator("h1").first().textContent())?.trim() ?? null;
  await sinJs.close();

  const resumen = {
    baseUrl: BASE,
    latenciaMs: LATENCIA,
    corridas: CORRIDAS,
    caliente: {
      ttfb: mediana(calientes.map((m) => m.ttfb)),
      lcp: mediana(calientes.map((m) => m.lcp)),
      viewTransition: calientes.every((m) => m.viewTransition),
      prefetch: calientes.every((m) => m.prefetchLinks > 0),
    },
    frio: {
      ttfb: mediana(frios.map((m) => m.ttfb)),
      lcp: mediana(frios.map((m) => m.lcp)),
      viewTransition: frios.every((m) => m.viewTransition),
    },
    sinJs: { url: paginaSinJs.url(), h1: h1SinJs },
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(resumen, null, 2)}\n`);
  } else {
    const si = (v) => (v ? "sí" : "no");
    process.stdout.write(
      [
        `base: ${resumen.baseUrl} · latencia ${resumen.latenciaMs} ms · ${resumen.corridas} corridas`,
        `caliente (${args.ruta}): TTFB ${resumen.caliente.ttfb} ms · LCP ${resumen.caliente.lcp} ms · prefetch ${si(resumen.caliente.prefetch)} · View Transition ${si(resumen.caliente.viewTransition)}`,
        `frío (${args.frio}): TTFB ${resumen.frio.ttfb} ms · LCP ${resumen.frio.lcp} ms · View Transition ${si(resumen.frio.viewTransition)}`,
        `sin JS: ${resumen.sinJs.url} · h1 «${resumen.sinJs.h1 ?? "—"}»`,
      ].join("\n") + "\n",
    );
  }
} finally {
  await browser.close();
}
