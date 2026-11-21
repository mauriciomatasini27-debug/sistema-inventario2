import { parsearPesos } from "../../lib/pesos.js";
import { subtotalLinea } from "./linea_peso.js";

export type LineaTotal = { readonly qty: number; readonly precio_centavos: number; readonly porPeso?: boolean | undefined };

export type EvaluacionVuelto =
  | { readonly ok: true; readonly modo: "sin_recibido" }
  | {
      readonly ok: true;
      readonly modo: "vuelto";
      readonly recibidoCentavos: number;
      readonly vueltoCentavos: number;
    }
  | { readonly ok: false; readonly codigo: "recibido_invalido" | "recibido_insuficiente" };

export function totalCentavosCarrito(lineas: ReadonlyArray<LineaTotal>): number {
  return lineas.reduce((acc, l) => acc + Number(subtotalLinea(l.qty, l.precio_centavos, l.porPeso)), 0);
}

// TB-162: solo UI. El backend sigue registrando el importe de la venta, no lo recibido.
export function evaluarVueltoEfectivo(totalCentavos: number, textoRecibido: string): EvaluacionVuelto {
  const limpio = textoRecibido.trim();
  if (limpio === "") return { ok: true, modo: "sin_recibido" };
  const parseo = parsearPesos(limpio);
  if (!parseo.ok) return { ok: false, codigo: "recibido_invalido" };
  if (parseo.centavos < totalCentavos) return { ok: false, codigo: "recibido_insuficiente" };
  return {
    ok: true,
    modo: "vuelto",
    recibidoCentavos: parseo.centavos,
    vueltoCentavos: parseo.centavos - totalCentavos,
  };
}
