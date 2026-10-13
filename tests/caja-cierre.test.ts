import { describe, expect, it } from "vitest";
import { cerrar_jornada, fecha_jornada_ar, type CierreOk } from "../src/modules/cash/cierre.js";
import { puede_registrar, registrar_movimiento } from "../src/modules/cash/caja.js";
import type { Movimiento } from "../src/modules/cash/caja.js";

function cierres() {
  return new Map<string, CierreOk>();
}

const MOVS: Movimiento[] = [
  { tipo: "ingreso", metodo: "Efectivo", monto_centavos: 100000n, origen: "venta" },
  { tipo: "egreso", metodo: "Efectivo", monto_centavos: 20000n, origen: "retiro" },
];

describe("C12 cierre de jornada", () => {
  it("fecha_jornada usa America/Argentina, no UTC", () => {
    // 02:30 UTC = 23:30 del día anterior en AR (UTC-3).
    expect(fecha_jornada_ar(new Date("2026-01-01T02:30:00Z"))).toBe("2025-12-31");
    expect(fecha_jornada_ar(new Date("2026-01-01T03:30:00Z"))).toBe("2026-01-01");
  });

  it("cierra 201 con total derivado (SUM, sin persistir saldos)", () => {
    const r = cerrar_jornada({
      idempotencyKey: "cierre-1",
      fechaJornada: "2026-10-09",
      closeType: "manual",
      movimientos: MOVS,
      ultimoMovimientoId: "mov-99",
      turnosEnDisputa: 0,
      cierres: cierres(),
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.cierre.totalCentavos).toBe(80000n);
    expect(r.cierre.ultimoMovimientoId).toBe("mov-99");
  });

  it("segundo cierre de la misma jornada es 409", () => {
    const c = cierres();
    const base = {
      fechaJornada: "2026-10-09",
      closeType: "manual" as const,
      movimientos: MOVS,
      ultimoMovimientoId: null,
      turnosEnDisputa: 0,
      cierres: c,
    };
    expect(cerrar_jornada({ ...base, idempotencyKey: "k1" }).status).toBe(201);
    const r2 = cerrar_jornada({ ...base, idempotencyKey: "k2" });
    expect(r2.status).toBe(409);
  });

  it("misma Idempotency-Key devuelve 409 con el original (E3)", () => {
    const c = cierres();
    const base = {
      fechaJornada: "2026-10-09",
      closeType: "automatica" as const,
      movimientos: MOVS,
      ultimoMovimientoId: null,
      turnosEnDisputa: 0,
      cierres: c,
    };
    const r1 = cerrar_jornada({ ...base, idempotencyKey: "dup" });
    const r2 = cerrar_jornada({ ...base, idempotencyKey: "dup" });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(409);
    if (r2.status === 409) expect(r2.original).toBeDefined();
  });

  it("close_type fuera de lista es 422 (CHECK)", () => {
    const r = cerrar_jornada({
      idempotencyKey: "k-bad",
      fechaJornada: "2026-10-09",
      closeType: "a_ojo",
      movimientos: MOVS,
      ultimoMovimientoId: null,
      turnosEnDisputa: 0,
      cierres: cierres(),
    });
    expect(r).toMatchObject({ status: 422 });
  });

  it("fecha_jornada malformada es 422", () => {
    const r = cerrar_jornada({
      idempotencyKey: "k-fecha",
      fechaJornada: "09-10-2026",
      closeType: "manual",
      movimientos: MOVS,
      ultimoMovimientoId: null,
      turnosEnDisputa: 0,
      cierres: cierres(),
    });
    expect(r).toMatchObject({ status: 422 });
  });

  it("E5: con turno en disputa el cierre es 422 hasta resolución Dueño", () => {
    const c = cierres();
    const base = {
      fechaJornada: "2026-10-09",
      closeType: "manual" as const,
      movimientos: MOVS,
      ultimoMovimientoId: null,
      cierres: c,
    };
    const bloqueado = cerrar_jornada({ ...base, idempotencyKey: "k-e5", turnosEnDisputa: 1 });
    expect(bloqueado).toMatchObject({ status: 422 });
    const liberado = cerrar_jornada({ ...base, idempotencyKey: "k-ok", turnosEnDisputa: 0 });
    expect(liberado.status).toBe(201);
  });
});

describe("C15/C16 retiros y sueldos solo Dueño", () => {
  it("empleado no puede retiro_dueno por categoria ni por tipo_retiro", () => {
    expect(() =>
      registrar_movimiento({ tipo: "egreso", metodo: "Efectivo", monto_centavos: 1000n, origen: "retiro", categoria_id: "retiro_dueno", rol: "empleado" }),
    ).toThrow("empleado no puede retiro_dueno");
    expect(() =>
      registrar_movimiento({ tipo: "egreso", metodo: "Efectivo", monto_centavos: 1000n, origen: "retiro", categoria_id: "caja_chica", tipo_retiro: "retiro_dueno", rol: "empleado" }),
    ).toThrow("empleado no puede retiro_dueno");
  });

  it("dueno registra retiro_dueno y empleado registra retiro_caja", () => {
    const r1 = registrar_movimiento({ tipo: "egreso", metodo: "Efectivo", monto_centavos: 1000n, origen: "retiro", categoria_id: "retiro_dueno", tipo_retiro: "retiro_dueno", rol: "dueno" });
    expect(r1.tipo_retiro).toBe("retiro_dueno");
    const r2 = registrar_movimiento({ tipo: "egreso", metodo: "Efectivo", monto_centavos: 500n, origen: "retiro", categoria_id: "caja_chica", tipo_retiro: "retiro_caja", rol: "empleado" });
    expect(r2.origen).toBe("retiro");
  });

  it("sueldos solo dueno", () => {
    expect(() =>
      registrar_movimiento({ tipo: "egreso", metodo: "Transferencia", monto_centavos: 50000n, origen: "sueldo", categoria_id: "sueldo_mensual", rol: "empleado", empleado: "juan", periodo: "2026-09" }),
    ).toThrow("sueldos solo dueno");
    expect(puede_registrar({ origen: "sueldo", categoria_id: "sueldo_mensual", rol: "empleado" })).toBe(false);
    expect(puede_registrar({ origen: "sueldo", categoria_id: "sueldo_mensual", rol: "dueno" })).toBe(true);
    expect(puede_registrar({ origen: "retiro", categoria_id: "retiro_dueno", rol: "empleado" })).toBe(false);
  });
});
