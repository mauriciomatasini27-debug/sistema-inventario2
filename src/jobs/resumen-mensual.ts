// BOT-S7 (PRD-BOT-01, ADR-0040): resumen mensual día 1 a las 09:00 de la zona
// del tenant. WhatsApp y email comparten el MISMO snapshot y el MISMO texto,
// idempotente por tenant+mes+canal. Núcleo puro: recibe los datos ya leídos y
// los enviadores inyectados; no toca red, Drizzle ni env.

import { formatear_pesos } from "../modules/email/plantilla-cierre.js";
import { deudores_a_cobrar, type ClientePyme, type PagoPyme } from "./bot-pyme.js";
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import { puede_enviar_email, type PreferenciasEmail } from "../modules/email/proveedor.js";
import type { ModuloBot } from "../modules/bot/modulos-rubro.js";
import {
  calcular_acciones_propuestas,
  texto_acciones_sugeridas,
  type AccionPropuesta,
  type ProductoAccion,
} from "../modules/bot/acciones-propuestas.js";

export const ZONA_DEFECTO = "America/Argentina/Buenos_Aires";
export const HORA_RESUMEN_MENSUAL = 9;

export type CanalResumen = "wa" | "email";

export type EstadoCanalResumen =
  | "enviado"
  | "encolado"
  | "omitido_fuera_de_ventana"
  | "omitido_sin_modulos"
  | "omitido_optout"
  | "omitido_sin_destino"
  | "omitido_ya_enviado"
  | "fallo";

export interface MovimientoResumen {
  readonly tipo: "ingreso" | "egreso";
  readonly montoCentavos: bigint;
  readonly origen: string;
  readonly ocurridoEn: string | null;
}

// Un comercio ya resuelto por la ruta: módulos, movimientos de caja, clientes
// (solo si cobranza), pagos pendientes (solo si flujo_caja), preferencias y
// destino del email. `destinoWa` no viaja: el enviador lo captura en la ruta.
export interface ComercioResumen {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly modulos: ReadonlyArray<ModuloBot>;
  readonly movimientos: ReadonlyArray<MovimientoResumen>;
  // BOT-S8: productos con stock vivo para proponer reposición (opcional para
  // no romper a los llamadores que solo arman caja/cobranza).
  readonly productos?: ReadonlyArray<ProductoAccion> | undefined;
  readonly clientes: ReadonlyArray<ClientePyme>;
  readonly pagos: ReadonlyArray<PagoPyme>;
  readonly prefsWa: Preferencias;
  readonly prefsEmail: PreferenciasEmail;
  readonly destinoEmail: string;
}

export interface SnapshotMensual {
  readonly mes: string;
  readonly ingresosCentavos: bigint;
  readonly egresosCentavos: bigint;
  readonly resultadoCentavos: bigint;
  readonly ventas: number;
  // BOT-S8: acciones deterministas que viajan al adaptador de WhatsApp como
  // botones y al texto compartido por ambos canales.
  readonly acciones: ReadonlyArray<AccionPropuesta>;
  readonly texto: string;
}

export interface EnvioWaResumen {
  readonly ok: boolean;
  readonly error?: string | undefined;
}

export type ResultadoEmailResumen =
  | { readonly ok: true }
  | { readonly ok: false; readonly codigo: "DUPLICADO" }
  | { readonly ok: false; readonly codigo: "fallo"; readonly error: string };

export interface CanalResumenMensual {
  readonly canal: CanalResumen;
  readonly clave: string;
  readonly estado: EstadoCanalResumen;
  readonly error: string | null;
}

export interface ResultadoResumenMensual {
  readonly tenantId: string;
  readonly mes: string;
  readonly texto: string | null;
  readonly canales: ReadonlyArray<CanalResumenMensual>;
}

export interface EnviarWaResumen {
  (
    tenantId: string,
    payload: {
      readonly texto: string;
      readonly clave: string;
      readonly acciones?: ReadonlyArray<AccionPropuesta> | undefined;
    },
  ): Promise<EnvioWaResumen>;
}

export interface EncolarEmailResumen {
  (
    tenantId: string,
    payload: { readonly destino: string; readonly asunto: string; readonly texto: string; readonly clave: string },
  ): Promise<ResultadoEmailResumen>;
}

interface PartesZona {
  readonly anio: string;
  readonly mes: string;
  readonly dia: string;
  readonly hora: string;
}

function partesZona(ahoraMs: number, zona: string): PartesZona {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ahoraMs));
  const tomar = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? "";
  return { anio: tomar("year"), mes: tomar("month"), dia: tomar("day"), hora: tomar("hour") };
}

// AC de BOT-S7: día 1 desde las 09:00 locales. La hora local se lee con
// hourCycle h23 para que la medianoche no cuente como "24".
export function en_ventana_mensual(ahoraMs: number, zona: string): boolean {
  const p = partesZona(ahoraMs, zona);
  return p.dia === "01" && Number(p.hora) >= HORA_RESUMEN_MENSUAL;
}

// Mes anterior a la fecha local, en formato AAAA-MM (2026-11-01 -> 2026-10).
export function mes_cerrado(ahoraMs: number, zona: string): string {
  const p = partesZona(ahoraMs, zona);
  const anio = Number(p.anio);
  const mes = Number(p.mes);
  const mesPrevio = mes === 1 ? 12 : mes - 1;
  const anioPrevio = mes === 1 ? anio - 1 : anio;
  return `${anioPrevio}-${String(mesPrevio).padStart(2, "0")}`;
}

export function clave_resumen_mensual(tenantId: string, mes: string, canal: CanalResumen): string {
  return `resumen_mensual:${canal}:${tenantId}:${mes}`;
}

function mesSiguiente(mes: string): string {
  const partes = mes.split("-");
  const anio = Number(partes[0] ?? 0);
  const m = Number(partes[1] ?? 1);
  const proximo = m === 12 ? 1 : m + 1;
  const anioProximo = m === 12 ? anio + 1 : anio;
  return `${anioProximo}-${String(proximo).padStart(2, "0")}`;
}

function mesDeInstante(ms: number, zona: string): string {
  const p = partesZona(ms, zona);
  return `${p.anio}-${p.mes}`;
}

// Vencimiento de caja: AAAA-MM-DD es día calendario puro; ISO se resuelve en la
// zona. Mismo criterio de borde que diaDe() de bot-pyme.
function mesDeVencimiento(venceEl: string, zona: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(venceEl)) return venceEl.slice(0, 7);
  const ms = Date.parse(venceEl);
  return Number.isNaN(ms) ? null : mesDeInstante(ms, zona);
}

// Snapshot y texto del mes cerrado: movimientos de caja del mes EN LA ZONA,
// fiado a cobrar y deudores si `cobranza`, pagos que vencen el mes que empieza
// si `flujo_caja`. Determinista y compartido por ambos canales.
export function armar_snapshot_mensual(c: ComercioResumen, mes: string, zona: string): SnapshotMensual {
  let ingresos = 0n;
  let egresos = 0n;
  let ventas = 0;
  let hayMovimientos = false;
  for (const m of c.movimientos) {
    if (m.ocurridoEn === null) continue;
    const ms = Date.parse(m.ocurridoEn);
    if (Number.isNaN(ms) || mesDeInstante(ms, zona) !== mes) continue;
    hayMovimientos = true;
    if (m.tipo === "ingreso") {
      ingresos += m.montoCentavos;
      if (m.origen === "venta") ventas++;
    } else {
      egresos += m.montoCentavos;
    }
  }
  const resultado = ingresos - egresos;
  const lineas: string[] = [`Resumen mensual de ${c.nombreComercio} · ${mes}`, "Caja del mes:"];
  if (hayMovimientos) {
    lineas.push(`- Ingresos: ${formatear_pesos(ingresos)}`);
    lineas.push(`- Egresos: ${formatear_pesos(egresos)}`);
    lineas.push(`- Resultado: ${formatear_pesos(resultado)}`);
    lineas.push(`- Ventas registradas: ${ventas}`);
  } else {
    lineas.push("- Sin movimientos registrados en el mes");
  }

  const activos = new Set<string>(c.modulos);
  if (activos.has("cobranza")) {
    let fiado = 0n;
    for (const cl of c.clientes) if (cl.saldoCentavos > 0n) fiado += cl.saldoCentavos;
    lineas.push("Cobranza:");
    lineas.push(`- Fiado a cobrar: ${formatear_pesos(fiado)} (${deudores_a_cobrar(c.clientes).length} deudores)`);
  }
  if (activos.has("flujo_caja")) {
    const siguiente = mesSiguiente(mes);
    let total = 0n;
    let cantidad = 0;
    for (const p of c.pagos) {
      if (mesDeVencimiento(p.venceEl, zona) !== siguiente) continue;
      total += p.montoCentavos;
      cantidad++;
    }
    lineas.push("Flujo de caja:");
    lineas.push(`- Pagos pendientes en ${siguiente}: ${formatear_pesos(total)} (${cantidad})`);
  }

  const acciones = calcular_acciones_propuestas({
    modulos: c.modulos,
    productos: c.productos ?? [],
    clientes: c.clientes,
  });
  const bloqueAcciones = texto_acciones_sugeridas(acciones);
  if (bloqueAcciones !== "") lineas.push(...bloqueAcciones.split("\n"));

  return {
    mes,
    ingresosCentavos: ingresos,
    egresosCentavos: egresos,
    resultadoCentavos: resultado,
    ventas,
    acciones,
    texto: lineas.join("\n"),
  };
}

// Corridas WA ya registradas en este proceso (idempotencia en memoria, igual
// que BOT-S3/S4). El email es durable por el idempotency_key del outbox.
const corridas = new Set<string>();

export function limpiar_corridas_mensual(): void {
  corridas.clear();
}

export async function ejecutar_resumen_mensual(args: {
  readonly comercios: ReadonlyArray<ComercioResumen>;
  readonly ahoraMs: number;
  readonly zona: string;
  readonly yaEnviadosWa?: ReadonlySet<string> | undefined;
  readonly enviarWa: EnviarWaResumen;
  readonly encolarEmail: EncolarEmailResumen;
}): Promise<{ readonly resultados: ReadonlyArray<ResultadoResumenMensual> }> {
  const enVentana = en_ventana_mensual(args.ahoraMs, args.zona);
  const mes = mes_cerrado(args.ahoraMs, args.zona);
  const resultados: ResultadoResumenMensual[] = [];

  const canalTestigo = (canal: CanalResumen, clave: string, estado: EstadoCanalResumen): CanalResumenMensual => ({
    canal,
    clave,
    estado,
    error: null,
  });

  const correrWa = async (
    c: ComercioResumen,
    clave: string,
    texto: string,
    acciones: ReadonlyArray<AccionPropuesta>,
  ): Promise<CanalResumenMensual> => {
    if (corridas.has(clave) || args.yaEnviadosWa?.has(clave) === true) return canalTestigo("wa", clave, "omitido_ya_enviado");
    if (!puede_enviar_whatsapp(c.prefsWa, args.ahoraMs)) return canalTestigo("wa", clave, "omitido_optout");
    try {
      const r = await args.enviarWa(c.tenantId, { texto, clave, acciones });
      if (!r.ok) return { canal: "wa", clave, estado: "fallo", error: r.error ?? "fallo_envio" };
      corridas.add(clave);
      return canalTestigo("wa", clave, "enviado");
    } catch (e) {
      return { canal: "wa", clave, estado: "fallo", error: e instanceof Error ? e.message : "fallo_envio" };
    }
  };

  const correrEmail = async (c: ComercioResumen, clave: string, texto: string): Promise<CanalResumenMensual> => {
    if (!puede_enviar_email(c.prefsEmail, args.ahoraMs)) return canalTestigo("email", clave, "omitido_optout");
    if (c.destinoEmail.trim() === "") return canalTestigo("email", clave, "omitido_sin_destino");
    try {
      const r = await args.encolarEmail(c.tenantId, {
        destino: c.destinoEmail,
        asunto: `Resumen mensual ${mes} · ${c.nombreComercio}`,
        texto,
        clave,
      });
      if (r.ok) return canalTestigo("email", clave, "encolado");
      if (r.codigo === "DUPLICADO") return canalTestigo("email", clave, "omitido_ya_enviado");
      return { canal: "email", clave, estado: "fallo", error: r.error };
    } catch (e) {
      return { canal: "email", clave, estado: "fallo", error: e instanceof Error ? e.message : "fallo_envio" };
    }
  };

  for (const c of args.comercios) {
    const claveWa = clave_resumen_mensual(c.tenantId, mes, "wa");
    const claveEmail = clave_resumen_mensual(c.tenantId, mes, "email");
    // Fuera de ventana no se arma nada: ambos canales omitidos.
    if (!enVentana) {
      resultados.push({
        tenantId: c.tenantId,
        mes,
        texto: null,
        canales: [canalTestigo("wa", claveWa, "omitido_fuera_de_ventana"), canalTestigo("email", claveEmail, "omitido_fuera_de_ventana")],
      });
      continue;
    }
    // Tenant sin ningún módulo activo: no hay resumen que armar.
    if (c.modulos.length === 0) {
      resultados.push({
        tenantId: c.tenantId,
        mes,
        texto: null,
        canales: [canalTestigo("wa", claveWa, "omitido_sin_modulos"), canalTestigo("email", claveEmail, "omitido_sin_modulos")],
      });
      continue;
    }
    // Snapshot y texto UNA vez; los dos canales usan exactamente el mismo.
    const snapshot = armar_snapshot_mensual(c, mes, args.zona);
    const canales = [
      await correrWa(c, claveWa, snapshot.texto, snapshot.acciones),
      await correrEmail(c, claveEmail, snapshot.texto),
    ];
    resultados.push({ tenantId: c.tenantId, mes, texto: snapshot.texto, canales });
  }

  return { resultados: Object.freeze(resultados) };
}
