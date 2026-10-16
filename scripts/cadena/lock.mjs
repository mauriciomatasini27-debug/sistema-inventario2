#!/usr/bin/env node
// Lock de la cadena. Uso:
//   node scripts/cadena/lock.mjs check   [--lock ruta]        -> libera si stale; exit 0 libre, 3 ocupado vivo
//   node scripts/cadena/lock.mjs acquire --pid N [--lock ruta] [--wait-min 20]
//   node scripts/cadena/lock.mjs release --pid N [--lock ruta]  -> solo propio o stale
// Default: --lock /workspace/.cadena.lock, --log /workspace/cadena-log.tsv
import { leerLock, liberar, liberarSiStale, tomar } from "./lock-lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (n, d) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : d;
};
const ruta = opt("lock", "/workspace/.cadena.lock");
const log = opt("log", "/workspace/cadena-log.tsv");
const pid = Number(opt("pid", process.ppid));

if (cmd === "check") {
  const r = liberarSiStale(ruta, { log });
  if (r.liberado) console.log(`stale liberado: ${r.motivo}`);
  const l = leerLock(ruta);
  console.log(l ? `ocupado pid=${l.pid}` : "libre");
  process.exit(l ? 3 : 0);
} else if (cmd === "acquire") {
  const limite = Date.now() + Number(opt("wait-min", "20")) * 60000;
  for (;;) {
    const r = tomar(ruta, pid, { log });
    if (r.tomado) {
      console.log(`tomado pid=${pid}`);
      process.exit(0);
    }
    if (Date.now() > limite) {
      console.log(`timeout: ocupado por pid=${r.dueño}`);
      process.exit(3);
    }
    await new Promise((res) => setTimeout(res, 5000));
  }
} else if (cmd === "release") {
  const r = liberar(ruta, pid, { log });
  console.log(`${r.liberado ? "liberado" : "no liberado"}: ${r.motivo}`);
  process.exit(r.liberado ? 0 : 1);
} else {
  console.error("uso: lock.mjs check|acquire|release [--pid N] [--lock ruta] [--log ruta]");
  process.exit(2);
}
