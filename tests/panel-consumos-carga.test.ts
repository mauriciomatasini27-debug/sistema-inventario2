import { describe, expect, it } from "vitest";
import { crearCargadorCuentasConsumos } from "../src/lib/panel-consumos-carga.js";

describe("panel consumos: carga de cuentas sin promesa stale", () => {
  it("cada cargar() dispara pedir() de nuevo y devuelve otra promesa", async () => {
    let llamadas = 0;
    const cargador = crearCargadorCuentasConsumos(async () => {
      llamadas += 1;
      return { items: llamadas };
    });

    const primera = cargador.cargar();
    const segunda = cargador.cargar();

    expect(primera).not.toBe(segunda);
    expect(llamadas).toBe(2);
    await expect(primera).resolves.toEqual({ items: 1 });
    await expect(segunda).resolves.toEqual({ items: 2 });
  });

  it("invalidar permite volver a cargar después de un fallo", async () => {
    let llamadas = 0;
    const cargador = crearCargadorCuentasConsumos(() => {
      llamadas += 1;
      return llamadas === 1 ? Promise.reject(new Error("red")) : Promise.resolve([]);
    });

    await expect(cargador.cargar()).rejects.toThrow("red");
    cargador.invalidar();
    await expect(cargador.cargar()).resolves.toEqual([]);
    expect(llamadas).toBe(2);
  });
});