import { describe, expect, it } from "vitest";
import { aplicarFiltroIndice } from "../src/lib/panel-indice-cliente.js";

interface Marca {
  dataset: { moduloIndice?: string };
  hidden: boolean;
}

function marca(id?: string): Marca {
  const el: Marca = { dataset: {}, hidden: false };
  if (id !== undefined) el.dataset.moduloIndice = id;
  return el;
}

function raiz(elementos: Marca[]): ParentNode {
  return {
    querySelectorAll: (selector: string) => {
      if (selector !== "[data-modulo-indice]") throw new Error(selector);
      return elementos.filter((el) => el.dataset.moduloIndice !== undefined);
    },
  } as unknown as ParentNode;
}

describe("filtro de módulos del índice", () => {
  it("oculta el id que no está en el índice y deja el que está", () => {
    const bot = marca("bot");
    const alertas = marca("alertas");
    const caja = marca("caja");
    const ok = aplicarFiltroIndice({ modulos: [{ id: "alertas" }, { id: "caja" }] }, raiz([bot, alertas, caja]));
    expect(ok).toBe(true);
    expect(bot.hidden).toBe(true);
    expect(alertas.hidden).toBe(false);
    expect(caja.hidden).toBe(false);
  });

  it("un índice sin módulos oculta todas las marcas", () => {
    const caja = marca("caja");
    const ok = aplicarFiltroIndice({ modulos: [] }, raiz([caja]));
    expect(ok).toBe(true);
    expect(caja.hidden).toBe(true);
  });

  it("ignora entradas sin id de texto", () => {
    const bot = marca("bot");
    const ok = aplicarFiltroIndice(
      { modulos: [null, 3, { id: 1 }, { nombre: "bot" }, { id: "caja" }] },
      raiz([bot, marca("caja")]),
    );
    expect(ok).toBe(true);
    expect(bot.hidden).toBe(true);
  });

  it("no toca una marca sin id", () => {
    const vacia = marca("");
    const ok = aplicarFiltroIndice({ modulos: [{ id: "caja" }] }, raiz([vacia, marca("caja")]));
    expect(ok).toBe(true);
    expect(vacia.hidden).toBe(false);
  });

  it("un payload inutilizable no cambia la visibilidad", () => {
    const bot = marca("bot");
    bot.hidden = false;
    for (const crudo of [null, undefined, "indice", 0, [], { upsell: [] }, { modulos: "bot" }]) {
      expect(aplicarFiltroIndice(crudo, raiz([bot]))).toBe(false);
      expect(bot.hidden).toBe(false);
    }
  });
});
