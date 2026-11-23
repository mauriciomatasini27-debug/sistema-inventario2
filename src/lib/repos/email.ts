import { and, eq, ne } from "drizzle-orm";
import { dondeTenant, filaConTenant } from "../tenant-scope.js";
import { emailOutbox, notificationEvents } from "../../db/schema-email.js";
import { listarMovimientosCaja } from "./movimientos-caja.js";
import { conTenant, tenantActual, tenantIdAlSellar } from "../tenant-mode.js";
import { dbVivaTenant } from "../server-db.js";
import { cifrarCampoOutbox } from "../../modules/email/outbox-cifrado.js";
import { crearAlmacenEmailEventos, crearAlmacenEmailOutbox, crearListaMovimientos } from "./_almacen.js";
import { encolar_resumen_cierre, type EncolarResultado, type OutboxPendiente } from "../../modules/email/resumen-cierre.js";
import type { DatosCierre } from "../../modules/email/plantilla-cierre.js";

// Sin contexto en multi (email/send) la memoria particionada no es
// alcanzable: solo se toca con tenant explícito o dentro de conTenant. Las
// factorías resuelven la partición al crearse, por eso se crean dentro del
function conParticion<T>(tenantId: string | undefined, fn: () => T): T {
  if (tenantId) return conTenant(tenantId, fn);
  return fn();
}

// Sin leer el modo en este archivo: con tenant (explícito o ambiente) la
// memoria es alcanzable; sin tenant solo single la tiene (en multi el acceso
// lanza "Falta tenant" y se responde que no hay memoria).
function hayMemoria(tenantId?: string): boolean {
  if (tenantId ?? tenantActual()) return true;
  try {
    crearAlmacenEmailOutbox().comoMapaSoloLectura();
    return true;
  } catch {
    return false;
  }
}

export type EncolarEnvioResultado =
  | { ok: true; key: string; fuente: "db" | "memoria" }
  | { ok: false; codigo: "DUPLICADO"; key: string };

interface EntradaEnvio {
  key: string;
  to: string;
  plantilla: string;
  vars: Record<string, string>;
  asunto?: string | undefined;
  html?: string | undefined;
  texto?: string | undefined;
  estado?: "pendiente" | "enviado" | undefined;
  providerMessageId?: string | null | undefined;
}

type EstadoFila = "pendiente" | "enviado";

// P10-36 [tenant]: solo "enviado" prueba entrega; cualquier otro estado deja la fila reintentable.
function estadoDeFila(estado: string): EstadoFila {
  return estado === "enviado" ? "enviado" : "pendiente";
}

async function estadoFilaOutbox(key: string, tenantId?: string): Promise<EstadoFila | null> {
  const db = dbVivaTenant(tenantId);
  if (db) {
    try {
      const previo = await db
        .select({ estado: emailOutbox.estado })
        .from(emailOutbox)
        .where(dondeTenant(emailOutbox.tenantId, eq(emailOutbox.idempotencyKey, key)))
        .limit(1);
      if (previo[0]) return estadoDeFila(previo[0].estado);
    } catch (e) {
      conParticion(tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
    }
  }
  // P10-36 [tenant]: el espejo en memoria es solo fallback; P10-92 confirma en DB y puede dejarlo viejo.
  if (hayMemoria(tenantId)) {
    const memoria = conParticion(tenantId, () => crearAlmacenEmailOutbox().obtener(key));
    if (memoria) return memoria.estado;
  }
  return null;
}

export async function existeEnvio(key: string, tenantId?: string): Promise<boolean> {
  return (await estadoFilaOutbox(key, tenantId)) === "enviado";
}

function pendienteDeEnvio(input: EntradaEnvio): OutboxPendiente {
  return {
    idempotencyKey: input.key,
    destinatario: input.to,
    asunto: input.asunto ?? input.plantilla,
    html: input.html ?? `<p>${input.plantilla}</p>`,
    texto: input.texto ?? (Object.keys(input.vars).length > 0 ? JSON.stringify(input.vars) : input.plantilla),
    estado: input.estado ?? "pendiente",
    intentos: 0,
    providerMessageId: input.providerMessageId ?? null,
  };
}

// P10-33 [tenant]: el AAD es el tenant con el que se sella la fila; sin contexto la fila cae al espejo en memoria.
function tenantParaCifrar(tenantId?: string): string | null {
  if (tenantId) return tenantId;
  try {
    return tenantIdAlSellar() ?? null;
  } catch {
    return null;
  }
}

function cuerpoCifradoOutbox(html: string, texto: string, tenantId?: string) {
  const tid = tenantParaCifrar(tenantId);
  if (!tid) return { htmlCiphertext: html, textoCiphertext: texto };
  return {
    htmlCiphertext: cifrarCampoOutbox(html, tid, "html"),
    textoCiphertext: cifrarCampoOutbox(texto, tid, "texto"),
  };
}

// Cola de envíos (CH-S1): email_outbox del tenant con DB viva, memoria
// particionada en single sin base. En multi sin base propaga.
export async function encolarEnvio(input: EntradaEnvio & {
  stream: string;
  tenantId?: string | undefined;
}): Promise<EncolarEnvioResultado> {
  const usaMemoria = hayMemoria(input.tenantId);
  const estadoPrevio = await estadoFilaOutbox(input.key, input.tenantId);
  // P10-36 [tenant]: lo pendiente se reintenta, nunca se duplica; solo confirmarlo lo vuelve enviado.
  if (estadoPrevio === "enviado" || (estadoPrevio === "pendiente" && input.estado !== "enviado")) {
    return { ok: false, codigo: "DUPLICADO", key: input.key };
  }
  const db = dbVivaTenant(input.tenantId);
  const envio = pendienteDeEnvio(input);
  if (!db) {
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, envio);
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  if (estadoPrevio === "pendiente") {
    // P10-36 [tenant]: el único por tenant+clave prohíbe insertar; confirma la fila ya encolada.
    try {
      await db
        .update(emailOutbox)
        .set({ estado: "enviado", providerMessageId: envio.providerMessageId })
        .where(
          dondeTenant(
            emailOutbox.tenantId,
            and(eq(emailOutbox.idempotencyKey, input.key), ne(emailOutbox.estado, "enviado")),
          ),
        );
    } catch (e) {
      conParticion(input.tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
      conParticion(input.tenantId, () => crearAlmacenEmailOutbox().guardar(input.key, envio));
      return { ok: true, key: input.key, fuente: "memoria" };
    }
    if (usaMemoria) {
      conParticion(input.tenantId, () => crearAlmacenEmailOutbox().guardar(input.key, envio));
    }
    return { ok: true, key: input.key, fuente: "db" };
  }
  // P10-33 [tenant]: cifrar fuera del try; sin clave se falla, no se cae al espejo.
  const cuerpo = cuerpoCifradoOutbox(envio.html, envio.texto, input.tenantId);
  try {
    await db.insert(emailOutbox).values(
      filaConTenant({
        categoria: input.stream,
        plantilla: input.plantilla,
        destinatario: envio.destinatario,
        asunto: envio.asunto,
        ...cuerpo,
        idempotencyKey: envio.idempotencyKey,
        estado: envio.estado,
        providerMessageId: envio.providerMessageId,
      }),
    );
  } catch (e) {
    conParticion(input.tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, pendienteDeEnvio(input));
    });
    return { ok: true, key: input.key, fuente: "memoria" };
  }
  if (usaMemoria) {
    conParticion(input.tenantId, () => {
      crearAlmacenEmailOutbox().guardar(input.key, pendienteDeEnvio(input));
    });
  }
  return { ok: true, key: input.key, fuente: "db" };
}

// Snapshot de caja para el resumen: cash_movements del tenant con DB viva,
// memoria particionada en single sin base. En multi sin base propaga.
export async function resumenMovimientosCaja(tenantId?: string): Promise<{ total: bigint; porMedio: Record<string, bigint> }> {
  const leer = async () => {
    const db = dbVivaTenant();
    if (!db) return null;
    return listarMovimientosCaja(db);
  };
  try {
    const filas = tenantId ? await conTenant(tenantId, leer) : await leer();
    if (filas !== null) {
      const porMedio: Record<string, bigint> = {};
      let total = 0n;
      for (const m of filas) {
        const signo = m.tipo === "ingreso" ? 1n : -1n;
        porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * m.montoCentavos;
        total += signo * m.montoCentavos;
      }
      return { total, porMedio };
    }
  } catch (e) {
    conParticion(tenantId, () => crearListaMovimientos()).anteFalloPersistencia(e);
  }
  if (!hayMemoria(tenantId)) return { total: 0n, porMedio: {} };
  return conParticion(tenantId, () => {
    const porMedio: Record<string, bigint> = {};
    let total = 0n;
    for (const m of crearListaMovimientos().listar()) {
      const monto = BigInt(m.monto_centavos);
      const signo = m.tipo === "ingreso" ? 1n : -1n;
      porMedio[m.metodo] = (porMedio[m.metodo] ?? 0n) + signo * monto;
      total += signo * monto;
    }
    return { total, porMedio };
  });
}

// Resumen de cierre (NE4/NE11): dedupe por tenant+fecha en memoria y
// evento + outbox en 1 tx con DB viva. En multi sin base propaga.
export async function encolarResumen(input: {
  tenantId: string;
  cierreId: string;
  fechaJornada: string;
  totalCentavos: bigint;
  porMedio: Record<string, bigint>;
  tipo: string;
  datosPlantilla: DatosCierre;
  destinatario: string;
}): Promise<EncolarResultado> {
  const r = conParticion(input.tenantId, () =>
    encolar_resumen_cierre(
      { eventos: crearAlmacenEmailEventos().mapaVivo(), outbox: crearAlmacenEmailOutbox().mapaVivo() },
      {
        tenantId: input.tenantId,
        cierreId: input.cierreId,
        fechaJornada: input.fechaJornada,
        totalCentavos: input.totalCentavos,
        porMedio: input.porMedio,
        tipo: input.tipo,
        datosPlantilla: input.datosPlantilla,
        destinatario: input.destinatario,
      },
    ),
  );
  if (r.status !== 201) return r;
  const db = dbVivaTenant(input.tenantId);
  if (!db) return r;
  const cuerpo = cuerpoCifradoOutbox(r.envio.html, r.envio.texto, input.tenantId);
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(notificationEvents)
        .values(
          filaConTenant({
            tipo: r.evento.tipo,
            version: 1,
            payload: r.evento.payload,
            dedupeKey: r.evento.dedupeKey,
            estado: "pendiente",
          }),
        )
        .onConflictDoNothing({ target: [notificationEvents.tenantId, notificationEvents.dedupeKey] });
      await tx
        .insert(emailOutbox)
        .values(
          filaConTenant({
            categoria: "cierre",
            plantilla: "cierre_v1",
            destinatario: r.envio.destinatario,
            asunto: r.envio.asunto,
            ...cuerpo,
            idempotencyKey: r.envio.idempotencyKey,
            estado: "pendiente",
          }),
        )
        .onConflictDoNothing({ target: [emailOutbox.tenantId, emailOutbox.idempotencyKey] });
    });
  } catch (e) {
    conParticion(input.tenantId, () => crearAlmacenEmailOutbox()).anteFalloPersistencia(e);
  }
  return r;
}

function esUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
