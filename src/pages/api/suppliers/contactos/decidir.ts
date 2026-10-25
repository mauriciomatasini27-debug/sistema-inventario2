import type { APIRoute } from "astro";
import { z } from "zod";
import { contactoPorNumero, guardarContacto, limpiarCupo } from "../../../../lib/repos/proveedor-wa.js";
import { exigirDuenoDeRequest } from "../../../../lib/tenant-context.js";

export const prerender = false;

// POST /api/suppliers/contactos/decidir (PROV-S4, solo Dueño): aprueba
// (verificado) o revoca (revocado) el contacto. El número debe pertenecer al
// comercio del Dueño; si es ajeno responde 404 sin revelar nada.
const bodySchema = z.object({
  numero: z.string().min(1).max(32),
  estado: z.enum(["verificado", "revocado"]),
});

export const POST: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const { numero, estado } = parsed.data;
  const actual = await contactoPorNumero(numero);
  if (!actual || actual.tenantId !== dueno.tenantId) {
    return Response.json({ error: "contacto inexistente" }, { status: 404 });
  }
  await guardarContacto({ ...actual, estado });
  // PROV-E4: aprobar (o re-aprobar) habilita de nuevo al proveedor; revocar
  // también limpia. El cupo se reconstruye solo desde el próximo mensaje.
  await limpiarCupo(numero, dueno.tenantId);
  return Response.json({ numero, estado });
};
