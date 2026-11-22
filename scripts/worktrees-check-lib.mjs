const PREFIJO_BRANCH = "branch refs/heads/";

const MOTIVOS = {
  huerfano: "Registro huérfano: el directorio ya no existe",
  principal: "Árbol de trabajo principal",
  sistema: "Rama del sistema",
  prAbierto: "Rama con pull request abierto",
  dobleCheckout: "Rama chequeada en más de un worktree",
  mergeEnCurso: "Merge en curso sin cerrar",
  sucio: "Cambios sin commitear",
  limpioMergeado: "Limpio y su commit ya está en la rama por defecto",
  limpioNoMergeado: "Limpio pero su rama aún no llegó a la rama por defecto",
};

function lineasDeStatus(status) {
  return String(status ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(Boolean);
}

function archivosDelStatus(status) {
  return lineasDeStatus(status)
    .map((linea) => /^(.{1,2})\s+(.+)$/.exec(linea))
    .filter(Boolean)
    .map((match) => match[2].trim().replace(/^"|"$/g, "").split(" -> ").at(-1))
    .filter(Boolean);
}

function conflictosDelStatus(status) {
  return lineasDeStatus(status).filter((linea) => /^[UAD]{2} /.test(linea) && linea[1] === "U").length;
}

export function clasificarWorktrees({
  worktrees,
  estados,
  merges,
  rutaPrincipal,
  ramaPorDefecto,
  ahora,
  diasUmbral,
  pullRequestsAbiertas = new Set(),
  ramasSistema = new Set(["main", "master"]),
}) {
  const usosDeRama = new Map();
  for (const w of worktrees) {
    if (w.rama) usosDeRama.set(w.rama, (usosDeRama.get(w.rama) ?? 0) + 1);
  }
  const sistema = new Set([...ramasSistema, ramaPorDefecto].filter(Boolean));

  return worktrees.map((w) => {
    const estado = estados?.[w.ruta] ?? { status: "", head: w.head, mergeHead: null };
    const archivos = archivosDelStatus(estado.status);
    const conflictosSinStage = conflictosDelStatus(estado.status);
    const mergeEnCurso = Boolean(estado.mergeHead);
    const modificado = estado.modificado ?? null;
    const diasInactivo = modificado == null ? null : Math.floor((ahora - modificado) / 86400000);

    let bucket;
    let motivo;
    if (w.prunable) {
      bucket = "huerfano";
      motivo = MOTIVOS.huerfano;
    } else if (w.ruta === rutaPrincipal) {
      bucket = "protegido";
      motivo = MOTIVOS.principal;
    } else if (w.rama && sistema.has(w.rama)) {
      bucket = "protegido";
      motivo = MOTIVOS.sistema;
    } else if (w.rama && pullRequestsAbiertas.has(w.rama)) {
      bucket = "protegido";
      motivo = MOTIVOS.prAbierto;
    } else if (w.rama && (usosDeRama.get(w.rama) ?? 0) > 1) {
      bucket = "protegido";
      motivo = MOTIVOS.dobleCheckout;
    } else if (mergeEnCurso) {
      bucket = "merge-en-curso";
      motivo = MOTIVOS.mergeEnCurso;
    } else if (archivos.length > 0) {
      bucket = "sucio";
      motivo = MOTIVOS.sucio;
    } else if (merges?.[w.head]) {
      bucket = "limpio-mergeado";
      motivo = MOTIVOS.limpioMergeado;
    } else {
      bucket = "limpio-no-mergeado";
      motivo = MOTIVOS.limpioNoMergeado;
    }

    return {
      ruta: w.ruta,
      rama: w.rama,
      head: w.head,
      headCorto: w.head.slice(0, 8),
      detached: w.detached,
      bucket,
      motivo,
      archivos,
      archivosCambios: archivos.length,
      conflictosSinStage,
      mergeEnCurso,
      mergeConRamaPorDefecto: estado.mergeConRamaPorDefecto ?? null,
      diasInactivo,
      diasUmbral,
    };
  });
}

export function estadoBaseline({ clasificados, duenos = new Set() }) {
  const motivos = [];
  for (const w of clasificados ?? []) {
    const comun = { ruta: w.ruta, rama: w.rama, bucket: w.bucket };
    if (w.bucket === "huerfano") {
      motivos.push({ ...comun, motivo: MOTIVOS.huerfano });
    } else if (w.bucket === "merge-en-curso") {
      motivos.push({ ...comun, motivo: MOTIVOS.mergeEnCurso });
    } else if (w.bucket === "limpio-no-mergeado" && !duenos.has(w.rama)) {
      motivos.push({ ...comun, motivo: `${MOTIVOS.limpioNoMergeado} y sin dueño explícito` });
    } else if (
      w.bucket === "limpio-mergeado" &&
      w.diasInactivo != null &&
      w.diasInactivo > w.diasUmbral
    ) {
      motivos.push({
        ...comun,
        motivo: `Worktree limpio y mergeado con ${w.diasInactivo} días de inactividad`,
        diasInactivo: w.diasInactivo,
        diasUmbral: w.diasUmbral,
      });
    }
  }
  return { ok: motivos.length === 0, motivos };
}

export function comandosRestauracion(clasificados) {
  return (clasificados ?? []).map((w) => `git worktree add --detach ${w.ruta} ${w.head}`);
}

export function parsearWorktrees(porcelain) {
  const bloques = String(porcelain ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return bloques.map((bloque) => {
    const item = {
      ruta: "",
      head: "",
      rama: null,
      detached: false,
      prunable: false,
    };
    for (const linea of bloque.split("\n")) {
      if (linea.startsWith("worktree ")) item.ruta = linea.slice("worktree ".length);
      else if (linea.startsWith("HEAD ")) item.head = linea.slice("HEAD ".length);
      else if (linea.startsWith(PREFIJO_BRANCH)) item.rama = linea.slice(PREFIJO_BRANCH.length);
      else if (linea === "detached") item.detached = true;
      else if (linea.startsWith("prunable ")) item.prunable = true;
    }
    return item;
  });
}
