import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { products, sales, ticketLines, tickets } from "../../db/schema.js";
import { ticketDiscounts, ticketLinkRevocations, ticketLinks } from "../../db/schema-tickets.js";
import { listarDescuentosTicket, listarLineasTicket, listarTicketsFiado } from "../ticket-memoria.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import {
  crearAlmacenIdempotenciaVentas,
  crearAlmacenTicketEnviosCentral,
  crearAlmacenTicketLinkRevocaciones,
  crearAlmacenTicketLinkRevokeVistos,
  crearAlmacenTicketLinks,
  crearAlmacenTicketLinksPorHash,
  crearAlmacenTicketLinkVistos,
  type AlmacenVivo,
  type StoredTicket,
} from "./_almacen.js";
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

export interface TicketLineaResumen {
  sku: string;
  qty: number;
  precio_centavos: string;
  bruto_centavos: string;
  desc_linea_centavos: string;
  desc_ticket_centavos: string;
  neto_centavos: string;
}

// TV1/TV2 (P10-5): las líneas congeladas al emitir. DB primero y, si la
// tabla no tiene filas, cae al espejo memoria de la misma venta.
export async function leerLineasTicket(saleId: string): Promise<TicketLineaResumen[]> {
  const db = dbVivaTenant();
  if (db) {
    try {
      const filas = await db
        .select({
          productId: ticketLines.productId,
          sku: products.sku,
          qty: ticketLines.qty,
          precio: ticketLines.precioCentavos,
        })
        .from(ticketLines)
        .leftJoin(products, eq(ticketLines.productId, products.id))
        .where(eq(ticketLines.saleId, saleId));
      const desc = await db.select().from(ticketDiscounts).where(eq(ticketDiscounts.saleId, saleId));
      const porSku = new Map(desc.map((d) => [d.sku, d] as const));
      return filas.map((f, idx) => {
        const bruto = f.precio * BigInt(f.qty);
        const d = porSku.get(f.sku ?? "") ?? desc[idx];
        return {
          sku: f.sku ?? f.productId,
          qty: f.qty,
          precio_centavos: f.precio.toString(),
          bruto_centavos: d ? d.brutoCentavos.toString() : bruto.toString(),
          desc_linea_centavos: d ? d.descLineaCentavos.toString() : "0",
          desc_ticket_centavos: d ? d.descTicketCentavos.toString() : "0",
          neto_centavos: d ? d.netoCentavos.toString() : bruto.toString(),
        };
      });
    } catch {
      return leerLineasEnMemoria(saleId);
    }
  }
  return leerLineasEnMemoria(saleId);
}

function leerLineasEnMemoria(saleId: string): TicketLineaResumen[] {
  const lineas = listarLineasTicket(saleId);
  const descuentos = listarDescuentosTicket(saleId);
  if (descuentos.length === 0) {
    return lineas.map((l) => {
      const bruto = BigInt(l.precio_centavos) * BigInt(l.qty);
      return {
        sku: l.product_id,
        qty: l.qty,
        precio_centavos: l.precio_centavos,
        bruto_centavos: bruto.toString(),
        desc_linea_centavos: "0",
        desc_ticket_centavos: "0",
        neto_centavos: bruto.toString(),
      };
    });
  }
  return descuentos
    .sort((a, b) => a.linea_idx - b.linea_idx)
    .map((d) => {
      const linea = lineas[d.linea_idx];
      return {
        sku: d.sku,
        qty: linea?.qty ?? 0,
        precio_centavos: linea?.precio_centavos ?? "0",
        bruto_centavos: d.bruto_centavos,
        desc_linea_centavos: d.desc_linea_centavos,
        desc_ticket_centavos: d.desc_ticket_centavos,
        neto_centavos: d.neto_centavos,
      };
    });
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

function espejoLink(
  link: TicketLinkEmitido,
  links: AlmacenVivo<TicketLinkEmitido>,
  porHash: AlmacenVivo<TicketLinkEmitido>,
  vistos: AlmacenVivo<TicketLinkEmitido>,
): void {
  links.guardar(link.id, link);
  porHash.guardar(link.tokenHash, link);
  vistos.guardar(link.idempotencyKey, link);
}

export async function buscarTicketPorNumero(
  numero: string,
): Promise<{ ticket: TicketResumen; fuente: "db" | "memoria" } | null> {
  const idempotencia = crearAlmacenIdempotenciaVentas();
  const db = dbVivaTenant();
  if (!db) return buscarTicketEnMemoria(numero, idempotencia);
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
    idempotencia.anteFalloPersistencia(e);
    return buscarTicketEnMemoria(numero, idempotencia);
  }
}

function buscarTicketEnMemoria(
  numero: string,
  idempotencia: AlmacenVivo<StoredTicket>,
): { ticket: TicketResumen; fuente: "db" | "memoria" } | null {
  for (const t of listarTicketsFiado()) {
    if (t.ticket_definitivo === numero || t.ticket_provisorio === numero) {
      return { ticket: { ...t }, fuente: "memoria" };
    }
  }
  for (const t of idempotencia.comoMapaSoloLectura().values()) {
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
  const envios = crearAlmacenTicketEnviosCentral();
  return ya_enviado(envios.comoMapaSoloLectura(), key);
}

export function registrarEnvioCentral(key: string, envio: unknown): void {
  const envios = crearAlmacenTicketEnviosCentral();
  envios.guardar(key, envio);
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
  const links = crearAlmacenTicketLinks();
  const porHash = crearAlmacenTicketLinksPorHash();
  const vistos = crearAlmacenTicketLinkVistos();
  const hash = sha256Hex(input.tokenPlano);
  const db = dbVivaTenant();
  if (!db) return crearLinkEnMemoria(input, hash, links, porHash, vistos);
  try {
    return await crearLinkEnDb(db, input, hash, links, porHash, vistos);
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
        links.anteFalloPersistencia(e2);
      }
      links.anteFalloPersistencia(e);
      return crearLinkEnMemoria(input, hash, links, porHash, vistos);
    }
    links.anteFalloPersistencia(e);
    return crearLinkEnMemoria(input, hash, links, porHash, vistos);
  }
}

async function crearLinkEnDb(
  db: TenantDb,
  input: { saleId: string; idempotencyKey: string; tokenPlano: string; ttlMs?: number | undefined },
  hash: string,
  links: AlmacenVivo<TicketLinkEmitido>,
  porHash: AlmacenVivo<TicketLinkEmitido>,
  vistos: AlmacenVivo<TicketLinkEmitido>,
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
  espejoLink(r.link, links, porHash, vistos);
  return { ok: true, link: r.link, fuente: "db" };
}

function crearLinkEnMemoria(
  input: { saleId: string; idempotencyKey: string; tokenPlano: string; ttlMs?: number | undefined },
  hash: string,
  links: AlmacenVivo<TicketLinkEmitido>,
  porHash: AlmacenVivo<TicketLinkEmitido>,
  vistos: AlmacenVivo<TicketLinkEmitido>,
): CrearLinkResultado {
  const r = crear_link({
    saleId: input.saleId,
    idempotencyKey: input.idempotencyKey,
    tokenPlano: input.tokenPlano,
    tokenHash: hash,
    nowMs: Date.now(),
    ...(input.ttlMs !== undefined ? { ttlMs: input.ttlMs } : {}),
    linkId: crypto.randomUUID(),
    vistos: vistos.mapaVivo(),
    hashesVistos: new Set(porHash.comoMapaSoloLectura().keys()),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", original: r.original };
    return { ok: false, codigo: "LINK_INVALIDO" };
  }
  espejoLink(r.link, links, porHash, vistos);
  return { ok: true, link: r.link, fuente: "memoria" };
}

export type ResolverLinkResultado =
  | { ok: true; saleId: string; linkId: string; leyenda: string }
  | { ok: false; codigo: "TOKEN_INVALIDO" | "EXPIRADO" | "REVOCADO" };

export async function resolverLinkPublico(tokenPlano: string): Promise<ResolverLinkResultado> {
  if (!esTokenPlanoValido(tokenPlano)) return { ok: false, codigo: "TOKEN_INVALIDO" };
  const porHash = crearAlmacenTicketLinksPorHash();
  const revocaciones = crearAlmacenTicketLinkRevocaciones();
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
      porHash.anteFalloPersistencia(e);
    }
  }
  return resolverLinkEnMemoria(tokenPlano, hash, porHash, revocaciones);
}

function resolverLinkEnMemoria(
  tokenPlano: string,
  hash: string,
  porHash: AlmacenVivo<TicketLinkEmitido>,
  revocaciones: AlmacenVivo<RevocacionLink>,
): ResolverLinkResultado {
  const vista = porHash.comoMapaSoloLectura();
  let encontrado = false;
  for (const h of vista.keys()) {
    const a = Buffer.from(h, "utf8");
    const b2 = Buffer.from(hash, "utf8");
    if (a.length === b2.length && timingSafeEqual(a, b2)) {
      encontrado = true;
      break;
    }
  }
  if (!encontrado && !vista.has(hash)) {
    return { ok: false, codigo: "TOKEN_INVALIDO" };
  }
  const r = resolver_link({
    tokenPlano,
    tokenHash: hash,
    nowMs: Date.now(),
    porHash: vista,
    revocadas: new Set(revocaciones.comoMapaSoloLectura().keys()),
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
  const links = crearAlmacenTicketLinks();
  const revocaciones = crearAlmacenTicketLinkRevocaciones();
  const revokeVistos = crearAlmacenTicketLinkRevokeVistos();
  const db = dbVivaTenant();
  if (!db) return revocarLinksEnMemoria(input, links, revocaciones, revokeVistos);
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
      revocaciones.guardar(rev.linkId, rev);
    }
    revokeVistos.guardar(input.idempotencyKey, [...r.revocaciones]);
    return { ok: true, revocaciones: [...r.revocaciones] };
  } catch (e) {
    revocaciones.anteFalloPersistencia(e);
    return revocarLinksEnMemoria(input, links, revocaciones, revokeVistos);
  }
}

function revocarLinksEnMemoria(
  input: {
    saleId: string;
    actor: string;
    motivo: string;
    idempotencyKey: string;
  },
  links: AlmacenVivo<TicketLinkEmitido>,
  revocaciones: AlmacenVivo<RevocacionLink>,
  revokeVistos: AlmacenVivo<Array<RevocacionLink>>,
): RevocarLinksResultado {
  const deLaVenta = [...links.comoMapaSoloLectura().values()].filter((l) => l.saleId === input.saleId);
  const r = revocar_por_venta({
    saleId: input.saleId,
    actor: input.actor,
    motivo: input.motivo,
    nowMs: Date.now(),
    idempotencyKey: input.idempotencyKey,
    linksDeLaVenta: deLaVenta,
    revocacionesPrevias: revocaciones.mapaVivo(),
    vistos: revokeVistos.mapaVivo(),
  });
  if (!r.ok) {
    if (r.codigo === "YA_VISTO") return { ok: false, codigo: "YA_VISTO", originales: r.originales };
    return { ok: false, codigo: "REVOQUE_INVALIDO" };
  }
  for (const rev of r.revocaciones) {
    revocaciones.guardar(rev.linkId, rev);
  }
  revokeVistos.guardar(input.idempotencyKey, [...r.revocaciones]);
  return { ok: true, revocaciones: [...r.revocaciones] };
}
