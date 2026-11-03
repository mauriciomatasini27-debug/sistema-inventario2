import { textoError } from "./panel-modulos.js";

export type CuerpoSnapshotManual = {
  desde: string;
  hasta: string;
  origen: "manual";
};

export type EfectoSnapshotManual = { tipo: "recargar" } | { tipo: "mostrar"; texto: string };

export type RespuestaSnapshot = {
  status: number;
  json: () => Promise<unknown>;
};

export function cuerpoSnapshotManual(desde: string, hasta: string): CuerpoSnapshotManual {
  return { desde, hasta, origen: "manual" };
}

function errorDeCuerpo(cuerpo: unknown): unknown {
  if (!cuerpo || typeof cuerpo !== "object" || !("error" in cuerpo)) return undefined;
  return cuerpo.error;
}

// P1-47: 409 es el snapshot ya guardado para ese rango. Se relee. No es corte de red.
export async function leerEfectoSnapshot(respuesta: RespuestaSnapshot): Promise<EfectoSnapshotManual> {
  if (respuesta.status === 201 || respuesta.status === 409) return { tipo: "recargar" };
  try {
    return { tipo: "mostrar", texto: textoError(errorDeCuerpo(await respuesta.json()), respuesta.status) };
  } catch (errorJson) {
    console.warn("[panel/reportes] snapshot sin JSON", respuesta.status, errorJson);
    return { tipo: "mostrar", texto: textoError(undefined, respuesta.status) };
  }
}
