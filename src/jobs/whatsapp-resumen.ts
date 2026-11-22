
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import { puede_enviar_email, type PreferenciasEmail } from "../modules/email/proveedor.js";
import {
  armar_resumen_semanal_wa,
  recordatorio_lunes,
  type SnapshotLunes,
} from "../modules/whatsapp/resumen-semanal.js";
import { armar_cierre_wa, type SnapshotCaja } from "../modules/whatsapp/resumen-cierre.js";
import { armar_bloque_promos, topear_3_por_impacto, type Sugerencia } from "../modules/whatsapp/promos.js";
import type { CalculoSemanal } from "../modules/email/resumen-semanal.js";
import type { ReclamadorEntrega } from "../modules/whatsapp/entregas.js";

export interface ComercioJob {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly zona: string;
  readonly prefsWa: Preferencias;
  readonly prefsEmail: PreferenciasEmail;
  readonly destinoWa: string;
  readonly destinoEmail: string;
}

export interface ResultadoCanal {
  readonly canal: "wa" | "email";
  readonly estado: "enviado" | "pendiente" | "omitido_optin" | "omitido_pausa" | "duplicado";
  readonly idempotencyKey: string;
}

export type Enviador = (args: {
  canal: "wa" | "email";
  destino: string;
  texto: string;
  idempotencyKey: string;
}) => Promise<boolean>;

export function offset_por_comercio(tenantId: string, ventanaMin: number): number {
  let h = 0;
  for (let i = 0; i < tenantId.length; i++) h = (h * 31 + tenantId.charCodeAt(i)) >>> 0;
  return ventanaMin <= 0 ? 0 : h % ventanaMin;
}

export function dia_iso_en_zona(ahora: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(ahora);
}


export async function ejecutar_job_viernes(
  tiendas: { wa: ReclamadorEntrega; email: ReclamadorEntrega },
  sender: Enviador,
  args: {
    comercio: ComercioJob;
    semanaISO: string;
    calculo: CalculoSemanal;
    promos: ReadonlyArray<Sugerencia>;
    baseWeb: string;
    ahoraMs: number;
  },
): Promise<ReadonlyArray<ResultadoCanal>> {
  const { comercio, semanaISO, calculo } = args;
  const waKey = `resumen_semanal:wa:${comercio.tenantId}:${semanaISO}`;
  const emailKey = `resumen_semanal:${comercio.tenantId}:${semanaISO}`;
  const out: ResultadoCanal[] = [];

  if (!comercio.prefsWa.optIn) {
    out.push({ canal: "wa", estado: "omitido_optin", idempotencyKey: waKey });
  } else if (!puede_enviar_whatsapp(comercio.prefsWa, args.ahoraMs)) {
    out.push({ canal: "wa", estado: "omitido_pausa", idempotencyKey: waKey });
  } else if (!(await tiendas.wa.reclamar(waKey, "enviado"))) {
    out.push({ canal: "wa", estado: "duplicado", idempotencyKey: waKey });
  } else {
    const resumen = armar_resumen_semanal_wa({
      tenantId: comercio.tenantId,
      nombreComercio: comercio.nombreComercio,
      semanaISO,
      calculo,
    });
    const top3 = topear_3_por_impacto(args.promos);
    const bloque = armar_bloque_promos(top3);
    const texto =
      top3.length > 0
        ? `${resumen.texto}\nPromos: ${bloque.lineas.join(" / ")} Ver promos: ${args.baseWeb}/promos`
        : resumen.texto;
    const ok = await sender({ canal: "wa", destino: comercio.destinoWa, texto, idempotencyKey: waKey });
    if (!ok) await tiendas.wa.liberar(waKey);
    out.push({ canal: "wa", estado: ok ? "enviado" : "omitido_pausa", idempotencyKey: waKey });
  }

  if (!comercio.prefsEmail.resumenCierre && calculo.unidades === 0 && calculo.faltantes === 0) {
    out.push({ canal: "email", estado: "omitido_optin", idempotencyKey: emailKey });
  } else if (!puede_enviar_email(comercio.prefsEmail, args.ahoraMs)) {
    out.push({ canal: "email", estado: "omitido_pausa", idempotencyKey: emailKey });
  } else if (!(await tiendas.email.reclamar(emailKey, "enviado"))) {
    out.push({ canal: "email", estado: "duplicado", idempotencyKey: emailKey });
  } else {
    const textoEmail =
      calculo.unidades > 0
        ? `Resumen semanal ${semanaISO}: ${calculo.unidades} u. Ver pedido: ${args.baseWeb}/pedidos`
        : `Resumen semanal ${semanaISO}: sin ventas registradas. Faltantes: ${calculo.faltantes}.`;
    const ok = await sender({
      canal: "email",
      destino: comercio.destinoEmail,
      texto: textoEmail,
      idempotencyKey: emailKey,
    });
    // P10-36 [tenant]: sin confirmación se libera el claim; la fila pendiente la reintenta P10-92.
    if (!ok) await tiendas.email.liberar(emailKey);
    out.push({ canal: "email", estado: ok ? "enviado" : "pendiente", idempotencyKey: emailKey });
  }
  return out;
}


export async function ejecutar_job_lunes(
  tiendas: Map<string, string>,
  sender: Enviador,
  args: {
    comercio: ComercioJob;
    snapshot: SnapshotLunes;
    lunesFecha: string;
    ahoraMs: number;
  },
): Promise<ResultadoCanal> {
  const key = `recordatorio_lunes:wa:${args.comercio.tenantId}:${args.lunesFecha}`;
  if (!args.comercio.prefsWa.optIn) return { canal: "wa", estado: "omitido_optin", idempotencyKey: key };
  if (!puede_enviar_whatsapp(args.comercio.prefsWa, args.ahoraMs))
    return { canal: "wa", estado: "omitido_pausa", idempotencyKey: key };
  if (tiendas.has(key)) return { canal: "wa", estado: "duplicado", idempotencyKey: key };
  const texto = recordatorio_lunes({
    nombreComercio: args.comercio.nombreComercio,
    lunesFecha: args.lunesFecha,
    snapshot: args.snapshot,
  });
  const ok = await sender({ canal: "wa", destino: args.comercio.destinoWa, texto, idempotencyKey: key });
  if (ok) tiendas.set(key, "enviado");
  return { canal: "wa", estado: ok ? "enviado" : "omitido_pausa", idempotencyKey: key };
}


export async function ejecutar_job_cierre(
  tiendas: Map<string, string>,
  sender: Enviador,
  args: { comercio: ComercioJob; snapshot: SnapshotCaja; ahoraMs: number },
): Promise<ResultadoCanal> {
  const key = `resumen_cierre:wa:${args.comercio.tenantId}:${args.snapshot.fechaJornada}`;
  if (!args.comercio.prefsWa.optIn) return { canal: "wa", estado: "omitido_optin", idempotencyKey: key };
  if (!puede_enviar_whatsapp(args.comercio.prefsWa, args.ahoraMs))
    return { canal: "wa", estado: "omitido_pausa", idempotencyKey: key };
  if (tiendas.has(key)) return { canal: "wa", estado: "duplicado", idempotencyKey: key };
  const resumen = armar_cierre_wa(args.snapshot);
  const ok = await sender({
    canal: "wa",
    destino: args.comercio.destinoWa,
    texto: resumen.texto,
    idempotencyKey: key,
  });
  if (ok) tiendas.set(key, args.snapshot.cierreId);
  return { canal: "wa", estado: ok ? "enviado" : "omitido_pausa", idempotencyKey: key };
}
