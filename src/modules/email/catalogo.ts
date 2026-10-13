// Núcleo puro NE1: catálogo cerrado de notificaciones, canal fijo.
// Sin IO. El dueño no elige canal; cada tipo expone su canal como texto.

export type TipoEmail =
  | "stock_bajo"
  | "resumen_viernes"
  | "resumen_cierre"
  | "ventas_diaria"
  | "vencimientos"
  | "sistema_operacion"
  | "seguridad"
  | "cuenta"
  | "diferencia_turno"
  | "entrega_disputa"
  | "ajuste_conteo"
  | "fiado"
  | "lote_vencer"
  | "promo_vencer";

export type CanalEmail = "wa+email" | "email";

export type FrecuenciaEmail = "instantanea" | "diaria" | "semanal";

export interface DefTipo {
  readonly tipo: TipoEmail;
  readonly canal: CanalEmail;
  readonly frecuencias: readonly FrecuenciaEmail[];
  readonly porDefecto: boolean;
  readonly frecuenciaDefecto: FrecuenciaEmail;
  readonly desactivable: boolean;
  readonly ignoraSilencio: boolean;
  readonly ignoraPausa: boolean;
  readonly permiteWAopcional: boolean;
}

// NE1.1: tres clave por WA+email. NE1.2: resto solo email.
// NE7.4: seguridad y cuenta no desactivables. NE7.5: seguridad ignora
// silencio y pausa; cuenta respeta silencio (salvo paso a solo lectura,
// que el orquestador fuerza por fuera).
export const CATALOGO: Record<TipoEmail, DefTipo> = {
  stock_bajo: {
    tipo: "stock_bajo",
    canal: "wa+email",
    frecuencias: ["instantanea", "diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  resumen_viernes: {
    tipo: "resumen_viernes",
    canal: "wa+email",
    frecuencias: ["semanal"],
    porDefecto: true,
    frecuenciaDefecto: "semanal",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  resumen_cierre: {
    tipo: "resumen_cierre",
    canal: "wa+email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  ventas_diaria: {
    tipo: "ventas_diaria",
    canal: "email",
    frecuencias: ["diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  vencimientos: {
    tipo: "vencimientos",
    canal: "email",
    frecuencias: ["instantanea", "diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  sistema_operacion: {
    tipo: "sistema_operacion",
    canal: "email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  seguridad: {
    tipo: "seguridad",
    canal: "email",
    frecuencias: ["instantanea"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: false,
    ignoraSilencio: true,
    ignoraPausa: true,
    permiteWAopcional: false,
  },
  cuenta: {
    tipo: "cuenta",
    canal: "email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: false,
    ignoraSilencio: false,
    ignoraPausa: true,
    permiteWAopcional: false,
  },
  diferencia_turno: {
    tipo: "diferencia_turno",
    canal: "email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: true,
  },
  entrega_disputa: {
    tipo: "entrega_disputa",
    canal: "email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: true,
  },
  ajuste_conteo: {
    tipo: "ajuste_conteo",
    canal: "email",
    frecuencias: ["instantanea", "diaria"],
    porDefecto: true,
    frecuenciaDefecto: "instantanea",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: true,
  },
  fiado: {
    tipo: "fiado",
    canal: "email",
    frecuencias: ["diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: true,
  },
  lote_vencer: {
    tipo: "lote_vencer",
    canal: "email",
    frecuencias: ["diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: false,
  },
  promo_vencer: {
    tipo: "promo_vencer",
    canal: "email",
    frecuencias: ["diaria", "semanal"],
    porDefecto: true,
    frecuenciaDefecto: "diaria",
    desactivable: true,
    ignoraSilencio: false,
    ignoraPausa: false,
    permiteWAopcional: true,
  },
};

export function canal_para(tipo: TipoEmail): CanalEmail {
  return CATALOGO[tipo].canal;
}

export function es_desactivable(tipo: TipoEmail): boolean {
  return CATALOGO[tipo].desactivable;
}

// Texto fijo para la UI; no hay selector de canal (NE1, NE9.1).
export function canal_texto(tipo: TipoEmail): string {
  return CATALOGO[tipo].canal === "wa+email" ? "Por WhatsApp y email" : "Por email";
}
