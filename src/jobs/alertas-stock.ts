// Job ALR-S2/S5 (PRD-ALR-01, ADR-0043). Orquestador puro con canales
// inyectados: nunca toca red ni env. La clave por producto+día se registra
// antes de enviar (AT2) y el catálogo solo se lee (AT1). Nunca crea un envío
// al proveedor: solo deja borrador (S5, enviosProveedor siempre 0).
// pg_cron no se configura en este repo: el cron vive fuera y pega al endpoint.

import { clave_alerta_stock, es_quiebre, umbral_efectivo, type CanalAlerta } from "../modules/alertas/stock-bajo.js";

export interface ItemAlertaJob {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly minimo: number | null | undefined;
  readonly ventas7d: number;
  readonly proveedor: string | null;
}

export interface DestinoJob {
  readonly googleSub: string;
  readonly rol: "dueno" | "encargado";
  readonly canales: ReadonlyArray<CanalAlerta>;
}

export type EnvioCanal = (destino: string, texto: string) => { readonly ok: boolean; readonly error?: string | undefined };

export interface AlertaDecidida {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
  readonly clave: string;
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

export function ejecutar_alertas_stock(args: {
  readonly tenantId: string;
  readonly fecha: string;
  readonly modo: "matutino" | "quiebre";
  readonly catalogo: ReadonlyArray<ItemAlertaJob>;
  readonly destinatarios: ReadonlyArray<DestinoJob>;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly enviarWa: EnvioCanal;
  readonly enviarEmail: EnvioCanal;
  readonly registrar?: ((clave: string) => void) | undefined;
}): ResultadoAlertas {
  const alertas: AlertaDecidida[] = [];
  let omitidasYa = 0;
  for (const it of args.catalogo) {
    const umbral = umbral_efectivo(it.minimo, it.ventas7d);
    if (umbral == null) continue;
    if (!(it.stock <= umbral)) continue;
    if (args.modo === "quiebre" && !es_quiebre(it.stock)) continue;
    const clave = clave_alerta_stock(args.tenantId, it.sku, args.fecha);
    if (clavesProceso.has(clave) || args.yaEnviados?.has(clave) === true) {
      omitidasYa += 1;
      continue;
    }
    alertas.push({ sku: it.sku, nombre: it.nombre, stock: it.stock, umbral, proveedor: it.proveedor, clave });
  }
  if (alertas.length === 0 || args.destinatarios.length === 0) {
    return { alertas: Object.freeze(alertas), enviadas: 0, omitidasYa, clavesRegistradas: Object.freeze([]), enviosProveedor: 0 };
  }
  const registradas: string[] = [];
  for (const a of alertas) {
    clavesProceso.add(a.clave);
    registradas.push(a.clave);
    args.registrar?.(a.clave);
    const texto = `${a.nombre}: quedan ${a.stock} (umbral ${a.umbral}). Sugerido a pedir.`;
    for (const d of args.destinatarios) {
      if (d.canales.includes("whatsapp")) {
        try {
          args.enviarWa(d.googleSub, texto);
        } catch {
          // Fallo de un canal no bloquea el resto.
        }
      }
      if (d.canales.includes("email")) {
        try {
          args.enviarEmail(d.googleSub, texto);
        } catch {
          // Fallo de un canal no bloquea el resto.
        }
      }
    }
  }
  return { alertas: Object.freeze(alertas), enviadas: alertas.length, omitidasYa, clavesRegistradas: Object.freeze(registradas), enviosProveedor: 0 };
}
