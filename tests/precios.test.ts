import { describe, expect, it } from "vitest";
import {
  actualizarSettings,
  aplicarProgramados,
  auditar,
  cancelarAjuste,
  congelarLinea,
  crearAjuste,
  elegirPrecioEnTicket,
  fichaProducto,
  precioDesdeMarkup,
  previsualizarAjuste,
  resolverPrecioOffline,
  senalOpsSinMontos,
  type Ajuste,
  type ItemCatalogo,
} from "../src/modules/pricing/precios.js";
import { recomendarPrecio } from "../src/modules/pricing/recomendacion.js";

const AHORA = "2026-10-10T12:00:00.000-03:00";
const FUTURO = "2026-10-11T09:00:00.000-03:00";
const PASADO = "2026-10-09T09:00:00.000-03:00";

const items: ItemCatalogo[] = [
  { sku: "YERBA", vigenteCentavos: 10_000n, costoCentavos: 6_000n },
  { sku: "AZUCAR", vigenteCentavos: 5_000n, costoCentavos: 3_000n },
];

function baseCrear(over: Partial<Parameters<typeof crearAjuste>[0]> = {}) {
  return {
    idempotencyKey: "aj-1",
    direccion: "suba" as const,
    porcentaje: 10,
    vigenciaTipo: "ahora" as const,
    aplicaEn: null,
    confirmado: true,
    online: true,
    rol: "dueno" as const,
    creadoPor: "dueno-1",
    ahoraIso: AHORA,
    items,
    vistos: new Map<string, Ajuste>(),
    ...over,
  };
}

describe("GP1 ajuste masivo", () => {
  it("previa calcula sin mutar la entrada", () => {
    const copia = items.map((i) => ({ ...i }));
    const previa = previsualizarAjuste(items, "suba", 10, 1_000n);
    expect(previa).toHaveLength(2);
    expect(previa[0]).toMatchObject({ sku: "YERBA", vigenteCentavos: 10_000n, nuevoCentavos: 11_000n });
    expect(items).toEqual(copia);
  });

  it("valida rangos 0.01-300 suba / 0.01-90 baja", () => {
    expect(previsualizarAjuste(items, "suba", 300, 1_000n)[0]?.nuevoCentavos).toBe(40_000n);
    expect(previsualizarAjuste(items, "baja", 90, 1_000n)[0]?.nuevoCentavos).toBe(1_000n);
    expect(() => previsualizarAjuste(items, "suba", 300.01, 1_000n)).toThrow();
    expect(() => previsualizarAjuste(items, "baja", 90.01, 1_000n)).toThrow();
    expect(() => previsualizarAjuste(items, "suba", 0.009, 1_000n)).toThrow();
  });

  it("exige confirmación reforzada y online sensible", () => {
    expect(crearAjuste(baseCrear({ confirmado: false }))).toMatchObject({ status: 422 });
    expect(crearAjuste(baseCrear({ online: false }))).toMatchObject({ status: 403 });
  });

  it("programada exige aplica_en futuro", () => {
    expect(
      crearAjuste(baseCrear({ vigenciaTipo: "programada", aplicaEn: PASADO })),
    ).toMatchObject({ status: 422 });
    const r = crearAjuste(baseCrear({ vigenciaTipo: "programada", aplicaEn: FUTURO }));
    expect(r.status).toBe(201);
  });

  it("crea en 1 tx idempotente: retry devuelve 409 con original", () => {
    const vistos = new Map<string, Ajuste>();
    const r1 = crearAjuste(baseCrear({ vistos }));
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    vistos.set("aj-1", r1.ajuste);
    expect(r1.ajuste.estado).toBe("pendiente");
    expect(r1.auditoria.quien).toBe("dueno-1");
    const r2 = crearAjuste(baseCrear({ vistos, porcentaje: 50 }));
    expect(r2).toMatchObject({ status: 409, error: expect.stringMatching(/distinto cuerpo/) });
    const r3 = crearAjuste(baseCrear({ vistos }));
    expect(r3.status).toBe(409);
    if (r3.status !== 409 || !("original" in r3)) return;
    expect(r3.original?.idempotencyKey).toBe("aj-1");
  });
});

describe("GP3 programados y job", () => {
  it("pendiente futuro es cancelable; aplicado solo revierte vía ajuste nuevo", () => {
    const r = crearAjuste(
      baseCrear({ idempotencyKey: "prog-1", vigenciaTipo: "programada", aplicaEn: FUTURO }),
    );
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    const c = cancelarAjuste(r.ajuste, "dueno-1", AHORA);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.ajuste.estado).toBe("cancelado");
    // No mutó el original.
    expect(r.ajuste.estado).toBe("pendiente");
    const aplicado: Ajuste = { ...r.ajuste, estado: "aplicado" };
    expect(cancelarAjuste(aplicado, "dueno-1", AHORA)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/ajuste nuevo/),
    });
  });

  it("vencido ya no es cancelable", () => {
    const r = crearAjuste(
      baseCrear({ idempotencyKey: "prog-2", vigenciaTipo: "programada", aplicaEn: FUTURO }),
    );
    if (r.status !== 201) return;
    expect(cancelarAjuste(r.ajuste, "dueno-1", FUTURO).ok).toBe(false);
  });

  it("job aplica a hora vigencia como Sistema y deja pendiente al futuro", () => {
    const a = crearAjuste(
      baseCrear({ idempotencyKey: "j-1", vigenciaTipo: "programada", aplicaEn: FUTURO }),
    );
    const b = crearAjuste(
      baseCrear({ idempotencyKey: "j-2", vigenciaTipo: "programada", aplicaEn: "2026-12-01T09:00:00.000-03:00" }),
    );
    if (a.status !== 201 || b.status !== 201) return;
    const job = aplicarProgramados([a.ajuste, b.ajuste], FUTURO);
    expect(job.aplicados).toHaveLength(1);
    expect(job.ajustes[0]?.estado).toBe("aplicado");
    expect(job.ajustes[1]?.estado).toBe("pendiente");
    expect(job.auditoria[0]).toMatchObject({ quien: "sistema", cuando: FUTURO });
    expect(job.aplicados[0]?.nuevosPrecios[0]).toMatchObject({
      sku: "YERBA",
      vigenteCentavos: 10_000n,
      nuevoCentavos: 11_000n,
    });
  });
});

describe("GP4 snapshot y offline", () => {
  it("congela precio/costo/descuento por línea", () => {
    const s = congelarLinea({
      sku: "YERBA",
      qty: 2,
      precioVigenteCentavos: 11_000n,
      costoVigenteCentavos: 6_000n,
      descuentoCentavos: 500n,
      precioId: "aj-1",
    });
    expect(s).toMatchObject({
      precioCongeladoCentavos: 11_000n,
      costoCongeladoCentavos: 6_000n,
      descuentoCentavos: 500n,
    });
    expect(Object.isFrozen(s)).toBe(true);
  });

  it("offline usa catálogo local sin recalcular", () => {
    const local = new Map([["YERBA", 10_000n]]);
    expect(resolverPrecioOffline(local, "YERBA")).toBe(10_000n);
    expect(() => resolverPrecioOffline(local, "FALTANTE")).toThrow();
  });

  it("precio manual prevalece sobre recomendación", () => {
    expect(elegirPrecioEnTicket({ manualCentavos: 12_000n, recomendadoCentavos: 15_000n })).toBe(12_000n);
    expect(elegirPrecioEnTicket({ recomendadoCentavos: 15_000n })).toBe(15_000n);
  });
});

describe("GP5 ficha y markup fijo", () => {
  it("calcula ganancia/markup/margen", () => {
    const f = fichaProducto({ costoCentavos: 10_000n, precioCentavos: 15_000n });
    expect(f.gananciaCentavos).toBe(5_000n);
    expect(f.markupBp).toBe(5_000);
    expect(f.margenBp).toBe(3_333);
  });

  it("valida impuestos+comisiones+ganancia < 60%", () => {
    const ok = fichaProducto({
      costoCentavos: 10_000n,
      precioCentavos: 12_000n,
      impuestosPct: 10,
      comisionesPct: 5,
    });
    expect(ok.cargaOk).toBe(true);
    const mal = fichaProducto({
      costoCentavos: 10_000n,
      precioCentavos: 15_000n,
      impuestosPct: 20,
      comisionesPct: 10,
    });
    expect(mal.cargaOk).toBe(false);
  });

  it("markup fijo exige confirmación y redondea arriba", () => {
    expect(() =>
      precioDesdeMarkup({ costoCentavos: 10_000n, markupPct: 50, confirmado: false }),
    ).toThrow();
    const r = precioDesdeMarkup({ costoCentavos: 10_000n, markupPct: 50, confirmado: true });
    expect(r).toEqual({ brutoCentavos: 15_000n, nuevoCentavos: 15_000n });
    const r2 = precioDesdeMarkup({
      costoCentavos: 10_001n,
      markupPct: 10,
      confirmado: true,
    });
    expect(r2.brutoCentavos).toBe(11_001n);
    expect(r2.nuevoCentavos).toBe(12_000n);
  });
});

describe("GP7 config + GP8/GP10", () => {
  it("solo Dueño online: Empleado 403, offline 403, paso inválido 422", () => {
    expect(
      actualizarSettings({ rol: "empleado", online: true, parche: {}, quien: "e", ahoraIso: AHORA }),
    ).toMatchObject({ status: 403 });
    expect(
      actualizarSettings({ rol: "dueno", online: false, parche: {}, quien: "d", ahoraIso: AHORA }),
    ).toMatchObject({ status: 403 });
    expect(
      actualizarSettings({
        rol: "dueno",
        online: true,
        parche: { pasoCentavos: 200n },
        quien: "d",
        ahoraIso: AHORA,
      }),
    ).toMatchObject({ status: 422 });
    const ok = actualizarSettings({
      rol: "dueno",
      online: true,
      parche: { pasoCentavos: 5_000n },
      quien: "d",
      ahoraIso: AHORA,
    });
    expect(ok.status).toBe(200);
  });

  it("auditoría inmutable con quién/cuándo/antes/después", () => {
    const a = auditar({
      id: "x:1",
      quien: "dueno-1",
      cuando: AHORA,
      antes: "YERBA=10000",
      despues: "YERBA=11000",
      motivo: "test",
    });
    expect(a).toMatchObject({ quien: "dueno-1", cuando: AHORA });
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("GP10: señales al panel sin montos", () => {
    const s = senalOpsSinMontos({ tipo: "precios_ajuste_creado", cantidad: 3, ventana: "2026-10-10" });
    const keys = Object.keys(s).join(",");
    expect(keys).not.toMatch(/centavos|monto|precio|costo/i);
  });
});

describe("GP6 recomendación determinista", () => {
  it("misma entrada => misma salida; con/sin retiro difieren", () => {
    const base = {
      costoCentavos: 6_000n,
      gastosMensualesCentavos: 300_000n,
      unidadesMensuales: 100,
    } as const;
    const sin = recomendarPrecio({ ...base, incluirRetiro: false });
    const sin2 = recomendarPrecio({ ...base, incluirRetiro: false });
    expect(sin).toEqual(sin2);
    const con = recomendarPrecio({ ...base, incluirRetiro: true, retiroDuenoCentavos: 100_000n });
    expect(con.precioSugeridoCentavos).toBeGreaterThan(sin.precioSugeridoCentavos);
    // 6000 + 300000/100 = 9000 => techo $10 = 9000.
    expect(sin.precioSugeridoCentavos).toBe(9_000n);
    expect(sin.conRetiro).toBe(false);
    expect(con.conRetiro).toBe(true);
  });
});
