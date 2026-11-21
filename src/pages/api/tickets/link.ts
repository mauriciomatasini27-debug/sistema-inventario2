import type { APIRoute } from "astro";
import {
  crearLinkPublico,
  generarTokenPlano,
  resolverLinkPublico,
  revocarLinksPorVenta,
} from "../../../lib/repos/tickets.js";
import { buscarVentaPorId } from "../../../modules/sales/buscar_venta.js";

export const prerender = false;

// PERS2-S5: la persistencia vive en el repo de tickets (DB-first, memoria solo
// en single sin base). El plano nunca se guarda: solo va el SHA-256 hex.

// Body: { sale_id, ttl_ms? }. Header Idempotency-Key requerido (E3).
// 201 con token plano UNA vez + url; 409 retry; 404 venta; 422 inválido.
export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as { sale_id?: string; ttl_ms?: number };
  if (!b.sale_id) return Response.json({ error: "falta sale_id" }, { status: 422 });
  const vendido = await buscarVentaPorId(b.sale_id);
  if (!vendido) return Response.json({ error: "venta inexistente" }, { status: 404 });

  const plano = generarTokenPlano();
  const url = new URL(request.url);
  const publicUrl = `${url.origin}/t/${plano}`;

  const r = await crearLinkPublico({
    saleId: b.sale_id,
    idempotencyKey: key,
    tokenPlano: plano,
    ...(b.ttl_ms !== undefined ? { ttlMs: b.ttl_ms } : {}),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") {
      return Response.json(
        { error: "idempotency-key repetida", link_id: r.original.id, expira_at_ms: r.original.expiraAtMs },
        { status: 409 },
      );
    }
    return Response.json({ error: "link invalido" }, { status: 422 });
  }
  if (r.fuente === "db") {
    return Response.json(
      { link_id: r.link.id, token: plano, expira_at_ms: r.link.expiraAtMs, url: publicUrl, fuente: "db" },
      { status: 201 },
    );
  }
  return Response.json(
    { link_id: r.link.id, token: plano, expira_at_ms: r.link.expiraAtMs, url: publicUrl },
    { status: 201 },
  );
};

// 200 { sale_id, link_id, leyenda }; 404 formato/desconocido; 410 expirado/revocado.
export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const r = await resolverLinkPublico(token);
  if (!r.ok) {
    if (r.codigo === "TOKEN_INVALIDO") return Response.json({ error: "no encontrado" }, { status: 404 });
    return Response.json({ error: r.codigo === "REVOCADO" ? "revocado" : "expirado" }, { status: 410 });
  }
  return Response.json({ sale_id: r.saleId, link_id: r.linkId, leyenda: r.leyenda }, { status: 200 });
};

// Body: { sale_id, actor, motivo }. Header Idempotency-Key requerido.
export const DELETE: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const b = body as { sale_id?: string; actor?: string; motivo?: string };
  if (!b.sale_id || !b.actor || !b.motivo) {
    return Response.json({ error: "faltan campos" }, { status: 422 });
  }

  const r = await revocarLinksPorVenta({
    saleId: b.sale_id,
    actor: b.actor,
    motivo: b.motivo,
    idempotencyKey: key,
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") {
      return Response.json({ error: "idempotency-key repetida", revocaciones: r.originales.length }, { status: 409 });
    }
    return Response.json({ error: "revoque invalido" }, { status: 422 });
  }
  return Response.json({ revocadas: r.revocaciones.length }, { status: 200 });
};
