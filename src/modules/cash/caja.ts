import type { Medio } from "../../lib/validation.js";

export type TipoMov = "ingreso" | "egreso";
export type OrigenMov =
  | "venta"
  | "retiro"
  | "sueldo"
  | "devolucion"
  | "cobro_fiado";
export type Rol = "dueno" | "empleado";

export type TipoRetiro = "retiro_dueno" | "retiro_caja" | "gasto_operativo";

export interface MovimientoInput {
  tipo: TipoMov;
  metodo: Medio;
  monto_centavos: bigint;
  origen: OrigenMov;
  categoria_id: string;
  nota?: string;
  rol?: Rol;
  tipo_retiro?: TipoRetiro;
  empleado?: string;
  periodo?: string;
}

export interface Movimiento {
  tipo: TipoMov;
  metodo: Medio;
  monto_centavos: bigint;
  origen: OrigenMov;
  tipo_retiro?: TipoRetiro | undefined;
}

export function registrar_movimiento(input: MovimientoInput): Movimiento {
  if (input.monto_centavos <= 0n) throw new Error("monto debe ser positivo");
  if (!input.categoria_id) throw new Error("categoria requerida");
  if (input.origen === "retiro") {
    const tipoEfectivo: TipoRetiro =
      input.tipo_retiro ?? (input.categoria_id === "retiro_dueno" ? "retiro_dueno" : "retiro_caja");
    if (tipoEfectivo === "retiro_dueno" && input.rol === "empleado") {
      throw new Error("empleado no puede retiro_dueno");
    }
  }
  if (input.origen === "sueldo" && input.rol === "empleado") {
    throw new Error("sueldos solo dueno");
  }
  return {
    tipo: input.tipo,
    metodo: input.metodo,
    monto_centavos: input.monto_centavos,
    origen: input.origen,
    ...(input.tipo_retiro !== undefined ? { tipo_retiro: input.tipo_retiro } : {}),
  };
}

export function puede_registrar(input: Pick<MovimientoInput, "origen" | "categoria_id" | "rol" | "tipo_retiro">): boolean {
  if (input.origen === "sueldo" && input.rol === "empleado") return false;
  if (input.origen === "retiro") {
    const tipoEfectivo: TipoRetiro =
      input.tipo_retiro ?? (input.categoria_id === "retiro_dueno" ? "retiro_dueno" : "retiro_caja");
    if (tipoEfectivo === "retiro_dueno" && input.rol === "empleado") return false;
  }
  return true;
}

export interface Balance {
  porMedio: Record<Medio, bigint>;
  total: bigint;
}

const MEDIOS: Medio[] = ["Efectivo", "Debito", "Mercado Pago", "QR", "Transferencia"];

export function derivar_balance(movs: Movimiento[]): Balance {
  const porMedio = Object.fromEntries(MEDIOS.map((m) => [m, 0n])) as Record<Medio, bigint>;
  let total = 0n;
  for (const m of movs) {
    const signo = m.tipo === "ingreso" ? 1n : -1n;
    porMedio[m.metodo] += signo * m.monto_centavos;
    total += signo * m.monto_centavos;
  }
  return { porMedio, total };
}
