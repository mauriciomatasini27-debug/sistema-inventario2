import { and, eq } from "drizzle-orm";
import { filaConTenant, dondeTenant } from "../tenant-scope.js";
import { proveedorContactos, proveedorCupo, proveedorInvitaciones } from "../../db/schema-proveedores.js";
import type { ContactoProveedor, EstadoContactoProveedor, InvitacionProveedor } from "../../modules/whatsapp/proveedor.js";
import { idsConBasePropia } from "../db.js";
import { control } from "./_almacen.js";
import { BaseNoDisponible, intentarLeer, intentarPersistir, dbVivaTenant, type TenantDb } from "../server-db.js";

// #68: un E.164 (o un hash) pertenece a un solo comercio, y la fila se escribe
// en la base de ese comercio. El webhook no conoce el comercio hasta leerla,
// así que la búsqueda global recorre las bases conocidas. Sin base, el espejo
// de `control` es la copia (single y tests).

function destinosGlobales(): Array<string | undefined> {
  const especificos = idsConBasePropia();
  try {
    if (!dbVivaTenant()) return especificos;
  } catch (e) {
    if (e instanceof BaseNoDisponible) return especificos;
    throw e;
  }
  return [...especificos, undefined];
}

async function primeraFila<T>(fn: (db: TenantDb) => Promise<T | null>): Promise<T | null> {
  for (const tenantId of destinosGlobales()) {
    const fila = await intentarLeer(fn, tenantId);
    if (fila != null) return fila;
  }
  return null;
}

function estadoDe(estado: string): EstadoContactoProveedor {
  if (estado === "pendiente" || estado === "verificado" || estado === "revocado") return estado;
  throw new Error("estado_contacto_invalido");
}

function contactoDe(fila: typeof proveedorContactos.$inferSelect): ContactoProveedor {
  const creadoEn = fila.creadoEn instanceof Date ? fila.creadoEn.toISOString() : new Date(fila.creadoEn).toISOString();
  return {
    numeroE164: fila.numeroE164,
    tenantId: fila.tenantId,
    supplierCuit: fila.supplierCuit,
    estado: estadoDe(fila.estado),
    creadoEn,
  };
}

function invitacionDe(fila: typeof proveedorInvitaciones.$inferSelect): InvitacionProveedor {
  return {
    tenantId: fila.tenantId,
    supplierCuit: fila.supplierCuit,
    codigoHash: fila.codigoHash,
    expiraEn: fila.expiraEnMs,
    usado: fila.usado,
  };
}

function marcasDe(valor: unknown): number[] {
  if (!Array.isArray(valor)) return [];
  const marcas: number[] = [];
  for (const item of valor) {
    if (typeof item === "number" && Number.isFinite(item)) marcas.push(item);
  }
  return marcas;
}

function espejarCupo(numero: string, marcasMs: readonly number[], aviso: boolean): void {
  control.proveedorCupo.set(numero, [...marcasMs]);
  if (aviso) control.proveedorCupoAviso.set(numero, true);
  else control.proveedorCupoAviso.delete(numero);
}

export async function contactoPorNumero(numero: string): Promise<ContactoProveedor | null> {
  const fila = await primeraFila(async (db) => {
    const [f] = await db
      .select()
      .from(proveedorContactos)
      .where(eq(proveedorContactos.numeroE164, numero))
      .limit(1);
    return f ?? null;
  });
  if (fila) {
    const contacto = contactoDe(fila);
    control.proveedorContactos.set(numero, contacto);
    return contacto;
  }
  return control.proveedorContactos.get(numero) ?? null;
}

export async function listarContactos(tenantId: string): Promise<ContactoProveedor[]> {
  const porNumero = new Map<string, ContactoProveedor>();
  for (const contacto of control.proveedorContactos.values()) {
    if (contacto.tenantId === tenantId) porNumero.set(contacto.numeroE164, contacto);
  }
  const filas = await intentarLeer(
    (db) => db.select().from(proveedorContactos).where(eq(proveedorContactos.tenantId, tenantId)),
    tenantId,
  );
  if (filas) {
    for (const fila of filas) {
      const contacto = contactoDe(fila);
      porNumero.set(contacto.numeroE164, contacto);
      control.proveedorContactos.set(contacto.numeroE164, contacto);
    }
  }
  return [...porNumero.values()];
}

export async function guardarContacto(contacto: ContactoProveedor): Promise<void> {
  const previo = await contactoPorNumero(contacto.numeroE164);
  if (previo && previo.tenantId !== contacto.tenantId) {
    await intentarPersistir(
      (db) =>
        db
          .delete(proveedorContactos)
          .where(and(eq(proveedorContactos.numeroE164, contacto.numeroE164), eq(proveedorContactos.tenantId, previo.tenantId))),
      previo.tenantId,
    );
  }
  await intentarPersistir(
    (db) =>
      db
        .insert(proveedorContactos)
        .values({
          numeroE164: contacto.numeroE164,
          tenantId: contacto.tenantId,
          supplierCuit: contacto.supplierCuit,
          estado: contacto.estado,
          creadoEn: new Date(contacto.creadoEn),
        })
        .onConflictDoUpdate({
          target: proveedorContactos.numeroE164,
          set: {
            tenantId: contacto.tenantId,
            supplierCuit: contacto.supplierCuit,
            estado: contacto.estado,
            creadoEn: new Date(contacto.creadoEn),
          },
        }),
    contacto.tenantId,
  );
  control.proveedorContactos.set(contacto.numeroE164, contacto);
}

export async function invitacionPorHash(codigoHash: string): Promise<InvitacionProveedor | null> {
  const fila = await primeraFila(async (db) => {
    const [f] = await db.select().from(proveedorInvitaciones).where(eq(proveedorInvitaciones.codigoHash, codigoHash)).limit(1);
    return f ?? null;
  });
  if (fila) {
    const invitacion = invitacionDe(fila);
    control.proveedorInvitaciones.set(codigoHash, invitacion);
    return invitacion;
  }
  return control.proveedorInvitaciones.get(codigoHash) ?? null;
}

export async function guardarInvitacion(invitacion: InvitacionProveedor): Promise<void> {
  await intentarPersistir(
    (db) =>
      db
        .insert(proveedorInvitaciones)
        .values({
          codigoHash: invitacion.codigoHash,
          tenantId: invitacion.tenantId,
          supplierCuit: invitacion.supplierCuit,
          expiraEnMs: invitacion.expiraEn,
          usado: invitacion.usado,
        })
        .onConflictDoUpdate({
          target: proveedorInvitaciones.codigoHash,
          set: {
            tenantId: invitacion.tenantId,
            supplierCuit: invitacion.supplierCuit,
            expiraEnMs: invitacion.expiraEn,
            usado: invitacion.usado,
          },
        }),
    invitacion.tenantId,
  );
  control.proveedorInvitaciones.set(invitacion.codigoHash, invitacion);
}

export async function leerCupo(numero: string, tenantId: string): Promise<{ marcasMs: number[]; aviso: boolean }> {
  const fila = await intentarLeer(async (db) => {
    const [f] = await db.select().from(proveedorCupo).where(eq(proveedorCupo.numeroE164, numero)).limit(1);
    return f ?? null;
  }, tenantId);
  if (fila) {
    const marcasMs = marcasDe(fila.marcasMs);
    espejarCupo(numero, marcasMs, fila.aviso);
    return { marcasMs, aviso: fila.aviso };
  }
  return {
    marcasMs: [...(control.proveedorCupo.get(numero) ?? [])],
    aviso: control.proveedorCupoAviso.has(numero),
  };
}

export async function guardarCupo(
  numero: string,
  tenantId: string,
  marcasMs: readonly number[],
  aviso: boolean,
): Promise<void> {
  const marcas = [...marcasMs];
  await intentarPersistir(
    (db) =>
      db
        .insert(proveedorCupo)
        .values(filaConTenant({ numeroE164: numero, marcasMs: marcas, aviso }))
        .onConflictDoUpdate({
          target: [proveedorCupo.tenantId, proveedorCupo.numeroE164],
          set: { marcasMs: marcas, aviso },
        }),
    tenantId,
  );
  espejarCupo(numero, marcas, aviso);
}

export async function limpiarCupo(numero: string, tenantId: string): Promise<void> {
  await intentarPersistir(
    (db) => db.delete(proveedorCupo).where(dondeTenant(proveedorCupo.tenantId, eq(proveedorCupo.numeroE164, numero))),
    tenantId,
  );
  control.proveedorCupo.delete(numero);
  control.proveedorCupoAviso.delete(numero);
}
