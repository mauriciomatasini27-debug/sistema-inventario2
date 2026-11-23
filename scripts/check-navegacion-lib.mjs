// Helpers puros de `check:navegacion` (AUD-S6). Sin red ni base: lo que se puede
// probar sin levantar la app vive acá, y el runner queda fino.
import { createHash } from "node:crypto";

// Peso fijo de la RG 5616 para el dígito verificador del CUIT.
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function digitoCuit(cuerpo) {
  const digitos = String(cuerpo).replace(/\D/g, "");
  if (digitos.length !== 10) return null;
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(digitos[i]) * PESOS_CUIT[i];
  const resto = suma % 11;
  if (resto === 0) return 0;
  if (resto === 1) return 9;
  return 11 - resto;
}

export function cuitConDigito(cuerpo) {
  const d = digitoCuit(cuerpo);
  if (d === null) return null;
  return `${String(cuerpo).replace(/\D/g, "")}${d}`;
}

// CUIT único por corrida sin tocar el estado de corridas anteriores: 10 dígitos
// derivados del reloj y del hash del prefijo, y el dígito verificador real.
export function cuitDeCorrida(ahora = Date.now(), prefijo = "") {
  const hash = createHash("sha256").update(`${prefijo}:${ahora}`).digest();
  const digitos = `${30}${String(ahora).slice(-8)}`;
  const ajustado = `${digitos.slice(0, 9)}${String((hash[0] ?? 0) % 10)}`;
  return cuitConDigito(ajustado);
}

export function leerH1(html) {
  const m = String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return m[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function leerTitulo(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

// La API de productos responde camel (`precioCentavos`) en memoria y snake en
// otros caminos; el checklist no debe romperse por eso.
export function precioDeProducto(producto) {
  const p = producto ?? {};
  const valor = p.precioCentavos ?? p.precio_centavos;
  return typeof valor === "string" ? Number(valor) : valor;
}

export function skuDeProducto(producto) {
  const p = producto ?? {};
  return p.sku ?? null;
}

export function productoDeLista(cuerpo, sku) {
  const lista = cuerpo?.productos ?? [];
  return lista.find((p) => String(p.sku).toUpperCase() === String(sku).toUpperCase()) ?? null;
}

export function itemDeLista(cuerpo, clave, valor) {
  const lista = cuerpo?.items ?? [];
  return lista.find((i) => String(i[clave]) === String(valor)) ?? null;
}

export function fechaLocal(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function slugSeguro(nombre) {
  return (
    String(nombre)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pantalla"
  );
}

// Un paso queda ok si el status observado está entre los esperados. Los
// hallazgos conocidos se marcan aparte: el checklist los reporta y siguen
// contando como falla hasta que se cierren.
export function pasoOk(esperados, status) {
  return (Array.isArray(esperados) ? esperados : [esperados]).includes(status);
}

// El rechazo de cantidad del contrato llega como fieldErrors.lineas/qty
// ("Poné un entero entre 1 y 999"); un rechazo de dominio llega como `error`
// string ("stock insuficiente", "linea invalida"). El checklist los distingue
// para no confundir "la pantalla no puede mandar el peso" con "no hay stock".
export function mensajeDeError(cuerpo) {
  const error = cuerpo?.error;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return null;
  const campos = error.fieldErrors ?? {};
  const partes = Object.entries(campos).flatMap(([campo, lista]) => (lista ?? []).map((v) => `${campo}: ${v}`));
  return partes.length > 0 ? partes.join(" · ") : null;
}

export function resumir(resultados) {
  const pantallas = resultados.length;
  let pasos = 0;
  let pasosOk = 0;
  const hallazgos = [];
  const fallas = [];
  for (const pantalla of resultados) {
    for (const paso of pantalla.pasos ?? []) {
      pasos += 1;
      if (paso.ok) pasosOk += 1;
      if (!paso.ok) {
        const destino = paso.codigo ? hallazgos : fallas;
        destino.push({ pantalla: pantalla.id, paso: paso.nombre, detalle: paso.detalle, codigo: paso.codigo, issue: paso.issue });
      }
    }
  }
  return { pantallas, pasos, pasosOk, pasosFallidos: pasos - pasosOk, hallazgos, fallas };
}

export function tablaMarkdown(resumen) {
  const filas = [
    "| Pantalla | Pasos | OK | Fallas |",
    "|---|---|---|---|",
    ...(resumen.pantallasDetalle ?? []).map(
      (p) => `| ${p.id} | ${p.pasos} | ${p.ok} | ${p.pasos - p.ok} |`,
    ),
  ];
  return filas.join("\n");
}
