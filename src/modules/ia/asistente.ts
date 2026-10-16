import { z } from "zod";
import type { ProveedorLLM } from "./proveedor.js";
import type { RegistroUsoIA } from "./registro.js";

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

export interface HerramientaIA {
  readonly nombre: NombreHerramienta;
  readonly descripcion: string;
  readonly esquema: z.ZodType<unknown>;
  readonly soloDueno: boolean;
  readonly patrones: RegExp;
  ejecutar(ctx: CtxHerramienta, params: unknown): unknown;
}

export type LecturasIA = {
  [K in NombreHerramienta]?: (ctx: CtxHerramienta, params: unknown) => unknown;
};

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function crear_catalogo(lecturas: LecturasIA = {}): HerramientaIA[] {
  const hacer = (
    nombre: NombreHerramienta,
    descripcion: string,
    esquema: z.ZodType<unknown>,
    patrones: RegExp,
    soloDueno: boolean,
    porDefecto: unknown,
  ): HerramientaIA => ({
    nombre,
    descripcion,
    esquema,
    soloDueno,
    patrones,
    ejecutar: lecturas[nombre] ?? (() => porDefecto),
  });
  return [
    hacer(
      "top_productos",
      "Productos más vendidos del período",
      z.object({ limite: z.number().int().min(1).max(20).optional() }),
      /vend[a-z]*\s+m[aá]s|m[aá]s vendid|top \d|top productos|lo que m[aá]s se vende/,
      false,
      [],
    ),
    hacer(
      "ventas_periodo",
      "Total vendido en un período",
      z.object({ desde: z.string().optional(), hasta: z.string().optional() }),
      /cu[aá]nto vend|ventas? del|ventas? de |facturaci[oó]n|total vendido|vendido hoy|ventas hoy/,
      false,
      { total: 0 },
    ),
    hacer(
      "por_vencer",
      "Facturas o servicios próximos a vencer",
      z.object({ dias: z.number().int().min(1).max(90).optional() }),
      /por vencer|vencimiento|vencen|pr[oó]ximo a vencer|a punto de vencer/,
      false,
      [],
    ),
    hacer(
      "deudores",
      "Clientes con mayor deuda de fiado",
      z.object({ limite: z.number().int().min(1).max(20).optional() }),
      /debe|deben|deudor|fiado|cuenta corriente|quien me debe/,
      false,
      [],
    ),
    hacer(
      "stock_bajo",
      "Productos con stock bajo el mínimo",
      z.object({ limite: z.number().int().min(1).max(50).optional() }),
      /stock bajo|poco stock|quedando poco|reponer|faltante|sin stock/,
      false,
      [],
    ),
    hacer(
      "margen_producto",
      "Margen y costo de un producto (solo dueño)",
      z.object({ producto: z.string().min(1).optional() }),
      /margen|rentabilidad|cuanto me cuesta|costo|ganancia por producto/,
      true,
      null,
    ),
    hacer(
      "caja_dia",
      "Estado de la caja del día",
      z.object({ dia: z.string().optional() }),
      /caja de hoy|caja del d[ií]a|cierre de caja|hay en caja|saldo de caja|estado de caja/,
      false,
      { saldo: 0 },
    ),
    hacer(
      "rotacion_lenta",
      "Productos que casi no rotan",
      z.object({ dias: z.number().int().min(7).max(365).optional() }),
      /rotaci[oó]n lenta|no se vende|no rota|quieto|estancado|poca rotaci[oó]n/,
      false,
      [],
    ),
  ];
}

export function detectar_intencion(pregunta: string, catalogo: readonly HerramientaIA[]): HerramientaIA | null {
  const t = ` ${SIN_TILDES(pregunta)} `;
  return catalogo.find((h) => h.patrones.test(t)) ?? null;
}

export const RESPUESTA_FUERA_CATALOGO = "Todavía no sé responder eso" as const;
export const RESPUESTA_SIN_PERMISO = "No tenés permiso para ver esa información." as const;
export const RESPUESTA_SIN_CUPO = "Llegaste al cupo mensual de consultas del asistente. Se reinicia el mes que viene." as const;

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
}): { catalogo: HerramientaIA[]; preguntar(sesion: SesionIA, pregunta: string): Promise<RespuestaAsistente> } {
  const catalogo = crear_catalogo(opts.lecturas ?? {});
  const cupo = opts.cupoConsultasPorMes ?? 100;
  const mesActual = opts.mesActual ?? (() => new Date().toISOString().slice(0, 7));

  async function preguntar(sesion: SesionIA, pregunta: string): Promise<RespuestaAsistente> {
    const herramienta = detectar_intencion(pregunta, catalogo);
    if (!herramienta) {
      return {
        rechazada: true,
        texto: `${RESPUESTA_FUERA_CATALOGO}. Puedo responder: ${NOMBRES_HERRAMIENTAS.join(", ")}.`,
      };
    }
    if (herramienta.soloDueno && sesion.rol !== "dueno") {
      return { rechazada: true, texto: RESPUESTA_SIN_PERMISO };
    }
    const mes = mesActual();
    if (opts.registro.usoDelMes(sesion.tenantId, mes).consultas >= cupo) {
      return { rechazada: true, texto: RESPUESTA_SIN_CUPO };
    }
    const validado = herramienta.esquema.safeParse({});
    const datos = herramienta.ejecutar({ tenantId: sesion.tenantId }, validado.success ? validado.data : {});
    const redaccion = await opts.proveedor.completar([
      { rol: "sistema", contenido: `Respondé en español rioplatense breve usando solo estos datos: ${JSON.stringify(datos)}` },
      { rol: "usuario", contenido: pregunta },
    ]);
    opts.registro.registrar({
      tenantId: sesion.tenantId,
      mes,
      tokensEntrada: redaccion.tokensEntrada,
      tokensSalida: redaccion.tokensSalida,
      costoCentavos: 0,
    });
    return { rechazada: false, texto: redaccion.texto, herramienta: herramienta.nombre, datos };
  }

  return { catalogo, preguntar };
}
