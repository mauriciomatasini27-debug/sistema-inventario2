import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { sales, tickets } from "../../db/schema.js";
import { ticketLinkRevocations, ticketLinks } from "../../db/schema-tickets.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import {
  bytesABase64Url,
  crear_link,
  esTokenPlanoValido,
  resolver_link,
  revocar_por_venta,
  TOKEN_BYTES,
  type RevocacionLink,
  type TicketLinkEmitido,
} from "../../modules/sales/ticket_link.js";
import { ya_enviado } from "../../modules/sales/ticket_share.js";

export interface TicketResumen {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  medio: string;
  sobreventa: boolean;
}

export function sha256Hex(plano: string): string {
  return createHash("sha256").update(plano, "utf8").digest("hex");
}

export function generarTokenPlano(): string {
  return bytesABase64Url(randomBytes(TOKEN_BYTES));
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

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export async function buscarTicketPorNumero(
  numero: string,
): Promise<{ ticket: TicketResumen; fuente: "db" | "memoria" } | null> {
  const db = dbVivaTenant();
  if (!db) return buscarTicketEnMemoria(numero);
  try {
    const filas = await db
      .select({
        saleId: sales.id,
        definitivo: tickets.definitivo,
        provisorio: tickets.provisorio,
        total: sales.totalCentavos,
        medio: sales.medio,
        sobreventa: sales.sobreventa,
      })
      .from(tickets)
      .innerJoin(sales, eq(tickets.saleId, sales.id))
      .where(or(eq(tickets.definitivo, numero), eq(tickets.provisorio, numero)))
      .limit(1);
    const f = filas[0];
    if (!f) return null;
    return {
      ticket: {
        sale_id: f.saleId,
        ticket_definitivo: f.definitivo,
        ticket_provisorio: f.provisorio,
        total_centavos: BigInt(f.total).toString(),
        medio: f.medio,
        sobreventa: f.sobreventa,
      },
      fuente: "db",
    };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return buscarTicketEnMemoria(numero);
  }
}

function buscarTicketEnMemoria(numero: string): { ticket: TicketResumen; fuente: "db" | "memoria" } | null {
  for (const t of store.idempotency.values()) {
    if (t.ticket_definitivo === numero || t.ticket_provisorio === numero) {
      return {
        ticket: {
          sale_id: t.sale_id,
          ticket_definitivo: t.ticket_definitivo,
          ticket_provisorio: t.ticket_provisorio,
          total_centavos: t.total_centavos,
          medio: t.medio,
          sobreventa: t.sobreventa,
        },
        fuente: "memoria",
      };
    }
  }
  return null;
}

// ticketEnviosCentral has no table: envios centrales viven en memoria del repo.
export function envioCentralYaVisto(key: string): boolean {
  return ya_enviado(store.ticketEnviosCentral, key);
}

export function registrarEnvioCentral(key: string, envio: unknown): void {
  store.ticketEnviosCentral.set(key, envio);
}

export type CrearLinkResultado =
  | { ok: true; link: TicketLinkEmitido; fuente: "db" | "memoria" }
  | { ok: false; codigo: "YA_VISTO"; original: TicketLinkEmitido }
  | { ok: false; codigo: "LINK_INVALIDO" };

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export async function crearLinkPublico(input: {
  saleId: string;
  idempotencyKey: string;
  tokenPlano: string;
  ttlMs?: number | undefined;
}): Promise<CrearLinkResultado> {
  const hash = sha256Hex(input.tokenPlano);
  const db = dbVivaTenant();
  if (!db) return crearLinkEnMemoria(input, hash);
  try {
    return await crearLinkEnDb(db, input, hash);
  } catch (e) {
    if (esConflictoUnico(e)) {
      try {
        const previo = await db
          .select()
          .from(ticketLinks)
          .where(eq(ticketLinks.idempotencyKey, input.idempotencyKey))
          .limit(1);
        const filaPrevia = previo[0];
        if (filaPrevia) return { ok: false, codigo: "YA_VISTO", original: filaALink(filaPrevia) };
      } catch (e2) {
        if (esModoMulti()) throw aBaseNoDisponible(e2);
      }
      if (!esModoMulti()) return crearLinkEnMemoria(input, hash);
      throw aBaseNoDisponible(e);
    }
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return crearLinkEnMemoria(input, hash);
  }
}

async function crearLinkEnDb(
  db: TenantDb,
  input: { saleId: string; idempotencyKey: string; tokenPlano: string; ttlMs?: number | undefined },
  hash: string,
): Promise<CrearLinkResultado> {
  const previo = await db.select().from(ticketLinks).where(eq(ticketLinks.idempotencyKey, input.idempotencyKey)).limit(1);
  const filaPrevia = previo[0];
  if (filaPrevia) return { ok: false, codigo: "YA_VISTO", original: filaALink(filaPrevia) };
  const choque = await db.select({ id: ticketLinks.id }).from(ticketLinks).where(eq(ticketLinks.tokenHash, hash)).limit(1);
  const r = crear_link({
    saleId: input.saleId,
    idempotencyKey: input.idempotencyKey,
    tokenPlano: input.tokenPlano,
    tokenHash: hash,
    nowMs: Date.now(),
    ...(input.ttlMs !== undefined ? { ttlMs: input.ttlMs } : {}),
    linkId: crypto.randomUUID(),
    vistos: new Map(),
    hashesVistos: new Set(choque.length > 0 ? [hash] : []),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", original: r.original };
    return { ok: false, codigo: "LINK_INVALIDO" };
  }
  await db.insert(ticketLinks).values({
    id: r.link.id,
    idempotencyKey: input.idempotencyKey,
    saleId: input.saleId,
    tokenHash: r.link.tokenHash,
    expiraAt: new Date(r.link.expiraAtMs),
  });
  espejoLink(r.link);
  return { ok: true, link: r.link, fuente: "db" };
}

function crearLinkEnMemoria(
  input: { saleId: string; idempotencyKey: string; tokenPlano: string; ttlMs?: number | undefined },
  hash: string,
): CrearLinkResultado {
  const r = crear_link({
    saleId: input.saleId,
    idempotencyKey: input.idempotencyKey,
    tokenPlano: input.tokenPlano,
    tokenHash: hash,
    nowMs: Date.now(),
    ...(input.ttlMs !== undefined ? { ttlMs: input.ttlMs } : {}),
    linkId: crypto.randomUUID(),
    vistos: store.ticketLinkVistos,
    hashesVistos: new Set(store.ticketLinksByHash.keys()),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", original: r.original };
    return { ok: false, codigo: "LINK_INVALIDO" };
  }
  espejoLink(r.link);
  return { ok: true, link: r.link, fuente: "memoria" };
}

export type ResolverLinkResultado =
  | { ok: true; saleId: string; linkId: string; leyenda: string }
  | { ok: false; codigo: "TOKEN_INVALIDO" | "EXPIRADO" | "REVOCADO" };

export async function resolverLinkPublico(tokenPlano: string): Promise<ResolverLinkResultado> {
  if (!esTokenPlanoValido(tokenPlano)) return { ok: false, codigo: "TOKEN_INVALIDO" };
  const hash = sha256Hex(tokenPlano);
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
          tokenPlano,
          tokenHash: hash,
          nowMs: Date.now(),
          porHash: new Map([[fila.tokenHash, filaALink(fila)]]),
          revocadas: new Set(revs.map((x) => x.linkId)),
        });
        if (!r.ok) {
          if (r.codigo === "TOKEN_INVALIDO") return { ok: false, codigo: "TOKEN_INVALIDO" };
          return { ok: false, codigo: r.codigo };
        }
        return { ok: true, saleId: r.saleId, linkId: r.linkId, leyenda: r.leyenda };
      }
    } catch (e) {
      if (esModoMulti()) throw aBaseNoDisponible(e);
    }
  }
  return resolverLinkEnMemoria(tokenPlano, hash);
}

function resolverLinkEnMemoria(tokenPlano: string, hash: string): ResolverLinkResultado {
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
    return { ok: false, codigo: "TOKEN_INVALIDO" };
  }
  const r = resolver_link({
    tokenPlano,
    tokenHash: hash,
    nowMs: Date.now(),
    porHash: store.ticketLinksByHash,
    revocadas: new Set(store.ticketLinkRevocaciones.keys()),
  });
  if (!r.ok) {
    if (r.codigo === "TOKEN_INVALIDO") return { ok: false, codigo: "TOKEN_INVALIDO" };
    return { ok: false, codigo: r.codigo };
  }
  return { ok: true, saleId: r.saleId, linkId: r.linkId, leyenda: r.leyenda };
}

export type RevocarLinksResultado =
  | { ok: true; revocaciones: RevocacionLink[] }
  | { ok: false; codigo: "YA_VISTO"; originales: readonly RevocacionLink[] }
  | { ok: false; codigo: "REVOQUE_INVALIDO" };

export async function revocarLinksPorVenta(input: {
  saleId: string;
  actor: string;
  motivo: string;
  idempotencyKey: string;
}): Promise<RevocarLinksResultado> {
  const db = dbVivaTenant();
  if (!db) return revocarLinksEnMemoria(input);
  try {
    const linksDb = await db.select().from(ticketLinks).where(eq(ticketLinks.saleId, input.saleId));
    const revsDb = await db.select().from(ticketLinkRevocations).where(eq(ticketLinkRevocations.saleId, input.saleId));
    const emitidas = revsDb.map(filaARevocacion).filter((x) => x.idempotencyKey.startsWith(`${input.idempotencyKey}:`));
    const r = revocar_por_venta({
      saleId: input.saleId,
      actor: input.actor,
      motivo: input.motivo,
      nowMs: Date.now(),
      idempotencyKey: input.idempotencyKey,
      linksDeLaVenta: linksDb.map(filaALink),
      revocacionesPrevias: new Map(revsDb.map((f) => [f.linkId, filaARevocacion(f)] as const)),
      vistos: new Map(emitidas.length > 0 ? [[input.idempotencyKey, emitidas]] : []),
    });
    if (!r.ok) {
      if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", originales: r.originales };
      return { ok: false, codigo: "REVOQUE_INVALIDO" };
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
    store.ticketLinkRevokeVistos.set(input.idempotencyKey, [...r.revocaciones]);
    return { ok: true, revocaciones: [...r.revocaciones] };
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    return revocarLinksEnMemoria(input);
  }
}

function revocarLinksEnMemoria(input: {
  saleId: string;
  actor: string;
  motivo: string;
  idempotencyKey: string;
}): RevocarLinksResultado {
  const links = [...store.ticketLinks.values()].filter((l) => l.saleId === input.saleId);
  const r = revocar_por_venta({
    saleId: input.saleId,
    actor: input.actor,
    motivo: input.motivo,
    nowMs: Date.now(),
    idempotencyKey: input.idempotencyKey,
    linksDeLaVenta: links,
    revocacionesPrevias: store.ticketLinkRevocaciones,
    vistos: store.ticketLinkRevokeVistos,
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", originales: r.originales };
    return { ok: false, codigo: "REVOQUE_INVALIDO" };
  }
  for (const rev of r.revocaciones) {
    store.ticketLinkRevocaciones.set(rev.linkId, rev);
  }
  store.ticketLinkRevokeVistos.set(input.idempotencyKey, [...r.revocaciones]);
  return { ok: true, revocaciones: [...r.revocaciones] };
}
