import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  sincronizarColaVenta,
  type DepsColaVenta,
  type ItemCola,
  type RespuestaPush,
} from "../src/offline/cola-venta.js";

function item(seq: number): ItemCola {
  return {
    op_id: `op-${seq}`,
    device_code: "caja-01",
    device_seq: seq,
    payload: { seq },
  };
}

interface Simulacion {
  deps: DepsColaVenta;
  enviados: string[];
  cola: () => ItemCola[];
  agregar: (nuevo: ItemCola) => void;
}

function simulacion(
  inicial: ItemCola[],
  responder: (item: ItemCola, sim: Simulacion) => Promise<RespuestaPush>,
): Simulacion {
  let cola = inicial.map((i) => ({ ...i }));
  const sim: Simulacion = {
    enviados: [],
    cola: () => cola.map((i) => ({ ...i })),
    agregar: (nuevo) => {
      cola = [...cola, { ...nuevo }];
    },
    deps: {
      leer: () => cola.map((i) => ({ ...i })),
      escribir: (items) => {
        cola = items.map((i) => ({ ...i }));
      },
      enviar: async (i) => {
        sim.enviados.push(i.op_id);
        return responder(i, sim);
      },
    },
  };
  return sim;
}

describe("cola de venta offline", () => {
  it("una venta encolada con push caído por red sigue en la cola", async () => {
    const sim = simulacion([item(1)], async () => {
      throw new Error("sin red");
    });

    const r = await sincronizarColaVenta(sim.deps);

    expect(sim.cola().map((i) => i.op_id)).toEqual(["op-1"]);
    expect(r).toMatchObject({ pendientes: 1, cortado: true });
  });

  it("con dos ventas, un 503 en la primera corta y no envía la segunda", async () => {
    const sim = simulacion([item(1), item(2)], async (i) =>
      i.device_seq === 1 ? { status: 503, cuerpo: {} } : { status: 201, cuerpo: {} },
    );

    const r = await sincronizarColaVenta(sim.deps);

    expect(sim.enviados).toEqual(["op-1"]);
    expect(sim.cola().map((i) => i.op_id)).toEqual(["op-1", "op-2"]);
    expect(r.cortado).toBe(true);
  });

  it("201 y 200 replay sacan las ventas de la cola", async () => {
    const sim = simulacion([item(1), item(2)], async (i) => ({
      status: i.device_seq === 1 ? 201 : 200,
      cuerpo: {},
    }));

    const r = await sincronizarColaVenta(sim.deps);

    expect(sim.cola()).toEqual([]);
    expect(r).toMatchObject({ confirmados: 2, pendientes: 0, cortado: false });
  });

  it("una venta encolada durante el await del push no se borra", async () => {
    const sim = simulacion([item(1)], async (_i, s) => {
      s.agregar(item(2));
      return { status: 201, cuerpo: {} };
    });

    await sincronizarColaVenta(sim.deps);

    expect(sim.cola().map((i) => i.op_id)).toEqual(["op-2"]);
  });

  it("propiedad: no se pierde ninguna venta, el corte respeta el orden y lo confirmado sale", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 8 }),
        fc.array(fc.boolean(), { maxLength: 8 }),
        async (respuestas, llegadas) => {
          const inicial = respuestas.map((_, i) => item(i + 1));
          const todos = new Map(inicial.map((i) => [i.op_id, i]));
          const confirmados = new Set<string>();
          const enviados: number[] = [];
          let nuevoSeq = 100;

          const sim = simulacion(inicial, async (actual) => {
            enviados.push(actual.device_seq);
            if (llegadas[actual.device_seq - 1] === true) {
              const nuevo = item(nuevoSeq);
              nuevoSeq += 1;
              todos.set(nuevo.op_id, nuevo);
              sim.agregar(nuevo);
            }
            const tipo = respuestas[actual.device_seq - 1] ?? 0;
            if (tipo === 0) throw new Error("sin red");
            if (tipo === 1) {
              confirmados.add(actual.op_id);
              return { status: actual.device_seq % 2 === 0 ? 200 : 201, cuerpo: {} };
            }
            if (tipo === 2) return { status: 422, cuerpo: {} };
            return { status: 503, cuerpo: {} };
          });

          const r = await sincronizarColaVenta(sim.deps);
          const finales = new Set(sim.cola().map((i) => i.op_id));

          for (const opId of todos.keys()) {
            expect(finales.has(opId) || confirmados.has(opId)).toBe(true);
          }
          for (const opId of confirmados) {
            expect(finales.has(opId)).toBe(false);
          }

          const fallo = respuestas.findIndex((t) => t !== 1);
          const hasta = fallo === -1 ? respuestas.length : fallo + 1;
          expect(enviados).toEqual(Array.from({ length: hasta }, (_, i) => i + 1));
          expect(r.pendientes).toBe(sim.cola().length);
        },
      ),
      { numRuns: 300 },
    );
  });
});