import { describe, expect, it } from "vitest";
import { claveOutboxCola, type ItemCola, type RespuestaPush, type StorageCola } from "../src/offline/cola-venta.js";
import { debeDrenarPorVisibilidad, drenadoUnico, type DrenadoUnico } from "../src/offline/drenado-unico.js";

function item(op_id: string, seq = 1): ItemCola {
  return { op_id, device_code: "caja-01", device_seq: seq, payload: { op_id } };
}

function memoria(seed: Record<string, unknown>): StorageCola & { json(clave: string): unknown } {
  const datos = new Map<string, string>();
  for (const [clave, valor] of Object.entries(seed)) datos.set(clave, JSON.stringify(valor));
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave)! : null),
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
    removeItem: (clave) => {
      datos.delete(clave);
    },
    json: (clave) => (datos.has(clave) ? JSON.parse(datos.get(clave)!) : null),
  };
}

function ok(): RespuestaPush {
  return { status: 201, cuerpo: {} };
}

function alVolver(drenado: DrenadoUnico, visibilityState: string, esHarnessWorst: boolean) {
  if (!debeDrenarPorVisibilidad(visibilityState, esHarnessWorst)) return undefined;
  return drenado.drenar();
}

describe("drenado al volver a la pestaña", () => {
  it("drena solo si la pestaña está visible y no es el harness worst", () => {
    expect(debeDrenarPorVisibilidad("visible", false)).toBe(true);
    expect(debeDrenarPorVisibilidad("hidden", false)).toBe(false);
    expect(debeDrenarPorVisibilidad("visible", true)).toBe(false);
    expect(debeDrenarPorVisibilidad("prerender", false)).toBe(false);
  });

  it("oculto o harness dejan la cola quieta y visible la vacía", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("op-1")] });
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem,
      tenantId: "t-1",
      enviar: async (i) => {
        enviados.push(i.op_id);
        return ok();
      },
    });

    expect(alVolver(drenado, "hidden", false)).toBeUndefined();
    expect(alVolver(drenado, "visible", true)).toBeUndefined();
    expect(enviados).toEqual([]);
    expect(mem.json(clave)).toEqual([item("op-1")]);

    await alVolver(drenado, "visible", false);

    expect(enviados).toEqual(["op-1"]);
    expect(mem.json(clave)).toEqual([]);
  });

  it("dos vueltas visibles durante un envío comparten un solo vuelo", async () => {
    const clave = claveOutboxCola("t-1");
    const mem = memoria({ [clave]: [item("A", 1), item("B", 2)] });
    let enVuelo = 0;
    let maximo = 0;
    let soltar = () => {};
    const esperar = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    let adentro = () => {};
    const estaAdentro = new Promise<void>((resolve) => {
      adentro = resolve;
    });
    let primero = true;
    const enviados: string[] = [];
    const drenado = drenadoUnico({
      storage: mem,
      tenantId: "t-1",
      enviar: async (i) => {
        enVuelo += 1;
        maximo = Math.max(maximo, enVuelo);
        enviados.push(i.op_id);
        const bloquear = primero;
        primero = false;
        if (bloquear) adentro();
        try {
          if (bloquear) await esperar;
          return ok();
        } finally {
          enVuelo -= 1;
        }
      },
    });

    const ida = alVolver(drenado, "visible", false);
    await Promise.race([
      estaAdentro,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("el drenado visible no arrancó")), 200);
      }),
    ]);
    const vuelta = alVolver(drenado, "visible", false);
    soltar();
    const [a, b] = await Promise.all([ida, vuelta]);

    expect(vuelta).toBe(ida);
    expect(a).toBe(b);
    expect(maximo).toBe(1);
    expect(enviados).toEqual(["A", "B"]);
    expect(mem.json(clave)).toEqual([]);
  });
});
