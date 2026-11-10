import type { Feature } from "../modules/planes/catalogo.js";

export type ModuloPanel =
  | "caja"
  | "stock"
  | "precios"
  | "proveedores"
  | "consumos"
  | "fiado"
  | "devoluciones"
  | "reportes";

export type DestinoPanel = "dashboard" | "ventas" | ModuloPanel | "ventas-pendientes";

export type ModuloIndice = DestinoPanel | "bot" | "alertas" | "asistente";

export type RequisitoIndice =
  | { readonly tipo: "siempre" }
  | { readonly tipo: "feature"; readonly feature: Feature }
  | { readonly tipo: "alguna"; readonly features: ReadonlyArray<Feature> };

export type FeaturesPlan = Partial<Record<Feature, boolean>>;

export interface EntradaIndice {
  readonly id: ModuloIndice;
  readonly label: string;
  readonly href: string;
  readonly ember: Ember | null;
  readonly enPills: boolean;
  readonly requisito: RequisitoIndice;
  readonly soloDueno?: boolean;
}

export interface ModuloVisible {
  readonly id: ModuloIndice;
  readonly label: string;
  readonly href: string;
}

// Acento ember de cada módulo (DS-S2): solo secundarias, nunca CTA primario.
export type Ember = "ambar" | "coral" | "rojo" | "vino";

export const EMBER_MODULO: Record<ModuloPanel, Ember> = {
  caja: "ambar",
  stock: "coral",
  precios: "rojo",
  proveedores: "vino",
  consumos: "ambar",
  fiado: "coral",
  devoluciones: "ambar",
  reportes: "vino",
};

export interface PillPanel {
  label: string;
  href: string;
  activo: boolean;
  id: ModuloIndice;
  ember?: Ember;
}

export type EstadoWidget = "cargando" | "error" | "vacio" | "listo";

const CON_PANTALLA: ReadonlySet<ModuloPanel> = new Set([
  "caja",
  "stock",
  "precios",
  "proveedores",
  "consumos",
  "fiado",
  "devoluciones",
  "reportes",
]);

const ETIQUETAS: Record<ModuloPanel, string> = {
  caja: "Caja",
  stock: "Stock",
  precios: "Precios",
  proveedores: "Proveedores",
  consumos: "Consumos",
  fiado: "Fiado",
  devoluciones: "Devolución",
  reportes: "Reportes",
};

const MODULOS: ReadonlySet<string> = new Set(Object.keys(ETIQUETAS));

export function tienePantalla(id: ModuloPanel): boolean {
  return CON_PANTALLA.has(id);
}

export function hrefModulo(id: ModuloPanel): string {
  return tienePantalla(id) ? `/panel/${id}` : `/panel/pronto?m=${id}`;
}

export function esModuloPanel(valor: unknown): valor is ModuloPanel {
  return typeof valor === "string" && MODULOS.has(valor);
}

export function etiquetaModulo(id: ModuloPanel): string {
  return ETIQUETAS[id];
}

export function emberModulo(id: ModuloPanel): Ember {
  return EMBER_MODULO[id];
}

export const MODULOS_INDICE: ReadonlyArray<EntradaIndice> = Object.freeze([
  { id: "dashboard", label: "Dashboard", href: "/panel", ember: null, enPills: true, requisito: { tipo: "siempre" } },
  { id: "ventas", label: "Ventas", href: "/venta", ember: null, enPills: true, requisito: { tipo: "siempre" } },
  // P1-63: al lado de Ventas. El origen devolucion de caja sigue siendo un egreso manual.
  { id: "devoluciones", label: "Devolución", href: hrefModulo("devoluciones"), ember: emberModulo("devoluciones"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "caja", label: "Caja", href: hrefModulo("caja"), ember: emberModulo("caja"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "stock", label: "Stock", href: hrefModulo("stock"), ember: emberModulo("stock"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "precios", label: "Precios", href: hrefModulo("precios"), ember: emberModulo("precios"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "proveedores", label: "Proveedores", href: hrefModulo("proveedores"), ember: emberModulo("proveedores"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "consumos", label: "Consumos", href: hrefModulo("consumos"), ember: emberModulo("consumos"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "fiado", label: "Fiado", href: hrefModulo("fiado"), ember: emberModulo("fiado"), enPills: true, requisito: { tipo: "siempre" } },
  { id: "reportes", label: "Reportes", href: hrefModulo("reportes"), ember: emberModulo("reportes"), enPills: true, requisito: { tipo: "siempre" } },
  {
    id: "ventas-pendientes",
    label: "Ventas pendientes",
    href: "/panel/ventas-pendientes",
    ember: "rojo",
    enPills: false,
    requisito: { tipo: "siempre" },
    soloDueno: true,
  },
  {
    id: "bot",
    label: "Bot",
    href: "/panel/bot/config",
    ember: "ambar",
    enPills: true,
    requisito: { tipo: "feature", feature: "bot_consulta" },
  },
  {
    id: "alertas",
    label: "Alertas",
    href: "/panel/alertas/umbrales",
    ember: "rojo",
    enPills: true,
    requisito: { tipo: "alguna", features: ["alertas_email", "alertas_whatsapp"] },
  },
  {
    id: "asistente",
    label: "Asistente",
    href: "#asistente",
    ember: null,
    enPills: false,
    requisito: { tipo: "feature", feature: "asistente_ia" },
  },
]);

export function moduloIndice(id: ModuloIndice): EntradaIndice {
  const entrada = MODULOS_INDICE.find((m) => m.id === id);
  if (!entrada) throw new Error(`módulo de índice desconocido: ${id}`);
  return entrada;
}

export function cumpleRequisito(requisito: RequisitoIndice, features: FeaturesPlan): boolean {
  if (requisito.tipo === "siempre") return true;
  if (requisito.tipo === "feature") return features[requisito.feature] === true;
  return requisito.features.some((f) => features[f] === true);
}

export function indicePanel(
  features: FeaturesPlan = {},
  rol?: "dueno" | "empleado",
): ModuloVisible[] {
  return MODULOS_INDICE.filter(
    (m) => cumpleRequisito(m.requisito, features) && (!m.soloDueno || rol === "dueno"),
  ).map(({ id, label, href }) => ({
    id,
    label,
    href,
  }));
}

export function featuresDelIndice(): Feature[] {
  const features = new Set<Feature>();
  for (const { requisito } of MODULOS_INDICE) {
    if (requisito.tipo === "feature") features.add(requisito.feature);
    else if (requisito.tipo === "alguna") for (const f of requisito.features) features.add(f);
  }
  return [...features];
}

export function pillsPanel(activo?: DestinoPanel): PillPanel[] {
  return MODULOS_INDICE.filter((m) => m.enPills).map((m) => {
    const pill: PillPanel = { id: m.id, label: m.label, href: m.href, activo: m.id === activo };
    if (m.ember !== null) pill.ember = m.ember;
    return pill;
  });
}

export function setTexto(id: string, texto: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

export function formatearCentavos(centavos: number | bigint | string): string {
  const numero = Number(centavos);
  const valor = Number.isFinite(numero) ? numero : 0;
  const signo = valor < 0 ? "-" : "";
  return `${signo}$${(Math.abs(valor) / 100).toFixed(2)}`;
}

export function textoVentasPendientes(n: number): string {
  if (!Number.isInteger(n) || n < 0) return "";
  if (n === 0) return "Sin ventas pendientes";
  if (n === 1) return "1 venta pendiente de revisar";
  return `${n} ventas pendientes de revisar`;
}

export function montoParaInput(centavos: number | bigint | string | null): string {
  if (centavos === null) return "";
  const numero = Number(centavos);
  if (!Number.isFinite(numero)) return "";
  return (numero / 100).toFixed(2).replace(".", ",");
}

export function derivarEstado({ cargando, error, items }: { cargando: boolean; error: boolean; items: number }): EstadoWidget {
  if (cargando) return "cargando";
  if (error) return "error";
  return items > 0 ? "listo" : "vacio";
}

// Las APIs devuelven `error` como texto o como zod flatten(); nunca mostrar "[object Object]".
export function textoError(error: unknown, status: number): string {
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const e = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    const campos = Object.keys(e.fieldErrors ?? {});
    if (campos.length > 0) return "revisá " + campos.join(", ");
    if (Array.isArray(e.formErrors) && e.formErrors.length > 0) return String(e.formErrors[0]);
  }
  return "error " + status;
}
