/**
 * @typedef {{ ruta: string, numero: number }} EntradaNumerada
 * @typedef {{ idx: number, tag: string }} EntradaJournal
 * @typedef {{ migraciones: EntradaNumerada[], journal: EntradaJournal[], adrs: EntradaNumerada[], avances: EntradaNumerada[] }} EstadoNumeros
 * @typedef {{ ok: boolean, problemas: string[], arreglos: string[] }} ResultadoNumeros
 */

const RX_MIGRACION = /^drizzle\/(\d{4})_[^/]+\.sql$/;
const RX_ADR = /^docs\/adr\/(\d{4})-[^/]+\.md$/;
const RX_AVANCE = /^docs\/roadmap\/avances\/(\d{4})\.md$/;

export function normalizarRuta(ruta) {
  return String(ruta ?? "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function numeroDeMigracion(ruta) {
  const m = RX_MIGRACION.exec(normalizarRuta(ruta));
  return m ? Number(m[1]) : null;
}

export function numeroDeAdr(ruta) {
  const m = RX_ADR.exec(normalizarRuta(ruta));
  return m ? Number(m[1]) : null;
}

export function numeroDeAvance(ruta) {
  const m = RX_AVANCE.exec(normalizarRuta(ruta));
  return m ? Number(m[1]) : null;
}

function entradasNumeradas(archivos, numeroDe) {
  return archivos
    .map((ruta) => ({ ruta, numero: numeroDe(ruta) }))
    .filter((e) => e.numero !== null)
    .sort((a, b) => a.numero - b.numero || a.ruta.localeCompare(b.ruta));
}

/**
 * @param {{ archivos?: string[], journal?: Array<{ idx: number, tag: string }> }} [entrada]
 * @returns {EstadoNumeros}
 */
export function armarEstado({ archivos = [], journal = [] } = {}) {
  const rutas = archivos.map(normalizarRuta);
  return {
    migraciones: entradasNumeradas(rutas, numeroDeMigracion),
    journal: (journal ?? [])
      .map((e) => ({ idx: Number(e?.idx), tag: String(e?.tag ?? "") }))
      .filter((e) => Number.isInteger(e.idx) && e.tag !== ""),
    adrs: entradasNumeradas(rutas, numeroDeAdr),
    avances: entradasNumeradas(rutas, numeroDeAvance),
  };
}

export function maximo(items) {
  let max = 0;
  for (const item of items ?? []) {
    const n = typeof item === "number" ? item : (item?.numero ?? item?.idx);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

export function formatearNumero(numero) {
  return String(numero).padStart(4, "0");
}

export function siguienteNumero(max) {
  return formatearNumero(Number(max) + 1);
}

function tagDeRuta(ruta) {
  const base = ruta.split("/").pop() ?? "";
  return base.replace(/\.sql$/, "");
}

function renombrar(ruta, numero) {
  const corte = ruta.lastIndexOf("/") + 1;
  const dir = ruta.slice(0, corte);
  const base = ruta.slice(corte).replace(/^\d{4}/, formatearNumero(numero));
  return `${dir}${base}`;
}

function evaluarSerie({ etiqueta, baseItems, ramaItems, maxBase, numerosReservados = null }) {
  const rutasBase = new Set(baseItems.map((x) => x.ruta));
  const agregados = ramaItems.filter((x) => !rutasBase.has(x.ruta));
  const problemas = [];
  const arreglos = [];
  if (agregados.length === 0) return { problemas, arreglos };

  const numerosBase = new Set(
    [...(numerosReservados ?? baseItems.map((x) => x.numero))].filter((n) => Number.isInteger(n)),
  );
  const porNumero = new Map();
  for (const a of agregados) {
    const lista = porNumero.get(a.numero) ?? [];
    lista.push(a);
    porNumero.set(a.numero, lista);
  }
  for (const [numero, items] of porNumero) {
    if (items.length > 1) {
      problemas.push(
        `${etiqueta}: las rutas ${items.map((x) => x.ruta).join(", ")} repiten el número ${formatearNumero(numero)}.`,
      );
    }
  }

  const reusaExacto = [...porNumero.keys()].some((numero) => numerosBase.has(numero));
  if (reusaExacto) {
    problemas.push(
      `${etiqueta}: main ya usa hasta ${formatearNumero(maxBase)} y el siguiente libre en main es ${siguienteNumero(maxBase)}.`,
    );
  }

  const ordenados = [...agregados].sort(
    (a, b) => a.numero - b.numero || a.ruta.localeCompare(b.ruta),
  );
  const ocupados = new Map();
  const aMover = [];
  for (const item of ordenados) {
    if (numerosBase.has(item.numero)) aMover.push(item);
    else if (!ocupados.has(item.numero)) ocupados.set(item.numero, item);
    else aMover.push(item);
  }
  if (aMover.length === 0) return { problemas, arreglos };

  const nuevoNumero = new Map();
  const insertar = (numero, item) => {
    let n = numero;
    let entrante = item;
    while (true) {
      while (numerosBase.has(n)) n += 1;
      const ocupante = ocupados.get(n);
      if (!ocupante) {
        ocupados.set(n, entrante);
        nuevoNumero.set(entrante.ruta, n);
        return n;
      }
      if (ocupante.numero === item.numero) {
        n += 1;
        continue;
      }
      ocupados.set(n, entrante);
      nuevoNumero.set(entrante.ruta, n);
      entrante = ocupante;
      n += 1;
    }
  };

  let cursor = maxBase + 1;
  for (const item of aMover) {
    if (ocupados.get(item.numero) === item) ocupados.delete(item.numero);
    const colocado = insertar(cursor, item);
    cursor = colocado + 1;
  }

  for (const item of ordenados) {
    const nuevo = nuevoNumero.get(item.ruta);
    if (nuevo === undefined || nuevo === item.numero) continue;
    arreglos.push(`- ${item.ruta}: renumerá a ${renombrar(item.ruta, nuevo)}`);
  }
  return { problemas, arreglos };
}

function evaluarJournal({ base, rama }) {
  const problemas = [];
  const rutasBase = new Set(base.migraciones.map((x) => x.ruta));
  const tagsBase = new Set(base.journal.map((x) => x.tag));
  const tagPorIdxBase = new Map(base.journal.map((x) => [x.idx, x.tag]));
  const migracionesAgregadas = rama.migraciones.filter((x) => !rutasBase.has(x.ruta));
  const tagsAgregados = new Set(migracionesAgregadas.map((x) => tagDeRuta(x.ruta)));

  for (const m of migracionesAgregadas) {
    const tag = tagDeRuta(m.ruta);
    const entrada = rama.journal.find((j) => j.tag === tag);
    if (!entrada) {
      problemas.push(
        `Migraciones drizzle: falta la entrada ${tag} en drizzle/meta/_journal.json (idx ${m.numero}).`,
      );
    } else if (entrada.idx !== m.numero) {
      problemas.push(
        `Migraciones drizzle: drizzle/meta/_journal.json registra ${tag} con idx ${entrada.idx}, pero el archivo usa ${formatearNumero(m.numero)}; corregí el idx a ${m.numero}.`,
      );
    }
  }

  for (const j of rama.journal) {
    if (tagsBase.has(j.tag) || tagsAgregados.has(j.tag)) continue;
    problemas.push(
      `Migraciones drizzle: drizzle/meta/_journal.json agrega idx ${j.idx} (${j.tag}) sin drizzle/${formatearNumero(j.idx)}_*.sql nuevo.`,
    );
  }

  for (const j of rama.journal) {
    if (tagsBase.has(j.tag)) continue;
    const tagDeMain = tagPorIdxBase.get(j.idx);
    if (tagDeMain !== undefined && tagDeMain !== j.tag) {
      problemas.push(
        `Migraciones drizzle: drizzle/meta/_journal.json reusa el idx ${j.idx} de main (${tagDeMain}) para ${j.tag}.`,
      );
    }
  }

  return problemas;
}

/**
 * @param {{ base: EstadoNumeros, rama: EstadoNumeros }} estados
 * @returns {ResultadoNumeros}
 */
export function evaluarNumeros({ base, rama }) {
  const maxMigracion = Math.max(maximo(base.migraciones), maximo(base.journal));
  const maxAdr = maximo(base.adrs);
  const maxAvance = maximo(base.avances);
  const maxDocs = Math.max(maxAdr, maxAvance);
  const numerosDocsBase = new Set([
    ...base.adrs.map((x) => x.numero),
    ...base.avances.map((x) => x.numero),
  ]);

  const numerosMigracionBase = new Set([
    ...base.migraciones.map((x) => x.numero),
    ...base.journal.map((x) => x.idx),
  ]);
  const migraciones = evaluarSerie({
    etiqueta: "Migraciones drizzle",
    baseItems: base.migraciones,
    ramaItems: rama.migraciones,
    maxBase: maxMigracion,
    numerosReservados: numerosMigracionBase,
  });
  const adrs = evaluarSerie({
    etiqueta: "ADR",
    baseItems: base.adrs,
    ramaItems: rama.adrs,
    maxBase: maxDocs,
    numerosReservados: numerosDocsBase,
  });
  const avances = evaluarSerie({
    etiqueta: "Avances numerados",
    baseItems: base.avances,
    ramaItems: rama.avances,
    maxBase: maxDocs,
    numerosReservados: numerosDocsBase,
  });

  const problemas = [
    ...migraciones.problemas,
    ...evaluarJournal({ base, rama }),
    ...adrs.problemas,
    ...avances.problemas,
  ];
  const arreglos = [...migraciones.arreglos];
  if (migraciones.arreglos.length > 0) {
    arreglos.push(
      "- Actualizá drizzle/meta/_journal.json (idx y tag); docs/roadmap/migraciones-aplicadas.md se actualiza recién cuando Mauri aplica la migración.",
    );
  }
  arreglos.push(...adrs.arreglos, ...avances.arreglos);

  return { ok: problemas.length === 0, problemas, arreglos };
}
