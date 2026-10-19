import { z } from "zod";
import { mesAR } from "../../lib/fecha-ar.js";
import type { ProveedorLLM } from "./proveedor.js";
import type { RegistroUsoIA } from "./registro.js";

// Tope por defecto del asistente cuando el plan lo incluye sin cupo numérico.
// Fuente única: el medidor de /panel/plan (plan-panel.ts) lo importa para que
// el bloqueo y la vista nunca discrepen.
export const CUPO_ASISTENTE_POR_DEFECTO = 100;

export const NOMBRES_HERRAMIENTAS = [
  "top_productos",
  "ventas_periodo",
  "por_vencer",
  "deudores",
  "stock_bajo",
  "margen_producto",
  "caja_dia",
  "rotacion_lenta",
] as const;

export type NombreHerramienta = (typeof NOMBRES_HERRAMIENTAS)[number];

export interface CtxHerramienta {
  readonly tenantId: string;
}

export type LecturaIA = (ctx: CtxHerramienta, params: unknown) => unknown | Promise<unknown>;

export interface HerramientaIA {
  readonly nombre: NombreHerramienta;
  readonly descripcion: string;
  readonly esquema: z.ZodType<unknown>;
  readonly soloDueno: boolean;
  readonly patrones: RegExp;
  // Sin lectura conectada no hay dato real que mandar al LLM (ADR-0044).
  readonly ejecutar: LecturaIA | null;
}

export type LecturasIA = {
  [K in NombreHerramienta]?: LecturaIA;
};

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function crear_catalogo(lecturas: LecturasIA = {}): HerramientaIA[] {
  const hacer = (
    nombre: NombreHerramienta,
    descripcion: string,
    esquema: z.ZodType<unknown>,
    patrones: RegExp,
    soloDueno: boolean,
  ): HerramientaIA => ({
    nombre,
    descripcion,
    esquema,
    soloDueno,
    patrones,
    ejecutar: lecturas[nombre] ?? null,
  });
  return [
    hacer(
      "top_productos",
      "Productos más vendidos del período",
      z.object({ limite: z.number().int().min(1).max(20).optional() }),
      /vend[a-z]*\s+m[aá]s|m[aá]s vendid|top \d|top productos|lo que m[aá]s se vende/,
      false,
    ),
    hacer(
      "ventas_periodo",
      "Total vendido en un período",
      z.object({ desde: z.string().optional(), hasta: z.string().optional() }),
      /cu[aá]nto vend|ventas? del|ventas? de |facturaci[oó]n|total vendido|vendido hoy|ventas hoy/,
      false,
    ),
    hacer(
      "por_vencer",
      "Facturas o servicios próximos a vencer",
      z.object({ dias: z.number().int().min(1).max(90).optional() }),
      /por vencer|vencimiento|vencen|pr[oó]ximo a vencer|a punto de vencer/,
      false,
    ),
    hacer(
      "deudores",
      "Clientes con mayor deuda de fiado",
      z.object({ limite: z.number().int().min(1).max(20).optional() }),
      /debe|deben|deudor|fiado|cuenta corriente|quien me debe/,
      false,
    ),
    hacer(
      "stock_bajo",
      "Productos con stock bajo el mínimo",
      z.object({ limite: z.number().int().min(1).max(50).optional() }),
      /stock bajo|poco stock|quedando poco|reponer|faltante|sin stock/,
      false,
    ),
    hacer(
      "margen_producto",
      "Margen y costo de un producto (solo dueño)",
      z.object({ producto: z.string().min(1).optional() }),
      /margen|rentabilidad|cuanto me cuesta|costo|ganancia por producto/,
      true,
    ),
    hacer(
      "caja_dia",
      "Estado de la caja del día",
      z.object({ dia: z.string().optional() }),
      /caja de hoy|caja del d[ií]a|cierre de caja|hay en caja|saldo de caja|estado de caja/,
      false,
    ),
    hacer(
      "rotacion_lenta",
      "Productos que casi no rotan",
      z.object({ dias: z.number().int().min(7).max(365).optional() }),
      /rotaci[oó]n lenta|no se vende|no rota|quieto|estancado|poca rotaci[oó]n/,
      false,
    ),
  ];
}

export function detectar_intencion(pregunta: string, catalogo: readonly HerramientaIA[]): HerramientaIA | null {
  const t = ` ${SIN_TILDES(pregunta)} `;
  return catalogo.find((h) => h.patrones.test(t)) ?? null;
}

export const RESPUESTA_FUERA_CATALOGO =
  "Todavía no sé responder eso. Probá con una de las preguntas sugeridas." as const;
export const RESPUESTA_SIN_PERMISO = "No tenés permiso para ver esa información." as const;
export const RESPUESTA_SIN_CUPO = "Llegaste al cupo mensual de consultas del asistente. Se reinicia el mes que viene." as const;

export function respuestaSinLectura(descripcion: string): string {
  const detalle = descripcion.length > 0 ? descripcion.charAt(0).toLowerCase() + descripcion.slice(1) : descripcion;
  return `Todavía no puedo leer ${detalle} desde el asistente.`;
}

export interface SesionIA {
  readonly tenantId: string;
  readonly rol: "dueno" | "empleado";
}

export interface RespuestaAsistente {
  readonly rechazada: boolean;
  readonly texto: string;
  readonly herramienta?: NombreHerramienta | undefined;
  readonly datos?: unknown;
}

export function crearAsistente(opts: {
  proveedor: ProveedorLLM;
  registro: RegistroUsoIA;
  lecturas?: LecturasIA;
  cupoConsultasPorMes?: number;
  mesActual?: () => string;
  proveedorNombre?: string;
  modeloNombre?: string;
}): { catalogo: HerramientaIA[]; preguntar(sesion: SesionIA, pregunta: string): Promise<RespuestaAsistente> } {
  const catalogo = crear_catalogo(opts.lecturas ?? {});
  const cupo = opts.cupoConsultasPorMes ?? CUPO_ASISTENTE_POR_DEFECTO;
  const mesActual = opts.mesActual ?? (() => mesAR());

  async function preguntar(sesion: SesionIA, pregunta: string): Promise<RespuestaAsistente> {
    const herramienta = detectar_intencion(pregunta, catalogo);
    if (!herramienta) {
      return {
        rechazada: true,
        texto: RESPUESTA_FUERA_CATALOGO,
      };
    }
    if (herramienta.soloDueno && sesion.rol !== "dueno") {
      return { rechazada: true, texto: RESPUESTA_SIN_PERMISO };
    }
    if (!herramienta.ejecutar) {
      return { rechazada: true, texto: respuestaSinLectura(herramienta.descripcion) };
    }
    const mes = mesActual();
    if ((await opts.registro.usoDelMes(sesion.tenantId, mes)).consultas >= cupo) {
      return { rechazada: true, texto: RESPUESTA_SIN_CUPO };
    }
    const validado = herramienta.esquema.safeParse({});
    const datos = await herramienta.ejecutar({ tenantId: sesion.tenantId }, validado.success ? validado.data : {});
    const redaccion = await opts.proveedor.completar([
      { rol: "sistema", contenido: `Respondé en español rioplatense breve usando solo estos datos: ${JSON.stringify(datos)}` },
      { rol: "usuario", contenido: pregunta },
    ]);
    await opts.registro.registrar({
      tenantId: sesion.tenantId,
      mes,
      ...(opts.proveedorNombre !== undefined ? { proveedor: opts.proveedorNombre } : {}),
      ...(opts.modeloNombre !== undefined ? { modelo: opts.modeloNombre } : {}),
      tokensEntrada: redaccion.tokensEntrada,
      tokensSalida: redaccion.tokensSalida,
      costoCentavos: 0,
    });
    return { rechazada: false, texto: redaccion.texto, herramienta: herramienta.nombre, datos };
  }

  return { catalogo, preguntar };
}
