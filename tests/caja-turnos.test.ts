import { describe, expect, it } from "vitest";
import {
  conciliar_turno,
  registrar_drop,
  resolver_disputa,
  TOLERANCIA_CENTAVOS,
  type ConciliarOk,
  type Drop,
  type DropOk,
  type Turno,
} from "../src/modules/cash/turnos.js";

function turnoBase(over: Partial<Turno> = {}): Turno {
  return {
    id: "t1",
    fechaJornada: "2026-10-09",
    turno: "manana",
    entregadoPor: "ana",
    esperadoCentavos: 200000n,
    estado: "pendiente",
    ...over,
  };
}

function ctx(t: Turno) {
  return {
    turnos: new Map<string, Turno>([[t.id, t]]),
    vistos: new Map<string, ConciliarOk>(),
  };
}

describe("C17 turnos: conteo a ciegas vs esperado", () => {
  it("tolerancia es ±$500 en centavos bigint", () => {
    expect(TOLERANCIA_CENTAVOS).toBe(50000n);
  });

  it("conteo exacto concilia sin disputa", () => {
    const c = ctx(turnoBase());
    const r = conciliar_turno({
      idempotencyKey: "h1",
      turnoId: "t1",
      contadoCentavos: 200000n,
      conteosPorMedio: [{ medio: "Efectivo", montoCentavos: 200000n }],
      ...c,
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.turno.estado).toBe("conciliado");
    expect(r.turno.diferenciaCentavos).toBe(0n);
  });

  it("diferencia dentro de tolerancia concilia (borde ±$500)", () => {
    for (const contado of [150000n, 250000n]) {
      const c = ctx(turnoBase());
      const r = conciliar_turno({
        idempotencyKey: `h-${contado}`,
        turnoId: "t1",
        contadoCentavos: contado,
        conteosPorMedio: [{ medio: "Efectivo", montoCentavos: contado }],
        ...c,
      });
      expect(r.status).toBe(201);
      if (r.status === 201) expect(r.turno.estado).toBe("conciliado");
    }
  });

  it("diferencia mayor a $500 abre disputa con diferencia_turno", () => {
    const c = ctx(turnoBase());
    const r = conciliar_turno({
      idempotencyKey: "h-disp",
      turnoId: "t1",
      contadoCentavos: 140000n,
      conteosPorMedio: [{ medio: "Efectivo", montoCentavos: 140000n }],
      ...c,
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.turno.estado).toBe("en_disputa");
    expect(r.turno.diferenciaCentavos).toBe(-60000n);
  });

  it("desglose por medio que no cuadra con el conteo es 422", () => {
    const c = ctx(turnoBase());
    const r = conciliar_turno({
      idempotencyKey: "h-mal",
      turnoId: "t1",
      contadoCentavos: 200000n,
      conteosPorMedio: [{ medio: "Efectivo", montoCentavos: 199000n }],
      ...c,
    });
    expect(r).toMatchObject({ status: 422 });
  });

  it("reconciliar un turno ya conciliado es 409", () => {
    const c = ctx(turnoBase());
    const input = {
      turnoId: "t1",
      contadoCentavos: 200000n,
      conteosPorMedio: [{ medio: "Efectivo", montoCentavos: 200000n }],
      ...c,
    };
    expect(conciliar_turno({ ...input, idempotencyKey: "h-a" }).status).toBe(201);
    expect(conciliar_turno({ ...input, idempotencyKey: "h-b" })).toMatchObject({ status: 409 });
  });

  it("turno inexistente es 404", () => {
    const r = conciliar_turno({
      idempotencyKey: "h-x",
      turnoId: "nope",
      contadoCentavos: 100n,
      conteosPorMedio: [{ medio: "Efectivo", montoCentavos: 100n }],
      turnos: new Map(),
      vistos: new Map(),
    });
    expect(r).toMatchObject({ status: 404 });
  });
});

describe("C17 resolución de disputas solo Dueño", () => {
  function enDisputa() {
    return new Map<string, Turno>([[ "t1", turnoBase({ estado: "en_disputa", contadoCentavos: 140000n, diferenciaCentavos: -60000n }) ]]);
  }

  it("empleado recibe 403", () => {
    const r = resolver_disputa({ turnoId: "t1", nota: "lo reviso", rol: "empleado", resueltoPor: "pepe", turnos: enDisputa() });
    expect(r).toMatchObject({ status: 403 });
  });

  it("dueno resuelve con nota y queda resuelto", () => {
    const turnos = enDisputa();
    const r = resolver_disputa({ turnoId: "t1", nota: "faltante justificado", rol: "dueno", resueltoPor: "duena", turnos });
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(r.turno.estado).toBe("resuelto");
    expect(r.turno.resolucionNota).toBe("faltante justificado");
  });

  it("resolucion sin nota es 422 y sin disputa es 422", () => {
    expect(resolver_disputa({ turnoId: "t1", nota: "", rol: "dueno", resueltoPor: "d", turnos: enDisputa() })).toMatchObject({ status: 422 });
    const sinDisputa = new Map<string, Turno>([["t1", turnoBase()]]);
    expect(resolver_disputa({ turnoId: "t1", nota: "x", rol: "dueno", resueltoPor: "d", turnos: sinDisputa })).toMatchObject({ status: 422 });
  });
});

describe("C17 drops y conteo sorpresa", () => {
  function dropCtx() {
    return { drops: new Map<string, Drop>(), vistos: new Map<string, DropOk>() };
  }

  it("registra drop a caja fuerte 201", () => {
    const r = registrar_drop({
      idempotencyKey: "d1",
      fechaJornada: "2026-10-09",
      montoCentavos: 50000n,
      motivo: "caja llena",
      creadoPor: "ana",
      sorpresa: false,
      ...dropCtx(),
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.drop.montoCentavos).toBe(50000n);
    expect(r.drop.sorpresa).toBe(false);
  });

  it("conteo sorpresa del Dueño queda marcado", () => {
    const r = registrar_drop({
      idempotencyKey: "d-sorp",
      fechaJornada: "2026-10-09",
      montoCentavos: 10000n,
      creadoPor: "duena",
      sorpresa: true,
      ...dropCtx(),
    });
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.drop.sorpresa).toBe(true);
  });

  it("monto no positivo es 422 y duplicado de key es 409", () => {
    const c = dropCtx();
    expect(registrar_drop({ idempotencyKey: "d0", fechaJornada: "2026-10-09", montoCentavos: 0n, creadoPor: "ana", sorpresa: false, ...c })).toMatchObject({ status: 422 });
    const base = { fechaJornada: "2026-10-09", montoCentavos: 1000n, creadoPor: "ana", sorpresa: false, ...c };
    expect(registrar_drop({ ...base, idempotencyKey: "dd" }).status).toBe(201);
    expect(registrar_drop({ ...base, idempotencyKey: "dd" })).toMatchObject({ status: 409 });
  });
});
