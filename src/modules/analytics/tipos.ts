// Núcleo puro analytics RT1-RT11 (tipos). Sin IO, sin Drizzle, sin store.
// Una DB por comercio (PRD 6.1 / ADR-0003): las tablas NO llevan tenant_id.
// Dinero siempre bigint centavos. Conteo de unidades en number int.
declare const SkuBrand: unique symbol;
export type SkuRot = string & { readonly [SkuBrand]: "SkuRot" };

export type Resultado<T, E extends string> = { ok: true; valor: T } | { ok: false; codigo: E };

export type Rol = "dueno" | "empleado";

export interface Grant {
  readonly rol: Rol;
  readonly permisos: ReadonlyArray<string>;
}

export type TipoMovVentana = "ALTA" | "VENTA" | "COMPENSATORIO";

// Movimiento ya filtrado por ventana en el adaptador (una query agg).
export interface MovimientoVentana {
  readonly sku: SkuRot;
  readonly delta: number;
  readonly tipo: TipoMovVentana;
  readonly creadoEn: Date;
  readonly eventoId: string;
}

export interface FotoCatalogo {
  readonly sku: SkuRot;
  readonly nombre: string;
  readonly categoria: string | null;
  readonly ubicacion: string | null;
  readonly costoCentavos: bigint;
  readonly precioCentavos: bigint;
  readonly excluidoDormidos: boolean;
  readonly stockActual: number;
}

export interface ParamsVentana {
  readonly desde: string; // YYYY-MM-DD America/Argentina/Buenos_Aires
  readonly hasta: string; // YYYY-MM-DD
  readonly hoy: string; // YYYY-MM-DD
  readonly ventanaCoberturaDias: 14 | 28 | 56;
}

// Fila canónica: todo RT1-RT5/RT7 sale de acá. Estable para P1
// (product_daily_stats futura alimenta el mismo tipo).
export interface FilaRotacion {
  readonly sku: SkuRot;
  readonly nombre: string;
  readonly categoria: string | null;
  readonly ubicacion: string | null;
  readonly bruto: number;
  readonly devuelto: number;
  readonly neto: number;
  readonly diasConVenta: number;
  readonly diasEfectivos: number;
  readonly diasSinVenta: number;
  readonly stockInicial: number;
  readonly stockFinal: number;
  readonly stockPromedio: number;
  readonly rotacion: number | null;
  readonly ventaDiaria: number | null;
  readonly coberturaDias: number | null;
  readonly vecesRepuesto: number;
  readonly costoCentavos: bigint;
  readonly valorizadoCentavos: bigint;
  readonly pocosDatos: boolean;
  readonly motivoPocosDatos: "DIAS_LT7" | "VENTAS_LT3" | null;
  readonly ultimaVenta: string | null; // YYYY-MM-DD
}

export interface RotationSettings {
  readonly ventanaCoberturaDias: 14 | 28 | 56;
  readonly dormidoN: number; // default 30
  readonly dormidoX: number; // default 60
  readonly coberturaReponerDias: number; // default 7
  readonly abcCorteA_bp: number; // default 8000
  readonly abcCorteB_bp: number; // default 9500
  readonly abcMinDias: number; // default 30
  readonly markupMinBp: number; // piso RT9, default 0
}

export const DEFAULT_SETTINGS: RotationSettings = {
  ventanaCoberturaDias: 28,
  dormidoN: 30,
  dormidoX: 60,
  coberturaReponerDias: 7,
  abcCorteA_bp: 8000,
  abcCorteB_bp: 9500,
  abcMinDias: 30,
  markupMinBp: 0,
};

export type OrigenSnapshot = "viernes18h" | "manual" | "export" | "offline";

export interface SnapshotRotacion {
  readonly id: string;
  readonly dedupeKey: string;
  readonly desde: string;
  readonly hasta: string;
  readonly filas: ReadonlyArray<FilaRotacion>;
  readonly creadoEn: string;
  readonly origen: OrigenSnapshot;
}
