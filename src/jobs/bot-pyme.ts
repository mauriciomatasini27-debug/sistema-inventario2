// BOT-S4 (PRD-BOT-01, ADR-0039): mensaje diario del bot para rubro pyme.
// Une los módulos flujo_caja (C1-C18: caja contra pagos a 7 días) y cobranza
// (FC1-FC9: deudores sobre tope o con 14+ días de atraso, con recordatorio
// wa.me) en UN envío por comercio y día. Núcleo puro: recibe los datos ya
// leídos y el `enviar` inyectado; no toca red, Drizzle ni env.

import { formatear_pesos } from "../modules/email/plantilla-cierre.js";
import { link_whatsapp } from "../modules/credit/fiado.js";
import { motivoTope } from "../modules/credit/limite.js";
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import type { ModuloBot } from "../modules/bot/modulos-rubro.js";
import { fechaAR, sumarDiasAR, type FechaAR } from "../lib/fecha-ar.js";

// AC de BOT-S4: "mora 14d". Es el aviso del bot, distinto del en_mora del
// fiado (UMBRAL_MORA_DIAS = 15 en credit/saldos.ts), que no se toca.
export const MORA_COBRANZA_DIAS = 14;
export const MAX_DEUDORES = 5;
export const VENTANA_PAGOS_DIAS = 7;

export interface ClientePyme {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly saldoCentavos: bigint;
  // 0 = sin tope (TOPE_DEFECTO): solo la mora lo vuelve deudor.
  readonly topeCentavos: bigint;
  readonly diasMax: number;
}

// Vencimiento de caja pendiente (cash_due_items). venceEl: ISO o AAAA-MM-DD.
export interface PagoPyme {
  readonly id: string;
  readonly concepto: string;
  readonly venceEl: string;
  readonly montoCentavos: bigint;
}

export interface ComercioPyme {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly modulos: ReadonlyArray<ModuloBot>;
  readonly clientes: ReadonlyArray<ClientePyme>;
  readonly cajaCentavos: bigint;
  readonly pagos: ReadonlyArray<PagoPyme>;
  readonly prefs: Preferencias;
}

export type MotivoDeuda = "tope" | "mora";

export interface DeudorPyme {
  readonly id: string;
  readonly nombre: string;
  readonly saldoCentavos: bigint;
  readonly motivos: ReadonlyArray<MotivoDeuda>;
  readonly link: string | null;
}

export type EstadoComercioPyme =
  | "enviado"
  | "omitido_sin_novedad"
  | "omitido_optout"
  | "omitido_ya_enviado"
  | "fallo";

export type SeccionPyme = "flujo_caja" | "cobranza";

export interface ResultadoPyme {
  readonly tenantId: string;
  readonly clave: string;
  readonly estado: EstadoComercioPyme;
  readonly secciones: ReadonlyArray<SeccionPyme>;
  readonly deudores: ReadonlyArray<DeudorPyme>;
  readonly texto: string | null;
  readonly error: string | null;
}

export interface EnvioPyme {
  readonly ok: boolean;
  readonly error?: string | undefined;
}

export function clave_bot_pyme(tenantId: string, fecha: string): string {
  return `bot_pyme:${tenantId}:${fecha}`;
}

// Corridas ya registradas en este proceso (idempotencia en memoria).
const corridas = new Set<string>();

export function limpiar_corridas_pyme(): void {
  corridas.clear();
}

export function texto_recordatorio(nombreCliente: string, nombreComercio: string, saldoCentavos: bigint): string {
  return `Hola ${nombreCliente}, te escribimos de ${nombreComercio}. Tu cuenta tiene un saldo pendiente de ${formatear_pesos(saldoCentavos)}. Cuando puedas, acercate a regularizar. Gracias.`;
}

function motivosDe(c: ClientePyme): MotivoDeuda[] {
  const motivos: MotivoDeuda[] = [];
  if (motivoTope(c.saldoCentavos, c.topeCentavos)) motivos.push("tope");
  if (c.diasMax >= MORA_COBRANZA_DIAS) motivos.push("mora");
  return motivos;
}

// Deudor = saldo a cobrar Y (supera su tope o tiene 14+ días de atraso).
// Orden: el que más debe primero; empate por nombre.
export function deudores_a_cobrar(
  clientes: ReadonlyArray<ClientePyme>,
): Array<{ readonly cliente: ClientePyme; readonly motivos: ReadonlyArray<MotivoDeuda> }> {
  const out: Array<{ readonly cliente: ClientePyme; readonly motivos: ReadonlyArray<MotivoDeuda> }> = [];
  for (const c of clientes) {
    if (c.saldoCentavos <= 0n) continue;
    const motivos = motivosDe(c);
    if (motivos.length > 0) out.push({ cliente: c, motivos });
  }
  return out.sort((a, b) => {
    if (a.cliente.saldoCentavos !== b.cliente.saldoCentavos) return a.cliente.saldoCentavos > b.cliente.saldoCentavos ? -1 : 1;
    return a.cliente.nombre.localeCompare(b.cliente.nombre, "es");
  });
}

// Día calendario (Buenos Aires) del vencimiento. Se compara como string para
// no correr el día por la zona horaria.
function diaDe(venceEl: string): FechaAR | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) return venceEl as FechaAR;
  const ms = Date.parse(venceEl);
  return Number.isNaN(ms) ? null : fechaAR(new Date(ms));
}

interface Armado {
  readonly texto: string;
  readonly secciones: ReadonlyArray<SeccionPyme>;
  readonly deudores: ReadonlyArray<DeudorPyme>;
}

function seccionFlujoCaja(c: ComercioPyme, fecha: FechaAR): string | null {
  const limite = sumarDiasAR(fecha, VENTANA_PAGOS_DIAS);
  const enVentana: Array<{ readonly pago: PagoPyme; readonly dia: FechaAR }> = [];
  for (const p of c.pagos) {
    const dia = diaDe(p.venceEl);
    if (dia !== null && dia <= limite) enVentana.push({ pago: p, dia });
  }
  if (enVentana.length === 0) return null;
  enVentana.sort((a, b) => (a.dia !== b.dia ? (a.dia < b.dia ? -1 : 1) : a.pago.concepto.localeCompare(b.pago.concepto, "es")));
  let total = 0n;
  for (const { pago } of enVentana) total += pago.montoCentavos;
  const lineas = [
    "Flujo de caja:",
    `- Caja hoy: ${formatear_pesos(c.cajaCentavos)}`,
    `- Pagos a ${VENTANA_PAGOS_DIAS} días: ${formatear_pesos(total)}`,
    ...enVentana.map(({ pago, dia }) => {
      const cuando = dia < fecha ? `vencido el ${dia}` : dia === fecha ? "vence hoy" : `vence el ${dia}`;
      return `- ${pago.concepto}: ${formatear_pesos(pago.montoCentavos)} ${cuando}`;
    }),
  ];
  if (total > c.cajaCentavos) lineas.push(`- Faltan ${formatear_pesos(total - c.cajaCentavos)} para cubrir los pagos`);
  let fiado = 0n;
  for (const cl of c.clientes) if (cl.saldoCentavos > 0n) fiado += cl.saldoCentavos;
  if (fiado > 0n) lineas.push(`- Fiado a cobrar: ${formatear_pesos(fiado)}`);
  return lineas.join("\n");
}

function motivoLegible(m: MotivoDeuda, c: ClientePyme): string {
  return m === "tope" ? `supera tope de ${formatear_pesos(c.topeCentavos)}` : `${c.diasMax} días de atraso`;
}

function seccionCobranza(c: ComercioPyme, deudores: DeudorPyme[]): string | null {
  const lista = deudores_a_cobrar(c.clientes);
  if (lista.length === 0) return null;
  const lineas = ["Cobranza:"];
  lista.forEach(({ cliente, motivos }, i) => {
    const wa =
      cliente.telefono === null
        ? null
        : link_whatsapp(cliente.telefono, texto_recordatorio(cliente.nombre, c.nombreComercio, cliente.saldoCentavos));
    const link = wa !== null && wa.ok ? wa.url : null;
    deudores.push({ id: cliente.id, nombre: cliente.nombre, saldoCentavos: cliente.saldoCentavos, motivos, link });
    if (i >= MAX_DEUDORES) return;
    const cola = link !== null ? `Recordatorio: ${link}` : "Sin teléfono para recordatorio.";
    const porQue = motivos.map((m) => motivoLegible(m, cliente)).join("; ");
    lineas.push(`- ${cliente.nombre}: ${formatear_pesos(cliente.saldoCentavos)} (${porQue}). ${cola}`);
  });
  if (lista.length > MAX_DEUDORES) lineas.push(`- y ${lista.length - MAX_DEUDORES} más`);
  return lineas.join("\n");
}

// Un bloque por módulo activo con novedades. Sin ningún bloque no hay envío.
function armar(c: ComercioPyme, fecha: FechaAR): Armado | null {
  const activos = new Set<string>(c.modulos);
  const secciones: SeccionPyme[] = [];
  const bloques: string[] = [];
  const deudores: DeudorPyme[] = [];

  if (activos.has("flujo_caja")) {
    const bloque = seccionFlujoCaja(c, fecha);
    if (bloque !== null) {
      bloques.push(bloque);
      secciones.push("flujo_caja");
    }
  }
  if (activos.has("cobranza")) {
    const bloque = seccionCobranza(c, deudores);
    if (bloque !== null) {
      bloques.push(bloque);
      secciones.push("cobranza");
    }
  }
  if (bloques.length === 0) return null;
  return { texto: [`${c.nombreComercio} · ${fecha}`, ...bloques].join("\n"), secciones, deudores };
}

export function ejecutar_bot_pyme(args: {
  readonly comercios: ReadonlyArray<ComercioPyme>;
  readonly fecha: FechaAR;
  readonly ahoraMs: number;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly enviar: (tenantId: string, payload: { readonly texto: string; readonly clave: string }) => EnvioPyme;
}): { readonly resultados: ReadonlyArray<ResultadoPyme> } {
  const resultados: ResultadoPyme[] = [];
  for (const c of args.comercios) {
    const clave = clave_bot_pyme(c.tenantId, args.fecha);
    const terminar = (estado: EstadoComercioPyme, armado: Armado | null, error: string | null): void => {
      resultados.push({
        tenantId: c.tenantId,
        clave,
        estado,
        secciones: armado?.secciones ?? [],
        deudores: armado?.deudores ?? [],
        texto: armado?.texto ?? null,
        error,
      });
    };
    // Idempotente por comercio y día: memoria del proceso + registro externo.
    if (corridas.has(clave) || args.yaEnviados?.has(clave) === true) {
      terminar("omitido_ya_enviado", null, null);
      continue;
    }
    // Respeta opt-in/pausa antes de armar el mensaje.
    if (!puede_enviar_whatsapp(c.prefs, args.ahoraMs)) {
      terminar("omitido_optout", null, null);
      continue;
    }
    const armado = armar(c, args.fecha);
    if (armado === null) {
      terminar("omitido_sin_novedad", null, null);
      continue;
    }
    let envio: EnvioPyme;
    try {
      envio = args.enviar(c.tenantId, { texto: armado.texto, clave });
    } catch (e) {
      terminar("fallo", armado, e instanceof Error ? e.message : "fallo_envio");
      continue;
    }
    if (!envio.ok) {
      terminar("fallo", armado, envio.error ?? "fallo_envio");
      continue;
    }
    corridas.add(clave);
    terminar("enviado", armado, null);
  }
  return { resultados: Object.freeze(resultados) };
}
