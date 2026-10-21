export const COMANDOS = {
  levantar: {
    resumen: "Levanta Postgres local y Astro dev, y espera a que la app responda.",
    uso: "control-app levantar [--puerto 4321]",
    posicionales: 0,
    flags: ["--puerto"],
    ejemplos: ["control-app levantar", "control-app levantar --puerto 4321"],
    destructivo: false,
  },
  apagar: {
    resumen: "Apaga el Astro dev que levantó esta CLI y, si lo arrancó, el Postgres local.",
    uso: "control-app apagar [--dry-run]",
    posicionales: 0,
    flags: ["--dry-run"],
    ejemplos: ["control-app apagar", "control-app apagar --dry-run"],
    destructivo: true,
  },
  seed: {
    resumen: "Recrea el tenant local con productos, stock, plan y usuarios Dueño y empleado.",
    uso: "control-app seed [--dry-run]",
    posicionales: 0,
    flags: ["--dry-run"],
    ejemplos: ["control-app seed", "control-app seed --dry-run"],
    destructivo: true,
  },
  login: {
    resumen: "Inicia sesión local como Dueño o empleado y guarda la sesión para los demás comandos.",
    uso: "control-app login --rol duenio|empleado",
    posicionales: 0,
    flags: ["--rol"],
    ejemplos: ["control-app login --rol duenio", "control-app login --rol empleado"],
    destructivo: false,
  },
  ir: {
    resumen: "Abre una ruta de la app con la sesión activa y la deja como página actual.",
    uso: "control-app ir <ruta>",
    posicionales: 1,
    flags: [],
    ejemplos: ["control-app ir /panel", "control-app ir /venta"],
    destructivo: false,
  },
  clic: {
    resumen: "Hace clic en un selector de la página actual.",
    uso: "control-app clic <selector>",
    posicionales: 1,
    flags: [],
    ejemplos: ['control-app clic "#cobrar"', 'control-app clic "text=Configurar umbrales"'],
    destructivo: false,
  },
  escribir: {
    resumen: "Escribe en un campo de la página actual.",
    uso: "control-app escribir <selector> <texto>",
    posicionales: 2,
    flags: [],
    ejemplos: ['control-app escribir "#sku" "CAFE-001"', 'control-app escribir "#q" "café"'],
    destructivo: false,
  },
  captura: {
    resumen: "Guarda un PNG de la página actual y devuelve la ruta.",
    uso: "control-app captura [--nombre <nombre>] [--dir <carpeta>]",
    posicionales: 0,
    flags: ["--nombre", "--dir"],
    ejemplos: [
      "control-app captura --nombre panel",
      "control-app captura --nombre venta --dir .agents/skills/control-app/artifacts/2026-10-21",
    ],
    destructivo: false,
  },
  errores: {
    resumen: "Devuelve los errores de consola y requests fallidas acumulados.",
    uso: "control-app errores [--limpiar] [--dry-run]",
    posicionales: 0,
    flags: ["--limpiar", "--dry-run"],
    ejemplos: ["control-app errores", "control-app errores --limpiar --dry-run"],
    destructivo: true,
  },
  estado: {
    resumen: "Informa qué está levantado, qué sesión está activa y dónde quedó la evidencia.",
    uso: "control-app estado",
    posicionales: 0,
    flags: [],
    ejemplos: ["control-app estado"],
    destructivo: false,
  },
  api: {
    resumen: "Llama una ruta de la API con la sesión activa y devuelve status y JSON.",
    uso: "control-app api <METODO> <ruta> [json]",
    posicionales: 2,
    flags: [],
    ejemplos: ['control-app api GET /api/auth/sesion-actual', 'control-app api POST /api/sync/heartbeat \'{"device_code":"CONTROL-APP-01","pendientes":0}\''],
    destructivo: false,
  },
};

const FLAGS_CON_VALOR = new Set(["--puerto", "--rol", "--nombre", "--dir", "--salida", "--base-url", "--home", "--ruta"]);
const FLAGS_BOOLEANAS = new Set(["--help", "-h", "--dry-run", "--limpiar"]);

const ALIAS = {
  l: "levantar",
  off: "apagar",
  s: "seed",
  e: "estado",
};

export class ErrorControlApp extends Error {
  constructor(mensaje, hint = "", datos = {}) {
    super(mensaje);
    this.name = "ErrorControlApp";
    this.hint = hint;
    this.datos = datos;
  }
}

export function parsear(argv) {
  const args = [...(argv ?? [])];
  const flags = {};
  const posicionales = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "--") {
      posicionales.push(...args.slice(i + 1));
      break;
    }
    if (a === "-h") {
      flags["--help"] = true;
      i += 1;
      continue;
    }
    if (a.startsWith("--")) {
      const [nombre, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
      if (!FLAGS_CON_VALOR.has(nombre) && !FLAGS_BOOLEANAS.has(nombre)) {
        throw new ErrorControlApp(`No conozco la opción ${nombre}.`, "Mirá `control-app --help` para las opciones válidas.");
      }
      if (FLAGS_BOOLEANAS.has(nombre)) {
        if (inline !== undefined) throw new ErrorControlApp(`${nombre} no lleva valor.`);
        flags[nombre] = true;
        i += 1;
        continue;
      }
      const valor = inline ?? args[i + 1];
      if (valor === undefined || valor.startsWith("--")) {
        throw new ErrorControlApp(`Falta el valor de ${nombre}.`, `Ejemplo: ${nombre} <valor>.`);
      }
      flags[nombre] = valor;
      i += inline === undefined ? 2 : 1;
      continue;
    }
    posicionales.push(a);
    i += 1;
  }
  const crudo = posicionales[0] ?? "";
  const comando = ALIAS[crudo] ?? crudo;
  return { comando, posicionales: posicionales.slice(1), flags };
}

export function validar(parsed) {
  if (parsed.flags["--help"] || parsed.comando === "ayuda" || parsed.comando === "") return { ayuda: true, comando: parsed.comando || null };
  const def = COMANDOS[parsed.comando];
  if (!def) {
    throw new ErrorControlApp(
      `No conozco el comando "${parsed.comando || "(vacío)"}".`,
      "Comandos: " + Object.keys(COMANDOS).join(", ") + ". Mirá `control-app --help`.",
    );
  }
  if (parsed.posicionales.length < def.posicionales) {
    throw new ErrorControlApp(
      `Faltan argumentos para ${parsed.comando}.`,
      `Uso: ${def.uso}`,
    );
  }
  const maximo = parsed.comando === "api" ? def.posicionales + 1 : def.posicionales;
  if (parsed.posicionales.length > maximo) {
    throw new ErrorControlApp(
      `Sobran argumentos para ${parsed.comando}.`,
      `Uso: ${def.uso}`,
    );
  }
  if (parsed.comando === "login" && !parsed.flags["--rol"]) {
    throw new ErrorControlApp("Falta --rol.", "Usá `control-app login --rol duenio` o `control-app login --rol empleado`.");
  }
  if (parsed.flags["--rol"] && !["duenio", "empleado"].includes(parsed.flags["--rol"])) {
    throw new ErrorControlApp(`Rol inválido: ${parsed.flags["--rol"]}.`, "Los roles válidos son duenio y empleado.");
  }
  const puerto = parsed.flags["--puerto"];
  if (puerto !== undefined && (!/^\d+$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535)) {
    throw new ErrorControlApp(`Puerto inválido: ${puerto}.`, "Usá un número entre 1 y 65535.");
  }
  return { ayuda: false, comando: parsed.comando };
}

export function ayudaGeneral() {
  const lineas = [
    "control-app: recorré la app como usuario y dejá evidencia real.",
    "",
    "Uso: control-app <comando> [opciones]",
    "",
    "Comandos:",
  ];
  for (const [nombre, def] of Object.entries(COMANDOS)) {
    lineas.push(`  ${nombre.padEnd(10)} ${def.resumen}`);
  }
  lineas.push(
    "",
    "Flujo típico:",
    "  control-app levantar",
    "  control-app seed",
    "  control-app login --rol duenio",
    "  control-app ir /panel",
    "  control-app captura --nombre panel-duenio",
    "  control-app login --rol empleado",
    "  control-app ir /venta",
    "  control-app captura --nombre venta-empleado",
    "",
    "Salida: siempre JSON. Si un comando falla, devuelve ok:false, error y hint.",
    "Evidencia: .agents/skills/control-app/artifacts/<fecha>/ (PNG y JSON).",
    "",
    "Opciones globales:",
    "  --salida <archivo>   además de stdout, escribe el JSON en ese archivo",
    "  --base-url <url>     default http://localhost:4321",
    "  --home <carpeta>     estado de la CLI (default .pstack-tmp/control-app)",
    "  --help               esta ayuda; también vale después de cada comando",
  );
  return lineas.join("\n");
}

export function ayudaDe(comando) {
  const def = COMANDOS[comando];
  if (!def) throw new ErrorControlApp(`No conozco el comando "${comando}".`, "Mirá `control-app --help`.");
  const lineas = [
    `control-app ${comando}`,
    "",
    def.resumen,
    "",
    `Uso: ${def.uso}`,
    "",
    def.destructivo
      ? "Este comando cambia estado local. Probá primero con --dry-run."
      : "Este comando no borra estado. Deja evidencia en artifacts/.",
    "",
    "Ejemplos:",
    ...def.ejemplos.map((e) => `  ${e}`),
    "",
    "Devuelve JSON por stdout. Un fallo trae ok:false, error y hint con el próximo paso.",
  ];
  if (def.flags.length > 0) {
    lineas.push("", "Opciones:");
    for (const f of def.flags) lineas.push(`  ${f}`);
  }
  return lineas.join("\n");
}

export function sobre(error) {
  if (error instanceof ErrorControlApp) return { error: error.message, hint: error.hint, ...error.datos };
  return { error: error instanceof Error ? error.message : String(error), hint: "Corré `control-app estado` y volvé a intentar." };
}
