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

// TB-158: la barra muestra cinco accesos. El resto vive en grupos de Más.
// El índice de plan (MODULOS_INDICE / indicePanel) no cambia: DASH-S12 sigue
// siendo la lista que el cliente filtra. Un id de Más solo lleva `indice`
// cuando ese id ya está en MODULOS_INDICE, para no ocultar de más si el
// índice falla (P1-46).
export type IdBarra = "inicio" | "productos" | "vender" | "fiado" | "mas";

export interface AccesoBarra {
  readonly id: IdBarra;
  readonly label: string;
  readonly href: string | null;
  readonly activo?: DestinoPanel;
  readonly destacado?: boolean;
}

export const BARRA_TABLERO: readonly AccesoBarra[] = Object.freeze([
  { id: "inicio", label: "Inicio", href: "/panel", activo: "dashboard" },
  { id: "productos", label: "Productos", href: "/panel/stock", activo: "stock" },
  { id: "vender", label: "Vender", href: "/venta", activo: "ventas", destacado: true },
  { id: "fiado", label: "Fiado", href: "/panel/fiado", activo: "fiado" },
  { id: "mas", label: "Más", href: null },
]);

export type IdGrupoMas = "vender" | "productos" | "caja" | "compras" | "servicios" | "reportes" | "ajustes";

export interface EntradaMas {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly grupo: IdGrupoMas;
  readonly indice?: ModuloIndice;
  readonly soloDueno?: boolean;
  // TB-164: abre el diálogo de reportes sin ruta nueva en la barra.
  readonly dialogo?: "reportes-comercio";
}

export interface GrupoMas {
  readonly id: IdGrupoMas;
  readonly label: string;
  readonly entradas: readonly EntradaMas[];
}

const ETIQUETA_GRUPO: Record<IdGrupoMas, string> = {
  vender: "Vender",
  productos: "Productos",
  caja: "Caja",
  compras: "Compras",
  servicios: "Servicios",
  reportes: "Reportes",
  ajustes: "Ajustes",
};

const ORDEN_GRUPOS: readonly IdGrupoMas[] = [
  "vender",
  "productos",
  "caja",
  "compras",
  "servicios",
  "reportes",
  "ajustes",
];

export const ENTRADAS_MAS: readonly EntradaMas[] = Object.freeze([
  {
    id: "ventas-pendientes",
    label: "Ventas pendientes",
    href: "/panel/ventas-pendientes",
    grupo: "vender",
    indice: "ventas-pendientes",
    soloDueno: true,
  },
  {
    id: "devoluciones",
    label: "Devolución",
    href: "/panel/devoluciones",
    grupo: "vender",
    indice: "devoluciones",
  },
  { id: "importar", label: "Importar stock", href: "/panel/stock/importar", grupo: "productos", indice: "stock" },
  { id: "precios", label: "Precios", href: "/panel/precios", grupo: "productos", indice: "precios" },
  { id: "alertas-umbrales", label: "Umbrales", href: "/panel/alertas/umbrales", grupo: "productos", indice: "alertas" },
  {
    id: "alertas-destinatarios",
    label: "Destinatarios",
    href: "/panel/alertas/destinatarios",
    grupo: "productos",
    indice: "alertas",
  },
  { id: "alertas-historial", label: "Historial de alertas", href: "/panel/alertas/historial", grupo: "productos" },
  { id: "caja", label: "Caja", href: "/panel/caja", grupo: "caja", indice: "caja" },
  { id: "proveedores", label: "Proveedores", href: "/panel/proveedores", grupo: "compras", indice: "proveedores" },
  { id: "consumos", label: "Consumos", href: "/panel/consumos", grupo: "servicios", indice: "consumos" },
  { id: "integraciones", label: "Gmail", href: "/panel/integraciones", grupo: "servicios", soloDueno: true },
  {
    id: "integraciones-remitentes",
    label: "Remitentes",
    href: "/panel/integraciones-remitentes",
    grupo: "servicios",
    soloDueno: true,
  },
  { id: "reportes", label: "Reportes", href: "/panel/reportes", grupo: "reportes", indice: "reportes" },
  { id: "bot", label: "Bot", href: "/panel/bot/config", grupo: "ajustes", indice: "bot" },
  { id: "bot-historial", label: "Historial del bot", href: "/panel/bot/historial", grupo: "ajustes", indice: "bot" },
  { id: "plan", label: "Plan", href: "/panel/plan", grupo: "ajustes" },
  // P1-88: Más → Ajustes → Usuarios. Sin indice: no se esconde si el plan no carga.
  { id: "usuarios", label: "Usuarios", href: "/panel/usuarios", grupo: "ajustes", soloDueno: true },
  { id: "fiscal", label: "Facturación ARCA", href: "/panel/fiscal/delegacion", grupo: "ajustes" },
  { id: "pronto", label: "Pronto", href: "/panel/pronto", grupo: "ajustes" },
  {
    id: "problemas-sugerencias",
    label: "Problemas y sugerencias",
    href: "#reportes-comercio",
    grupo: "ajustes",
    dialogo: "reportes-comercio",
  },
]);

export function gruposMasVisibles(rol: "dueno" | "empleado"): GrupoMas[] {
  const entradas = ENTRADAS_MAS.filter((e) => !e.soloDueno || rol === "dueno");
  return ORDEN_GRUPOS.map((id) => ({
    id,
    label: ETIQUETA_GRUPO[id],
    entradas: entradas.filter((e) => e.grupo === id),
  })).filter((g) => g.entradas.length > 0);
}

export function rolParaNav(efectivo: {
  estado: "sesion" | "legado" | "sin_permiso";
  rol?: "dueno" | "empleado";
  permisos?: readonly string[];
}): { rol: "dueno" | "empleado"; permisos: readonly string[] } {
  if (efectivo.estado === "sin_permiso") return { rol: "empleado", permisos: [] };
  if (efectivo.estado === "sesion" && efectivo.rol === "empleado") {
    return { rol: "empleado", permisos: efectivo.permisos ?? [] };
  }
  return { rol: "dueno", permisos: efectivo.permisos ?? [] };
}

export function puedeVerSaldoCaja(rol: "dueno" | "empleado", permisos: readonly string[]): boolean {
  return rol === "dueno" || permisos.includes("ver_saldos_caja");
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
