// LANE admin — Acciones de mora cableadas desde el panel (#221/#222/#223).
//
// Núcleo puro + un adaptador de red con fetch inyectado. El panel arma una
// AccionMora, la valida acá y pinta el ResultadoMora. Las rutas siguen siendo
// la autoridad: esta validación solo evita un POST que ya sabemos inválido.

export interface CobroRegularizar {
  readonly montoCentavos: bigint;
  readonly medio: string;
  readonly referenciaExterna: string;
  readonly idempotencyKey: string;
}

export type AccionMora =
  | {
      readonly tipo: "evaluar";
      readonly tenantId: string;
      readonly diasAtraso: number;
      readonly saldoDeudorCentavos: bigint;
    }
  | {
      readonly tipo: "suspender";
      readonly tenantId: string;
      readonly motivo: string;
      readonly confirmoId: string;
    }
  | {
      readonly tipo: "regularizar";
      readonly tenantId: string;
      readonly motivo: string;
      readonly confirmoId: string;
      readonly cobro: CobroRegularizar;
    };

export const DECISIONES_MORA = [
  "al_dia",
  "en_gracia",
  "suspender",
  "baja",
  "mantener_suspension",
] as const;

export type DecisionMora = (typeof DECISIONES_MORA)[number];

export interface EvaluacionMora {
  readonly tenantId: string;
  readonly estadoActual: string;
  readonly decision: DecisionMora;
  readonly proximoPasoEn: string;
  readonly debeEmitirEvento: boolean;
}

export type ResultadoMora =
  | { readonly ok: true; readonly tipo: "evaluar"; readonly decisiones: readonly EvaluacionMora[] }
  | { readonly ok: true; readonly tipo: "suspender"; readonly estado: string; readonly ya: boolean }
  | {
      readonly ok: true;
      readonly tipo: "regularizar";
      readonly estado: string;
      readonly asientoId: string;
      readonly montoCentavos: string;
      readonly ya: boolean;
    }
  | { readonly ok: false; readonly status: number; readonly error: string };

interface Deps {
  readonly fetch: typeof fetch;
}

const ETIQUETA_DECISION: Readonly<Record<DecisionMora, string>> = {
  al_dia: "Al día",
  en_gracia: "En gracia",
  suspender: "Suspender",
  baja: "Dar de baja",
  mantener_suspension: "Mantener suspensión",
};

export function etiquetaDecisionMora(decision: DecisionMora): string {
  return ETIQUETA_DECISION[decision];
}

export function validarAccionMora(accion: AccionMora): string | null {
  if (!accion.tenantId.trim()) return "Falta el tenant.";
  if (accion.tipo === "evaluar") {
    if (!Number.isInteger(accion.diasAtraso) || accion.diasAtraso < 0) {
      return "Los días de atraso tienen que ser un entero de 0 o más.";
    }
    if (accion.saldoDeudorCentavos < 0n) return "El saldo deudor no puede ser negativo.";
    return null;
  }
  const motivo = accion.motivo.trim();
  if (!motivo) return "Falta el motivo.";
  if (motivo.length > 280) return "El motivo no puede pasar de 280 caracteres.";
  if (accion.confirmoId.trim() !== accion.tenantId) {
    return "Escribí el id completo del tenant para confirmar.";
  }
  if (accion.tipo === "regularizar") {
    const { montoCentavos, medio, referenciaExterna, idempotencyKey } = accion.cobro;
    if (montoCentavos <= 0n) return "El monto tiene que ser mayor a cero.";
    if (!medio.trim()) return "Falta el medio de pago.";
    if (!referenciaExterna.trim()) return "Falta la referencia externa.";
    if (!idempotencyKey.trim()) return "Falta la clave de idempotencia.";
  }
  return null;
}

// El asiento es append-only y se identifica por idempotency_key. Sugerir
// tenant + día hace que un reintento del operador caiga en el mismo asiento.
export function sugerirIdempotencyKey(tenantId: string, fecha: string): string {
  return `regularizar:${tenantId}:${fecha}`;
}

function urlDeAccion(accion: AccionMora): string {
  if (accion.tipo === "evaluar") return "/api/admin/mora/evaluar";
  if (accion.tipo === "suspender") return "/api/admin/mora/suspender";
  return "/api/admin/mora/regularizar";
}

function cuerpoDeAccion(accion: AccionMora): Record<string, unknown> {
  if (accion.tipo === "evaluar") {
    return {
      tenant_id: accion.tenantId,
      dias_atraso: accion.diasAtraso,
      saldo_deudor_centavos: accion.saldoDeudorCentavos.toString(),
    };
  }
  const confirmacion = {
    tenant_id: accion.tenantId,
    motivo: accion.motivo.trim(),
    confirmo_id: accion.confirmoId.trim(),
  };
  if (accion.tipo === "suspender") return confirmacion;
  return {
    ...confirmacion,
    cobro: {
      monto_centavos: accion.cobro.montoCentavos.toString(),
      medio: accion.cobro.medio.trim(),
      referencia_externa: accion.cobro.referenciaExterna.trim(),
      idempotency_key: accion.cobro.idempotencyKey.trim(),
    },
  };
}

function esDecision(valor: unknown): valor is DecisionMora {
  return typeof valor === "string" && (DECISIONES_MORA as readonly string[]).includes(valor);
}

function leerDecisiones(body: unknown): readonly EvaluacionMora[] | null {
  if (!body || typeof body !== "object") return null;
  const lista = (body as { decisiones?: unknown }).decisiones;
  if (!Array.isArray(lista)) return null;
  const decisiones: EvaluacionMora[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") return null;
    const fila = item as Record<string, unknown>;
    if (typeof fila["tenant_id"] !== "string" || !esDecision(fila["decision"])) return null;
    decisiones.push({
      tenantId: fila["tenant_id"],
      estadoActual: typeof fila["estado_actual"] === "string" ? fila["estado_actual"] : "",
      decision: fila["decision"],
      proximoPasoEn: typeof fila["proximoPasoEn"] === "string" ? fila["proximoPasoEn"] : "",
      debeEmitirEvento: fila["debeEmitirEvento"] === true,
    });
  }
  return decisiones;
}

function mensajeDeError(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  if (status === 403) return "Sin permiso de admin o tenant desconocido.";
  if (status === 404) return "Tenant desconocido.";
  if (status === 409) return "La operación ya estaba hecha.";
  if (status === 422) return "Datos inválidos.";
  return "No se pudo completar la acción (http " + status + ").";
}

async function leerJsonSeguro(response: Response): Promise<unknown> {
  const texto = await response.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export async function ejecutarAccionMora(accion: AccionMora, deps: Deps): Promise<ResultadoMora> {
  const invalidacion = validarAccionMora(accion);
  if (invalidacion) return { ok: false, status: 422, error: invalidacion };

  let response: Response;
  try {
    response = await deps.fetch(urlDeAccion(accion), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoDeAccion(accion)),
    });
  } catch {
    return { ok: false, status: 0, error: "Sin conexión con el panel." };
  }
  const body = await leerJsonSeguro(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: mensajeDeError(response.status, body) };
  }

  if (accion.tipo === "evaluar") {
    const decisiones = leerDecisiones(body);
    if (!decisiones) return { ok: false, status: 502, error: "Respuesta inesperada del servidor." };
    return { ok: true, tipo: "evaluar", decisiones };
  }

  if (!body || typeof body !== "object") {
    return { ok: false, status: 502, error: "Respuesta inesperada del servidor." };
  }
  const datos = body as Record<string, unknown>;
  if (accion.tipo === "suspender") {
    if (typeof datos["estado"] !== "string") {
      return { ok: false, status: 502, error: "Respuesta inesperada del servidor." };
    }
    return { ok: true, tipo: "suspender", estado: datos["estado"], ya: datos["ya"] === true };
  }
  if (typeof datos["estado"] !== "string" || typeof datos["asiento_id"] !== "string") {
    return { ok: false, status: 502, error: "Respuesta inesperada del servidor." };
  }
  return {
    ok: true,
    tipo: "regularizar",
    estado: datos["estado"],
    asientoId: datos["asiento_id"],
    montoCentavos: typeof datos["monto_centavos"] === "string" ? datos["monto_centavos"] : "",
    ya: datos["ya"] === true,
  };
}

export function textoResultadoMora(resultado: ResultadoMora): string {
  if (!resultado.ok) return resultado.error;
  if (resultado.tipo === "evaluar") {
    const lineas = resultado.decisiones.map(
      (d) => d.tenantId + ": " + etiquetaDecisionMora(d.decision) + " (próximo paso " + d.proximoPasoEn + ")",
    );
    return lineas.length === 0 ? "Sin decisiones." : lineas.join(" · ");
  }
  if (resultado.tipo === "suspender") {
    return resultado.ya ? "Ya estaba suspendido hoy." : "Suspendido. Estado: " + resultado.estado + ".";
  }
  return resultado.ya
    ? "Ya estaba regularizado con esa clave. Estado: " + resultado.estado + "."
    : "Regularizado. Estado: " + resultado.estado + ". Asiento " + resultado.asientoId + ".";
}
