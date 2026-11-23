#!/usr/bin/env node
// AUD-S6 (PRD-AUD-03, ADR-0127): checklist de navegación de las 8 pantallas.
// Recorre cada pantalla contra una app local, prueba que carga, guarda y relee,
// y deja evidencia JSON por pantalla. No modifica el repo ni el código.
//
// Uso:
//   node scripts/check-navegacion.mjs --semilla            (siembra el tenant control-app)
//   node scripts/check-navegacion.mjs --base-url http://localhost:4321
//   node scripts/check-navegacion.mjs --estricto            (exit 1 si hay hallazgos)
//
// Requiere la app levantada con CONTROL_APP_DEV=1 (control-app levantar) y un
// tenant sembrado (control-app seed, o --semilla acá).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  cuitDeCorrida,
  fechaLocal,
  itemDeLista,
  leerH1,
  mensajeDeError,
  pasoOk,
  precioDeProducto,
  productoDeLista,
  resumir,
  skuDeProducto,
  slugSeguro,
} from "./check-navegacion-lib.mjs";

const AYUDA = `check:navegacion — checklist de navegación de AUD-S6

Opciones:
  --base-url <url>   URL de la app (default: CONTROL_APP_BASE_URL o http://localhost:4321)
  --dir <carpeta>    Carpeta de evidencia (default: .agents/skills/control-app/artifacts/<fecha>/aud-s6)
  --semilla          Siembra el tenant control-app antes de recorrer (POST /api/dev/control-app)
  --estricto         Sale con 1 si algún paso falla (default: informa y sale 0)
  --json             Imprime el resumen JSON en vez de la tabla
  --help             Esta ayuda

Salida: un JSON por pantalla más resumen.json en la carpeta de evidencia.`;

function parsearArgs(argv) {
  const args = { posicionales: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args.posicionales.push(a);
      continue;
    }
    if (a === "--semilla" || a === "--estricto" || a === "--json" || a === "--help") {
      args[a] = true;
      continue;
    }
    args[a] = argv[i + 1];
    i += 1;
  }
  return args;
}

const args = parsearArgs(process.argv.slice(2));
if (args["--help"]) {
  process.stdout.write(`${AYUDA}\n`);
  process.exit(0);
}

const BASE = (args["--base-url"] ?? process.env.CONTROL_APP_BASE_URL ?? "http://localhost:4321").replace(/\/$/, "");
const DIR = resolve(args["--dir"] ?? join(".agents", "skills", "control-app", "artifacts", fechaLocal(), "aud-s6"));
const AHORA = new Date();

function errorCorto(cuerpo, status) {
  if (cuerpo && typeof cuerpo === "object") {
    if (typeof cuerpo.error === "string") return cuerpo.error;
    if (cuerpo.error) return JSON.stringify(cuerpo.error).slice(0, 300);
  }
  return `HTTP ${status}`;
}

async function pedir(metodo, ruta, opciones = {}) {
  const headers = { ...(opciones.headers ?? {}) };
  if (opciones.cookie) headers.cookie = opciones.cookie;
  if (opciones.body !== undefined) headers["content-type"] = "application/json";
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers,
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    return { status: 0, json: null, texto: "", error: e instanceof Error ? e.message : String(e) };
  }
  const texto = await respuesta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { status: respuesta.status, json, texto };
}

async function pedirDev(accion) {
  return pedir("POST", "/api/dev/control-app", { body: accion });
}

async function sesion(rol) {
  const r = await pedirDev({ accion: "login", rol });
  if (r.status !== 200) {
    throw new Error(
      `No pude iniciar sesión como ${rol} (HTTP ${r.status}). Levantá la app con CONTROL_APP_DEV=1 y corré con --semilla.`,
    );
  }
  return { cookie: r.json?.cookie ?? null, nombre: r.json?.nombre ?? null, tenant: r.json?.tenant_id ?? null };
}

function paso(nombre, ok, detalle, extra = {}) {
  return { nombre, ok, detalle, ...extra };
}

async function pagina(ctx, ruta, cookie, { esperados = [200], h1Esperado = null } = {}) {
  const r = await pedir("GET", ruta, { cookie });
  const h1 = leerH1(r.texto);
  const cumpleH1 = h1Esperado === null || String(h1 ?? "").includes(h1Esperado);
  return {
    r,
    h1,
    paso: paso(
      "carga",
      pasoOk(esperados, r.status) && cumpleH1,
      `${ruta} → ${r.status}${h1 ? ` · h1 «${h1.slice(0, 60)}»` : " · sin h1"}${cumpleH1 ? "" : ` · se esperaba h1 «${h1Esperado}»`}`,
      { status: r.status, url: ruta, h1 },
    ),
  };
}

// ---------------------------------------------------------------- pantallas

async function pantallaPanel(ctx) {
  const page = await pagina(ctx, "/panel", ctx.duenio.cookie, { h1Esperado: "Hola · Almacén Control App" });
  const api = await pedir("GET", "/api/panel/indice", { cookie: ctx.duenio.cookie });
  const modulos = Array.isArray(api.json?.modulos) ? api.json.modulos.length : 0;
  return {
    id: "panel",
    nombre: "Panel",
    ruta: "/panel",
    rol: "duenio",
    pasos: [
      page.paso,
      paso("carga-api", pasoOk([200], api.status) && modulos > 0, `GET /api/panel/indice → ${api.status} · ${modulos} módulos`, {
        status: api.status,
        modulos,
      }),
    ],
    observaciones: ["Pantalla de solo lectura: el panel no persiste nada propio; relee KPIs y módulos."],
  };
}

async function pantallaVenta(ctx) {
  const cookie = ctx.empleado.cookie;
  const page = await pagina(ctx, "/venta", cookie, { h1Esperado: "Venta mostrador" });
  const busqueda = await pedir("GET", "/api/products?q=CAFE", { cookie });
  const producto = busqueda.json?.productos?.[0] ?? null;
  const sku = skuDeProducto(producto);
  const precio = precioDeProducto(producto);
  const pasos = [
    page.paso,
    paso(
      "carga-catalogo",
      pasoOk([200], busqueda.status) && Boolean(sku) && typeof precio === "number",
      `GET /api/products?q=CAFE → ${busqueda.status} · ${sku ?? "sin producto"} · precio ${precio ?? "?"}`,
      { status: busqueda.status },
    ),
  ];
  const observaciones = [];
  if (!sku || typeof precio !== "number") {
    pasos.push(paso("guarda", false, "No hay producto sembrado para probar la venta (corré con --semilla)."));
    return { id: "venta", nombre: "Venta", ruta: "/venta", rol: "empleado", pasos, observaciones };
  }

  const seq = Date.now();
  const ocurrido = AHORA.toISOString();
  // Cada envío lleva su propia Idempotency-Key: con la misma, el handler
  // responde 409 (ya vista) y no se puede distinguir el resultado del payload.
  const vender = (cuerpo) =>
    pedir("POST", "/api/sales", { cookie, headers: { "Idempotency-Key": crypto.randomUUID() }, body: cuerpo });
  const venta = await vender({
    lineas: [{ product_id: sku, qty: 2, precio_centavos: precio }],
    medio: "Efectivo",
    device_code: "panel-web",
    seq_local: seq,
    client_occurred_at: ocurrido,
    offline: false,
  });
  const movimientoId = venta.json?.pagos?.[0]?.cash_movement_id ?? null;
  pasos.push(
    paso(
      "guarda",
      pasoOk([201], venta.status) && Boolean(venta.json?.sale_id),
      `POST /api/sales (2 u) → ${venta.status} · ticket ${venta.json?.ticket_definitivo ?? "—"} · total ${venta.json?.total_centavos ?? "?"}`,
      { status: venta.status, sale_id: venta.json?.sale_id ?? null },
    ),
  );

  const historia = await pedir("GET", "/api/cash/history?limit=20", { cookie });
  const movimiento = movimientoId ? itemDeLista(historia.json, "id", movimientoId) : null;
  pasos.push(
    paso(
      "relee",
      pasoOk([200], historia.status) && Boolean(movimiento),
      `GET /api/cash/history → ${historia.status} · ${movimiento ? `egreso ${movimiento.monto_centavos} con ${movimiento.metodo}` : "no encontré el egreso de la venta"}`,
      { status: historia.status },
    ),
  );

  // venta-1 (#474): el payload de la pantalla viaja con `porPeso` y el handler
  // espera `por_peso`, así que una línea por peso de más de 999 g no se cobra.
  // Se siembra un producto por peso con stock suficiente para que el rechazo,
  // si aparece, sea del contrato y no de la cantidad disponible.
  const sufijo = String(Date.now()).slice(-6);
  const skuPeso = `AUD6-PESO-${sufijo}`;
  const precioPeso = 120000;
  await pedir("POST", "/api/products", {
    cookie,
    body: {
      sku: skuPeso,
      nombre: `Fiambre AUD S6 ${sufijo}`,
      precio_centavos: precioPeso,
      por_peso: true,
      sector: "general",
      codigo: skuPeso,
    },
  });
  for (let i = 0; i < 5; i += 1) {
    await pedir("POST", "/api/stock/ingreso", {
      cookie,
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { sku: skuPeso, cantidad: 999, costo_centavos: 80000 },
    });
  }
  const pesoPantalla = await vender({
    lineas: [{ product_id: skuPeso, qty: 2500, precio_centavos: precioPeso, porPeso: true }],
    medio: "Efectivo",
    device_code: "panel-web",
    seq_local: seq + 1,
    client_occurred_at: ocurrido,
    offline: false,
  });
  const pesoContrato = await vender({
    lineas: [{ product_id: skuPeso, qty: 2500, precio_centavos: precioPeso, por_peso: true }],
    medio: "Efectivo",
    device_code: "panel-web",
    seq_local: seq + 2,
    client_occurred_at: ocurrido,
    offline: false,
  });
  pasos.push(
    paso(
      "por-peso",
      pesoPantalla.status === 201,
      `2,5 kg con el payload de /venta → ${pesoPantalla.status} ${mensajeDeError(pesoPantalla.json) ?? ""} · con el contrato del handler → ${pesoContrato.status} ${mensajeDeError(pesoContrato.json) ?? ""}`,
      {
        status: pesoPantalla.status,
        codigo: pesoPantalla.status === 201 ? null : "venta-1",
        issue: "#474",
      },
    ),
  );
  return { id: "venta", nombre: "Venta", ruta: "/venta", rol: "empleado", pasos, observaciones };
}

async function pantallaCaja(ctx) {
  const cookie = ctx.duenio.cookie;
  const page = await pagina(ctx, "/panel/caja", cookie, { h1Esperado: "Caja" });
  const balance = await pedir("GET", "/api/cash/balance", { cookie });
  const pasos = [
    page.paso,
    paso("carga-balance", pasoOk([200], balance.status), `GET /api/cash/balance → ${balance.status} · total ${balance.json?.total ?? "?"}`, {
      status: balance.status,
    }),
  ];
  const alta = await pedir("POST", "/api/cash/movements", {
    cookie,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: {
      tipo: "egreso",
      metodo: "Efectivo",
      categoria_id: "manual",
      origen: "retiro",
      monto_centavos: 1500,
      device_code: "panel-web",
      seq_local: Date.now(),
      client_occurred_at: AHORA.toISOString(),
    },
  });
  pasos.push(
    paso("guarda", pasoOk([201], alta.status) && Boolean(alta.json?.id), `POST /api/cash/movements → ${alta.status} · ${alta.json?.id ?? errorCorto(alta.json, alta.status)}`, {
      status: alta.status,
    }),
  );
  const historia = await pedir("GET", "/api/cash/history?limit=10", { cookie });
  const movimiento = alta.json?.id ? itemDeLista(historia.json, "id", alta.json.id) : null;
  pasos.push(
    paso("relee", pasoOk([200], historia.status) && Boolean(movimiento), `GET /api/cash/history → ${historia.status} · ${movimiento ? "el egreso está en el histórico" : "no aparece el egreso"}`, {
      status: historia.status,
    }),
  );

  // caja-1 (#476): `nota` está en el contrato y no se persiste (no hay columna).
  const conNota = await pedir("POST", "/api/cash/movements", {
    cookie,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: {
      tipo: "egreso",
      metodo: "Efectivo",
      categoria_id: "manual",
      origen: "retiro",
      monto_centavos: 2000,
      nota: "AUD-S6 nota de arqueo",
      device_code: "panel-web",
      seq_local: Date.now() + 1,
      client_occurred_at: AHORA.toISOString(),
    },
  });
  const historiaNota = await pedir("GET", "/api/cash/history?limit=10", { cookie });
  const conNotaLeido = conNota.json?.id ? itemDeLista(historiaNota.json, "id", conNota.json.id) : null;
  const observaciones = [];
  observaciones.push(
    conNotaLeida(conNotaLeido)
      ? "caja-1 reproducido: el movimiento acepta `nota` (201) y la relectura no la devuelve (no hay columna)."
      : "caja-1 no reproducible: la relectura devolvió `nota`.",
  );
  return { id: "caja", nombre: "Caja", ruta: "/panel/caja", rol: "duenio", pasos, observaciones };
}

function conNotaLeida(movimiento) {
  if (!movimiento) return false;
  return !("nota" in movimiento) || movimiento.nota === null || movimiento.nota === undefined;
}

async function pantallaStock(ctx) {
  const cookie = ctx.duenio.cookie;
  const page = await pagina(ctx, "/panel/stock", cookie, { h1Esperado: "Stock" });
  const listado = await pedir("GET", "/api/products?panel=1", { cookie });
  const pasos = [
    page.paso,
    paso("carga-listado", pasoOk([200], listado.status), `GET /api/products?panel=1 → ${listado.status} · ${Array.isArray(listado.json?.productos) ? listado.json.productos.length : "?"} productos`, {
      status: listado.status,
    }),
  ];
  const sufijo = String(Date.now()).slice(-6);
  const sku = `AUD6-${sufijo}`;
  const precio = 123400;
  const alta = await pedir("POST", "/api/products", {
    cookie,
    body: {
      sku,
      nombre: `Yerba AUD S6 ${sufijo}`,
      precio_centavos: precio,
      por_peso: false,
      sector: "general",
      codigo: sku,
      controla_vencimiento: true,
      permisos: [],
    },
  });
  pasos.push(
    paso("guarda", pasoOk([201], alta.status), `POST /api/products ${sku} → ${alta.status}${alta.status === 201 ? "" : ` · ${errorCorto(alta.json, alta.status)}`}`, {
      status: alta.status,
    }),
  );
  const relectura = await pedir("GET", `/api/products?codigo=${sku}`, { cookie });
  const producto = productoDeLista(relectura.json, sku);
  const mismoPrecio = producto !== null && Number(precioDeProducto(producto)) === precio;
  pasos.push(
    paso(
      "relee",
      pasoOk([200], relectura.status) && mismoPrecio,
      `GET /api/products?codigo=${sku} → ${relectura.status} · ${producto ? `precio ${precioDeProducto(producto)} (esperado ${precio})` : "no encontré el producto"}`,
      { status: relectura.status },
    ),
  );

  const vence = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const ingreso = await pedir("POST", "/api/stock/ingreso", {
    cookie,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { sku, cantidad: 5, costo_centavos: 90000, vence_el: vence, controla_vencimiento: true },
  });
  pasos.push(
    paso("guarda-ingreso", pasoOk([201], ingreso.status), `POST /api/stock/ingreso ${sku} → ${ingreso.status}${ingreso.status === 201 ? "" : ` · ${errorCorto(ingreso.json, ingreso.status)}`}`, {
      status: ingreso.status,
    }),
  );
  const lotes = await pedir("GET", `/api/lots?sku=${sku}`, { cookie });
  const lote = (lotes.json?.lotes ?? lotes.json?.items ?? []).find((l) => String(l.sku).toUpperCase() === sku);
  pasos.push(
    paso("relee-lote", pasoOk([200], lotes.status) && Boolean(lote), `GET /api/lots?sku=${sku} → ${lotes.status} · ${lote ? `lote ${lote.cantidad ?? lote.cantidad_restante ?? "?"} u` : "no encontré el lote"}`, {
      status: lotes.status,
    }),
  );
  const observaciones = [
    "stock-1 (#477) no se prueba acá: el flag `controla_vencimiento` del alta vive en el espejo de memoria y la lectura es la misma memoria; el round-trip a base lo cubre AUD-S4.",
  ];
  return { id: "stock", nombre: "Stock", ruta: "/panel/stock", rol: "duenio", pasos, observaciones };
}

async function pantallaProveedores(ctx) {
  const cookie = ctx.duenio.cookie;
  const page = await pagina(ctx, "/panel/proveedores", cookie, { h1Esperado: "Proveedores" });
  const listado = await pedir("GET", "/api/suppliers", { cookie });
  const pasos = [
    page.paso,
    paso("carga-listado", pasoOk([200], listado.status), `GET /api/suppliers → ${listado.status} · ${Array.isArray(listado.json?.items) ? listado.json.items.length : "?"} proveedores`, {
      status: listado.status,
    }),
  ];
  const sufijo = String(Date.now()).slice(-6);
  const cuit = cuitDeCorrida(Date.now(), `aud-s6-${sufijo}`);
  const nombre = `Proveedor AUD S6 ${sufijo}`;
  const alta = await pedir("POST", "/api/suppliers", {
    cookie,
    body: { cuit, nombre, email: `aud-s6-${sufijo}@example.com`, telefono: "1145550000" },
  });
  pasos.push(
    paso("guarda", pasoOk([201], alta.status), `POST /api/suppliers ${cuit} → ${alta.status}${alta.status === 201 ? "" : ` · ${errorCorto(alta.json, alta.status)}`}`, {
      status: alta.status,
    }),
  );
  const relectura = await pedir("GET", `/api/suppliers?q=${encodeURIComponent(nombre)}`, { cookie });
  const proveedor = itemDeLista(relectura.json, "cuit", cuit);
  pasos.push(
    paso("relee", pasoOk([200], relectura.status) && Boolean(proveedor), `GET /api/suppliers?q=… → ${relectura.status} · ${proveedor ? `encontré ${proveedor.nombre}` : "no encontré el proveedor"}`, {
      status: relectura.status,
    }),
  );
  return { id: "proveedores", nombre: "Proveedores", ruta: "/panel/proveedores", rol: "duenio", pasos, observaciones: [] };
}

async function pantallaServicios(ctx) {
  const cookie = ctx.duenio.cookie;
  const page = await pagina(ctx, "/panel/consumos", cookie, { h1Esperado: "Consumos" });
  const listado = await pedir("GET", "/api/service-accounts", { cookie });
  const pasos = [
    page.paso,
    paso("carga-listado", pasoOk([200], listado.status), `GET /api/service-accounts → ${listado.status} · ${Array.isArray(listado.json?.items) ? listado.json.items.length : "?"} cuentas`, {
      status: listado.status,
    }),
  ];
  const sufijo = String(Date.now()).slice(-6);
  const proveedor = `Edenor AUD S6 ${sufijo}`;
  const alta = await pedir("POST", "/api/service-accounts", {
    cookie,
    body: { servicio: "luz", proveedor, titular: "Mora Dueña" },
  });
  pasos.push(
    paso("guarda", pasoOk([201], alta.status), `POST /api/service-accounts → ${alta.status}${alta.status === 201 ? "" : ` · ${errorCorto(alta.json, alta.status)}`}`, {
      status: alta.status,
    }),
  );
  const relectura = await pedir("GET", "/api/service-accounts", { cookie });
  const cuenta = alta.json?.account_id
    ? (relectura.json?.items ?? []).find((c) => c.account_id === alta.json.account_id)
    : null;
  pasos.push(
    paso("relee", pasoOk([200], relectura.status) && Boolean(cuenta), `GET /api/service-accounts → ${relectura.status} · ${cuenta ? `encontré ${cuenta.proveedor}` : "no encontré la cuenta"}`, {
      status: relectura.status,
    }),
  );
  const observaciones = [];
  if (cuenta) {
    const faltantes = ["alias", "email_origen", "vencimiento_tipico_dia"].filter(
      (campo) => !(campo in cuenta) || cuenta[campo] === null || cuenta[campo] === undefined,
    );
    observaciones.push(
      faltantes.length > 0
        ? `servicios-1 (#479) reproducido: el alta de la pantalla manda servicio/proveedor/titular y quedan sin poblar ${faltantes.join(", ")}.`
        : "servicios-1 no reproducible: la cuenta relecta trae alias, email y día de vencimiento.",
    );
  }
  return { id: "servicios", nombre: "Servicios", ruta: "/panel/consumos", rol: "duenio", pasos, observaciones };
}

async function pantallaFiscal(ctx) {
  const cookie = ctx.duenio.cookie;
  const page = await pagina(ctx, "/panel/fiscal/delegacion", cookie, { h1Esperado: "Facturación ARCA" });
  // La pantalla llama GET /api/fiscal/wizard sin tenant_id (delegacion.astro:39).
  const sinTenant = await pedir("GET", "/api/fiscal/wizard", { cookie });
  const pasos = [
    page.paso,
    paso(
      "carga-estado",
      pasoOk([200], sinTenant.status),
      `GET /api/fiscal/wizard (como lo llama la pantalla) → ${sinTenant.status} · ${sinTenant.status === 200 ? "estado leído" : errorCorto(sinTenant.json, sinTenant.status)}`,
      { status: sinTenant.status, codigo: sinTenant.status === 200 ? null : "fiscal-3", issue: "#483" },
    ),
  ];
  const tenant = ctx.duenio.tenant ?? "control-app";
  const conTenant = await pedir("GET", `/api/fiscal/wizard?tenant_id=${encodeURIComponent(tenant)}`, { cookie });
  pasos.push(
    paso("carga-contrato", pasoOk([200], conTenant.status), `GET /api/fiscal/wizard?tenant_id=${tenant} → ${conTenant.status}`, {
      status: conTenant.status,
    }),
  );
  const avanzar = await pedir("POST", "/api/fiscal/wizard", {
    cookie,
    body: { tenant_id: tenant, accion: "avanzar", paso: 1 },
  });
  pasos.push(
    paso("guarda", pasoOk([200], avanzar.status) && Number(avanzar.json?.paso) >= 1, `POST /api/fiscal/wizard avanzar → ${avanzar.status} · paso ${avanzar.json?.paso ?? "?"}`, {
      status: avanzar.status,
    }),
  );
  const relectura = await pedir("GET", `/api/fiscal/wizard?tenant_id=${encodeURIComponent(tenant)}`, { cookie });
  pasos.push(
    paso("relee", pasoOk([200], relectura.status) && Number(relectura.json?.paso) >= 1, `GET /api/fiscal/wizard → ${relectura.status} · paso ${relectura.json?.paso ?? "?"}`, {
      status: relectura.status,
    }),
  );
  return {
    id: "fiscal",
    nombre: "Fiscal",
    ruta: "/panel/fiscal/delegacion",
    rol: "duenio",
    pasos,
    observaciones: [
      "fiscal-1 (#480) y fiscal-2 no se prueban acá: el modo de primera factura y `cola_pausada`/`aviso_revocacion` viven en memoria y el checklist corre en un solo proceso; reinstalar el server es el único experimento que los distingue.",
    ],
  };
}

async function pantallaPagos(ctx) {
  const cookie = ctx.duenio.cookie;
  const r = await pedir("GET", "/panel/pagos", { cookie });
  const pasos = [
    paso(
      "carga",
      pasoOk([200], r.status),
      `GET /panel/pagos → ${r.status} · ${r.status === 404 ? "la pantalla no existe en el panel" : "responde"}`,
      { status: r.status, codigo: r.status === 404 ? "pagos-1" : null, issue: "#481" },
    ),
  ];
  return {
    id: "pagos",
    nombre: "Pagos",
    ruta: "/panel/pagos",
    rol: "duenio",
    pasos,
    observaciones: [
      "pagos-1 (#481): el módulo existe solo en API (`/api/payment-orders/*`, `lib/repos/ordenes-pago.ts`, tabla `payment_orders`); sin pantalla no hay campo que trazar ni guarda que recorrer.",
    ],
  };
}

const PANTALLAS = [
  pantallaPanel,
  pantallaVenta,
  pantallaCaja,
  pantallaStock,
  pantallaProveedores,
  pantallaServicios,
  pantallaFiscal,
  pantallaPagos,
];

// ------------------------------------------------------------------- runner

async function main() {
  const salud = await pedir("GET", "/api/health");
  if (salud.status !== 200) {
    process.stderr.write(
      `La app no responde en ${BASE}/api/health (${salud.status || "sin respuesta"}).\n` +
        "Corré `node scripts/control-app/control-app.mjs levantar` o levantá la app con CONTROL_APP_DEV=1.\n",
    );
    process.exitCode = 2;
    return;
  }
  if (args["--semilla"]) {
    const seed = await pedirDev({ accion: "seed" });
    if (seed.status !== 200) {
      process.stderr.write(`No pude sembrar el tenant (HTTP ${seed.status}): ${errorCorto(seed.json, seed.status)}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const duenio = await sesion("duenio");
  const empleado = await sesion("empleado");
  if (duenio.tenant !== "control-app" && !args["--semilla"]) {
    process.stderr.write(
      `Aviso: el tenant de la sesión es "${duenio.tenant}", no "control-app". ` +
        "El checklist asume el tenant sembrado por control-app.\n",
    );
  }

  const ctx = { duenio, empleado, ahora: AHORA };
  const resultados = [];
  for (const pantalla of PANTALLAS) {
    let resultado;
    try {
      resultado = await pantalla(ctx);
    } catch (e) {
      resultado = {
        id: pantalla.name.replace(/^pantalla/, "").toLowerCase(),
        pasos: [paso("runner", false, e instanceof Error ? e.message : String(e))],
        observaciones: [],
      };
    }
    resultados.push(resultado);
    const carpeta = join(DIR);
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, `${slugSeguro(resultado.id)}.json`), `${JSON.stringify(resultado, null, 2)}\n`);
  }

  const resumen = resumir(resultados);
  const completo = {
    accion: "check-navegacion",
    historia: "AUD-S6",
    base: BASE,
    tomada_en: new Date().toISOString(),
    tenant: duenio.tenant,
    ...resumen,
    pantallasDetalle: resultados.map((r) => ({
      id: r.id,
      ruta: r.ruta,
      rol: r.rol,
      pasos: (r.pasos ?? []).length,
      ok: (r.pasos ?? []).filter((p) => p.ok).length,
      observaciones: r.observaciones ?? [],
    })),
  };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, "resumen.json"), `${JSON.stringify(completo, null, 2)}\n`);

  if (args["--json"]) {
    process.stdout.write(`${JSON.stringify(completo, null, 2)}\n`);
  } else {
    const filas = resultados.map((r) => {
      const pasos = r.pasos ?? [];
      const ok = pasos.filter((p) => p.ok).length;
      const marca = ok === pasos.length ? "ok" : "falla";
      return `${String(r.id).padEnd(13)} ${String(ok).padStart(2)}/${String(pasos.length).padEnd(2)} ${marca.padEnd(6)} ${r.ruta ?? ""}`;
    });
    process.stdout.write(`check:navegacion · ${BASE} · tenant ${duenio.tenant}\n\n${filas.join("\n")}\n`);
    for (const r of resultados) {
      for (const p of r.pasos ?? []) {
        if (p.ok) continue;
        process.stdout.write(`\n  falla ${r.id}/${p.nombre}: ${p.detalle}${p.issue ? ` (${p.issue})` : ""}`);
      }
      for (const o of r.observaciones ?? []) process.stdout.write(`\n  nota ${r.id}: ${o}`);
    }
    process.stdout.write(`\n\n${resumen.pasosOk}/${resumen.pasos} pasos ok · ${resumen.hallazgos.length} hallazgo(s) · ${resumen.fallas.length} falla(s)`);
    process.stdout.write(`\nevidencia: ${DIR}\n`);
  }
  if (args["--estricto"] && resumen.pasosFallidos > 0) process.exitCode = 1;
}

await main();
