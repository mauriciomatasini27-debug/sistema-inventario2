import { describe, expect, it } from "vitest";
import {
  accionesDisponibles,
  armarConteo,
  armarIngreso,
  clavesIdempotencia,
} from "../src/modules/stock/operaciones-panel.js";

describe("STOCK-R7: campo de código único y operaciones", () => {
  it("el alta de producto y el ingreso usan claves de idempotencia distintas", () => {
    const claves = clavesIdempotencia("entropia-1");
    expect(claves.alta).not.toBe(claves.ingreso);
    expect(claves.conteo).not.toBe(claves.alta);
    expect(clavesIdempotencia("entropia-1")).toEqual(claves);
  });

  it("el ingreso separa el costo del precio y el vencimiento es opcional", () => {
    const sinVence = armarIngreso({ sku: "A", cantidad: 2, costoCentavos: 350 });
    expect(sinVence.body).toEqual({
      sku: "A",
      cantidad: 2,
      costo_centavos: 350,
      controla_vencimiento: false,
      vence_el: null,
    });
    const conVence = armarIngreso({ sku: "A", cantidad: 1, costoCentavos: 0, venceEl: "2026-12-01T00:00" });
    expect(conVence.body.controla_vencimiento).toBe(true);
    expect(conVence.body.vence_el).toBe(new Date("2026-12-01T00:00").toISOString());
  });

  it("el conteo confirma con el rol efectivo real", () => {
    const dueno = armarConteo({ sku: "A", fisico: 4, contadoPor: "panel", motivo: "Ajuste", rol: "dueno" });
    expect(dueno.confirmar.body).toEqual({ rol: "dueno", confirmado_por: "panel", motivo: "Ajuste" });
    expect(dueno.crear.body).toEqual({ contado_por: "panel", lineas: [{ sku: "A", fisico: 4 }] });

    const empleado = armarConteo({ sku: "A", fisico: 4, contadoPor: "empleado", rol: "empleado" });
    expect(empleado.confirmar.body).toEqual({ rol: "empleado", confirmado_por: "empleado" });
  });

  it("el alta solo aparece si hay permiso para crear productos", () => {
    expect(accionesDisponibles(true)).toEqual(["agregar", "ingreso", "conteo", "lotes"]);
    expect(accionesDisponibles(false)).toEqual(["ingreso", "conteo", "lotes"]);
  });
});
