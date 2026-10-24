import {
  esPantallaUpsell,
  esSuperficieUpsell,
  type PantallaUpsell,
  type SuperficieUpsell,
} from "./panel-upsell.js";

export type AccesoCliente =
  | { readonly acceso: "incluido" }
  | { readonly acceso: "upsell"; readonly pantalla: PantallaUpsell }
  | { readonly acceso: "desconocido" };

const vuelos = new Map<SuperficieUpsell, Promise<AccesoCliente>>();

async function pedir(superficie: SuperficieUpsell): Promise<AccesoCliente> {
  try {
    const r = await fetch(`/api/panel/upsell?superficie=${superficie}`, { credentials: "same-origin" });
    if (!r.ok) return { acceso: "desconocido" };
    const crudo: unknown = await r.json();
    if (typeof crudo !== "object" || crudo === null) return { acceso: "desconocido" };
    const fila = crudo as Record<string, unknown>;
    if (fila["acceso"] === "incluido") return { acceso: "incluido" };
    if (fila["acceso"] === "upsell" && esPantallaUpsell(fila["pantalla"])) {
      return { acceso: "upsell", pantalla: fila["pantalla"] };
    }
    return { acceso: "desconocido" };
  } catch (error) {
    console.warn("[panel] no pudimos leer el upsell de la ruta", error);
    return { acceso: "desconocido" };
  }
}

export function leerAccesoUpsell(superficie: unknown): Promise<AccesoCliente> {
  if (!esSuperficieUpsell(superficie)) return Promise.resolve({ acceso: "desconocido" });
  const previo = vuelos.get(superficie);
  if (previo) return previo;
  const vuelo = pedir(superficie);
  vuelos.set(superficie, vuelo);
  return vuelo;
}

function texto(raiz: HTMLElement, selector: string, valor: string): void {
  const el = raiz.querySelector(selector);
  if (el) el.textContent = valor;
}

export function pintarUpsellPantalla(raiz: HTMLElement, acceso: AccesoCliente): void {
  if (acceso.acceso !== "upsell") return;
  const pantalla = acceso.pantalla;
  texto(raiz, "[data-upsell-pantalla-titulo]", pantalla.titulo);
  texto(raiz, "[data-upsell-pantalla-hace]", pantalla.queHace);
  texto(raiz, "[data-upsell-pantalla-actual]", pantalla.planActualTexto);
  const modulo = raiz.querySelector<HTMLElement>("[data-upsell-pantalla-modulo]");
  if (modulo) {
    modulo.textContent = pantalla.planModuloTexto ?? "";
    modulo.hidden = pantalla.planModuloTexto === null;
  }
  const ver = raiz.querySelector<HTMLElement>("[data-upsell-pantalla-ver]");
  const empleado = raiz.querySelector<HTMLElement>("[data-upsell-pantalla-empleado]");
  const esDueno = pantalla.cta === "ver_planes";
  if (ver) ver.hidden = !esDueno;
  if (empleado) empleado.hidden = esDueno;
  raiz.hidden = false;
  if (!pantalla.reemplazaPagina) return;
  for (const cuerpo of document.querySelectorAll<HTMLElement>("[data-modulo-cuerpo]")) {
    cuerpo.hidden = true;
  }
}
