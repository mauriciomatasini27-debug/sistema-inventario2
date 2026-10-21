import { beforeEach, describe, expect, it } from "vitest";
import {
  FORMATO_PRECIO,
  LOCALE_PRECIO,
  catalogoMil,
  leerCatalogo,
  leerSkuSeleccionado,
  marcarSkuSeleccionado,
  modoHarnessCatalogo,
  pesosDesdeCentavos,
  publicarCatalogo,
  suscribirCatalogo,
  suscribirSkuSeleccionado,
  type ProductoCatalogo,
} from "../src/lib/catalogo-panel.js";
import { formatearPesos } from "../src/lib/pesos.js";

const nfPrecio = new Intl.NumberFormat(LOCALE_PRECIO, FORMATO_PRECIO);
const precioNumberFlow = (centavos: number | string): string =>
  nfPrecio.format(pesosDesdeCentavos(centavos)).replace(/[\u00a0\u202f]/g, " ");

describe("pesosDesdeCentavos", () => {
  it("convierte centavos a pesos", () => {
    expect(pesosDesdeCentavos(0)).toBe(0);
    expect(pesosDesdeCentavos(5)).toBe(0.05);
    expect(pesosDesdeCentavos("123456")).toBe(1234.56);
    expect(pesosDesdeCentavos(-500)).toBe(-5);
  });

  it("cae a 0 cuando no es finito", () => {
    expect(pesosDesdeCentavos(Number.NaN)).toBe(0);
    expect(pesosDesdeCentavos(Number.POSITIVE_INFINITY)).toBe(0);
    expect(pesosDesdeCentavos("no-es-numero")).toBe(0);
  });
});

describe("FORMATO_PRECIO reproduce formatearPesos", () => {
  it("con LOCALE_PRECIO da el mismo texto del panel, signo incluido", () => {
    for (const centavos of [0, 5, 123456, -500, 999999999]) {
      expect(precioNumberFlow(centavos), String(centavos)).toBe(formatearPesos(centavos));
    }
  });

  it("agrupa miles y usa coma decimal", () => {
    expect(precioNumberFlow(123456)).toBe("$ 1.234,56");
    expect(precioNumberFlow(0)).toBe("$ 0,00");
  });
});

describe("catalogoMil", () => {
  it("arma n productos deterministas con sku MIL-0001..MIL-n", () => {
    const items = catalogoMil(1000);
    expect(items).toHaveLength(1000);
    expect(items[0]?.sku).toBe("MIL-0001");
    expect(items[999]?.sku).toBe("MIL-1000");
    expect(catalogoMil(1000)).toEqual(items);
  });

  it("incluye nombres largos sin espacios, precios de 1 a 9 dígitos y min_stock null", () => {
    const items = catalogoMil(1000);
    const largos = items.filter((p) => !p.nombre.includes(" ") && p.nombre.length > 40);
    expect(largos.length).toBeGreaterThan(0);
    const digitos = new Set(items.map((p) => String(p.precioCentavos).length));
    expect([...digitos].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(items.some((p) => p.min_stock === null)).toBe(true);
    expect(items.some((p) => typeof p.min_stock === "number")).toBe(true);
  });
});

describe("modoHarnessCatalogo", () => {
  it("solo devuelve mil en dev con ?data=mil", () => {
    expect(modoHarnessCatalogo(new URL("http://x/panel/precios?data=mil"), true)).toBe("mil");
    expect(modoHarnessCatalogo(new URL("http://x/panel/precios?data=mil"), false)).toBeNull();
    expect(modoHarnessCatalogo(new URL("http://x/panel/precios"), true)).toBeNull();
    expect(modoHarnessCatalogo(new URL("http://x/panel/precios?data=worst"), true)).toBeNull();
  });
});

describe("store de catalogo", () => {
  beforeEach(() => {
    publicarCatalogo([]);
    marcarSkuSeleccionado(null);
  });

  it("publicar y leer el ultimo valor", () => {
    const items: ProductoCatalogo[] = [{ sku: "A", nombre: "Uno", precioCentavos: 100 }];
    publicarCatalogo(items);
    expect(leerCatalogo()).toEqual(items);
  });

  it("repite el ultimo valor al suscribirse", () => {
    const items: ProductoCatalogo[] = [{ sku: "B", nombre: "Dos", precioCentavos: 200 }];
    publicarCatalogo(items);
    const vistos: ProductoCatalogo[][] = [];
    const desuscribir = suscribirCatalogo((v) => vistos.push(v));
    expect(vistos).toEqual([items]);
    desuscribir();
  });

  it("notifica cada publicacion a los suscriptos", () => {
    const vistos: ProductoCatalogo[][] = [];
    const desuscribir = suscribirCatalogo((v) => vistos.push(v));
    publicarCatalogo([{ sku: "C", nombre: "Tres", precioCentavos: 300 }]);
    expect(vistos.at(-1)?.map((p) => p.sku)).toEqual(["C"]);
    desuscribir();
  });

  it("deja de notificar tras desuscribir", () => {
    let llamados = 0;
    const desuscribir = suscribirCatalogo(() => {
      llamados += 1;
    });
    const trasSuscribir = llamados;
    desuscribir();
    publicarCatalogo([{ sku: "D", nombre: "Cuatro", precioCentavos: 400 }]);
    expect(llamados).toBe(trasSuscribir);
  });
});

describe("store de sku seleccionado", () => {
  beforeEach(() => {
    marcarSkuSeleccionado(null);
  });

  it("normaliza sku a mayusculas y trim", () => {
    marcarSkuSeleccionado("  mil-0001  ");
    expect(leerSkuSeleccionado()).toBe("MIL-0001");
  });

  it("null con vacío", () => {
    marcarSkuSeleccionado("  ");
    expect(leerSkuSeleccionado()).toBe(null);
    marcarSkuSeleccionado("");
    expect(leerSkuSeleccionado()).toBe(null);
    marcarSkuSeleccionado(null);
    expect(leerSkuSeleccionado()).toBe(null);
  });

  it("notifica a oyentes y desuscribe", () => {
    const vistos: (string | null)[] = [];
    const desuscribir = suscribirSkuSeleccionado((v) => vistos.push(v));
    expect(vistos[0]).toBe(null);
    marcarSkuSeleccionado("A");
    expect(vistos[vistos.length - 1]).toBe("A");
    desuscribir();
    const antes = vistos.length;
    marcarSkuSeleccionado("B");
    expect(vistos.length).toBe(antes);
  });
});
