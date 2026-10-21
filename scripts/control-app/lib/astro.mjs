import { RAIZ } from "./estado.mjs";
import { cmdline, correr, esperar, esperarHttp, pidVivo } from "./procesos.mjs";

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

export function sanitizarEntorno(extra = {}) {
  const env = { ...process.env };
  for (const clave of Object.keys(env)) {
    if (
      clave === "TENANT_MODE" ||
      clave === "CONTROL_DATABASE_URL" ||
      clave === "TENANT_DATABASE_URL" ||
      clave.startsWith("TENANT_DATABASE_URL_") ||
      clave.startsWith("ARCA_") ||
      clave.startsWith("ASSISTANT_LLM_") ||
      clave.startsWith("SUPABASE_") ||
      clave.startsWith("PUBLIC_SUPABASE_")
    ) {
      delete env[clave];
    }
  }
  return {
    ...env,
    CONTROL_APP_DEV: "1",
    NODE_ENV: "development",
    DEFAULT_TENANT_ID: "control-app",
    ASTRO_TELEMETRY_DISABLED: "1",
    ...extra,
  };
}

export function baseUrlPorDefecto(puerto = 4321, env = process.env) {
  return (env.CONTROL_APP_BASE_URL || `http://localhost:${puerto}`).replace(/\/$/, "");
}

export async function consultarSalud(baseUrl) {
  return esperarHttp(`${baseUrl}/api/health`, { timeoutMs: 3_000, intervaloMs: 300 });
}

function pidDeEstado(env) {
  const r = correr(NPX, ["astro", "dev", "status"], {
    cwd: RAIZ,
    env,
    timeout: 20_000,
  });
  const texto = `${r.stdout}\n${r.stderr}`;
  const m = texto.match(/\bpid (\d+)/);
  return m ? Number(m[1]) : null;
}

export async function levantarAstro({ puerto, baseUrl }) {
  const salud = await consultarSalud(baseUrl);
  if (salud.ok) return { ok: true, propia: false, pid: null, accion: "ya_estaba", puerto, baseUrl };
  const env = sanitizarEntorno({ HOST: "127.0.0.1", PORT: String(puerto) });
  const r = correr(NPX, ["astro", "dev", "--background", "--host", "127.0.0.1", "--port", String(puerto)], {
    cwd: RAIZ,
    env,
    timeout: 120_000,
  });
  const espera = await esperarHttp(`${baseUrl}/api/health`, { timeoutMs: 90_000, intervaloMs: 700 });
  if (!espera.ok) {
    return {
      ok: false,
      propia: false,
      puerto,
      baseUrl,
      error: "Astro dev no respondió.",
      detalle: (r.stderr || r.stdout).trim().slice(0, 1200),
      hint: "Mirá `.pstack-tmp/control-app` y volvé a correr `control-app levantar`. Si el puerto está ocupado, probá `--puerto 4322`.",
    };
  }
  const pid = pidDeEstado(env);
  return { ok: true, propia: true, pid, accion: "iniciada", puerto, baseUrl, salida: (r.stdout || r.stderr).trim().slice(0, 400) };
}

export async function pararAstro({ puerto, baseUrl, pid }) {
  const salud = await consultarSalud(baseUrl);
  if (!salud.ok) return { ok: true, accion: "ya_estaba_apagada", pid: null };
  if (!pidVivo(pid)) {
    return {
      ok: false,
      error: "La app responde pero no es el proceso que levantó control-app.",
      hint: "No la apago para no tocar una instancia ajena. Parala vos o cambiá `--puerto`.",
      pid: null,
    };
  }
  const cmd = cmdline(pid);
  if (!cmd.includes("astro")) {
    return {
      ok: false,
      error: `El PID ${pid} ya no es Astro.`,
      hint: "No lo mato. Corré `control-app doctor` o levantá de nuevo.",
      pid,
    };
  }
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 40; i += 1) {
    if (!pidVivo(pid)) break;
    await esperar(250);
  }
  if (pidVivo(pid)) {
    return {
      ok: false,
      error: `El Astro dev (PID ${pid}) no se cerró.`,
      hint: `Matá ese PID a mano si estás seguro: kill ${pid}.`,
      pid,
    };
  }
  return { ok: true, accion: "apagada", pid, puerto };
}

export async function doctor({ baseUrl }) {
  const salud = await consultarSalud(baseUrl);
  if (!salud.ok) {
    return {
      ok: false,
      error: "La app no responde.",
      hint: "Corré `control-app levantar`.",
      baseUrl,
    };
  }
  const venta = await fetch(`${baseUrl}/venta`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.text());
  const panel = await fetch(`${baseUrl}/panel`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.text());
  const marcadores = {
    venta: venta.includes("Venta mostrador"),
    panel: panel.includes("Panel del comercio"),
  };
  return {
    ok: marcadores.venta && marcadores.panel,
    baseUrl,
    health: true,
    marcadores,
    hint: marcadores.venta && marcadores.panel ? "" : "La app responde pero no parece ser el inventario. Revisá el puerto.",
  };
}
