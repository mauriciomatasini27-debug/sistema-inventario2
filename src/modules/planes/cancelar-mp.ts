// P10-91: cancela una preaprobación (suscripción) de Mercado Pago al cerrar la
// cuenta, sin devolución: solo corta los cobros futuros. Archivo propio para no
// pisar el trabajo de cobro de MP (P1-91) en planes.ts/proveedor.ts.
// API: PUT /preapproval/{id} con status "cancelled".

const MP_PREAPPROVAL_URL = "https://api.mercadopago.com/preapproval";

export type ResultadoCancelacionMp =
  | { readonly ok: true; readonly modo: "simulado" | "mercadopago"; readonly preapprovalId: string }
  | { readonly ok: false; readonly motivo: "sin_credenciales" | "red" | "http"; readonly preapprovalId: string };

export async function cancelarPreaprobacionMercadoPago(args: {
  readonly preapprovalId: string;
  readonly accessToken?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}): Promise<ResultadoCancelacionMp> {
  const id = args.preapprovalId;
  // P10-91: las preaprobaciones de ejemplo (COBRO-EJEMPLO) son simuladas, MP no las conoce.
  if (id.startsWith("sim-")) return { ok: true, modo: "simulado", preapprovalId: id };
  const token = args.accessToken ?? process.env.MP_ACCESS_TOKEN ?? "";
  if (!token) return { ok: false, motivo: "sin_credenciales", preapprovalId: id };
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const res = await fetchFn(`${MP_PREAPPROVAL_URL}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) return { ok: false, motivo: "http", preapprovalId: id };
    return { ok: true, modo: "mercadopago", preapprovalId: id };
  } catch {
    return { ok: false, motivo: "red", preapprovalId: id };
  }
}
