import type { ProductoCatalogo } from "./catalogo-panel.js";

export interface KpisCatalogo {
  bajo_minimo: number;
  sin_verificar: number;
  total: number;
  con_minimo: number;
}

export interface RespuestaCatalogo {
  productos: ProductoCatalogo[];
  kpis?: KpisCatalogo | undefined;
}

export type ObjetivoDeEventos = Pick<EventTarget, "addEventListener" | "removeEventListener">;

type RespuestaHttp = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type FetchCatalogo = (url: string, init: { signal: AbortSignal }) => Promise<RespuestaHttp>;

export interface OpcionesCargaCatalogo {
  url: string;
  alCargar: (respuesta: RespuestaCatalogo) => void;
  alError: (error: unknown) => void;
  fetchImpl?: FetchCatalogo | undefined;
  objetivo?: ObjetivoDeEventos | undefined;
}

export interface CargaEnCurso {
  cancelar(): void;
  terminada: Promise<void>;
}

export function esErrorDeAborto(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function cargarCatalogoPanel({
  url,
  alCargar,
  alError,
  fetchImpl = fetch,
  objetivo = window,
}: OpcionesCargaCatalogo): CargaEnCurso {
  const controlador = new AbortController();
  const alSalir = () => controlador.abort();
  // NAV-S4 [plataforma]: Chromium no siempre emite pagehide en MPA; beforeunload sí.
  const EVENTOS_SALIDA = ["pagehide", "beforeunload"] as const;
  for (const evento of EVENTOS_SALIDA) {
    objetivo.addEventListener(evento, alSalir, { once: true });
  }

  const soltar = () => {
    for (const evento of EVENTOS_SALIDA) {
      objetivo.removeEventListener(evento, alSalir);
    }
  };

  const terminada = (async () => {
    try {
      const r = await fetchImpl(url, { signal: controlador.signal });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const cuerpo = (await r.json()) as RespuestaCatalogo | null;
      if (controlador.signal.aborted) return;
      alCargar({
        productos: Array.isArray(cuerpo?.productos) ? cuerpo.productos : [],
        kpis: cuerpo?.kpis,
      });
    } catch (error) {
      if (controlador.signal.aborted || esErrorDeAborto(error)) return;
      alError(error);
    } finally {
      soltar();
    }
  })();

  return {
    cancelar() {
      soltar();
      controlador.abort();
    },
    terminada,
  };
}
