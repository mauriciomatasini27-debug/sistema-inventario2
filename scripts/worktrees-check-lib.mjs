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

function lineasDe(salida) {
  return String(salida ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter(Boolean);
}

function archivosDelStatus(status) {
  return lineasDe(status)
    .map((linea) => /^(.{1,2})\s+(.+)$/.exec(linea))
    .filter(Boolean)
    .map((match) => match[2].trim().replace(/^"|"$/g, "").split(" -> ").at(-1))
    .filter(Boolean);
}

function conflictosDelStatus(status) {
  return lineasDe(status).filter((linea) => /^[UAD]{2} /.test(linea) && linea[1] === "U").length;
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

const MOTIVOS_RAMAS = {
  prAbierto: "Rama con pull request abierto",
  sistema: "Rama del sistema",
  apuntada: "Una rama local con trabajo no mergeado apunta a esta remota",
  mergeadaLocal: "Rama local mergeada en la rama por defecto",
  mergeadaRemota: "Rama remota mergeada en la rama por defecto",
  noMergeadaLocal: "Rama local con trabajo no mergeado",
  noMergeadaRemota: "Rama remota con trabajo no mergeado",
  sinPush: "Rama sin push: el upstream ya no existe en el remote",
  stranded: "Rama sin upstream: solo reporte, no se ofrece para borrado",
  unknown: "Sin datos de merge: solo reporte",
};

function clasificacion(bucket, motivo, candidata = false) {
  return { bucket, motivo, candidata };
}

export function parsearLocales(salida) {
  return lineasDe(salida).map((linea) => {
    const [nombre = "", sha = "", upstream = ""] = linea.split("\t");
    return { nombre, sha, upstream };
  });
}

export function parsearRemotas(salida) {
  return lineasDe(salida)
    .map((linea) => {
      const [ref = "", sha = ""] = linea.split("\t");
      const nombre = ref.replace(/^refs\/remotes\//, "");
      const corte = nombre.indexOf("/");
      return {
        nombre,
        corto: corte >= 0 ? nombre.slice(corte + 1) : nombre,
        remoto: corte >= 0 ? nombre.slice(0, corte) : "",
        sha,
      };
    })
    .filter((r) => r.corto !== "HEAD");
}

export function parsearRamas(locales, remotas) {
  return { locales: parsearLocales(locales), remotas: parsearRemotas(remotas) };
}

export function parsearCommitsPosteriores(salida) {
  return lineasDe(salida).map((linea) => {
    const [sha = "", asunto = "", timestamp = "", archivos = "", inserciones = "", deletiones = ""] =
      linea.split("\t");
    return {
      sha,
      asunto,
      fecha: Number(timestamp) * 1000,
      archivos: Number(archivos) || 0,
      inserciones: Number(inserciones) || 0,
      deletiones: Number(deletiones) || 0,
    };
  });
}

export function clasificarRamas({
  locales,
  remotas,
  ramaPorDefecto,
  pullRequestsAbiertas = new Set(),
  trabajoPosterior = {},
  merges = {},
  remotasConocidas = new Set(),
  ahora,
}) {
  const diasDe = (commit) => Math.max(0, Math.floor((ahora - commit.fecha) / 86400000));
  const detalle = (commits) => {
    const c = commits[0];
    return `Trabajo posterior al merge: ${c.sha} ${c.asunto} (${diasDe(c)} días, ${c.archivos} archivos, +${c.inserciones} −${c.deletiones})`;
  };
  const conCommits = (commits) => ({
    dias: commits.length ? diasDe(commits[0]) : null,
    commits: commits.map((c) => ({ ...c, dias: diasDe(c) })),
  });

  const localesClasificadas = (locales ?? []).map((r) => {
    const commits = trabajoPosterior[r.nombre] ?? [];
    const conTrabajo = commits.length > 0 || merges[r.sha] === false;
    let resultado;
    if (pullRequestsAbiertas.has(r.nombre)) {
      resultado = clasificacion("protegida", MOTIVOS_RAMAS.prAbierto);
    } else if (!r.upstream) {
      resultado = clasificacion("stranded", MOTIVOS_RAMAS.stranded);
    } else if (!remotasConocidas.has(r.upstream)) {
      resultado = clasificacion("sin-push", MOTIVOS_RAMAS.sinPush);
    } else if (commits.length > 0) {
      resultado = clasificacion("trabajo-posterior-al-merge", detalle(commits));
    } else if (merges[r.sha] === true) {
      resultado = clasificacion("mergeada", MOTIVOS_RAMAS.mergeadaLocal, true);
    } else if (merges[r.sha] === false) {
      resultado = clasificacion("no-mergeada", MOTIVOS_RAMAS.noMergeadaLocal);
    } else {
      resultado = clasificacion("unknown", MOTIVOS_RAMAS.unknown);
    }
    return { ...r, ...resultado, ...conCommits(commits), conTrabajo };
  });

  const clavesProtegidas = new Set();
  for (const r of localesClasificadas) {
    if (!r.conTrabajo) continue;
    clavesProtegidas.add(r.nombre);
    if (r.upstream) clavesProtegidas.add(r.upstream);
  }

  const remotasClasificadas = (remotas ?? []).map((r) => {
    const commits = trabajoPosterior[r.nombre] ?? [];
    const esDelSistema = r.corto === ramaPorDefecto || r.nombre.endsWith(`/${ramaPorDefecto}`);
    let resultado;
    if (esDelSistema) {
      resultado = clasificacion("protegida", MOTIVOS_RAMAS.sistema);
    } else if (pullRequestsAbiertas.has(r.corto)) {
      resultado = clasificacion("protegida", MOTIVOS_RAMAS.prAbierto);
    } else if (clavesProtegidas.has(r.nombre) || clavesProtegidas.has(r.corto)) {
      resultado = clasificacion("protegida", MOTIVOS_RAMAS.apuntada);
    } else if (commits.length > 0) {
      resultado = clasificacion("trabajo-posterior-al-merge", detalle(commits));
    } else if (merges[r.sha] === true) {
      resultado = clasificacion("mergeada", MOTIVOS_RAMAS.mergeadaRemota, true);
    } else if (merges[r.sha] === false) {
      resultado = clasificacion("no-mergeada", MOTIVOS_RAMAS.noMergeadaRemota);
    } else {
      resultado = clasificacion("unknown", MOTIVOS_RAMAS.unknown);
    }
    return { ...r, ...resultado, ...conCommits(commits) };
  });

  return { locales: localesClasificadas, remotas: remotasClasificadas };
}

export function comandosRestauracionRamas({ locales, remotas }) {
  return [
    ...(locales ?? []).map((r) => `git branch ${r.nombre} ${r.sha}`),
    ...(remotas ?? []).map((r) => `git push ${r.remoto} ${r.sha}:refs/heads/${r.corto}`),
  ];
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
