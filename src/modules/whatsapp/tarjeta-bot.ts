import { fechaAR } from "../../lib/fecha-ar.js";

// DASH-S3 (ADR-0034/0036): núcleo puro de la tarjeta `Bot` del índice de
// /panel. Sin IO: recibe credenciales, el último envío y los registros ya
// leídos. Cada estado trae su texto en palabras porque el color nunca alcanza.

export type EstadoNumeroCentral = "sin_configurar" | "sin_envios" | "operativo" | "degradado";

export interface UltimoEnvioCloud {
  readonly ok: boolean;
  readonly enMs: number;
}

export interface EntradaEstadoNumeroCentral {
  readonly credencialesConfiguradas: boolean;
  readonly ultimoEnvio: UltimoEnvioCloud | null;
}

export interface EstadoNumeroCentralVista {
  readonly estado: EstadoNumeroCentral;
  readonly texto: string;
}

const TEXTOS: Record<EstadoNumeroCentral, string> = {
  sin_configurar:
    "Sin configurar: el número central de WhatsApp todavía no está dado de alta, el bot no responde.",
  sin_envios: "Configurado, todavía sin envíos.",
  operativo: "Operativo: el último envío salió bien.",
  degradado: "Degradado: el último envío por la Cloud API falló; las respuestas pueden no llegar.",
};

export function estadoNumeroCentral(input: EntradaEstadoNumeroCentral): EstadoNumeroCentralVista {
  let estado: EstadoNumeroCentral;
  if (!input.credencialesConfiguradas) estado = "sin_configurar";
  else if (!input.ultimoEnvio) estado = "sin_envios";
  else estado = input.ultimoEnvio.ok ? "operativo" : "degradado";
  return { estado, texto: TEXTOS[estado] };
}

export interface RegistroConsulta {
  readonly creadoEnMs: number;
}

export interface ResumenConsultas {
  readonly hoy: number;
  readonly ultimaEnMs: number | null;
}

export function resumenConsultas(registros: ReadonlyArray<RegistroConsulta>, ahoraMs: number): ResumenConsultas {
  const hoy = fechaAR(ahoraMs);
  let cantidad = 0;
  let ultimaEnMs: number | null = null;
  for (const r of registros) {
    if (fechaAR(r.creadoEnMs) === hoy) cantidad += 1;
    if (ultimaEnMs === null || r.creadoEnMs > ultimaEnMs) ultimaEnMs = r.creadoEnMs;
  }
  return { hoy: cantidad, ultimaEnMs };
}
