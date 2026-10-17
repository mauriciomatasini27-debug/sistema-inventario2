import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listarDocs, parseFrontmatter } from "./docs-lib.mjs";

const EXCLUIR_ESTADO = new Set(["reemplazado", "deprecado"]);
const TOPE = 8;
const FACTOR_MIN = 0.2;

function comoArreglo(v) {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter((x) => x !== "");
  const t = String(v ?? "").trim();
  return t === "" ? [] : [t];
}

function comoTexto(v) {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function primeraLinea(s) {
  for (const l of String(s ?? "").split("\n")) {
    const t = l.trim();
    if (t !== "") return t;
  }
  return "";
}

function esExcluidaPorRuta(rel) {
  const p = String(rel ?? "").replace(/\\/g, "/");
  return p.startsWith("archivo/") || p.startsWith("historico/");
}

function extraerTitulo(cuerpo) {
  const m = /^#\s+(.+)$/m.exec(String(cuerpo ?? ""));
  return (m?.[1] ?? "").trim();
}

function extraerHeadings(lineas) {
  const out = [];
  for (let i = 0; i < lineas.length; i += 1) {
    const m = /^(#{2,3})\s+(.*)$/.exec(lineas[i].trim());
    if (!m) continue;
    out.push({ level: m[1].length, heading: (m[2] ?? "").trim(), line: i + 1 });
  }
  return out;
}

function sinTildes(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function contarOcurrencias(haystack, aguja) {
  if (aguja === "") return 0;
  let n = 0;
  let desde = 0;
  for (;;) {
    const i = haystack.indexOf(aguja, desde);
    if (i < 0) return n;
    n += 1;
    desde = i + aguja.length;
  }
}

const RX_ID = /^(adr-\d+|prd-[a-z]+-\d+|plan-[a-z]+-\d+|spec-[a-z]+-\d+|mod-\d+.*|p\d+-\d+|[a-z]+-s\d+)$/i;

export function cargarCandidatos(raiz = "docs") {
  const base = String(raiz ?? "docs");
  const docs = [];
  for (const rel of listarDocs(base)) {
    const norm = rel.replace(/\\/g, "/");
    if (esExcluidaPorRuta(norm)) continue;
    const abs = join(base, rel);
    let texto;
    try {
      texto = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const parsed = parseFrontmatter(texto);
    if (!parsed.tiene) continue;
    const d = parsed.datos ?? {};
    const estado = comoTexto(d.estado).toLowerCase() || "propuesto";
    if (EXCLUIR_ESTADO.has(estado)) continue;
    const id = comoTexto(d.id) || comoTexto(d.item) || norm;
    const lineas = texto.split("\n");
    docs.push({
      id,
      rel: norm,
      ruta: `${base.replace(/\\/g, "/").replace(/\/+$/, "")}/${norm}`,
      tipo: comoTexto(d.tipo).toLowerCase() || "spec",
      estado,
      modulos: comoArreglo(d.modulos).map((m) => String(m).toLowerCase()),
      depende_de: comoArreglo(d.depende_de),
      reemplaza: comoArreglo(d.reemplaza),
      modifica: comoArreglo(d.modifica),
      modificado_por: comoArreglo(d.modificado_por),
      resumen: primeraLinea(comoTexto(d.resumen)),
      titulo: extraerTitulo(parsed.cuerpo),
      headings: extraerHeadings(lineas),
      cuerpo: parsed.cuerpo,
      lineas,
      texto,
    });
  }
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.rel < b.rel ? -1 : 1));
  return docs;
}

export function clasificarQuery(query, docs) {
  const q = String(query ?? "").trim();
  const qn = q.toLowerCase();
  const porId = new Map((docs ?? []).map((d) => [String(d.id).toLowerCase(), d]));
  if (porId.has(qn)) return "id";
  if (RX_ID.test(q)) return "id";
  if ((docs ?? []).some((d) => (d.modulos ?? []).includes(qn))) return "modulo";
  return "tema";
}

const RX_SECCION_CLAVE = /decisi|qu[eé] cambia|historias/i;

function rangoSeccion(doc, indice) {
  const h = doc.headings[indice];
  const siguiente = doc.headings[indice + 1];
  return {
    start: h.line,
    end: siguiente ? siguiente.line - 1 : doc.lineas.length,
    heading: h.heading,
    level: h.level,
  };
}

function textoSeccion(doc, indice) {
  const r = rangoSeccion(doc, indice);
  return doc.lineas.slice(r.start - 1, r.end).join("\n");
}

function seccionesPara(doc, qn, tipo) {
  if (doc.headings.length === 0) return [];
  if (tipo === "tema") {
    const out = [];
    for (let i = 0; i < doc.headings.length && out.length < 4; i += 1) {
      if (sinTildes(textoSeccion(doc, i).toLowerCase()).includes(sinTildes(qn))) {
        out.push(rangoSeccion(doc, i));
      }
    }
    return out;
  }
  const clave = [];
  for (let i = 0; i < doc.headings.length && clave.length < 4; i += 1) {
    if (RX_SECCION_CLAVE.test(doc.headings[i].heading)) clave.push(rangoSeccion(doc, i));
  }
  if (clave.length > 0) return clave;
  const porTermino = [];
  for (let i = 0; i < doc.headings.length && porTermino.length < 4; i += 1) {
    if (sinTildes(textoSeccion(doc, i).toLowerCase()).includes(sinTildes(qn))) {
      porTermino.push(rangoSeccion(doc, i));
    }
  }
  if (porTermino.length > 0) return porTermino;
  return [rangoSeccion(doc, 0)];
}

function rangoDecision(cand) {
  const headings = cand?.headings ?? [];
  const i = headings.findIndex((h) => /decisi/i.test(h.heading ?? ""));
  if (i < 0) return null;
  const h = headings[i];
  const sig = headings[i + 1];
  return {
    start: h.line,
    end: sig ? sig.line - 1 : (cand?.lineas ?? []).length,
    heading: h.heading,
  };
}

export function buscarContexto(query, docs) {
  const q = String(query ?? "").trim();
  const qn = q.toLowerCase();
  const lista = docs ?? [];
  const tipo = clasificarQuery(q, lista);
  const porId = new Map(lista.map((d) => [String(d.id).toLowerCase(), d]));
  const exacto = porId.get(qn) ?? null;
  const vecinos = new Set();
  if (tipo === "id" && exacto) {
    const enlaces = new Set(
      [
        ...(exacto.depende_de ?? []),
        ...(exacto.reemplaza ?? []),
        ...(exacto.modifica ?? []),
        ...(exacto.modificado_por ?? []),
      ].map((x) => String(x).toLowerCase()),
    );
    for (const d of lista) {
      const idl = String(d.id).toLowerCase();
      if (idl === qn) continue;
      if (enlaces.has(idl)) {
        vecinos.add(idl);
        continue;
      }
      const apunta = [
        ...(d.depende_de ?? []),
        ...(d.reemplaza ?? []),
        ...(d.modifica ?? []),
        ...(d.modificado_por ?? []),
      ].some((x) => String(x).toLowerCase() === qn);
      if (apunta) vecinos.add(idl);
    }
  }
  const citadasPorAdr = new Set();
  for (const d of lista) {
    if (d.tipo !== "adr") continue;
    if (d.estado !== "aceptado" && d.estado !== "hecho") continue;
    for (const dep of d.depende_de ?? []) citadasPorAdr.add(String(dep).toLowerCase());
  }
  const scored = [];
  for (const d of lista) {
    const idl = String(d.id).toLowerCase();
    let contenido = 0;
    if (tipo === "id") {
      if (idl === qn) contenido += 1000000;
      else if (vecinos.has(idl)) contenido += 500000;
    }
    if ((d.modulos ?? []).includes(qn)) contenido += 10000;
    if (qn !== "" && idl.includes(qn) && idl !== qn) contenido += 1000;
    if (qn !== "" && String(d.titulo ?? "").toLowerCase().includes(qn)) contenido += 800;
    if (qn !== "" && String(d.resumen ?? "").toLowerCase().includes(qn)) contenido += 500;
    if (qn !== "") {
      let enHeadings = 0;
      for (const h of d.headings ?? []) {
        enHeadings += contarOcurrencias(h.heading.toLowerCase(), qn);
      }
      contenido += enHeadings * 100;
      contenido += contarOcurrencias(String(d.cuerpo ?? "").toLowerCase(), qn) * 1;
    }
    if (contenido === 0) continue;
    let final = contenido;
    if (d.tipo === "adr" && (d.estado === "aceptado" || d.estado === "hecho")) final += 200;
    else if (d.estado === "aceptado" || d.estado === "hecho") final += 50;
    if (d.tipo === "prd" && citadasPorAdr.has(idl)) final += 150;
    scored.push({ doc: d, score: final });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.doc.id < b.doc.id) return -1;
    if (a.doc.id > b.doc.id) return 1;
    return a.doc.rel < b.doc.rel ? -1 : 1;
  });
  const piso = (scored[0]?.score ?? 0) * FACTOR_MIN;
  const top = scored.filter((s) => s.score >= piso).slice(0, TOPE);
  const items = top.map(({ doc: d, score }) => ({
    id: d.id,
    ruta: d.ruta,
    rel: d.rel,
    tipo: d.tipo,
    estado: d.estado,
    resumen: d.resumen,
    secciones: seccionesPara(d, qn, tipo),
    modificado_por: [...(d.modificado_por ?? [])],
    modificadores: [],
    score,
  }));
  const porItem = new Map(items.map((it) => [String(it.id).toLowerCase(), it]));
  top.forEach(({ doc: d }, idx) => {
    const mods = [];
    for (const mid of d.modificado_por ?? []) {
      const ml = String(mid).toLowerCase();
      const cand = porId.get(ml) ?? null;
      if (!cand) continue;
      let decision = null;
      const secDec = (porItem.get(ml)?.secciones ?? []).find((s) => /decisi/i.test(s.heading ?? ""));
      if (secDec) decision = { start: secDec.start, end: secDec.end, heading: secDec.heading };
      else decision = rangoDecision(cand);
      mods.push({ id: cand.id, ruta: cand.ruta, resumen: cand.resumen, decision });
    }
    items[idx].modificadores = mods;
  });
  let chars = 0;
  for (const item of items) {
    const d = lista.find((x) => x.id === item.id && x.rel === item.rel);
    if (!d) continue;
    for (const s of item.secciones) {
      chars += d.lineas.slice(s.start - 1, s.end).join("\n").length + 1;
    }
  }
  return { query: q, tipo, docs: items, total: items.length, tokensAprox: Math.ceil(chars / 4) };
}

export function formatearTexto(resultado) {
  const lineas = [];
  for (const d of resultado.docs ?? []) {
    lineas.push(`${d.id} · ${d.ruta} · ${d.estado}`);
    if (d.resumen && d.resumen.trim() !== "") lineas.push(`  ${d.resumen.trim()}`);
    for (const s of d.secciones ?? []) {
      lineas.push(`  - L${s.start}-L${s.end} ${"#".repeat(s.level)} ${s.heading}`);
    }
    for (const m of d.modificadores ?? []) {
      const res = m.resumen && m.resumen.trim() !== "" ? ` · ${m.resumen.trim()}` : "";
      lineas.push(`  ↳ modificado por ${m.id} · ${m.ruta}${res}`);
      if (m.decision) {
        lineas.push(`    - L${m.decision.start}-L${m.decision.end} ## ${m.decision.heading}`);
      }
    }
  }
  lineas.push(
    `Total: ${resultado.total} docs · ~${resultado.tokensAprox} tokens (solo rangos citados)`,
  );
  return `${lineas.join("\n")}\n`;
}
