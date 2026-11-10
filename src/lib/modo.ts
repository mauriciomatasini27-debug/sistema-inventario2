export const ESTADOS_MODO = ["calmado", "pensando", "exito", "alerta", "minimizado"] as const;

export type EstadoModo = (typeof ESTADOS_MODO)[number];

export type EventoModo = "cargar" | "avisos" | "sin-avisos" | "minimizar" | "celebrar" | "calmar";

export type GestoModo = "flotar" | "mecer" | "saltar" | "sacudir" | "flotar-lento" | "quieto";

export interface AvisoModo {
  readonly id: "stock" | "fiado";
  readonly texto: string;
  readonly href: string;
}

export interface NodoModo {
  readonly estado: EstadoModo;
  readonly panelAbierto: boolean;
  readonly ariaLabel: string;
  readonly ariaExpanded: boolean;
  readonly avisos: readonly AvisoModo[];
}

export interface VistaModo {
  readonly estado: EstadoModo;
  readonly ariaLabel: string;
  readonly gesto: GestoModo;
  readonly confeti: boolean;
  readonly figuraPx: 36 | 28;
}

const ETIQUETA: Record<EstadoModo, string> = {
  calmado: "calmado",
  pensando: "pensando",
  exito: "éxito",
  alerta: "alerta",
  minimizado: "minimizado",
};

const GESTO: Record<EstadoModo, GestoModo> = {
  calmado: "flotar",
  pensando: "mecer",
  exito: "saltar",
  alerta: "sacudir",
  minimizado: "flotar-lento",
};

export const ANTENA_MODO: Record<EstadoModo, string> = {
  calmado: "var(--color-llama)",
  pensando: "var(--color-pendiente-oscuro)",
  exito: "var(--color-ok-oscuro)",
  alerta: "var(--color-peligro)",
  minimizado: "var(--color-llama)",
};

export const CUERPO_MODO = [
  "var(--color-llama)",
  "var(--color-naranja)",
  "var(--color-star-warm)",
] as const;

export function esEstadoModo(valor: string): valor is EstadoModo {
  return (ESTADOS_MODO as readonly string[]).includes(valor);
}

export function etiquetaModo(estado: EstadoModo): string {
  return `Modo, ${ETIQUETA[estado]}`;
}

export function gestoModo(estado: EstadoModo, reducido: boolean): GestoModo {
  if (reducido) return "quieto";
  return GESTO[estado];
}

export function muestraConfeti(estado: EstadoModo, reducido: boolean): boolean {
  return estado === "exito" && !reducido;
}

export function tamanoModo(cobrando: boolean): 36 | 28 {
  return cobrando ? 28 : 36;
}

export function vistaModo(estado: EstadoModo, reducido: boolean, cobrando: boolean): VistaModo {
  return {
    estado,
    ariaLabel: etiquetaModo(estado),
    gesto: gestoModo(estado, reducido),
    confeti: muestraConfeti(estado, reducido),
    figuraPx: tamanoModo(cobrando),
  };
}

export function crearNodoModo(): NodoModo {
  return {
    estado: "calmado",
    panelAbierto: false,
    ariaLabel: etiquetaModo("calmado"),
    ariaExpanded: false,
    avisos: [],
  };
}

export function fijarEstado(nodo: NodoModo, estado: EstadoModo): NodoModo {
  return { ...nodo, estado, ariaLabel: etiquetaModo(estado) };
}

export function reducirModo(estado: EstadoModo, evento: EventoModo): EstadoModo {
  if (evento === "minimizar") return "minimizado";
  if (evento === "calmar") return "calmado";
  if (evento === "celebrar") return "exito";
  if (estado === "minimizado") return "minimizado";
  if (evento === "cargar") return "pensando";
  if (evento === "avisos") return "alerta";
  if (evento === "sin-avisos") return "calmado";
  return estado;
}

export function aplicarEvento(nodo: NodoModo, evento: EventoModo): NodoModo {
  const estado = reducirModo(nodo.estado, evento);
  return { ...nodo, estado, ariaLabel: etiquetaModo(estado) };
}

export function abrirPanel(nodo: NodoModo): NodoModo {
  return { ...nodo, panelAbierto: true, ariaExpanded: true };
}

export function cerrarPanel(nodo: NodoModo): NodoModo {
  return { ...nodo, panelAbierto: false, ariaExpanded: false };
}

export function alternarPanel(nodo: NodoModo): NodoModo {
  return nodo.panelAbierto ? cerrarPanel(nodo) : abrirPanel(nodo);
}

export function alTecla(nodo: NodoModo, tecla: string): NodoModo {
  if (tecla === "Escape" && nodo.panelAbierto) return cerrarPanel(nodo);
  return nodo;
}

export function alternarReposo(nodo: NodoModo): NodoModo {
  if (nodo.estado !== "minimizado") return aplicarEvento(nodo, "minimizar");
  const despierto = aplicarEvento(nodo, "calmar");
  return nodo.avisos.length > 0 ? aplicarEvento(despierto, "avisos") : despierto;
}

export function conAvisos(nodo: NodoModo, avisos: readonly AvisoModo[]): NodoModo {
  const evento: EventoModo = avisos.length > 0 ? "avisos" : "sin-avisos";
  return { ...aplicarEvento(nodo, evento), avisos: [...avisos] };
}

export function leerCuentaOpcional(valor: string | null | undefined): number | null {
  if (valor == null || valor.trim() === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function leerStockBajo(texto: string | null, oculto: boolean): number | null {
  if (texto === null) return null;
  if (oculto) return 0;
  const coincidencia = /(\d+)/.exec(texto);
  if (!coincidencia) return 0;
  return Number(coincidencia[1]);
}

export function avisosModo(entrada: {
  stockBajo: number | null;
  fiadoAtrasado: number | null;
}): AvisoModo[] {
  const avisos: AvisoModo[] = [];
  const stock = entrada.stockBajo;
  if (stock !== null && stock > 0) {
    avisos.push({
      id: "stock",
      texto: stock === 1 ? "1 producto con stock bajo." : `${stock} productos con stock bajo.`,
      href: "/panel/stock",
    });
  }
  const fiado = entrada.fiadoAtrasado;
  if (fiado !== null && fiado > 0) {
    avisos.push({
      id: "fiado",
      texto: fiado === 1 ? "1 fiado atrasado." : `${fiado} fiados atrasados.`,
      href: "/panel/fiado",
    });
  }
  return avisos;
}
