import { medioSchema } from "./validation.js";

export type MedioVenta = (typeof medioSchema.options)[number];

export const MEDIOS_VENTA: readonly MedioVenta[] = medioSchema.options;

export const SKU_LARGO = "SKU" + "9".repeat(90);
export const NOMBRE_LARGO =
  "Producto de limpieza industrial concentrado para pisos de alto tránsito con acción antihongos y antibacterial, edición especial";
export const NOMBRE_SIN_ESPACIOS = "N" + "O".repeat(90);
export const RTL_NOMBRE = "علبة حليب مجفف طويلة الاسم • מארז מוצר ארוך במיוחד";
export const EMOJI_NOMBRE = "🍫 Caja de bombones surtidos 🥤🧴 edición limitada 🧻";
export const ERROR_API =
  '422 {"error":{"formErrors":[],"fieldErrors":{"lineas":["precio_centavos: número inválido; el máximo es 999999999"],"medio":["medio no soportado en el slice"]}}}';
export const ERROR_SYNC =
  "necesita_conexion: operación sensible que solo puede empujarse online; " +
  "se reintentará cuando vuelva la red y la cola quedó saturada";
export const MAX_CENTAVOS = 999_999_999;
export const MAX_QTY = 999;

export interface VentaWorstLinea {
  sku: string;
  nombre: string;
  qty: number;
  precioCentavos: number;
}

export interface VentaWorstPayload {
  lineas: { product_id: string; qty: number; precio_centavos: number }[];
  medio: MedioVenta;
  device_code: string;
  seq_local: number;
  client_occurred_at: string;
  offline: boolean;
}

export interface VentaWorstProvisorio {
  op_id: string;
  device_code: string;
  device_seq: number;
  payload: VentaWorstPayload;
}

export interface VentaWorstSalesResponse {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  sobreventa: boolean;
  leyenda: string | null;
  fiscal_estado: string;
  fuente: string;
  pagos: { medio: MedioVenta; monto_centavos: string; cash_movement_id: string }[];
}

export interface VentaWorstTicketShare {
  wa_me_url: string;
  enviado_central: boolean;
}

export interface VentaWorstBalance {
  por_medio: Record<string, string>;
  total: string;
  fuente: string;
}

export interface VentaWorstFixture {
  sku: string;
  nombre: string;
  qty: number;
  precioCentavos: number;
  medio: MedioVenta;
  medios: readonly MedioVenta[];
  errorApi: string;
  errorSync: string;
  balanceTexto: string;
  lineas: VentaWorstLinea[];
  cola: VentaWorstProvisorio[];
  rtlNombre: string;
  emojiNombre: string;
  salesResponse: VentaWorstSalesResponse;
  ticketShare: VentaWorstTicketShare;
  balance: VentaWorstBalance;
}

const DEVICE_CODE = "caja-recepcion-01";
const OCCURRED_AT = "2026-10-17T12:00:00.000-03:00";

function provisorio(i: number): VentaWorstProvisorio {
  const opId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  return {
    op_id: opId,
    device_code: DEVICE_CODE,
    device_seq: i,
    payload: {
      lineas: [{ product_id: SKU_LARGO, qty: MAX_QTY, precio_centavos: MAX_CENTAVOS }],
      medio: "Efectivo",
      device_code: DEVICE_CODE,
      seq_local: i,
      client_occurred_at: OCCURRED_AT,
      offline: true,
    },
  };
}

export const VENTA_WORST: VentaWorstFixture = {
  sku: SKU_LARGO,
  nombre: NOMBRE_LARGO,
  qty: MAX_QTY,
  precioCentavos: MAX_CENTAVOS,
  medio: "Transferencia",
  medios: MEDIOS_VENTA,
  errorApi: ERROR_API,
  errorSync: ERROR_SYNC,
  balanceTexto:
    "Balance: " + MEDIOS_VENTA.map((m) => `${m} ${MAX_CENTAVOS}`).join(" · ") + ` · total ${MAX_CENTAVOS}`,
  lineas: [
    { sku: SKU_LARGO, nombre: NOMBRE_LARGO, qty: MAX_QTY, precioCentavos: MAX_CENTAVOS },
    { sku: SKU_LARGO, nombre: NOMBRE_SIN_ESPACIOS, qty: MAX_QTY, precioCentavos: MAX_CENTAVOS },
    { sku: SKU_LARGO, nombre: RTL_NOMBRE, qty: MAX_QTY, precioCentavos: MAX_CENTAVOS },
    { sku: SKU_LARGO, nombre: EMOJI_NOMBRE, qty: MAX_QTY, precioCentavos: MAX_CENTAVOS },
  ],
  cola: Array.from({ length: 50 }, (_, i) => provisorio(i + 1)),
  rtlNombre: RTL_NOMBRE,
  emojiNombre: EMOJI_NOMBRE,
  salesResponse: {
    sale_id: "00000000-0000-4000-8000-000000000001",
    ticket_definitivo: "T-2026-0000001",
    ticket_provisorio: `${DEVICE_CODE}-99999999999999999999999999999999999999999999999999`,
    total_centavos: String(MAX_CENTAVOS),
    sobreventa: false,
    leyenda: null,
    fiscal_estado: "pendiente_de_sync",
    fuente: "peor",
    pagos: MEDIOS_VENTA.map((medio, i) => ({
      medio,
      monto_centavos: String(MAX_CENTAVOS),
      cash_movement_id: `mov-${i}`,
    })),
  },
  ticketShare: {
    wa_me_url: `https://wa.me/5491100000000?text=${encodeURIComponent(NOMBRE_LARGO + " " + RTL_NOMBRE)}`,
    enviado_central: false,
  },
  balance: {
    por_medio: Object.fromEntries(MEDIOS_VENTA.map((m) => [m, String(MAX_CENTAVOS)])),
    total: String(MAX_CENTAVOS),
    fuente: "peor",
  },
};

export function modoHarness(url: URL, dev: boolean): { data: "worst" | null; dir: "rtl" | "ltr" } {
  if (!dev) return { data: null, dir: "ltr" };
  const data = url.searchParams.get("data") === "worst" ? "worst" : null;
  const dir = url.searchParams.get("dir") === "rtl" ? "rtl" : "ltr";
  return { data, dir };
}
