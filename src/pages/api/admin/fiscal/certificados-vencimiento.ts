import type { APIRoute } from "astro";
import { adminStore } from "../../../../lib/admin-store.js";
import { exigirAdmin } from "../_guard.js";
import {
  alertaDesdeComputador,
  type AlertaCertificadoFiscal,
} from "../../../../modules/fiscal/cert-vencimiento.js";
import { listarResumenComputadoresFiscal } from "../../../../lib/repos/fiscal-control.js";

export const prerender = false;

// GET /api/admin/fiscal/certificados-vencimiento — alertas FE16.3 para el Control Plane.
export const GET: APIRoute = async ({ request }) => {
  const admin = exigirAdmin(request);
  if (admin instanceof Response) return admin;

  const ahora = new Date();
  let alertas: AlertaCertificadoFiscal[] = [];
  try {
    const computadores = await listarResumenComputadoresFiscal();
    alertas = computadores
      .map((c) => alertaDesdeComputador(c, ahora))
      .filter((a): a is AlertaCertificadoFiscal => a !== null);
  } catch {
    alertas = [];
  }

  const espejo = adminStore.alertasCertificadoFiscal;
  return Response.json(
    {
      alertas: alertas.map((a) => ({
        fiscal_computer_id: a.fiscalComputerId,
        ambiente: a.ambiente,
        alias: a.alias,
        cuit_proveedor: a.cuitProveedor,
        not_after: a.notAfter,
        dias_restantes: a.diasRestantes,
        severidad: a.severidad,
        umbral_activo: a.umbralActivo,
      })),
      ultima_corrida_job: espejo[0]?.actualizadoEn ?? null,
    },
    { status: 200 },
  );
};
