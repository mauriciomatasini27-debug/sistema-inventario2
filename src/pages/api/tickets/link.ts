import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { store } from "../../../lib/store.js";
import { getTenantDb } from "../../../lib/db.js";
import { dbVivaTenant } from "../../../lib/server-db.js";
import { ticketLinkRevocations, ticketLinks } from "../../../db/schema-tickets.js";
import {
  bytesABase64Url,
  crear_link,
  esTokenPlanoValido,
  resolver_link,
  revocar_por_venta,
  TOKEN_BYTES,
  type RevocacionLink,
  type TicketLinkEmitido,
} from "../../../modules/sales/ticket_link.js";
import { buscarVentaPorId } from "../../../modules/sales/buscar_venta.js";

export const prerender = false;

// POST/GET/DELETE /api/tickets/link — links públicos con token (TV9).
// PERS-S4: DB-first sobre ticket_links + ticket_link_revocations con espejo
// memoria. Sin DB o ante error, la vía memoria histórica resuelve igual que
// antes. El plano nunca se guarda: solo va el SHA-256 hex.

type TenantDb = ReturnType<typeof getTenantDb>;

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

function sha256Hex(plano: string): string {
  return createHash("sha256").update(plano, "utf8").digest("hex");
}

function filaALink(f: typeof ticketLinks.$inferSelect): TicketLinkEmitido {
  return {
    id: f.id,
    saleId: f.saleId,
    tokenHash: f.tokenHash,
    expiraAtMs: f.expiraAt.getTime(),
    createdAtMs: f.createdAt.getTime(),
    idempotencyKey: f.idempotencyKey,
  };
}

function filaARevocacion(f: typeof ticketLinkRevocations.$inferSelect): RevocacionLink {
  return {
    linkId: f.linkId,
    saleId: f.saleId,
    actor: f.actor,
    motivo: f.motivo,
    createdAtMs: f.createdAt.getTime(),
    idempotencyKey: f.idempotencyKey,
  };
}

function espejoLink(link: TicketLinkEmitido): void {
  store.ticketLinks.set(link.id, link);
  store.ticketLinksByHash.set(link.tokenHash, link);
  store.ticketLinkVistos.set(link.idempotencyKey, link);
}

// POST /api/tickets/link — genera link público con token (TV9).
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

  const plano = bytesABase64Url(randomBytes(TOKEN_BYTES));
  const hash = sha256Hex(plano);
  const url = new URL(request.url);
  const publicUrl = `${url.origin}/t/${plano}`;

  const db = dbVivaTenant();
  if (!db) return viaMemoriaPost(key, b, plano, hash, publicUrl);

  try {
    const previo = await db.select().from(ticketLinks).where(eq(ticketLinks.idempotencyKey, key)).limit(1);
    const filaPrevia = previo[0];
    if (filaPrevia) {
      return Response.json(
        { error: "idempotency-key repetida", link_id: filaPrevia.id, expira_at_ms: filaPrevia.expiraAt.getTime() },
        { status: 409 },
      );
    }
    const choque = await db.select({ id: ticketLinks.id }).from(ticketLinks).where(eq(ticketLinks.tokenHash, hash)).limit(1);
    const r = crear_link({
      saleId: b.sale_id,
      idempotencyKey: key,
      tokenPlano: plano,
      tokenHash: hash,
      nowMs: Date.now(),
      ...(b.ttl_ms !== undefined ? { ttlMs: b.ttl_ms } : {}),
      linkId: crypto.randomUUID(),
      vistos: new Map(),
      hashesVistos: new Set(choque.length > 0 ? [hash] : []),
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
    await db.insert(ticketLinks).values({
      id: r.link.id,
      idempotencyKey: key,
      saleId: b.sale_id,
      tokenHash: r.link.tokenHash,
      expiraAt: new Date(r.link.expiraAtMs),
    });
    espejoLink(r.link);
    return Response.json(
      { link_id: r.link.id, token: plano, expira_at_ms: r.link.expiraAtMs, url: publicUrl, fuente: "db" },
      { status: 201 },
    );
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 409 con relectura.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(ticketLinks).where(eq(ticketLinks.idempotencyKey, key)).limit(1);
        const filaPrevia = previo[0];
        if (filaPrevia) {
          return Response.json(
            { error: "idempotency-key repetida", link_id: filaPrevia.id, expira_at_ms: filaPrevia.expiraAt.getTime() },
            { status: 409 },
          );
        }
      } catch {
        // Cae a la vía memoria de abajo.
      }
    }
    return viaMemoriaPost(key, b, plano, hash, publicUrl);
  }
};

function viaMemoriaPost(
  key: string,
  b: { sale_id?: string; ttl_ms?: number },
  plano: string,
  hash: string,
  publicUrl: string,
): Response {
  const r = crear_link({
    saleId: b.sale_id ?? "",
    idempotencyKey: key,
    tokenPlano: plano,
    tokenHash: hash,
    nowMs: Date.now(),
    ...(b.ttl_ms !== undefined ? { ttlMs: b.ttl_ms } : {}),
    linkId: crypto.randomUUID(),
    vistos: store.ticketLinkVistos,
    hashesVistos: new Set(store.ticketLinksByHash.keys()),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") {
      // El plano nunca se guarda: el retry no lo re-emite.
      return Response.json(
        { error: "idempotency-key repetida", link_id: r.original.id, expira_at_ms: r.original.expiraAtMs },
        { status: 409 },
      );
    }
    return Response.json({ error: "link invalido" }, { status: 422 });
  }
  espejoLink(r.link);
  return Response.json(
    { link_id: r.link.id, token: plano, expira_at_ms: r.link.expiraAtMs, url: publicUrl },
    { status: 201 },
  );
}

// GET /api/tickets/link?token= — resuelve link público sin auth (TV9).
// 200 { sale_id, link_id, leyenda }; 404 formato/desconocido; 410 expirado/revocado.
export const GET: APIRoute = async ({ request }) => {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!esTokenPlanoValido(token)) return Response.json({ error: "no encontrado" }, { status: 404 });
  const hash = sha256Hex(token);

  const db = dbVivaTenant();
  if (db) {
    try {
      const filas = await db.select().from(ticketLinks).where(eq(ticketLinks.tokenHash, hash)).limit(1);
      const fila = filas[0];
      if (fila) {
        const revs = await db
          .select({ linkId: ticketLinkRevocations.linkId })
          .from(ticketLinkRevocations)
          .where(eq(ticketLinkRevocations.linkId, fila.id));
        const r = resolver_link({
          tokenPlano: token,
          tokenHash: hash,
          nowMs: Date.now(),
          porHash: new Map([[fila.tokenHash, filaALink(fila)]]),
          revocadas: new Set(revs.map((x) => x.linkId)),
        });
        if (!r.ok) {
          if (r.codigo === "TOKEN_INVALIDO") return Response.json({ error: "no encontrado" }, { status: 404 });
          return Response.json({ error: r.codigo === "REVOCADO" ? "revocado" : "expirado" }, { status: 410 });
        }
        return Response.json({ sale_id: r.saleId, link_id: r.linkId, leyenda: r.leyenda }, { status: 200 });
      }
    } catch {
      // Cae a la vía memoria de abajo.
    }
  }

  // Comparación timing-safe contra el índice (evita oráculo de existencia).
  let encontrado = false;
  for (const h of store.ticketLinksByHash.keys()) {
    const a = Buffer.from(h, "utf8");
    const b2 = Buffer.from(hash, "utf8");
    if (a.length === b2.length && timingSafeEqual(a, b2)) {
      encontrado = true;
      break;
    }
  }
  if (!encontrado && !store.ticketLinksByHash.has(hash)) {
    return Response.json({ error: "no encontrado" }, { status: 404 });
  }
  const r = resolver_link({
    tokenPlano: token,
    tokenHash: hash,
    nowMs: Date.now(),
    porHash: store.ticketLinksByHash,
    revocadas: new Set(store.ticketLinkRevocaciones.keys()),
  });
  if (!r.ok) {
    if (r.codigo === "TOKEN_INVALIDO") return Response.json({ error: "no encontrado" }, { status: 404 });
    return Response.json({ error: r.codigo === "REVOCADO" ? "revocado" : "expirado" }, { status: 410 });
  }
  return Response.json({ sale_id: r.saleId, link_id: r.linkId, leyenda: r.leyenda }, { status: 200 });
};

// DELETE /api/tickets/link — revoca todos los links de una venta (TV9).
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

  const db = dbVivaTenant();
  if (db) {
    try {
      const linksDb = await db.select().from(ticketLinks).where(eq(ticketLinks.saleId, b.sale_id));
      const revsDb = await db.select().from(ticketLinkRevocations).where(eq(ticketLinkRevocations.saleId, b.sale_id));
      const emitidas = revsDb.map(filaARevocacion).filter((x) => x.idempotencyKey.startsWith(`${key}:`));
      const r = revocar_por_venta({
        saleId: b.sale_id,
        actor: b.actor,
        motivo: b.motivo,
        nowMs: Date.now(),
        idempotencyKey: key,
        linksDeLaVenta: linksDb.map(filaALink),
        revocacionesPrevias: new Map(revsDb.map((f) => [f.linkId, filaARevocacion(f)] as const)),
        vistos: new Map(emitidas.length > 0 ? [[key, emitidas]] : []),
      });
      if (!r.ok) {
        if (r.codigo === "YA_VISTO") {
          return Response.json({ error: "idempotency-key repetida", revocaciones: r.originales.length }, { status: 409 });
        }
        return Response.json({ error: "revoque invalido" }, { status: 422 });
      }
      if (r.revocaciones.length > 0) {
        await db.insert(ticketLinkRevocations).values(
          r.revocaciones.map((rev) => ({
            idempotencyKey: rev.idempotencyKey,
            linkId: rev.linkId,
            saleId: rev.saleId,
            actor: rev.actor,
            motivo: rev.motivo,
          })),
        );
      }
      for (const rev of r.revocaciones) {
        store.ticketLinkRevocaciones.set(rev.linkId, rev);
      }
      store.ticketLinkRevokeVistos.set(key, [...r.revocaciones]);
      return Response.json({ revocadas: r.revocaciones.length }, { status: 200 });
    } catch {
      // Cae a la vía memoria de abajo.
    }
  }

  const links = [...store.ticketLinks.values()].filter((l) => l.saleId === b.sale_id);
  const r = revocar_por_venta({
    saleId: b.sale_id,
    actor: b.actor,
    motivo: b.motivo,
    nowMs: Date.now(),
    idempotencyKey: key,
    linksDeLaVenta: links,
    revocacionesPrevias: store.ticketLinkRevocaciones,
    vistos: store.ticketLinkRevokeVistos,
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") {
      return Response.json({ error: "idempotency-key repetida", revocaciones: r.originales.length }, { status: 409 });
    }
    return Response.json({ error: "revoque invalido" }, { status: 422 });
  }
  for (const rev of r.revocaciones) {
    store.ticketLinkRevocaciones.set(rev.linkId, rev);
  }
  store.ticketLinkRevokeVistos.set(key, [...r.revocaciones]);
  return Response.json({ revocadas: r.revocaciones.length }, { status: 200 });
};
