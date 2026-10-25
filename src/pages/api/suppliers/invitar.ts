import type { APIRoute } from "astro";
import { z } from "zod";
import { guardarInvitacion } from "../../../lib/repos/proveedor-wa.js";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";
import { generar_codigo_vincular } from "../../../modules/whatsapp/vincular.js";
import { INVITAR_TTL_MIN } from "../../../modules/whatsapp/proveedor.js";
import { normalizarCuit, validarCuit } from "../../../modules/purchases/proveedores.js";

export const prerender = false;

// POST /api/suppliers/invitar (PROV-S1, solo Dueño): genera un código de un
// solo uso con vencimiento. El Dueño lo pasa al proveedor, que lo manda al
// número central. Con `cuit` opcional queda atado al proveedor del comercio.
const bodySchema = z.object({ cuit: z.string().min(1).max(14).optional() });

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  const texto = await request.text();
  let body: unknown = {};
  if (texto !== "") {
    try {
      body = JSON.parse(texto);
    } catch {
      return Response.json({ error: "json invalido" }, { status: 422 });
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  let cuit: string | null = null;
  if (parsed.data.cuit !== undefined) {
    cuit = normalizarCuit(parsed.data.cuit);
    if (!validarCuit(cuit)) return Response.json({ error: "CUIT inválido" }, { status: 422 });
  }
  const codigo = generar_codigo_vincular();
  const codigoHash = sha256Hex(codigo);
  const expiraEn = Date.now() + INVITAR_TTL_MIN * 60_000;
  await guardarInvitacion({
    tenantId: dueno.tenantId,
    supplierCuit: cuit,
    codigoHash,
    expiraEn,
    usado: false,
  });
  return Response.json({ codigo, expiraEn, vence_en_min: INVITAR_TTL_MIN }, { status: 201 });
};
