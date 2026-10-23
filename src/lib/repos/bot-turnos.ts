import { and, desc, eq, gte, lt, or } from "drizzle-orm";
import { botTurnos } from "../../db/schema-whatsapp.js";
import {
  alcanceHistorial,
  cursorDe,
  filaVisible,
  PAGE,
  truncarParaGuardar,
  type ConsultaHistorial,
  type CursorHistorial,
  type FilaHistorial,
  type FuenteTurno,
  type PaginaHistorial,
} from "../../modules/bot/historial.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";

export interface TurnoBot {
  readonly tenantId: string;
  readonly wamid: string;
  readonly numeroE164: string;
  readonly googleSub: string;
  readonly pregunta: string;
  readonly respuesta: string;
  readonly fuente: FuenteTurno;
  readonly ahoraMs: number;
}

export type { PaginaHistorial };

function dbOError(tenantId: string): TenantDb {
  const db = dbVivaTenant(tenantId);
  if (!db) throw new BaseNoDisponible();
  return db;
}

function parseCursorInterno(cursor: CursorHistorial): { t: number; id: string } {
  const json = Buffer.from(cursor, "base64url").toString("utf8");
  const o = JSON.parse(json) as { t: number; i: string };
  return { t: o.t, id: o.i };
}

export async function registrarTurnoBot(input: TurnoBot): Promise<void> {
  const db = dbVivaTenant(input.tenantId);
  if (!db) return;
  await db
    .insert(botTurnos)
    .values({
      tenantId: input.tenantId,
      wamid: input.wamid,
      numeroE164: input.numeroE164,
      googleSub: input.googleSub,
      pregunta: truncarParaGuardar(input.pregunta),
      respuesta: truncarParaGuardar(input.respuesta),
      fuente: input.fuente,
      creadoEn: new Date(input.ahoraMs),
    })
    .onConflictDoNothing({ target: botTurnos.wamid });
}

export async function listarHistorial(consulta: ConsultaHistorial): Promise<PaginaHistorial> {
  const db = dbOError(consulta.tenantId);
  const alcance = alcanceHistorial(consulta);
  const condiciones = [eq(botTurnos.tenantId, consulta.tenantId)];
  if (alcance.tipo === "uno") condiciones.push(eq(botTurnos.googleSub, alcance.googleSub));
  if (consulta.desdeMs != null) condiciones.push(gte(botTurnos.creadoEn, new Date(consulta.desdeMs)));
  if (consulta.hastaMsExcl != null) condiciones.push(lt(botTurnos.creadoEn, new Date(consulta.hastaMsExcl)));
  if (consulta.cursor) {
    const { t, id } = parseCursorInterno(consulta.cursor);
    condiciones.push(
      or(lt(botTurnos.creadoEn, new Date(t)), and(eq(botTurnos.creadoEn, new Date(t)), lt(botTurnos.id, id)))!,
    );
  }

  const filas = await db
    .select({
      id: botTurnos.id,
      creadoEn: botTurnos.creadoEn,
      numeroE164: botTurnos.numeroE164,
      pregunta: botTurnos.pregunta,
      respuesta: botTurnos.respuesta,
      fuente: botTurnos.fuente,
    })
    .from(botTurnos)
    .where(and(...condiciones))
    .orderBy(desc(botTurnos.creadoEn), desc(botTurnos.id))
    .limit(PAGE + 1);

  const visibles: FilaHistorial[] = [];
  for (const f of filas.slice(0, PAGE)) {
    visibles.push(
      filaVisible({
        id: f.id,
        creadoEnMs: f.creadoEn.getTime(),
        numeroE164: f.numeroE164,
        pregunta: f.pregunta,
        respuesta: f.respuesta,
        fuente: f.fuente as FuenteTurno,
      }),
    );
  }
  const cursor: CursorHistorial | null =
    filas.length > PAGE ? cursorDe({ creadoEnMs: visibles.at(-1)!.creadoEnMs, id: visibles.at(-1)!.id }) : null;
  return { filas: Object.freeze(visibles), cursor };
}
