
import { cerrar_jornada, fecha_jornada_ar, type CierreOk } from "../modules/cash/cierre.js";
import { derivar_balance, type Movimiento } from "../modules/cash/caja.js";
import {
  armar_cierre_wa,
  clave_cierre_wa,
  type SnapshotCaja,
} from "../modules/whatsapp/resumen-cierre.js";

export interface AvisoCierre {
  readonly estado: "enviado" | "duplicado";
  readonly idempotencyKey: string;
  readonly texto: string;
}

export function asegurar_aviso_cierre(waEnviados: Set<string>, snapshot: SnapshotCaja): AvisoCierre {
  const key = clave_cierre_wa(snapshot.tenantId, snapshot.fechaJornada);
  if (waEnviados.has(key)) return { estado: "duplicado", idempotencyKey: key, texto: "" };
  const resumen = armar_cierre_wa(snapshot);
  waEnviados.add(key);
  return { estado: "enviado", idempotencyKey: key, texto: resumen.texto };
}

export interface CierreMedianocheInput {
  readonly ahora: Date;
  readonly movimientos: ReadonlyArray<Movimiento>;
  readonly ultimoMovimientoId: string | null;
  readonly turnosEnDisputa: number;
  readonly cierres: Map<string, CierreOk>;
  readonly waEnviados: Set<string>;
  readonly tenantId?: string | undefined;
  readonly nombreComercio?: string | undefined;
}

export type CierreMedianocheResult =
  | { readonly status: 201; readonly fechaJornada: string; readonly totalCentavos: string; readonly wa: AvisoCierre }
  | { readonly status: 409; readonly error: string; readonly fechaJornada: string; readonly totalCentavos: string; readonly wa: AvisoCierre }
  | { readonly status: 422; readonly error: string };

export function ejecutar_cierre_medianoche(input: CierreMedianocheInput): CierreMedianocheResult {
  const tenantId = input.tenantId ?? "demo";
  const fechaJornada = fecha_jornada_ar(input.ahora);
  const r = cerrar_jornada({
    idempotencyKey: `cierre-auto-${fechaJornada}`,
    fechaJornada,
    closeType: "automatica",
    movimientos: [...input.movimientos],
    ultimoMovimientoId: input.ultimoMovimientoId,
    turnosEnDisputa: input.turnosEnDisputa,
    cierres: input.cierres,
  });
  if (r.status === 422) return { status: 422, error: r.error };
  const cierre = r.status === 201 ? r.cierre : (r.original?.cierre ?? input.cierres.get(fechaJornada)?.cierre);
  if (!cierre) return { status: 422, error: "cierre inconsistente" };
  const balance = derivar_balance([...input.movimientos]);
  const porMedio: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(balance.porMedio)) porMedio[k] = v;
  const wa = asegurar_aviso_cierre(input.waEnviados, {
    tenantId,
    cierreId: `cierre-auto-${fechaJornada}`,
    fechaJornada: cierre.fechaJornada,
    totalCentavos: cierre.totalCentavos,
    porMedio,
    tipo: cierre.closeType,
    nombreComercio: input.nombreComercio ?? "Mi comercio",
  });
  const totalCentavos = cierre.totalCentavos.toString();
  if (r.status === 201) return { status: 201, fechaJornada: cierre.fechaJornada, totalCentavos, wa };
  return { status: 409, error: r.error, fechaJornada: cierre.fechaJornada, totalCentavos, wa };
}
