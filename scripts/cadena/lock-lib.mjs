// Lock de la cadena (/workspace/.cadena.lock). Formato compatible: el archivo contiene solo el PID
// del dueño ("47867\n"). Toma atómica con O_EXCL ("wx"); la liberación de un lock ajeno/stale se
// serializa con mkdir(<lock>.d) para que dos corridas no lo borren y retomen a la vez.
import fs from "node:fs";

export const DOS_HORAS_MS = 2 * 60 * 60 * 1000;

export function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // existe pero es de otro usuario
  }
}

export function leerLock(ruta) {
  let st;
  let txt;
  try {
    st = fs.statSync(ruta);
    txt = fs.readFileSync(ruta, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  const m = /^\s*(\d+)/.exec(txt);
  return { pid: m ? Number(m[1]) : null, mtimeMs: st.mtimeMs, crudo: txt.trim() };
}

/** null si no está stale; si lo está, el motivo. vivo() inyectable para tests. */
export function motivoStale(lock, { ahora = Date.now(), vivo = pidVivo } = {}) {
  if (!lock) return null;
  if (lock.pid == null) return `contenido sin PID ("${lock.crudo.slice(0, 40)}")`;
  if (vivo(lock.pid)) return null;
  const edad = ahora - lock.mtimeMs;
  if (edad > DOS_HORAS_MS) return `pid=${lock.pid} muerto y lock de ${Math.round(edad / 60000)} min (>2h)`;
  return `pid=${lock.pid} muerto (kill -0 falla)`;
}

function conMutex(ruta, fn) {
  const dir = `${ruta}.d`;
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === "EEXIST") {
      // mutex abandonado (> 1 min): se recupera
      try {
        if (Date.now() - fs.statSync(dir).mtimeMs > 60000) fs.rmdirSync(dir);
      } catch (e2) {
        if (e2.code !== "ENOENT") throw e2;
      }
      return { ocupado: true };
    }
    throw e;
  }
  try {
    return fn();
  } finally {
    fs.rmdirSync(dir);
  }
}

export function logTsv(rutaLog, paso, estado, detalle) {
  if (!rutaLog) return;
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  fs.appendFileSync(rutaLog, `${ts}\t${paso}\t${estado}\t${detalle.replace(/[\t\n]/g, " ")}\n`);
}

/** Libera el lock si está stale. Devuelve { liberado, motivo }. */
export function liberarSiStale(ruta, { log, vivo, ahora } = {}) {
  return conMutex(ruta, () => {
    const lock = leerLock(ruta);
    const motivo = motivoStale(lock, { vivo, ahora });
    if (!motivo) return { liberado: false, motivo: lock ? `vivo pid=${lock.pid}` : "sin lock" };
    // re-chequeo: si otro lo reemplazó entre la lectura y ahora, no tocar
    const otra = leerLock(ruta);
    if (!otra || otra.crudo !== lock.crudo) return { liberado: false, motivo: "cambió durante el chequeo" };
    fs.unlinkSync(ruta);
    logTsv(log, "lock-stale", "ok", `liberado ${ruta}: ${motivo}`);
    return { liberado: true, motivo };
  });
}

/** Toma el lock para pid (atómico). Antes libera uno stale. */
export function tomar(ruta, pid, opts = {}) {
  liberarSiStale(ruta, opts);
  try {
    fs.writeFileSync(ruta, `${pid}\n`, { flag: "wx" });
    return { tomado: true };
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return { tomado: false, dueño: leerLock(ruta)?.pid ?? null };
  }
}

/** Libera solo si el lock es de pid (o está stale). */
export function liberar(ruta, pid, opts = {}) {
  const r = conMutex(ruta, () => {
    const lock = leerLock(ruta);
    if (!lock) return { liberado: false, motivo: "sin lock" };
    if (lock.pid === pid) {
      fs.unlinkSync(ruta);
      return { liberado: true, motivo: "propio" };
    }
    return null;
  });
  if (r && !r.ocupado) return r;
  if (r?.ocupado) return { liberado: false, motivo: "mutex ocupado" };
  const s = liberarSiStale(ruta, opts);
  return s.liberado ? s : { liberado: false, motivo: `ajeno (${s.motivo}); no se toca` };
}
