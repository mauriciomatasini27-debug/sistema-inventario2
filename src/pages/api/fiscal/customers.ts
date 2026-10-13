import type { APIRoute } from "astro";
import { z } from "zod";
import { crear_padron_stub_homo } from "../../../modules/fiscal/padron.js";
import { intentarPersistir } from "../../../lib/server-db.js";
import { fiscalCustomers } from "../../../db/schema-fiscal.js";

export const prerender = false;

// GET /api/fiscal/customers?cuit= — Etapa 3: declarado + padrón (stub homo).
// Prod usa ws_sr_constancia_inscripcion/a13; acá stub + tabla declarado.
export const GET: APIRoute = async ({ url }) => {
  const cuit = (url.searchParams.get("cuit") ?? "").replace(/\D/g, "");
  if (!cuit) return Response.json({ error: "falta cuit" }, { status: 422 });
  const padron = crear_padron_stub_homo();
  const dato = await padron.constancia(cuit);
  if (dato) return Response.json({ cuit, ...dato, origen: "padron" });
  return Response.json({ cuit, origen: "declarado", nota: "sin padrón, usar condición declarada" });
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = z.object({ doc_tipo: z.string().min(1).max(4), doc_nro: z.string().min(1).max(13), nombre: z.string().min(1).max(200), domicilio: z.string().max(300).optional(), cond_iva: z.string().min(1).max(4).default("5") }).safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  void intentarPersistir((db) =>
    db.insert(fiscalCustomers).values({ docTipo: parsed.data.doc_tipo, docNro: parsed.data.doc_nro, nombre: parsed.data.nombre, domicilio: parsed.data.domicilio ?? null, condIva: parsed.data.cond_iva, origen: "declarado" }).onConflictDoNothing(),
  );
  return Response.json({ ...parsed.data, origen: "declarado" }, { status: 201 });
};
