import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { priceAdjustmentSchema } from "../../../lib/validation.js";
import { control, store } from "../../../lib/store.js";
import { esDueno, resolverSesion } from "../../../lib/control.js";
import { getTenantDb } from "../../../lib/db.js";
import { priceAdjustments, pricingAuditLog } from "../../../db/schema-precios.js";
import { crearAjuste } from "../../../modules/pricing/precios.js";

export const prerender = false;

// POST /api/prices/adjustments — GP1 idempotente, sensible exige online + confirmación.
// Solo el Dueño del comercio (sesión + membership dueño activa): el ajuste
// cambia precios de venta y no es operación de empleado.
// PERS-S4: DB-first. Clave repetida responde 409 con relectura; ajuste +
// auditoría entran en 1 tx con espejo memoria. Sin DB o ante error, la vía
// memoria histórica resuelve igual que antes. Sesión y dueño quedan en memoria
// hasta el slice de auth.

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

function esConflictoUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: unknown }).code === "23505";
}

export const POST: APIRoute = async ({ request }) => {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!key) return Response.json({ error: "falta Idempotency-Key" }, { status: 422 });
  const ctx = resolverSesion(request);
  if (!ctx) return Response.json({ error: "requiere sesión" }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = priceAdjustmentSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const tenantId = (body as { tenant_id?: string }).tenant_id ?? "";
  if (!tenantId || !control.tenants.has(tenantId) || !esDueno(tenantId, ctx.googleSub)) {
    return Response.json({ error: "solo el dueño puede ajustar precios" }, { status: 403 });
  }
  const r = crearAjuste({
    idempotencyKey: key,
    direccion: b.direccion,
    porcentaje: b.porcentaje,
    vigenciaTipo: b.vigencia_tipo,
    aplicaEn: b.aplica_en ?? null,
    confirmado: b.confirmado,
    online: true,
    rol: "dueno",
    creadoPor: b.creado_por,
    ahoraIso: new Date().toISOString(),
    ...(b.paso_centavos !== undefined ? { pasoCentavos: BigInt(b.paso_centavos) } : {}),
    items: b.items.map((i) => ({ sku: i.sku, vigenteCentavos: BigInt(i.vigente_centavos), costoCentavos: BigInt(i.costo_centavos ?? 0) })),
    vistos: store.ajustes,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });

  const db = dbViva();
  if (!db) {
    store.ajustes.set(key, r.ajuste);
    return Response.json({ ajuste_id: r.ajuste.id }, { status: 201 });
  }

  try {
    const previo = await db.select().from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, key)).limit(1);
    if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
    const ahora = new Date();
    // El id de dominio (`aj-<key>`) no es uuid: la DB genera el propio y la
    // ruta devuelve ese. La clave de idempotencia sigue siendo la llave.
    const ins = await db.transaction(async (tx) => {
      const filas = await tx
        .insert(priceAdjustments)
        .values({
          idempotencyKey: key,
          direccion: r.ajuste.direccion,
          porcentajeBp: Math.round(r.ajuste.porcentaje * 100),
          pasoCentavos: r.ajuste.pasoCentavos,
          vigenciaTipo: r.ajuste.vigenciaTipo,
          aplicaEn: r.ajuste.aplicaEn ? new Date(r.ajuste.aplicaEn) : null,
          estado: r.ajuste.estado,
          confirmado: b.confirmado,
          creadoPor: r.ajuste.creadoPor,
          createdAt: ahora,
        })
        .returning({ id: priceAdjustments.id });
      const fila = filas[0];
      if (!fila) throw new Error("ajuste sin fila");
      await tx.insert(pricingAuditLog).values({
        actor: r.ajuste.creadoPor,
        ajusteId: fila.id,
        motivo: r.auditoria.motivo,
        antes: { texto: r.auditoria.antes } as never,
        despues: { texto: r.auditoria.despues } as never,
      });
      return fila.id;
    });
    store.ajustes.set(key, r.ajuste);
    return Response.json({ ajuste_id: ins, fuente: "db" }, { status: 201 });
  } catch (e) {
    // Carrera entre pre-check e insert: mismo 409 con relectura.
    if (esConflictoUnico(e)) {
      try {
        const previo = await db.select().from(priceAdjustments).where(eq(priceAdjustments.idempotencyKey, key)).limit(1);
        if (previo[0]) return Response.json({ error: "idempotency-key repetida" }, { status: 409 });
      } catch {
        // Cae a la vía memoria de abajo.
      }
    }
    // Caída de DB a mitad de camino: la tx revirtió; el ajuste no se pierde.
    store.ajustes.set(key, r.ajuste);
    return Response.json({ ajuste_id: r.ajuste.id }, { status: 201 });
  }
};
