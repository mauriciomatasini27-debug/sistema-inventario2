export type ModuloPanel =
  | "caja"
  | "stock"
  | "precios"
  | "proveedores"
  | "consumos"
  | "fiado"
  | "reportes";

export type DestinoPanel = "dashboard" | "ventas" | ModuloPanel;

// Acento ember de cada módulo (DS-S2): solo secundarias, nunca CTA primario.
export type Ember = "ambar" | "coral" | "rojo" | "vino";

export const EMBER_MODULO: Record<ModuloPanel, Ember> = {
  caja: "ambar",
  stock: "coral",
  precios: "rojo",
  proveedores: "vino",
  consumos: "ambar",
  fiado: "coral",
  reportes: "vino",
};

export interface PillPanel {
  label: string;
  href: string;
  activo: boolean;
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
  "reportes",
]);

const ETIQUETAS: Record<ModuloPanel, string> = {
  caja: "Caja",
  stock: "Stock",
  precios: "Precios",
  proveedores: "Proveedores",
  consumos: "Consumos",
  fiado: "Fiado",
  reportes: "Reportes",
};

const MODULOS: ReadonlySet<string> = new Set(Object.keys(ETIQUETAS));

const DESTINOS: ReadonlyArray<DestinoPanel> = [
  "dashboard",
  "ventas",
  "caja",
  "stock",
  "precios",
  "proveedores",
  "consumos",
  "fiado",
  "reportes",
];

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

function etiquetaDestino(id: DestinoPanel): string {
  if (id === "dashboard") return "Dashboard";
  if (id === "ventas") return "Ventas";
  return ETIQUETAS[id];
}

function hrefDestino(id: DestinoPanel): string {
  if (id === "dashboard") return "/panel";
  if (id === "ventas") return "/venta";
  return hrefModulo(id);
}

export function pillsPanel(activo?: DestinoPanel): PillPanel[] {
  return DESTINOS.map((id) => {
    const pill: PillPanel = { label: etiquetaDestino(id), href: hrefDestino(id), activo: id === activo };
    if (esModuloPanel(id)) pill.ember = emberModulo(id);
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
