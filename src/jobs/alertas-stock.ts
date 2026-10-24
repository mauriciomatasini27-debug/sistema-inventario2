// pg_cron no se configura en este repo: el cron vive fuera y pega al endpoint.

import type { DireccionAviso } from "../modules/alertas/destinatarios.js";
import { clave_alerta_stock, es_quiebre, umbral_efectivo, type CanalAlerta } from "../modules/alertas/stock-bajo.js";

export interface ItemAlertaJob {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly minimo: number | null | undefined;
  readonly ventas7d: number;
  readonly proveedor: string | null;
  readonly reorderQty?: number | null | undefined;
}

export interface DestinoJob {
  readonly googleSub: string;
  readonly rol: "dueno" | "encargado";
  readonly canales: ReadonlyArray<CanalAlerta>;
}

export interface MetaEnvioAlerta {
  readonly googleSub: string;
  readonly clave: string;
  readonly canal: CanalAlerta;
}

export type ResultadoEnvioCanal = { readonly ok: boolean; readonly error?: string | undefined };

export type EnvioCanal = (
  destino: string,
  texto: string,
  meta?: MetaEnvioAlerta,
) => ResultadoEnvioCanal | Promise<ResultadoEnvioCanal>;

export interface AlertaDecidida {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
  readonly clave: string;
  readonly reorderQty?: number | null | undefined;
}

export interface ResultadoAlertas {
  readonly alertas: ReadonlyArray<AlertaDecidida>;
  readonly enviadas: number;
  readonly omitidasYa: number;
  readonly clavesRegistradas: ReadonlyArray<string>;
  readonly enviosProveedor: number;
}

const clavesProceso = new Set<string>();

export function limpiar_claves_alertas(): void {
  clavesProceso.clear();
}

function claveEnvio(tenantId: string, sku: string, fecha: string, googleSub: string): string {
  return `${clave_alerta_stock(tenantId, sku, fecha)}:${googleSub}`;
}

// ALR-S3: con direcciones, el destino es la casilla o el número de esa persona.
// Sin mapa el llamador ya puso el destino en el id. Si falta la dirección, no se usa el número del comercio.
function destinoDe(
  googleSub: string,
  canal: CanalAlerta,
  direcciones: ReadonlyMap<string, DireccionAviso> | undefined,
): string | null {
  if (!direcciones) return googleSub;
  const dir = direcciones.get(googleSub);
  if (!dir) return null;
  const raw = canal === "whatsapp" ? dir.numeroWa : dir.email;
  if (raw == null || raw.trim() === "") return null;
  return raw;
}

export async function ejecutar_alertas_stock(args: {
  readonly tenantId: string;
  readonly fecha: string;
  readonly modo: "matutino" | "quiebre";
  readonly catalogo: ReadonlyArray<ItemAlertaJob>;
  readonly destinatarios: ReadonlyArray<DestinoJob>;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly direcciones?: ReadonlyMap<string, DireccionAviso> | undefined;
  readonly enviarWa: EnvioCanal;
  readonly enviarEmail: EnvioCanal;
  readonly registrar?: ((clave: string) => void) | undefined;
}): Promise<ResultadoAlertas> {
  const alertas: AlertaDecidida[] = [];
  let omitidasYa = 0;

  for (const it of args.catalogo) {
    const umbral = umbral_efectivo(it.minimo, it.ventas7d);
    if (umbral == null) continue;
    if (!(it.stock <= umbral)) continue;
    if (args.modo === "quiebre" && !es_quiebre(it.stock)) continue;
    const claveProducto = clave_alerta_stock(args.tenantId, it.sku, args.fecha);
    const pendientes = args.destinatarios.filter((d) => {
      const ck = claveEnvio(args.tenantId, it.sku, args.fecha, d.googleSub);
      return !clavesProceso.has(ck) && args.yaEnviados?.has(ck) !== true;
    });
    if (args.destinatarios.length > 0 && pendientes.length === 0) {
      omitidasYa += 1;
      continue;
    }
    alertas.push({
      sku: it.sku,
      nombre: it.nombre,
      stock: it.stock,
      umbral,
      proveedor: it.proveedor,
      clave: claveProducto,
      ...(it.reorderQty != null ? { reorderQty: it.reorderQty } : {}),
    });
  }

  if (alertas.length === 0 || args.destinatarios.length === 0) {
    return { alertas: Object.freeze(alertas), enviadas: 0, omitidasYa, clavesRegistradas: Object.freeze([]), enviosProveedor: 0 };
  }

  const registradas: string[] = [];
  let enviadas = 0;

  for (const a of alertas) {
    const texto =
      a.reorderQty != null
        ? `${a.nombre}: quedan ${a.stock} (umbral ${a.umbral}). Sugerido a pedir: ${a.reorderQty}.`
        : `${a.nombre}: quedan ${a.stock} (umbral ${a.umbral}). Sugerido a pedir.`;
    let alguno = false;
    for (const d of args.destinatarios) {
      const ck = claveEnvio(args.tenantId, a.sku, args.fecha, d.googleSub);
      if (clavesProceso.has(ck) || args.yaEnviados?.has(ck) === true) continue;
      clavesProceso.add(ck);
      registradas.push(ck);
      args.registrar?.(ck);
      alguno = true;
      const metaBase = { googleSub: d.googleSub, clave: ck };
      if (d.canales.includes("whatsapp")) {
        const destino = destinoDe(d.googleSub, "whatsapp", args.direcciones);
        if (destino) {
          try {
            await args.enviarWa(destino, texto, { ...metaBase, canal: "whatsapp" });
          } catch {
            // Fallo de un canal no bloquea el resto.
          }
        }
      }
      if (d.canales.includes("email")) {
        const destino = destinoDe(d.googleSub, "email", args.direcciones);
        if (destino) {
          try {
            await args.enviarEmail(destino, texto, { ...metaBase, canal: "email" });
          } catch {
            // Fallo de un canal no bloquea el resto.
          }
        }
      }
    }
    if (alguno) enviadas += 1;
  }

  return {
    alertas: Object.freeze(alertas),
    enviadas,
    omitidasYa,
    clavesRegistradas: Object.freeze(registradas),
    enviosProveedor: 0,
  };
}
