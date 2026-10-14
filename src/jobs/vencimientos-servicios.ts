// Job diario de vencimientos CS12/OP11 (03:00 America/Argentina, cron
// fuera del repo: POST /api/jobs/vencimientos-servicios con X-Job-Secret).
//
// Recorre facturas de servicios (pendientes 3d + vencidas) y órdenes de
// pago (preparadas 7d + vencidas), marca las órdenes vencidas con
// marcar_vencidas (la "vencida" de servicios es derivada, no se persiste)
// y manda un recordatorio WA por ítem y por día. Nada se paga ni se
// prepara solo: las sugerencias de pago viajan en la respuesta para que
// el comerciante decida (toque explícito CS5/OP9).
//
// Sin IO propia: el envío lo inyecta el llamador (igual que el aviso
// matutino); el job solo registra en yaEnviados lo que el sender confirma
// como ok. Sin opt-in/pausa no sale nada (B2). Vencidos de más de 30 días
// no se recuerdan (evita spam eterno: se pagan o cancelan para callarlos).

import {
  dias_para_vencer,
  evento_factura,
  proximas_a_vencer,
  vencidas,
  type EventoServicios,
  type FacturaServicio,
} from "../modules/utilities/facturas_servicios.js";
import {
  DIA_MS,
  marcar_vencidas,
  proximas_a_vencer as ordenes_proximas,
  type PaymentOrder,
} from "../modules/payments/ordenes.js";
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import { formatear_pesos } from "../modules/email/plantilla-cierre.js";
import { fechaBA } from "./whatsapp-aviso-matutino.js";

export const VENTANA_SERVICIOS_DIAS = 3;
export const VENTANA_ORDENES_DIAS = 7;
const TOPE_VENCIDA_DIAS = 30;

export interface ComercioVencimientos {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly prefs: Preferencias;
}

export type TipoRecordatorio = "servicio_proximo" | "servicio_vencido" | "orden_proxima" | "orden_vencida";

export type EstadoRecordatorio = "enviado" | "omitido_optout" | "omitido_pausa" | "omitido_ya_enviado" | "fallo";

export interface Recordatorio {
  readonly clave: string;
  readonly tipo: TipoRecordatorio;
  readonly refId: string;
  readonly estado: EstadoRecordatorio;
  readonly texto: string;
}

export interface SugerenciaPago {
  readonly tipo: "servicio" | "orden";
  readonly refId: string;
  readonly montoCentavos: string;
  readonly concepto: string;
}

export interface VencimientosResult {
  readonly ordenes: ReadonlyArray<PaymentOrder>;
  readonly vencidasMarcadas: ReadonlyArray<string>;
  readonly recordatorios: ReadonlyArray<Recordatorio>;
  readonly eventos: ReadonlyArray<EventoServicios>;
  readonly sugerencias: ReadonlyArray<SugerenciaPago>;
}

function clavePara(tenantId: string, tipo: "servicio" | "orden", refId: string, hoyIso: string): string {
  return `vencimiento:wa:${tenantId}:${tipo}:${refId}:${hoyIso}`;
}

export function ejecutar_vencimientos_servicios(args: {
  readonly comercio: ComercioVencimientos;
  readonly facturas: ReadonlyArray<FacturaServicio>;
  readonly ordenes: ReadonlyArray<PaymentOrder>;
  readonly cuentas: ReadonlyMap<string, { proveedor: string; servicio: string }>;
  readonly hoyIso: string;
  readonly hoyMs: number;
  readonly serviciosDentroDias?: number | undefined;
  readonly ordenesVentanaDias?: number | undefined;
  readonly yaEnviados: Set<string>;
  readonly enviar: (texto: string) => boolean;
}): VencimientosResult {
  const { comercio } = args;
  const dentroServicios = args.serviciosDentroDias ?? VENTANA_SERVICIOS_DIAS;
  const ventanaOrdenes = args.ordenesVentanaDias ?? VENTANA_ORDENES_DIAS;

  const marcadas = marcar_vencidas(args.ordenes, args.hoyMs);
  const ordenes = marcadas.actualizadas;

  const cuentaDe = (accountId: string): string => {
    const c = args.cuentas.get(accountId);
    return c === undefined ? "Servicio" : `${c.proveedor} · ${c.servicio}`;
  };

  const recordatorios: Recordatorio[] = [];
  const eventos: EventoServicios[] = [];
  const sugerencias: SugerenciaPago[] = [];

  const recordar = (tipo: TipoRecordatorio, grupo: "servicio" | "orden", refId: string, texto: string): void => {
    const clave = clavePara(comercio.tenantId, grupo, refId, args.hoyIso);
    if (args.yaEnviados.has(clave)) {
      recordatorios.push({ clave, tipo, refId, estado: "omitido_ya_enviado", texto });
      return;
    }
    if (!puede_enviar_whatsapp(comercio.prefs, args.hoyMs)) {
      recordatorios.push({
        clave,
        tipo,
        refId,
        estado: comercio.prefs.optIn ? "omitido_pausa" : "omitido_optout",
        texto,
      });
      return;
    }
    if (args.enviar(texto)) {
      args.yaEnviados.add(clave);
      recordatorios.push({ clave, tipo, refId, estado: "enviado", texto });
    } else {
      recordatorios.push({ clave, tipo, refId, estado: "fallo", texto });
    }
  };

  for (const f of proximas_a_vencer(args.facturas, args.hoyIso, dentroServicios)) {
    const d = dias_para_vencer(args.hoyIso, f.vencimiento);
    const nombre = cuentaDe(f.accountId);
    recordar(
      "servicio_proximo",
      "servicio",
      f.id,
      `${comercio.nombreComercio}: ${nombre} vence en ${d} día${d === 1 ? "" : "s"} (${f.vencimiento}) por ${formatear_pesos(f.montoCentavos)}.`,
    );
    eventos.push(evento_factura(f, "servicios_vencimiento_proximo"));
    sugerencias.push({ tipo: "servicio", refId: f.id, montoCentavos: f.montoCentavos.toString(), concepto: `${nombre} ${f.periodo}` });
  }

  for (const f of vencidas(args.facturas, args.hoyIso)) {
    if (dias_para_vencer(args.hoyIso, f.vencimiento) < -TOPE_VENCIDA_DIAS) continue;
    const nombre = cuentaDe(f.accountId);
    recordar(
      "servicio_vencido",
      "servicio",
      f.id,
      `${comercio.nombreComercio}: ${nombre} venció el ${f.vencimiento} por ${formatear_pesos(f.montoCentavos)}.`,
    );
    eventos.push(evento_factura(f, "servicios_factura_vencida"));
    sugerencias.push({ tipo: "servicio", refId: f.id, montoCentavos: f.montoCentavos.toString(), concepto: `${nombre} ${f.periodo}` });
  }

  for (const o of ordenes_proximas(ordenes, args.hoyMs, ventanaOrdenes)) {
    recordar(
      "orden_proxima",
      "orden",
      o.id,
      `${comercio.nombreComercio}: orden ${o.numero} (${o.concepto}) vence el ${fechaBA(new Date(o.venceElMs))} por ${formatear_pesos(o.montoCentavos)}.`,
    );
    sugerencias.push({ tipo: "orden", refId: o.id, montoCentavos: o.montoCentavos.toString(), concepto: o.concepto });
  }

  for (const o of ordenes) {
    if (o.estado !== "vencida") continue;
    if (args.hoyMs - o.venceElMs > TOPE_VENCIDA_DIAS * DIA_MS) continue;
    recordar(
      "orden_vencida",
      "orden",
      o.id,
      `${comercio.nombreComercio}: orden ${o.numero} (${o.concepto}) venció por ${formatear_pesos(o.montoCentavos)}.`,
    );
    sugerencias.push({ tipo: "orden", refId: o.id, montoCentavos: o.montoCentavos.toString(), concepto: o.concepto });
  }

  return { ordenes, vencidasMarcadas: marcadas.vencidasIds, recordatorios, eventos, sugerencias };
}
