// TV9 — Ticket salida: link público con token + vencimiento (Slice A, núcleo puro).
// Aislado: sin IO, sin Drizzle, sin store, sin imports del repo.
// El adaptador (ruta) hace: auth + lock + INSERT/SELECT en una sola tx; acá
// solo se decide. Respeta ADR-0004: dinero bigint, append-only (nunca UPDATE),
// Idempotency-Key en POST, leyenda no fiscal siempre.
//
// Decisiones:
// - Token opaco 128b (16 bytes) -> base64url sin padding (22 chars). El plano
//   se muestra UNA vez al crear; en DB solo va el SHA-256 hex (token_hash UNIQUE).
// - Vencimiento configurable, default 72h, tope 30d (evita links eternos).
// - Revocar = INSERT en documento vinculado (ticket_link_revocations), NUNCA
//   UPDATE sobre ticket_links. La columna `revocado` del DDL es solo read-model
//   mantenido por trigger/migración; el núcleo decide contra el snapshot de
//   revocaciones. Sin revocaciones a la vista => no revocado.
// - Resolver distingue 404 (formato inválido / hash desconocido) de 410
//   (EXPIRADO por tiempo / REVOCADO por acción). Si ambas aplican, gana
//   REVOCADO (la acción explícita prevalece sobre el paso del tiempo).

export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

export const DEFAULT_TTL_MS: number = 72 * 60 * 60 * 1000; // 72h
export const MAX_TTL_MS: number = 30 * 24 * 60 * 60 * 1000; // 30d
export const TOKEN_BYTES: number = 16; // 128b
export const TOKEN_HASH_HEX_LEN: number = 64; // SHA-256 hex

export interface TicketLinkEmitido {
  readonly id: string;
  readonly saleId: string;
  readonly tokenHash: string; // SHA-256 hex, UNIQUE
  readonly expiraAtMs: number;
  readonly createdAtMs: number;
  readonly idempotencyKey: string;
}

export interface RevocacionLink {
  readonly linkId: string;
  readonly saleId: string;
  readonly actor: string;
  readonly motivo: string;
  readonly createdAtMs: number;
  readonly idempotencyKey: string;
}

export interface CrearLinkInput {
  readonly saleId: string;
  readonly idempotencyKey: string;
  readonly tokenPlano: string; // 22 chars base64url, generado por el adaptador
  readonly tokenHash: string; // SHA-256 hex del plano, calculado por el adaptador
  readonly nowMs: number;
  readonly ttlMs?: number | undefined; // default 72h
  readonly linkId: string; // uuid v4 del adaptador
  readonly vistos: ReadonlyMap<string, TicketLinkEmitido>; // Idempotency-Key -> link
  readonly hashesVistos: ReadonlySet<string>; // colisión hash (improbable, se chequea)
}

export interface RevocarPorVentaInput {
  readonly saleId: string;
  readonly actor: string;
  readonly motivo: string;
  readonly nowMs: number;
  readonly idempotencyKey: string; // Idempotency-Key del DELETE/revoke
  readonly linksDeLaVenta: ReadonlyArray<TicketLinkEmitido>;
  readonly revocacionesPrevias: ReadonlyMap<string, RevocacionLink>; // linkId -> revocación
  readonly vistos: ReadonlyMap<string, ReadonlyArray<RevocacionLink>>; // revoke idemKey -> emitidas
}

export interface ResolverLinkInput {
  readonly tokenPlano: string;
  readonly tokenHash: string; // hash calculado por el adaptador (timing-safe allá)
  readonly nowMs: number;
  readonly porHash: ReadonlyMap<string, TicketLinkEmitido>;
  readonly revocadas: ReadonlySet<string>; // linkIds con fila en ticket_link_revocations
}

export type FalloCrearLink =
  | { readonly ok: false; readonly codigo: "YA_VISTO"; readonly status: 409; readonly original: TicketLinkEmitido }
  | { readonly ok: false; readonly codigo: "LINK_INVALIDO"; readonly status: 422 };

export type CrearLinkResult = { readonly ok: true; readonly link: TicketLinkEmitido } | FalloCrearLink;

export type FalloRevocar =
  | { readonly ok: false; readonly codigo: "YA_VISTO"; readonly status: 409; readonly originales: ReadonlyArray<RevocacionLink> }
  | { readonly ok: false; readonly codigo: "REVOQUE_INVALIDO"; readonly status: 422 };

export type RevocarResult =
  | { readonly ok: true; readonly revocaciones: ReadonlyArray<RevocacionLink> }
  | FalloRevocar;

export type ResolverResult =
  | { readonly ok: true; readonly saleId: string; readonly linkId: string; readonly leyenda: typeof LEYENDA_NO_FISCAL }
  | { readonly ok: false; readonly codigo: "TOKEN_INVALIDO"; readonly status: 404 }
  | { readonly ok: false; readonly codigo: "EXPIRADO"; readonly status: 410 }
  | { readonly ok: false; readonly codigo: "REVOCADO"; readonly status: 410 };

// --- Validadores puros (inyectables en tests, sin crypto acá) ---

/** base64url sin padding de exactamente 16 bytes => 22 chars [A-Za-z0-9_-]. */
export function esTokenPlanoValido(t: string): boolean {
  if (t.length !== 22) return false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const ok =
      (c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 45 || // -
      c === 95; // _
    if (!ok) return false;
  }
  return true;
}

export function esHashValido(h: string): boolean {
  if (h.length !== TOKEN_HASH_HEX_LEN) return false;
  for (let i = 0; i < h.length; i++) {
    const c = h.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
    if (!ok) return false;
  }
  return true;
}

/** Codifica 16 bytes a base64url sin padding. Puro, sin dependencias. */
export function bytesABase64Url(b: ReadonlyArray<number> | Uint8Array): string {
  const bytes: ReadonlyArray<number> = Array.isArray(b) ? b : Array.from(b);
  if (bytes.length !== TOKEN_BYTES) throw new Error("se requieren 16 bytes");
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    const rem = bytes.length - i;
    out += ABC[(n >>> 18) & 63];
    out += ABC[(n >>> 12) & 63];
    if (rem > 1) out += ABC[(n >>> 6) & 63];
    if (rem > 2) out += ABC[n & 63];
    i += 3;
  }
  return out;
}

// --- Núcleo ---

export function crear_link(input: CrearLinkInput): CrearLinkResult {
  const visto = input.vistos.get(input.idempotencyKey);
  if (visto) return { ok: false, codigo: "YA_VISTO", status: 409, original: visto };
  if (!input.idempotencyKey || !input.saleId || !input.linkId) {
    return { ok: false, codigo: "LINK_INVALIDO", status: 422 };
  }
  if (!esTokenPlanoValido(input.tokenPlano) || !esHashValido(input.tokenHash)) {
    return { ok: false, codigo: "LINK_INVALIDO", status: 422 };
  }
  if (input.hashesVistos.has(input.tokenHash)) {
    // Colisión SHA-256 (astronómicamente improbable): el adaptador regenera token.
    return { ok: false, codigo: "LINK_INVALIDO", status: 422 };
  }
  if (!Number.isFinite(input.nowMs) || input.nowMs <= 0) {
    return { ok: false, codigo: "LINK_INVALIDO", status: 422 };
  }
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > MAX_TTL_MS) {
    return { ok: false, codigo: "LINK_INVALIDO", status: 422 };
  }
  const link: TicketLinkEmitido = Object.freeze({
    id: input.linkId,
    saleId: input.saleId,
    tokenHash: input.tokenHash.toLowerCase(),
    expiraAtMs: input.nowMs + ttl,
    createdAtMs: input.nowMs,
    idempotencyKey: input.idempotencyKey,
  });
  return { ok: true, link };
}

export function revocar_por_venta(input: RevocarPorVentaInput): RevocarResult {
  const vistos = input.vistos.get(input.idempotencyKey);
  if (vistos) return { ok: false, codigo: "YA_VISTO", status: 409, originales: vistos };
  if (!input.idempotencyKey || !input.saleId || !input.actor) {
    return { ok: false, codigo: "REVOQUE_INVALIDO", status: 422 };
  }
  if (!input.motivo.trim() || input.motivo.length > 280) {
    return { ok: false, codigo: "REVOQUE_INVALIDO", status: 422 };
  }
  const nuevas: RevocacionLink[] = [];
  for (const l of input.linksDeLaVenta) {
    if (l.saleId !== input.saleId) continue;
    if (input.revocacionesPrevias.has(l.id)) continue; // ya revocado: append-only, no duplicar
    nuevas.push(
      Object.freeze({
        linkId: l.id,
        saleId: input.saleId,
        actor: input.actor,
        motivo: input.motivo,
        createdAtMs: input.nowMs,
        idempotencyKey: `${input.idempotencyKey}:${l.id}`,
      }),
    );
  }
  return { ok: true, revocaciones: Object.freeze(nuevas) };
}

export function resolver_link(input: ResolverLinkInput): ResolverResult {
  // 404: formato roto nunca toca DB (el adaptador puede atajar antes).
  if (!esTokenPlanoValido(input.tokenPlano) || !esHashValido(input.tokenHash)) {
    return { ok: false, codigo: "TOKEN_INVALIDO", status: 404 };
  }
  const link = input.porHash.get(input.tokenHash.toLowerCase());
  if (!link) return { ok: false, codigo: "TOKEN_INVALIDO", status: 404 };
  // La acción explícita prevalece sobre el paso del tiempo.
  if (input.revocadas.has(link.id)) return { ok: false, codigo: "REVOCADO", status: 410 };
  if (input.nowMs >= link.expiraAtMs) return { ok: false, codigo: "EXPIRADO", status: 410 };
  return { ok: true, saleId: link.saleId, linkId: link.id, leyenda: LEYENDA_NO_FISCAL };
}
