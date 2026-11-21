// NEG-S1/S3. Catálogo cerrado ModoOps→Inventario (PRD-NEG-01, ADR-0012).
// Núcleo puro: sin IO, sin fetch, sin db. La propuesta comercial nunca nombra
// Odoo (NEG-S1); el stack real vive solo en anexo técnico/docs. El universo
// ofrecible es el catálogo validado + add-ons con precio; todo lo demás se
// rechaza (NEG-S3, AT1).

export const CATALOGO_VALIDADO = [
  "Mostrador 2 cajas",
  "Depósito Inteligente 1 almacén",
  "Ventas",
  "Compras",
  "Fiscal AR",
  "Contactos",
  "Plataforma",
] as const;

export type ModuloValidado = (typeof CATALOGO_VALIDADO)[number];

export const ADDONS = [
  { nombre: "Puente Factura Web", precio: 155 },
  { nombre: "Taller", precio: 155 },
] as const;

export type AddonNombre = (typeof ADDONS)[number]["nombre"];

const FUERA_CATALOGO_BASE = ["eCommerce", "MRP", "CRM", "B2B"] as const;

/** ¿El texto comercial menciona Odoo? Puro. NEG-S1: propuesta/marketing => false. */
export function mencionaOdoo(texto: string): boolean {
  return /\bodoo\b/i.test(texto);
}

export type ValidacionPropuesta = { ok: true } | { ok: false; fuera: string[] };

/**
 * Valida una propuesta contra el catálogo cerrado. Puro (AT1).
 * Acepta validados + add-ons declarados; rechaza todo lo demás.
 * Fiscal AR exige anexo firmado (flag explícito).
 */
export function validarPropuesta(args: {
  modulos: string[];
  addons?: string[] | undefined;
  anexoFiscalFirmado?: boolean | undefined;
}): ValidacionPropuesta {
  const addons = new Set<string>(args.addons ?? []);
  const fuera: string[] = [];
  const vistos = new Set<string>();
  for (const m of args.modulos) {
    if (vistos.has(m)) continue;
    vistos.add(m);
    if ((CATALOGO_VALIDADO as readonly string[]).includes(m)) continue;
    const addon = ADDONS.find((a) => a.nombre === m);
    if (addon && addons.has(m)) continue;
    fuera.push(m);
  }
  for (const a of addons) {
    if (!ADDONS.some((x) => x.nombre === a) && !vistos.has(a)) fuera.push(a);
  }
  if (args.modulos.includes("Fiscal AR") && args.anexoFiscalFirmado !== true) {
    if (!fuera.includes("Fiscal AR (sin anexo)")) fuera.push("Fiscal AR (sin anexo)");
  }
  // Candidatos explícitos fuera de base (NEG-S4): nunca pasan como validados.
  for (const c of FUERA_CATALOGO_BASE) {
    if (args.modulos.includes(c) && !fuera.includes(c)) fuera.push(c);
  }
  if (fuera.length > 0) return { ok: false, fuera };
  return { ok: true };
}

/** Add-ons disponibles con precio (única fuente). */
export function listarAddons(): Array<{ nombre: string; precio: number }> {
  return ADDONS.map((a) => ({ nombre: a.nombre, precio: a.precio }));
}
