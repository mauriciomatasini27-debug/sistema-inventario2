// LANE G — órdenes de pago: preparar → (el comerciante paga AFUERA) →
// `Ya pagué` → egreso en caja + pagada (OP2/OP9).
//
// Núcleo puro: sin IO, sin Drizzle, sin rutas. NO modifica cash/caja: solo
// importa sus tipos y usa registrar_movimiento para construir un descriptor
// de egreso COMPATIBLE (origen "retiro" + tipo_retiro "gasto_operativo",
// categoría y nota). Si el descriptor no pasa caja, el pago se rechaza.
//
// Flujo inviolable: nada se marca pagado sin el toque explícito
// (confirmar_pago). No hay débito automático, ni conciliación, ni otro camino
// a "pagada": preparar y confirmar son las únicas transiciones de entrada.
//
// Máquina cerrada: preparada → pagada | cancelada | vencida;
// vencida → pagada (pago fuera de término, OP2.4) | cancelada;
// pagada y cancelada son TERMINALES e inmutables. Cancelar exige motivo
// (auditoría OP13). Toda transición deja evento (línea de tiempo OP12.2).
// Los botones llevan versión: toque con versión vieja => 409 (OP7.6).
//
// Roles (mismo criterio que caja.ts sueldos/retiro_dueno): preparar puede
// cualquiera; confirmar_pago y cancelar exigen Dueño (Empleado => 403).
// supplierInvoiceId es OPACO: Lane E vive en src/modules/purchases;
// el adaptador resolverá el vínculo sin cambiar este dominio.

import { registrar_movimiento, type Movimiento, type Rol } from "../cash/caja.js";
import type { Medio } from "../../lib/validation.js";
import { contiene_secreto, dominio_permitido, es_medio, type Payee, type PayeeTipo } from "./beneficiarios.js";

export type EstadoOrden = "preparada" | "pagada" | "vencida" | "cancelada";
export type InstruccionTipo = "link" | "transferencia" | "codigo_pago" | "efectivo";
export type CategoriaEgreso = "pago_proveedores" | "sin_factura" | "alquiler" | "luz" | "gas" | "servicios" | "impuestos";
export type OrigenActor = "web" | "bot" | "sistema";

const INSTRUCCIONES: ReadonlyArray<InstruccionTipo> = ["link", "transferencia", "codigo_pago", "efectivo"];
const CATEGORIAS: ReadonlyArray<CategoriaEgreso> = [
  "pago_proveedores",
  "sin_factura",
  "alquiler",
  "luz",
  "gas",
  "servicios",
  "impuestos",
];

export const DIA_MS = 86_400_000;

function es_categoria(c: string): c is CategoriaEgreso {
  return (CATEGORIAS as ReadonlyArray<string>).includes(c);
}

export interface EventoOrden {
  readonly de: EstadoOrden | null;
  readonly a: EstadoOrden;
  readonly actor: string;
  readonly origen: OrigenActor;
  readonly motivo?: string | undefined;
  readonly atMs: number;
}

export interface PaymentOrder {
  readonly id: string;
  readonly numero: string;
  readonly payeeId: string;
  readonly tipo: PayeeTipo;
  readonly concepto: string;
  readonly montoCentavos: bigint;
  readonly venceElMs: number;
  readonly medioSugerido: Medio;
  readonly instruccion: InstruccionTipo;
  readonly linkUrl?: string | undefined;
  readonly referencia?: string | undefined;
  // Vínculos opcionales opacos (Lane E / caja C9 los resuelven en el adaptador).
  readonly supplierInvoiceId?: string | undefined;
  readonly servicioId?: string | undefined;
  readonly categoria: CategoriaEgreso;
  readonly estado: EstadoOrden;
  readonly version: number;
  readonly idempotencyKey: string;
  readonly nota?: string | undefined;
  readonly comprobanteRef?: string | undefined;
  readonly montoPagadoCentavos?: bigint | undefined;
  readonly medioPagado?: Medio | undefined;
  readonly motivoCancelacion?: string | undefined;
  readonly eventos: ReadonlyArray<EventoOrden>;
}

export type FalloOrden =
  | { readonly ok: false; readonly codigo: "YA_VISTA"; readonly status: 409; readonly original: PaymentOrder }
  | { readonly ok: false; readonly codigo: "VERSION_DESACTUALIZADA"; readonly status: 409; readonly actual: PaymentOrder }
  | { readonly ok: false; readonly codigo: "SOLO_DUENO"; readonly status: 403; readonly error: string }
  | {
      readonly ok: false;
      readonly codigo:
        | "DATO_INVALIDO"
        | "CREDENCIAL_DETECTADA"
        | "LINK_NO_OFICIAL"
        | "TRANSICION_INVALIDA"
        | "MOTIVO_REQUERIDO"
        | "NOTA_REQUERIDA"
        | "EGRESO_INVALIDO";
      readonly status: 422;
      readonly error: string;
    };

export interface PrepararInput {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly numero: string;
  readonly payeeId: string;
  readonly payees: ReadonlyMap<string, Payee>;
  readonly concepto: string;
  readonly montoCentavos: bigint;
  readonly venceElMs: number;
  readonly medioSugerido: Medio;
  readonly instruccion: InstruccionTipo;
  readonly linkUrl?: string | undefined;
  readonly referencia?: string | undefined;
  readonly supplierInvoiceId?: string | undefined;
  readonly servicioId?: string | undefined;
  readonly categoria?: CategoriaEgreso | undefined;
  readonly nota?: string | undefined;
  readonly creadoPor: string;
  readonly origen: OrigenActor;
  readonly ahoraMs: number;
  // El dominio registra el visto (igual que confirmar_venta): el doble toque
  // con la misma key devuelve 409 sin duplicar, sin depender del adaptador.
  readonly vistos: Map<string, PaymentOrder>;
}

export type PrepararResult = { readonly ok: true; readonly orden: PaymentOrder } | FalloOrden;

function fallo422(
  codigo: Extract<FalloOrden, { status: 422 }>["codigo"],
  error: string,
): FalloOrden {
  return { ok: false, codigo, status: 422, error };
}

// OP7: el bot arma la orden con link oficial o datos de transferencia. La
// plata NUNCA se mueve acá: el comerciante paga afuera, en su propia app.
export function preparar_orden(input: PrepararInput): PrepararResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTA", status: 409, original: visto };
  for (const texto of [input.concepto, input.referencia ?? "", input.nota ?? ""]) {
    if (texto !== "" && contiene_secreto(texto)) {
      return fallo422(
        "CREDENCIAL_DETECTADA",
        "el texto parece contener una credencial; el sistema nunca pide ni guarda claves",
      );
    }
  }
  if (input.id === "" || !/^OP-\d+$/.test(input.numero)) {
    return fallo422("DATO_INVALIDO", "número de orden inválido (formato OP-NNNN)");
  }
  const payee = input.payees.get(input.payeeId);
  if (!payee || !payee.activo) return fallo422("DATO_INVALIDO", "beneficiario inexistente o inactivo");
  const concepto = input.concepto.trim();
  if (concepto === "" || concepto.length > 140) return fallo422("DATO_INVALIDO", "concepto inválido");
  if (input.montoCentavos <= 0n) return fallo422("DATO_INVALIDO", "monto debe ser positivo");
  if (!Number.isFinite(input.venceElMs) || input.venceElMs <= 0) {
    return fallo422("DATO_INVALIDO", "vencimiento inválido");
  }
  if (!es_medio(input.medioSugerido)) return fallo422("DATO_INVALIDO", "medio sugerido inválido");
  if (!INSTRUCCIONES.includes(input.instruccion)) return fallo422("DATO_INVALIDO", "instrucción inválida");
  if (input.referencia !== undefined && (input.referencia.trim() === "" || input.referencia.length > 64)) {
    return fallo422("DATO_INVALIDO", "referencia inválida");
  }
  for (const opaco of [input.supplierInvoiceId, input.servicioId]) {
    if (opaco !== undefined && (opaco === "" || opaco.length > 128)) {
      return fallo422("DATO_INVALIDO", "vínculo inválido");
    }
  }
  if (input.nota !== undefined && input.nota.length > 280) return fallo422("DATO_INVALIDO", "nota muy larga");
  const categoria = input.categoria ?? "pago_proveedores";
  if (!es_categoria(categoria)) return fallo422("DATO_INVALIDO", "categoría inválida");
  // OP8.5: link fuera de la allowlist => 422, se ofrece transferencia de la ficha.
  if (input.instruccion === "link" && (input.linkUrl === undefined || !dominio_permitido(input.linkUrl))) {
    return fallo422("LINK_NO_OFICIAL", "ese link no es de un sitio oficial conocido; por seguridad no se envía");
  }
  if (input.linkUrl !== undefined && !dominio_permitido(input.linkUrl)) {
    return fallo422("LINK_NO_OFICIAL", "ese link no es de un sitio oficial conocido; por seguridad no se envía");
  }
  const orden: PaymentOrder = {
    id: input.id,
    numero: input.numero,
    payeeId: input.payeeId,
    tipo: payee.tipo,
    concepto,
    montoCentavos: input.montoCentavos,
    venceElMs: input.venceElMs,
    medioSugerido: input.medioSugerido,
    instruccion: input.instruccion,
    ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
    ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
    ...(input.supplierInvoiceId !== undefined ? { supplierInvoiceId: input.supplierInvoiceId } : {}),
    ...(input.servicioId !== undefined ? { servicioId: input.servicioId } : {}),
    categoria,
    estado: "preparada",
    version: 1,
    idempotencyKey: input.idempotencyKey,
    ...(input.nota !== undefined ? { nota: input.nota } : {}),
    eventos: [{ de: null, a: "preparada", actor: input.creadoPor, origen: input.origen, atMs: input.ahoraMs }],
  };
  input.vistos.set(input.idempotencyKey, orden);
  return { ok: true, orden };
}

export interface PagoConfirmado {
  readonly orden: PaymentOrder;
  readonly egreso: Movimiento;
}

export interface ConfirmarPagoInput {
  readonly idempotencyKey: string;
  readonly orden: PaymentOrder;
  readonly versionEsperada: number;
  readonly montoPagadoCentavos?: bigint | undefined;
  readonly medio: Medio;
  readonly nota?: string | undefined;
  readonly comprobanteRef?: string | undefined;
  readonly rol: Rol;
  readonly actor: string;
  readonly origen: OrigenActor;
  readonly ahoraMs: number;
  readonly vistosPagos: Map<string, PagoConfirmado>;
}

export type ConfirmarPagoResult = { readonly ok: true; readonly efecto: PagoConfirmado } | FalloOrden;

// OP9.1 `Ya pagué`: toque explícito con monto/medio precargados y editables,
// comprobante opcional. Registra el egreso en caja (manual) en el mismo
// efecto y marca la orden pagada. Doble toque con misma key => 409 original.
export function confirmar_pago(input: ConfirmarPagoInput): ConfirmarPagoResult {
  const visto = input.vistosPagos.get(input.idempotencyKey);
  if (visto) {
    const original: PaymentOrder = visto.orden;
    return { ok: false, codigo: "YA_VISTA", status: 409, original };
  }
  if (input.orden.estado === "pagada" || input.orden.estado === "cancelada") {
    return fallo422("TRANSICION_INVALIDA", `orden ${input.orden.estado}: estado terminal, no se puede pagar`);
  }
  if (input.orden.version !== input.versionEsperada) {
    return { ok: false, codigo: "VERSION_DESACTUALIZADA", status: 409, actual: input.orden };
  }
  // Mismo criterio que caja.ts (sueldos/retiro_dueno): Empleado limitado.
  if (input.rol !== "dueno") {
    return { ok: false, codigo: "SOLO_DUENO", status: 403, error: "confirmar pagos solo dueno" };
  }
  const monto = input.montoPagadoCentavos ?? input.orden.montoCentavos;
  if (monto <= 0n) return fallo422("DATO_INVALIDO", "monto pagado debe ser positivo");
  if (!es_medio(input.medio)) return fallo422("DATO_INVALIDO", "medio inválido");
  for (const texto of [input.nota ?? "", input.comprobanteRef ?? ""]) {
    if (texto !== "" && contiene_secreto(texto)) {
      return fallo422(
        "CREDENCIAL_DETECTADA",
        "el texto parece contener una credencial; el sistema nunca pide ni guarda claves",
      );
    }
  }
  // OP9.9: gasto "Sin factura" exige nota que aclare qué fue el gasto.
  const nota = input.nota ?? input.orden.nota;
  if (input.orden.categoria === "sin_factura" && (nota === undefined || nota.trim() === "")) {
    return fallo422("NOTA_REQUERIDA", "sin factura: contame en una línea qué fue este gasto");
  }
  if (nota !== undefined && (nota.length > 280 || (input.orden.categoria === "sin_factura" && nota.trim() === ""))) {
    return fallo422("DATO_INVALIDO", "nota inválida");
  }
  if (input.comprobanteRef !== undefined && (input.comprobanteRef === "" || input.comprobanteRef.length > 512)) {
    return fallo422("DATO_INVALIDO", "comprobante inválido");
  }
  // Descriptor de egreso compatible con caja.ts (NO se modifica caja.ts):
  // egreso manual, origen retiro + gasto_operativo, misma categoría y nota.
  let egreso: Movimiento;
  try {
    egreso = registrar_movimiento({
      tipo: "egreso",
      metodo: input.medio,
      monto_centavos: monto,
      origen: "retiro",
      categoria_id: input.orden.categoria,
      ...(nota !== undefined ? { nota } : { nota: `Orden ${input.orden.numero} — ${input.orden.concepto}`.slice(0, 280) }),
      rol: input.rol,
      tipo_retiro: "gasto_operativo",
    });
  } catch {
    return fallo422("EGRESO_INVALIDO", "el egreso no pasa la validación de caja");
  }
  const orden: PaymentOrder = {
    ...input.orden,
    estado: "pagada",
    version: input.orden.version + 1,
    montoPagadoCentavos: monto,
    medioPagado: input.medio,
    ...(nota !== undefined ? { nota } : {}),
    ...(input.comprobanteRef !== undefined ? { comprobanteRef: input.comprobanteRef } : {}),
    eventos: [
      ...input.orden.eventos,
      { de: input.orden.estado, a: "pagada", actor: input.actor, origen: input.origen, atMs: input.ahoraMs },
    ],
  };
  const pago: PagoConfirmado = { orden, egreso };
  input.vistosPagos.set(input.idempotencyKey, pago);
  return { ok: true, efecto: pago };
}

export interface CancelarInput {
  readonly orden: PaymentOrder;
  readonly versionEsperada: number;
  readonly motivo: string;
  readonly rol: Rol;
  readonly actor: string;
  readonly origen: OrigenActor;
  readonly ahoraMs: number;
}

export type CancelarResult = { readonly ok: true; readonly orden: PaymentOrder } | FalloOrden;

// OP2/OP13: cancelación auditada con motivo obligatorio (valor anterior y
// nuevo quedan en eventos). Terminal: no se puede cancelar pagada/cancelada.
export function cancelar_orden(input: CancelarInput): CancelarResult {
  if (input.orden.estado === "pagada" || input.orden.estado === "cancelada") {
    return fallo422("TRANSICION_INVALIDA", `orden ${input.orden.estado}: estado terminal, inmutable`);
  }
  if (input.orden.version !== input.versionEsperada) {
    return { ok: false, codigo: "VERSION_DESACTUALIZADA", status: 409, actual: input.orden };
  }
  if (input.rol !== "dueno") {
    return { ok: false, codigo: "SOLO_DUENO", status: 403, error: "cancelar órdenes solo dueno" };
  }
  const motivo = input.motivo.trim();
  if (motivo === "" || motivo.length > 280) {
    return fallo422("MOTIVO_REQUERIDO", "cancelar exige motivo (auditoría)");
  }
  return {
    ok: true,
    orden: {
      ...input.orden,
      estado: "cancelada",
      version: input.orden.version + 1,
      motivoCancelacion: motivo,
      eventos: [
        ...input.orden.eventos,
        { de: input.orden.estado, a: "cancelada", actor: input.actor, origen: input.origen, motivo, atMs: input.ahoraMs },
      ],
    },
  };
}

// OP2.4/OP11: paso a vencida como función PURA determinista (misma entrada,
// misma salida; no muta el array ni las órdenes). Vencida si venceElMs quedó
// antes del inicio del día de hoyMs. La marca el job diario; pagar fuera de
// término sigue permitido (vencida → pagada).
export function marcar_vencidas(
  ordenes: ReadonlyArray<PaymentOrder>,
  hoyMs: number,
  actor = "sistema",
): { readonly actualizadas: ReadonlyArray<PaymentOrder>; readonly vencidasIds: ReadonlyArray<string> } {
  const inicioHoy = hoyMs - (hoyMs % DIA_MS);
  const actualizadas: PaymentOrder[] = [];
  const vencidasIds: string[] = [];
  for (const o of ordenes) {
    if (o.estado === "preparada" && o.venceElMs < inicioHoy) {
      actualizadas.push({
        ...o,
        estado: "vencida",
        version: o.version + 1,
        eventos: [...o.eventos, { de: "preparada", a: "vencida", actor, origen: "sistema", atMs: hoyMs }],
      });
      vencidasIds.push(o.id);
    } else {
      actualizadas.push(o);
    }
  }
  return { actualizadas, vencidasIds };
}

// OP11/OP12.2 (vista "Vencidas"/"Esta semana"): preparadas que vencen dentro
// de la ventana [hoy, hoy + ventanaDias], ordenadas por vencimiento. Pura.
export function proximas_a_vencer(
  ordenes: ReadonlyArray<PaymentOrder>,
  hoyMs: number,
  ventanaDias: number,
): ReadonlyArray<PaymentOrder> {
  const inicioHoy = hoyMs - (hoyMs % DIA_MS);
  const limite = inicioHoy + ventanaDias * DIA_MS;
  return ordenes
    .filter((o) => o.estado === "preparada" && o.venceElMs >= inicioHoy && o.venceElMs <= limite)
    .slice()
    .sort((a, b) => a.venceElMs - b.venceElMs);
}
