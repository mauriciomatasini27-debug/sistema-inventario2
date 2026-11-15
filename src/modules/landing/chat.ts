import { beatPorId, business, contact } from "../../data/business.js";
import type { MensajeLLM, ProveedorLLM, ResultadoLLM } from "../ia/proveedor.js";

export const CLAVE_LLM_LANDING = "LANDING_LLM_KEY";

export const LIMITE_MENSAJES_POR_DIA = 20;

export const AVISO_LEY_25326 =
  "Tus mensajes se usan solo para responder tu consulta (Ley 25.326 de Protección de Datos Personales). Si dejás datos de contacto, solo los usamos para responderte.";

export const ENLACE_FORMULARIO = "#contacto";

export type FuenteRespuesta =
  | "faq"
  | "planes"
  | "rubro"
  | "inicio"
  | "humano"
  | "inyeccion"
  | "derivacion"
  | "cupo";

export interface RespuestaLanding {
  readonly texto: string;
  readonly deriva: boolean;
  readonly fuente: FuenteRespuesta;
  readonly whatsapp?: string | undefined;
  readonly formulario?: string | undefined;
}

const sinTildes = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const PATRON_HUMANO = /hablar con alguien|humano|persona real|asesor|agente|operador|por telefono|llamarme/;
const PATRON_INTERNO =
  /vendi[óo]|ventas|facturaci[óo]n|tenant|comercio .*x|tabla|select|margen|deudor|fiado|stock de|caja de|cuanto .*cobr/;

export function linkDerivacionWhatsApp(): string {
  const texto = encodeURIComponent("Hola Inventario — quiero hablar con alguien — rubro: __, cajas: __");
  return `${contact.whatsapp}?text=${texto}`;
}

function derivar(texto: string, fuente: FuenteRespuesta): RespuestaLanding {
  return { texto, deriva: true, fuente, whatsapp: linkDerivacionWhatsApp(), formulario: ENLACE_FORMULARIO };
}

function textoPlanes(): string {
  const oferta = beatPorId("planes");
  const lista = business.planes.map((p) => `${p.nombre} (${p.precioUnico}): ${p.features.join(" ")}`).join(" ");
  return `Trabajamos con estos planes: ${lista} ${oferta.nota}`;
}

function textoRubro(): string {
  const publico = beatPorId("publico");
  return `Sí: está pensado para ${publico.yes.join(" ")} Arrancamos con un local de mostrador.`;
}

function textoInicio(): string {
  const empezar = beatPorId("planes").empezar;
  const pasos = empezar.steps.map((p) => `${p.title}: ${p.detail}`).join(" ");
  return `${empezar.lead} ${pasos}`;
}

export function responderLanding(pregunta: string): RespuestaLanding {
  const n = sinTildes(pregunta);
  if (PATRON_HUMANO.test(n)) {
    return derivar("Te paso con alguien por WhatsApp para seguirla ahí. También podés dejarnos tu consulta en el formulario.", "humano");
  }
  if (PATRON_INTERNO.test(n)) {
    return derivar(
      "No tengo esa información: solo respondo dudas generales sobre el sistema (planes, rubros y cómo empezar). Si querés, te paso con alguien por WhatsApp.",
      "inyeccion",
    );
  }
  for (const item of beatPorId("faq").items) {
    const qn = sinTildes(item.q);
    if (qn.length > 10 && (n.includes(qn) || qn.includes(n))) {
      return { texto: item.a, deriva: false, fuente: "faq" };
    }
  }
  if (n.includes("plan") || n.includes("precio")) {
    return { texto: textoPlanes(), deriva: false, fuente: "planes" };
  }
  if (n.includes("almac") || n.includes("kiosco") || n.includes("mostrador") || n.includes("rubro") || n.includes("sirve para")) {
    return { texto: textoRubro(), deriva: false, fuente: "rubro" };
  }
  if (n.includes("empez") || n.includes("empiezo") || n.includes("comienzo") || n.includes("demo") || n.includes("paso")) {
    return { texto: textoInicio(), deriva: false, fuente: "inicio" };
  }
  return derivar(
    "Todavía no sé responder eso con la info pública. Te paso con alguien por WhatsApp o dejános tu consulta en el formulario.",
    "derivacion",
  );
}

const usosPorClaveYDia = new Map<string, number>();

export function registrarUso(claveUso: string): { permitido: boolean; usados: number } {
  const usados = (usosPorClaveYDia.get(claveUso) ?? 0) + 1;
  usosPorClaveYDia.set(claveUso, usados);
  return { permitido: usados <= LIMITE_MENSAJES_POR_DIA, usados };
}

export function reiniciarLimiteLanding(): void {
  usosPorClaveYDia.clear();
}

function contarPalabras(texto: string): number {
  return Math.max(1, texto.split(/\s+/).filter(Boolean).length);
}

export class ProveedorLandingFake implements ProveedorLLM {
  llamadas = 0;
  readonly conClave: boolean;
  constructor(opts: { clavePresente?: boolean } = {}) {
    this.conClave = opts.clavePresente ?? false;
  }
  async completar(mensajes: readonly MensajeLLM[]): Promise<ResultadoLLM> {
    this.llamadas += 1;
    const ultimo = [...mensajes].reverse().find((m) => m.rol === "usuario");
    const entrada = mensajes.map((m) => m.contenido).join("\n");
    const texto = responderLanding(ultimo?.contenido ?? "").texto;
    return { texto, tokensEntrada: contarPalabras(entrada), tokensSalida: contarPalabras(texto) };
  }
}

const TEXTO_CUPO =
  "Llegaste al límite de 20 mensajes por día del chat. Seguimos por WhatsApp.";

export async function manejarMensajeLanding(opts: {
  mensaje: string;
  claveUso: string;
  proveedor: ProveedorLLM;
}): Promise<RespuestaLanding & { porCupo: boolean }> {
  const uso = registrarUso(opts.claveUso);
  if (!uso.permitido) {
    return { ...derivar(TEXTO_CUPO, "cupo"), porCupo: true };
  }
  const decision = responderLanding(opts.mensaje);
  const redaccion = await opts.proveedor.completar([{ rol: "usuario", contenido: opts.mensaje }]);
  return { ...decision, texto: redaccion.texto, porCupo: false };
}
