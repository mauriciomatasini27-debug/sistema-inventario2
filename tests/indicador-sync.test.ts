import { describe, expect, it } from "vitest";
import { CLAVE_LEGADA_OUTBOX, claveOutboxCola, type StorageCola } from "../src/offline/cola-venta.js";
import { contarPendientesCola, reducirIndicadorSync } from "../src/offline/indicador-sync.js";

function memoria(seed: Record<string, string> = {}) {
  const datos = new Map(Object.entries(seed));
  const storage: StorageCola = {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave)! : null),
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
    removeItem: (clave) => {
      datos.delete(clave);
    },
  };
  return storage;
}

describe("reducirIndicadorSync", () => {
  it("en línea y sin pendientes es verde", () => {
    expect(
      reducirIndicadorSync({ online: true, pendientes: 0, sincronizando: false, cortado: false }),
    ).toEqual({ tono: "verde", etiqueta: "En línea" });
  });

  it("sin conexión y con pendientes es ámbar y nombra la cantidad", () => {
    expect(
      reducirIndicadorSync({ online: false, pendientes: 3, sincronizando: false, cortado: false }),
    ).toEqual({ tono: "ambar", etiqueta: "Sin conexión · 3 pendientes" });
  });

  it("sin conexión y cola vacía dice Sin conexión", () => {
    expect(
      reducirIndicadorSync({ online: false, pendientes: 0, sincronizando: false, cortado: false }),
    ).toEqual({ tono: "ambar", etiqueta: "Sin conexión" });
  });

  it("mientras sincroniza es azul aunque el drenado anterior haya cortado", () => {
    const vista = reducirIndicadorSync({
      online: true,
      pendientes: 2,
      sincronizando: true,
      cortado: true,
    });
    expect(vista.tono).toBe("azul");
    expect(vista.etiqueta).toContain("2 pendientes");
  });

  it("cortado es rojo", () => {
    const vista = reducirIndicadorSync({
      online: true,
      pendientes: 1,
      sincronizando: false,
      cortado: true,
    });
    expect(vista.tono).toBe("rojo");
    expect(vista.etiqueta).toContain("1 pendiente");
  });

  it("en línea con pendientes sigue en ámbar", () => {
    expect(
      reducirIndicadorSync({ online: true, pendientes: 3, sincronizando: false, cortado: false }),
    ).toEqual({ tono: "ambar", etiqueta: "3 pendientes" });
  });
});

describe("contarPendientesCola", () => {
  it("con tenant suma la cola propia y la legada", () => {
    const clave = claveOutboxCola("t-1");
    const storage = memoria({
      [clave]: JSON.stringify([{ op_id: "a" }, { op_id: "b" }]),
      [CLAVE_LEGADA_OUTBOX]: JSON.stringify([{ op_id: "c" }]),
    });
    expect(contarPendientesCola(storage, "t-1")).toBe(3);
  });

  it("sin tenant no cuenta dos veces la clave legada", () => {
    const storage = memoria({
      [CLAVE_LEGADA_OUTBOX]: JSON.stringify([{ op_id: "a" }, { op_id: "b" }]),
    });
    expect(contarPendientesCola(storage, null)).toBe(2);
  });

  it("un JSON roto cuenta cero y no tira", () => {
    const storage = memoria({ [claveOutboxCola("t-1")]: "no-json" });
    expect(contarPendientesCola(storage, "t-1")).toBe(0);
  });
});

describe("presupuesto del reducer", () => {
  it("la mediana de 100 llamadas queda bajo 5 ms", () => {
    const entrada = { online: false, pendientes: 3, sincronizando: false, cortado: false };
    const muestras: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const t0 = performance.now();
      reducirIndicadorSync(entrada);
      muestras.push(performance.now() - t0);
    }
    muestras.sort((a, b) => a - b);
    const mediana = muestras[49] ?? 0;
    expect(mediana).toBeLessThan(5);
  });
});
