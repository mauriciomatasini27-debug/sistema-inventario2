// LANE admin — Cobranza PA6 (append-only en centavos bigint).
//
// Núcleo puro: sin IO, sin Drizzle. No existe update/delete: la corrección
// es un asiento nuevo con asientoCompensatorioDe. Idempotencia por
// idempotencyKey (el runner pasa los vistos; doble POST no duplica).

export interface AsientoCobroNuevo {
  readonly tenantId: string;
  readonly montoCentavos: bigint;
  readonly medio: string;
  readonly referenciaExterna: string;
  readonly idempotencyKey: string;
  readonly asientoCompensatorioDe?: string;
}

export interface AsientoValidado extends AsientoCobroNuevo {
  readonly id: string;
  readonly creadoEn: string;
  readonly creadoPor: string;
}

export type FalloAsiento =
  | { readonly ok: false; readonly codigo: "MONTO_INVALIDO"; readonly status: 422; readonly error: string }
  | { readonly ok: false; readonly codigo: "DUPLICADO"; readonly status: 409; readonly error: string };

export type AsentarCobroResult = { readonly ok: true; readonly asiento: AsientoValidado } | FalloAsiento;

// Constructor validado: monto > 0, medio y referencia no vacíos, key única.
export function asentar_cobro(args: {
  readonly input: AsientoCobroNuevo;
  readonly creadoPor: string;
  readonly vistos: ReadonlySet<string>;
  readonly ahora?: Date;
}): AsentarCobroResult {
  const { input } = args;
  if (!input.tenantId || !input.medio || !input.referenciaExterna || !input.idempotencyKey) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "tenant, medio, referencia e idempotency-key requeridos" };
  }
  if (input.montoCentavos <= 0n) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "el monto debe ser mayor a cero" };
  }
  if (!args.creadoPor) {
    return { ok: false, codigo: "MONTO_INVALIDO", status: 422, error: "asiento sin responsable" };
  }
  if (args.vistos.has(input.idempotencyKey)) {
    return { ok: false, codigo: "DUPLICADO", status: 409, error: "idempotency-key ya asentada" };
  }
  return {
    ok: true,
    asiento: {
      ...input,
      id: `cobro:${input.idempotencyKey}`,
      creadoEn: (args.ahora ?? new Date()).toISOString(),
      creadoPor: args.creadoPor,
    },
  };
}
