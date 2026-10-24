// LANE planes — ProveedorCobro (PRD-PLAN-01 PLAN-S13, solo interfaz + fake).
//
// NINGÚN proveedor real: sin llamadas de red, sin credenciales, sin DB.
// El adaptador manual (transferencia, alta en panel admin) y Mercado Pago
// quedan pendientes de decisión; este fake en memoria sostiene los tests y
// el cableado hasta que exista la migración de subscriptions.

import { planDe, type Catalogo, type PlanId } from "./catalogo.js";

const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";

export type ResultadoPreaprobacionMp =
  | { readonly ok: true; readonly modo: "simulado"; readonly preapprovalId: string }
  | { readonly ok: true; readonly modo: "mercadopago"; readonly preapprovalId: string }
  | { readonly ok: false; readonly motivo: "sin_credenciales" | "red" | "http" };

// COBRO-EJEMPLO: con catálogo/plan en modo ejemplo no se llama a Mercado Pago.
export async function crearPreaprobacionMercadoPago(args: {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly catalogo: Catalogo;
  readonly accessToken?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ResultadoPreaprobacionMp> {
  if (!args.tenantId) throw new Error("tenantId requerido");
  const plan = planDe(args.catalogo, args.planId);
  if (plan.ejemplo) {
    return {
      ok: true,
      modo: "simulado",
      preapprovalId: `sim-${args.tenantId.slice(0, 8)}-${args.planId}`,
    };
  }
  const token = args.accessToken ?? process.env.MP_ACCESS_TOKEN ?? "";
  if (!token) return { ok: false, motivo: "sin_credenciales" };
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(MP_PREAPPROVAL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ reason: `plan ${args.planId}`, external_reference: args.tenantId }),
    });
    if (!res.ok) return { ok: false, motivo: "http" };
    const data = (await res.json()) as { id?: string };
    if (!data.id) return { ok: false, motivo: "http" };
    return { ok: true, modo: "mercadopago", preapprovalId: data.id };
  } catch {
    return { ok: false, motivo: "red" };
  }
}

export type EstadoSuscripcion = "activa" | "cancelada";

export interface Suscripcion {
  readonly id: string;
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly estado: EstadoSuscripcion;
  // PLAN-S4: ciclo de facturación y cambio programado (null = sin cambio).
  readonly desde?: Date | null;
  readonly hasta?: Date | null;
  readonly planProgramado?: PlanId | null;
}

export interface ProveedorCobro {
  crearSuscripcion(args: { tenantId: string; planId: PlanId }): Promise<Suscripcion>;
  cancelar(suscripcionId: string): Promise<Suscripcion>;
  estado(suscripcionId: string): Promise<Suscripcion>;
}

// PLAN-S3: cobro del prorrateo. "confirmado" habilita el upgrade inmediato;
// "pendiente" no toca la suscripción (la ruta responde 409 requiere_cobro).
// El body del pedido no puede fabricar un confirmado: solo este puerto.
export type EstadoCobro = "confirmado" | "pendiente";

export type CobroProrrateo =
  | { readonly estado: "pendiente"; readonly montoCentavos: bigint }
  | { readonly estado: "confirmado"; readonly montoCentavos: bigint; readonly referencia: string };

export interface PedidoCobroProrrateo {
  readonly tenantId: string;
  readonly suscripcionId: string;
  readonly planDestino: PlanId;
  readonly montoCentavos: bigint;
}

export interface BillingProvider {
  cobrarProrrateo(args: PedidoCobroProrrateo): Promise<CobroProrrateo>;
}

export class BillingProviderFalso implements BillingProvider {
  private confirmar = false;
  private seq = 0;
  readonly llamados: PedidoCobroProrrateo[] = [];

  fijarConfirmacion(confirmado: boolean): void {
    this.confirmar = confirmado;
  }

  reiniciar(): void {
    this.confirmar = false;
    this.seq = 0;
    this.llamados.length = 0;
  }

  async cobrarProrrateo(args: PedidoCobroProrrateo): Promise<CobroProrrateo> {
    if (!args.tenantId) throw new Error("tenantId requerido");
    if (args.montoCentavos < 0n) throw new Error("monto inválido");
    this.llamados.push(args);
    if (!this.confirmar) return { estado: "pendiente", montoCentavos: args.montoCentavos };
    this.seq += 1;
    return {
      estado: "confirmado",
      montoCentavos: args.montoCentavos,
      referencia: `fake-${args.suscripcionId}-${this.seq}`,
    };
  }
}

const billingPorDefecto = new BillingProviderFalso();
let billingActual: BillingProvider = billingPorDefecto;

export function billingProviderActual(): BillingProvider {
  return billingActual;
}

export function usarBillingProvider(provider: BillingProvider): void {
  billingActual = provider;
}

export function reiniciarBillingProvider(): void {
  billingPorDefecto.reiniciar();
  billingActual = billingPorDefecto;
}

export class ProveedorCobroFake implements ProveedorCobro {
  private readonly subs = new Map<string, Suscripcion>();
  private proximo = 1;

  async crearSuscripcion(args: { tenantId: string; planId: PlanId }): Promise<Suscripcion> {
    if (!args.tenantId) throw new Error("tenantId requerido");
    const sub: Suscripcion = Object.freeze({
      id: `sub-${this.proximo++}`,
      tenantId: args.tenantId,
      planId: args.planId,
      estado: "activa" as const,
    });
    this.subs.set(sub.id, sub);
    return sub;
  }

  async cancelar(suscripcionId: string): Promise<Suscripcion> {
    const actual = await this.estado(suscripcionId);
    const cancelada: Suscripcion = Object.freeze({ ...actual, estado: "cancelada" as const });
    this.subs.set(suscripcionId, cancelada);
    return cancelada;
  }

  async estado(suscripcionId: string): Promise<Suscripcion> {
    const sub = this.subs.get(suscripcionId);
    if (!sub) throw new Error(`suscripción desconocida: ${suscripcionId}`);
    return sub;
  }
}
