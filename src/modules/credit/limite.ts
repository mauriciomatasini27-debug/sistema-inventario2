import type { Rol } from "../cash/caja.js";

const marcaCredito: unique symbol = Symbol("credito");

export type LimiteAbierto = { readonly kind: "abierto" };

export type LimiteTecho = { readonly kind: "techo"; readonly centavos: bigint };

export type LimiteCredito = LimiteAbierto | LimiteTecho;

export type CreditoResuelto = {
  readonly [marcaCredito]: true;
  readonly clienteId: string;
  readonly limite: LimiteCredito;
  readonly saldoCentavos: bigint;
  readonly rol: Rol;
};

export type FalloLimite =
  | { readonly ok: false; readonly codigo: "TOPE_CORRUPTO"; readonly status: 422 }
  | { readonly ok: false; readonly codigo: "FICHA_INVALIDA"; readonly status: 422 };

export type CreditoListo = { readonly ok: true; readonly valor: CreditoResuelto };

export function limiteDesdeFicha(topeAlmacenado: bigint): LimiteCredito | FalloLimite {
  if (topeAlmacenado === 0n) return { kind: "abierto" };
  if (topeAlmacenado > 0n) return { kind: "techo", centavos: topeAlmacenado };
  return { ok: false, codigo: "TOPE_CORRUPTO", status: 422 };
}

export function resolverCredito(input: {
  readonly customerId: string;
  readonly topeAlmacenado: bigint;
  readonly saldoCentavos: bigint;
  readonly rol: Rol;
}): CreditoListo | FalloLimite {
  if (input.customerId.trim() === "") return { ok: false, codigo: "FICHA_INVALIDA", status: 422 };
  const limite = limiteDesdeFicha(input.topeAlmacenado);
  if ("ok" in limite) return limite;
  return {
    ok: true,
    valor: {
      [marcaCredito]: true,
      clienteId: input.customerId,
      limite,
      saldoCentavos: input.saldoCentavos,
      rol: input.rol,
    },
  };
}

export function supera_limite(saldoNuevo: bigint, limite: LimiteCredito): boolean {
  if (limite.kind === "abierto") return false;
  return saldoNuevo > limite.centavos;
}

export function disponibleDesdeLimite(saldoCentavos: bigint, limite: LimiteCredito): bigint | null {
  if (limite.kind === "abierto") return null;
  const libre = limite.centavos - saldoCentavos;
  return libre > 0n ? libre : 0n;
}

export function disponibleCentavos(credito: CreditoResuelto): bigint | null {
  return disponibleDesdeLimite(credito.saldoCentavos, credito.limite);
}

export function motivoTope(saldoCentavos: bigint, topeAlmacenado: bigint): boolean {
  const limite = limiteDesdeFicha(topeAlmacenado);
  if ("ok" in limite) return false;
  return supera_limite(saldoCentavos, limite);
}
