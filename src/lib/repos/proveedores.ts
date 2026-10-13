import { eq } from "drizzle-orm";
import { suppliers } from "../../db/schema-proveedores.js";
import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { store } from "../store.js";
import { crearSupplier, normalizarCuit, type Supplier } from "../../modules/purchases/proveedores.js";

export interface ProveedorNuevo {
  readonly cuit: string;
  readonly nombre: string;
  readonly email?: string | undefined;
  readonly telefono?: string | undefined;
  readonly ahoraIso: string;
}

export type AltaProveedorResultado =
  | { ok: true; supplierId: string; cuit: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "CUIT_EXISTE"; error: string }
  | { ok: false; codigo: "NO_VALIDO"; error: string };

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

export async function altaProveedor(input: ProveedorNuevo): Promise<AltaProveedorResultado> {
  const r = crearSupplier({
    cuit: input.cuit,
    nombre: input.nombre,
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
    ahoraIso: input.ahoraIso,
    creados: store.suppliers,
  });
  if (r.status !== 201) {
    if (r.status === 409) return { ok: false, codigo: "CUIT_EXISTE", error: r.error };
    return { ok: false, codigo: "NO_VALIDO", error: r.error };
  }
  const cuit = normalizarCuit(r.supplier.cuit);
  const db = dbVivaTenant();
  if (!db) {
    store.suppliers.set(cuit, r.supplier);
    return { ok: true, supplierId: r.supplier.id, cuit: r.supplier.cuit, fuente: "memoria" };
  }
  try {
    return await altaProveedorEnDb(db, cuit, r.supplier);
  } catch (e) {
    if (esModoMulti()) throw aBaseNoDisponible(e);
    store.suppliers.set(cuit, r.supplier);
    return { ok: true, supplierId: r.supplier.id, cuit: r.supplier.cuit, fuente: "memoria" };
  }
}

async function altaProveedorEnDb(db: TenantDb, cuit: string, supplier: Supplier): Promise<AltaProveedorResultado> {
  const previo = await db.select().from(suppliers).where(eq(suppliers.cuit, cuit)).limit(1);
  if (previo[0]) return { ok: false, codigo: "CUIT_EXISTE", error: "proveedor ya existe" };
  // El id de dominio (sup-<cuit>) no es uuid: la copia durable va sin id
  // (defaultRandom) con cuit UNIQUE.
  const filas = await db
    .insert(suppliers)
    .values({
      cuit: supplier.cuit,
      nombre: supplier.nombre,
      email: supplier.email,
      telefono: supplier.telefono,
    })
    .onConflictDoNothing({ target: suppliers.cuit })
    .returning({ id: suppliers.id });
  if (!filas[0]) return { ok: false, codigo: "CUIT_EXISTE", error: "proveedor ya existe" };
  store.suppliers.set(cuit, supplier);
  return { ok: true, supplierId: supplier.id, cuit: supplier.cuit, fuente: "db" };
}
