import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { supplierInputSchema, crearSupplier, normalizarCuit } from "../../modules/purchases/proveedores.js";
import { store } from "../../lib/store.js";
import { getTenantDb } from "../../lib/db.js";
import { suppliers } from "../../db/schema-proveedores.js";

export const prerender = false;

type TenantDb = ReturnType<typeof getTenantDb>;

function dbViva(): TenantDb | null {
  try {
    return getTenantDb();
  } catch {
    return null;
  }
}

// POST /api/suppliers — alta de proveedor (FP). 409 si el CUIT ya existe.
// PERS-S4: DB-first. Pre-check por CUIT + onConflictDoNothing con relectura:
// la clave repetida responde 409 real aunque la memoria esté fría; el espejo
// memoria se actualiza tras el insert. Sin DB o ante error, la vía memoria
// histórica resuelve igual que antes.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = supplierInputSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;
  const r = crearSupplier({
    cuit: b.cuit,
    nombre: b.nombre,
    ...(b.email !== undefined ? { email: b.email } : {}),
    ...(b.telefono !== undefined ? { telefono: b.telefono } : {}),
    ahoraIso: new Date().toISOString(),
    creados: store.suppliers,
  });
  if (r.status !== 201) return Response.json({ error: r.error }, { status: r.status });

  const cuit = normalizarCuit(r.supplier.cuit);
  const espejo = () => {
    store.suppliers.set(cuit, r.supplier);
  };

  const db = dbViva();
  if (!db) {
    espejo();
    return Response.json({ supplier_id: r.supplier.id, cuit: r.supplier.cuit }, { status: 201 });
  }

  try {
    const previo = await db.select().from(suppliers).where(eq(suppliers.cuit, cuit)).limit(1);
    if (previo[0]) return Response.json({ error: "proveedor ya existe" }, { status: 409 });
    // El id de dominio (sup-<cuit>) no es uuid: la copia durable va sin id
    // (defaultRandom) con cuit UNIQUE.
    const filas = await db
      .insert(suppliers)
      .values({
        cuit: r.supplier.cuit,
        nombre: r.supplier.nombre,
        email: r.supplier.email,
        telefono: r.supplier.telefono,
      })
      .onConflictDoNothing({ target: suppliers.cuit })
      .returning({ id: suppliers.id });
    if (!filas[0]) {
      // Carrera entre pre-check e insert: el CUIT ya está, 409 real.
      return Response.json({ error: "proveedor ya existe" }, { status: 409 });
    }
    espejo();
    return Response.json({ supplier_id: r.supplier.id, cuit: r.supplier.cuit, fuente: "db" }, { status: 201 });
  } catch {
    // Caída de DB a mitad de camino: el alta no se pierde, queda en memoria.
    espejo();
    return Response.json({ supplier_id: r.supplier.id, cuit: r.supplier.cuit }, { status: 201 });
  }
};
