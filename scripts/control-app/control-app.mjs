#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { COMANDOS, ErrorControlApp, ayudaDe, ayudaGeneral, parsear, sobre, validar } from "./lib/cli.mjs";
import { agregarErrores, carpetaEvidencia, guardarEstado, leerEstado, rutaEstado } from "./lib/estado.mjs";
import { baseUrlPorDefecto, consultarSalud, doctor, levantarAstro, pararAstro } from "./lib/astro.mjs";
import { estadoBase, levantarBase, pararBase } from "./lib/base.mjs";
import { consultarApi } from "./lib/navegador.mjs";
import { asegurarDaemon, detenerDaemon, estadoDaemon, pedirAccion } from "./lib/daemon-cliente.mjs";
import { pedirSesion, rutaSesion, escribirStorageState } from "./lib/sesion.mjs";

function salida(envelope, rutaSalida) {
  const texto = `${JSON.stringify(envelope, null, 2)}\n`;
  if (rutaSalida) writeFileSync(rutaSalida, texto);
  process.stdout.write(texto);
}

function exigirApp(baseUrl) {
  if (!baseUrl) throw new ErrorControlApp("Falta la URL de la app.", "Corré `control-app levantar`.");
}

async function saludObligatoria(baseUrl) {
  exigirApp(baseUrl);
  const salud = await consultarSalud(baseUrl);
  if (!salud.ok) {
    throw new ErrorControlApp(
      "La app no responde.",
      "Corré `control-app levantar` y volvé a intentar.",
      { baseUrl },
    );
  }
}

async function cargarStorage(estado, rol = estado.rol) {
  if (!rol) return null;
  const ruta = rutaSesion(rol);
  if (!existsSync(ruta)) {
    throw new ErrorControlApp(
      "No hay sesión guardada para ese rol.",
      `Corré \`control-app login --rol ${rol}\` antes de navegar.`,
    );
  }
  return JSON.parse(readFileSync(ruta, "utf8"));
}

async function pedirJson(baseUrl, cuerpo) {
  let r;
  try {
    r = await fetch(`${baseUrl}/api/dev/control-app`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ErrorControlApp(
      "No pude hablar con la API de control-app.",
      "Corré `control-app levantar`.",
      { detalle: e instanceof Error ? e.message : String(e) },
    );
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorControlApp(json.error || `HTTP ${r.status}`, json.hint || "Volvé a correr `control-app seed`.");
  return json;
}

async function comandoLevantar(parsed, estado) {
  const puerto = Number(parsed.flags["--puerto"] ?? estado.puerto ?? process.env.CONTROL_APP_PORT ?? 4321);
  const baseUrl = (parsed.flags["--base-url"] ?? baseUrlPorDefecto(puerto)).replace(/\/$/, "");
  if (estado.levantado && estado.puerto === puerto) {
    const salud = await consultarSalud(baseUrl);
    if (salud.ok) return { ok: true, accion: "ya_levantado", puerto, baseUrl, pid: estado.pid };
  }
  let base;
  if (process.env.CONTROL_APP_SIN_BASE === "1") {
    base = { ok: true, omitida: true, accion: "omitida_por_env" };
  } else {
    base = levantarBase();
    if (!base.ok) throw new ErrorControlApp(base.error, base.hint, { detalle: base.detalle });
  }
  const astro = await levantarAstro({ puerto, baseUrl });
  if (!astro.ok) throw new ErrorControlApp(astro.error, astro.hint, { detalle: astro.detalle });
  guardarEstado({
    ...estado,
    levantado: true,
    propia: astro.propia,
    pid: astro.pid,
    puerto,
    baseUrl,
    pgIniciada: base.propia === true,
    iniciadoEn: new Date().toISOString(),
  });
  return {
    ok: true,
    accion: astro.accion,
    puerto,
    baseUrl,
    pid: astro.pid,
    propia: astro.propia,
    base,
    app: { health: true },
    siguiente: "control-app seed",
  };
}

async function comandoApagar(parsed, estado) {
  if (parsed.flags["--dry-run"]) {
    return {
      ok: true,
      dry_run: true,
      haria: {
        astro: estado.levantado ? { pid: estado.pid, puerto: estado.puerto } : null,
        base_local: estado.pgIniciada,
        estado: rutaEstado(),
      },
      hint: "Volvé a correr sin --dry-run para apagar.",
    };
  }
  const navegador = await detenerDaemon();
  const astro = await pararAstro({ puerto: estado.puerto, baseUrl: estado.baseUrl, pid: estado.pid });
  if (!astro.ok) throw new ErrorControlApp(astro.error, astro.hint);
  let base = { ok: true, accion: "no_era_nuestra" };
  if (estado.pgIniciada) {
    base = pararBase();
    if (!base.ok) throw new ErrorControlApp(base.error, base.hint ?? "Revisá los logs de Postgres local.", { detalle: base.detalle });
  }
  guardarEstado({ ...estado, levantado: false, propia: false, pid: null, pgIniciada: false, rol: null, sesion: null, url: null });
  return { ok: true, accion: "apagado", navegador, astro, base };
}

async function comandoSeed(parsed, estado) {
  if (parsed.flags["--dry-run"]) {
    return {
      ok: true,
      dry_run: true,
      haria: {
        resetea: "el estado en memoria del Astro dev local",
        crea: ["tenant control-app", "usuarios Dueño y empleado", "3 productos con stock", "plan Plus", "device para wipe remoto"],
      },
      hint: "Volvé a correr sin --dry-run para sembrar.",
    };
  }
  await saludObligatoria(estado.baseUrl);
  const json = await pedirJson(estado.baseUrl, { accion: "seed" });
  guardarEstado({ ...estado, rol: null, sesion: null, url: null, titulo: null, errores: [], capturas: [] });
  return { ...json, accion: "seed" };
}

async function comandoLogin(parsed, estado) {
  const rol = parsed.flags["--rol"];
  await saludObligatoria(estado.baseUrl);
  await detenerDaemon();
  const sesion = await pedirSesion(estado.baseUrl, rol);
  const ruta = escribirStorageState(estado.baseUrl, sesion.cookie, rol);
  guardarEstado({ ...estado, rol, sesion: ruta, url: null, errores: [] });
  return {
    ok: true,
    accion: "login",
    rol,
    nombre: sesion.nombre,
    tenant_id: sesion.tenant_id,
    storage_state: ruta,
    cookie: "guardada (no se imprime)",
    siguiente: rol === "duenio" ? "control-app ir /panel" : "control-app ir /venta",
  };
}

async function comandoNavegar(parsed, estado, accion) {
  await saludObligatoria(estado.baseUrl);
  const storageState = await cargarStorage(estado);
  await asegurarDaemon({ baseUrl: estado.baseUrl, storageState: estado.sesion });
  const ruta = accion === "ir" ? parsed.posicionales[0] : estado.url;
  if (!ruta) {
    throw new ErrorControlApp(
      "No hay una página actual.",
      "Corré `control-app ir <ruta>` antes de este comando.",
    );
  }
  const datos = await pedirAccion(
    accion === "ir"
      ? { accion: "ir", ruta }
      : accion === "clic"
        ? { accion: "clic", selector: parsed.posicionales[0] }
        : { accion: "escribir", selector: parsed.posicionales[0], texto: parsed.posicionales[1] },
  );
  const conErrores = agregarErrores({ ...estado, url: datos.url, titulo: datos.titulo }, datos.detalle_errores ?? []);
  guardarEstado(conErrores);
  return { ...datos, storage_state: storageState ? estado.sesion : null, estado_guardado: { url: datos.url, titulo: datos.titulo } };
}

async function comandoCaptura(parsed, estado) {
  await saludObligatoria(estado.baseUrl);
  await cargarStorage(estado);
  await asegurarDaemon({ baseUrl: estado.baseUrl, storageState: estado.sesion });
  if (!estado.url) {
    throw new ErrorControlApp("No hay una página actual para capturar.", "Corré `control-app ir <ruta>` antes de capturar.");
  }
  const dir = parsed.flags["--dir"] ?? carpetaEvidencia();
  const datos = await pedirAccion({ accion: "captura", nombre: parsed.flags["--nombre"], dir });
  const conErrores = agregarErrores(
    { ...estado, url: datos.url, titulo: datos.titulo, capturas: [...(estado.capturas ?? []), datos.archivo] },
    datos.detalle_errores ?? [],
  );
  guardarEstado(conErrores);
  return { ...datos, evidencia_dir: dir };
}

async function comandoErrores(parsed, estado) {
  const daemon = await estadoDaemon();
  if (!daemon.vivo) {
    const total = (estado.errores ?? []).length;
    if (parsed.flags["--limpiar"] && parsed.flags["--dry-run"]) {
      return { ok: true, dry_run: true, limpiaria: total, hint: "Volvé a correr sin --dry-run para limpiar." };
    }
    if (parsed.flags["--limpiar"]) {
      guardarEstado({ ...estado, errores: [] });
      return { ok: true, accion: "limpiar", limpiados: total, errores: 0 };
    }
    return { ok: true, total, errores: estado.errores ?? [], navegador: "apagado" };
  }
  if (parsed.flags["--limpiar"] && parsed.flags["--dry-run"]) {
    const actual = await pedirAccion({ accion: "errores" });
    return { ok: true, dry_run: true, limpiaria: actual.total, hint: "Volvé a correr sin --dry-run para limpiar." };
  }
  if (parsed.flags["--limpiar"]) {
    const datos = await pedirAccion({ accion: "limpiar-errores" });
    guardarEstado({ ...estado, errores: [] });
    return { ok: true, ...datos };
  }
  const datos = await pedirAccion({ accion: "errores" });
  guardarEstado({ ...estado, errores: datos.errores ?? [] });
  return { ok: true, ...datos };
}

async function comandoEstado(estado) {
  const salud = await consultarSalud(estado.baseUrl);
  const doctorRes = estado.levantado || salud.ok ? await doctor({ baseUrl: estado.baseUrl }) : { ok: false, hint: "No está levantada." };
  return {
    ok: true,
    sano: Boolean(salud.ok && doctorRes.ok),
    app: {
      levantada: salud.ok,
      propia: estado.propia,
      pid: estado.pid,
      puerto: estado.puerto,
      baseUrl: estado.baseUrl,
      doctor: doctorRes,
    },
    base_local: estadoBase(),
    navegador: await estadoDaemon(),
    sesion: { rol: estado.rol, storage_state: estado.sesion },
    pagina: { url: estado.url, titulo: estado.titulo },
    errores: (estado.errores ?? []).length,
    capturas: estado.capturas ?? [],
    evidencia: carpetaEvidencia(),
    estado: rutaEstado(),
    hint: salud.ok ? "" : "Corré `control-app levantar`.",
  };
}

async function comandoApi(parsed, estado) {
  await saludObligatoria(estado.baseUrl);
  const storageState = await cargarStorage(estado).catch(() => null);
  const [metodoCrudo, ruta, cuerpoCrudo] = parsed.posicionales;
  const metodo = (metodoCrudo ?? "GET").toUpperCase();
  if (!ruta) throw new ErrorControlApp("Falta la ruta.", "Ejemplo: `control-app api GET /api/health`.");
  let cuerpo;
  if (cuerpoCrudo !== undefined) {
    try {
      cuerpo = JSON.parse(cuerpoCrudo);
    } catch {
      throw new ErrorControlApp("El cuerpo no es JSON válido.", "Pasá el JSON entre comillas simples, por ejemplo '{\"accion\":\"x\"}'.");
    }
  }
  return consultarApi({ baseUrl: estado.baseUrl, storageState, metodo, ruta, cuerpo });
}

async function ejecutar(parsed) {
  const estado = leerEstado();
  if (parsed.flags["--base-url"]) estado.baseUrl = parsed.flags["--base-url"].replace(/\/$/, "");
  switch (parsed.comando) {
    case "levantar":
      return comandoLevantar(parsed, estado);
    case "apagar":
      return comandoApagar(parsed, estado);
    case "seed":
      return comandoSeed(parsed, estado);
    case "login":
      return comandoLogin(parsed, estado);
    case "ir":
    case "clic":
    case "escribir":
      return comandoNavegar(parsed, estado, parsed.comando);
    case "captura":
      return comandoCaptura(parsed, estado);
    case "errores":
      return comandoErrores(parsed, estado);
    case "estado":
      return comandoEstado(estado);
    case "api":
      return comandoApi(parsed, estado);
    default:
      throw new ErrorControlApp(`No conozco el comando "${parsed.comando}".`, "Mirá `control-app --help`.");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parsear(argv);
    if (parsed.flags["--home"]) process.env.CONTROL_APP_HOME = parsed.flags["--home"];
    const v = validar(parsed);
    if (v.ayuda) {
      const texto = parsed.comando && COMANDOS[parsed.comando] ? ayudaDe(parsed.comando) : ayudaGeneral();
      salida({ ok: true, ayuda: texto }, parsed.flags["--salida"]);
      return;
    }
    const datos = await ejecutar(parsed);
    salida({ ok: true, ...datos }, parsed.flags["--salida"]);
  } catch (error) {
    salida({ ok: false, ...sobre(error) }, parsed?.flags?.["--salida"]);
    process.exitCode = 1;
  }
}

main();
