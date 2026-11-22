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

export function estadoNormalizado({ status, archivos, conflictosSinStage, mergeHead, mergeConRamaPorDefecto } = {}) {
  const lista = status ? archivosDelStatus(status) : [...(archivos ?? [])];
  const ordenados = [...new Set(lista)].sort();
  const conflictos = status ? conflictosDelStatus(status) : conflictosSinStage ?? 0;
  return {
    archivos: ordenados,
    archivosCambios: ordenados.length,
    conflictosSinStage: conflictos,
    mergeHead: mergeHead ?? null,
    mergeConRamaPorDefecto: mergeConRamaPorDefecto ?? null,
    sucio: ordenados.length > 0,
  };
}

const TIPOS_OBJETIVO = {
  worktree: { id: "ruta" },
  "rama-local": { id: "nombre" },
  "rama-remota": { id: "nombre" },
};

function idObjetivo(objetivo) {
  return objetivo?.[TIPOS_OBJETIVO[objetivo?.tipo]?.id];
}

function describirObjetivo(objetivo) {
  return `${objetivo.tipo} ${idObjetivo(objetivo)}`;
}

export function validarRecibo(recibo) {
  const errores = [];
  if (!recibo || typeof recibo !== "object" || Array.isArray(recibo)) {
    return { ok: false, errores: ["el recibo no es un objeto"] };
  }
  if (!TIPOS_OBJETIVO[recibo.objetivo?.tipo]) errores.push("objetivo.tipo inválido");
  const id = idObjetivo(recibo.objetivo);
  if (typeof id !== "string" || !id.trim()) errores.push("objetivo sin identificador");
  if (!/^[0-9a-f]{40}$/i.test(recibo.head ?? "")) errores.push("head inválido");

  const estado = recibo.estado;
  if (!estado || typeof estado !== "object" || Array.isArray(estado)) {
    errores.push("estado inválido");
  } else {
    if (estado.status !== undefined && typeof estado.status !== "string") errores.push("estado.status inválido");
    if (
      estado.archivos !== undefined &&
      (!Array.isArray(estado.archivos) || estado.archivos.some((a) => typeof a !== "string"))
    ) {
      errores.push("estado.archivos inválido");
    }
    for (const campo of ["archivosCambios", "conflictosSinStage"]) {
      if (estado[campo] !== undefined && !Number.isInteger(estado[campo])) errores.push(`estado.${campo} inválido`);
    }
    if (estado.mergeHead !== undefined && estado.mergeHead !== null && typeof estado.mergeHead !== "string") {
      errores.push("estado.mergeHead inválido");
    }
    if (
      estado.mergeConRamaPorDefecto !== undefined &&
      estado.mergeConRamaPorDefecto !== null &&
      typeof estado.mergeConRamaPorDefecto !== "boolean"
    ) {
      errores.push("estado.mergeConRamaPorDefecto inválido");
    }
  }
  return { ok: errores.length === 0, errores };
}

function diferenciaDeEstado(antes, despues) {
  const diferencias = [];
  const cambia = (condicion, texto) => {
    if (condicion) diferencias.push(texto);
  };
  cambia(
    JSON.stringify(antes.archivos) !== JSON.stringify(despues.archivos),
    `el estado cambió: archivos antes [${antes.archivos.join(", ")}], ahora [${despues.archivos.join(", ")}]`,
  );
  cambia(
    antes.mergeHead !== despues.mergeHead,
    `el merge cambió: mergeHead antes ${antes.mergeHead ?? "null"}, ahora ${despues.mergeHead ?? "null"}`,
  );
  cambia(
    antes.mergeConRamaPorDefecto !== despues.mergeConRamaPorDefecto,
    `el merge cambió: apuntaba a la rama por defecto antes ${antes.mergeConRamaPorDefecto}, ahora ${despues.mergeConRamaPorDefecto}`,
  );
  cambia(
    antes.conflictosSinStage !== despues.conflictosSinStage,
    `el estado cambió: conflictos sin stage antes ${antes.conflictosSinStage}, ahora ${despues.conflictosSinStage}`,
  );
  return diferencias.length ? diferencias.join("; ") : null;
}

export function evaluarGuarda({ recibo, actual }) {
  const validez = validarRecibo(recibo);
  const objetivo = validez.ok ? describirObjetivo(recibo.objetivo) : "objetivo desconocido";
  const base = { objetivo, codigoSalida: 2, observado: null, actual: null };
  if (!validez.ok) {
    return { ...base, decision: "invalido", motivo: `Recibo mal formado: ${validez.errores.join(", ")}` };
  }
  if (actual?.existeObjetivo === false) {
    return { ...base, decision: "invalido", motivo: `Objetivo inexistente: ${objetivo}` };
  }

  const observado = { head: recibo.head, estado: estadoNormalizado(recibo.estado) };
  const corriente = { head: actual.head, estado: estadoNormalizado(actual.estado) };
  const resultado = { objetivo, observado, actual: corriente };

  if (recibo.head !== actual.head) {
    return {
      ...resultado,
      decision: "negar",
      codigoSalida: 1,
      motivo: `HEAD cambiado para ${objetivo}: observado ${recibo.head}, actual ${actual.head}`,
    };
  }
  const diferencia = diferenciaDeEstado(observado.estado, corriente.estado);
  if (diferencia) {
    return { ...resultado, decision: "negar", codigoSalida: 1, motivo: `No se puede mutar ${objetivo}: ${diferencia}` };
  }
  return {
    ...resultado,
    decision: "permitir",
    codigoSalida: 0,
    motivo: `Guarda OK para ${objetivo}: HEAD y estado sin cambios`,
  };
}

export function estadoDelObjetivo({ objetivo, worktrees, estados, locales, remotas }) {
  const listaWorktrees = worktrees ?? [];
  const listaEstados = estados ?? {};
  const listaLocales = locales ?? [];
  const listaRemotas = remotas ?? [];
  const sinObjetivo = { existeObjetivo: false, head: "", estado: estadoNormalizado({}) };
  const delWorktree = (worktree) => {
    const observado = worktree ? listaEstados[worktree.ruta] : null;
    return estadoNormalizado({
      status: observado?.status,
      mergeHead: observado?.mergeHead,
      mergeConRamaPorDefecto: observado?.mergeConRamaPorDefecto,
    });
  };

  if (objetivo?.tipo === "worktree") {
    const encontrado = listaWorktrees.find((w) => w.ruta === objetivo.ruta && !w.prunable);
    if (!encontrado) return sinObjetivo;
    const observado = listaEstados[encontrado.ruta] ?? {};
    return {
      existeObjetivo: true,
      head: observado.head ?? encontrado.head,
      estado: delWorktree(encontrado),
    };
  }

  if (objetivo?.tipo === "rama-local") {
    const rama = listaLocales.find((r) => r.nombre === objetivo.nombre);
    if (!rama) return sinObjetivo;
    const anfitrion = listaWorktrees.find((w) => w.rama === rama.nombre && !w.prunable);
    return { existeObjetivo: true, head: rama.sha, estado: delWorktree(anfitrion) };
  }

  if (objetivo?.tipo === "rama-remota") {
    const nombre = String(objetivo.nombre ?? "");
    const calificado = objetivo.remoto
      ? nombre.startsWith(`${objetivo.remoto}/`)
        ? nombre
        : `${objetivo.remoto}/${nombre}`
      : nombre;
    const rama =
      listaRemotas.find((r) => r.nombre === calificado) ?? listaRemotas.find((r) => r.corto === nombre);
    if (!rama) return sinObjetivo;
    const local = listaLocales.find((r) => r.upstream === rama.nombre);
    const anfitrion = local ? listaWorktrees.find((w) => w.rama === local.nombre && !w.prunable) : null;
    return { existeObjetivo: true, head: rama.sha, estado: delWorktree(anfitrion) };
  }

  return sinObjetivo;
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
