import { describe, expect, it } from "vitest";
import { calcular_rotacion } from "../src/modules/analytics/agregador.js";
import {
  cantidad_sugerida,
  clasificar_abc,
  listar_dormidos,
  ranking_menos_vendidos,
  reponer_primero,
} from "../src/modules/analytics/selectores.js";
import { recortar_para_rol } from "../src/modules/analytics/permisos.js";
import { construir_resumen, cuerpo_wa, top_n } from "../src/modules/analytics/snapshots.js";
import { DEFAULT_SETTINGS, type FilaRotacion, type FotoCatalogo, type MovimientoVentana, type SkuRot } from "../src/modules/analytics/tipos.js";

const sku = (s: string) => s as SkuRot;
const D = (s: string) => new Date(s + "T12:00:00Z");
const PRECIO = 140000n;
const COSTO = 100000n;

function foto(s: string, over: Partial<FotoCatalogo> = {}): FotoCatalogo {
  return {
    sku: sku(s),
    nombre: s,
    categoria: null,
    ubicacion: null,
    costoCentavos: COSTO,
    precioCentavos: PRECIO,
    excluidoDormidos: false,
    stockActual: 13,
    ...over,
  };
}

function vta(s: string, dia: string, qty: number, i: number): MovimientoVentana {
  return {
    sku: sku(s),
    delta: -qty,
    tipo: "VENTA",
    creadoEn: D(dia),
    eventoId: `v-${s}-${i}`,
    importeCentavos: BigInt(qty) * PRECIO,
    gananciaCentavos: BigInt(qty) * (PRECIO - COSTO),
  };
}

function fila(s: string, over: Partial<FilaRotacion> = {}): FilaRotacion {
  return {
    sku: sku(s),
    nombre: s,
    categoria: null,
    ubicacion: null,
    bruto: 10,
    devuelto: 0,
    neto: 10,
    diasConVenta: 5,
    diasEfectivos: 30,
    diasSinVenta: 1,
    stockInicial: 10,
    stockFinal: 10,
    stockPromedio: 10,
    rotacion: 1,
    ventaDiaria: 1,
    ventaSemanal: 7,
    ventaMensual: 30,
    coberturaDias: 10,
    vecesRepuesto: 1,
    costoCentavos: 1n,
    valorizadoCentavos: 10n,
    ingresosCentavos: 1000n,
    gananciaCentavos: 300n,
    margenBp: 3000,
    markupBp: 4286,
    pocosDatos: false,
    motivoPocosDatos: null,
    ultimaVenta: "2026-10-07",
    archivado: false,
    esNuevo: false,
    nuncaVendido: false,
    ...over,
  };
}

describe("P3-6a RT1.2: compensatorio de venta netea y no repone", () => {
  it("venta 5 corregida a 1 cuenta neto 1 con detalle 5/4", () => {
    const movs: MovimientoVentana[] = [
      vta("A", "2026-10-03", 5, 1),
      {
        sku: sku("A"),
        delta: 4,
        tipo: "COMPENSATORIO",
        creadoEn: D("2026-10-04"),
        eventoId: "comp-1",
        importeCentavos: 4n * PRECIO,
        gananciaCentavos: 4n * (PRECIO - COSTO),
      },
    ];
    const r = calcular_rotacion({
      movimientos: movs,
      stockInicial: new Map(),
      catalogo: [foto("A")],
      params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.valor[0]!;
    expect(f).toMatchObject({ bruto: 5, devuelto: 4, neto: 1, vecesRepuesto: 0 });
    expect(f.ingresosCentavos).toBe(PRECIO);
    expect(f.gananciaCentavos).toBe(PRECIO - COSTO);
  });
  it("ajuste positivo y compensatorio no suman veces repuesto", () => {
    const movs: MovimientoVentana[] = [
      { sku: sku("A"), delta: 5, tipo: "AJUSTE_CONTEO", creadoEn: D("2026-10-02"), eventoId: "aj-1" },
      { sku: sku("A"), delta: 2, tipo: "COMPENSATORIO", creadoEn: D("2026-10-03"), eventoId: "comp-2" },
    ];
    const r = calcular_rotacion({
      movimientos: movs,
      stockInicial: new Map(),
      catalogo: [foto("A")],
      params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor[0]!.vecesRepuesto).toBe(0);
  });
});

describe("P3-6a RT2.5: reposición por evento con regla día/pedido", () => {
  it("3 cargas manuales el mismo día = 1; 2 pedidos distintos = 2", () => {
    const movs: MovimientoVentana[] = [
      { sku: sku("A"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "c1" },
      { sku: sku("A"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "c2" },
      { sku: sku("A"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "c3" },
      { sku: sku("B"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "p1-l1", pedidoId: "ped-1" },
      { sku: sku("B"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "p1-l2", pedidoId: "ped-1" },
      { sku: sku("B"), delta: 10, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "p2-l1", pedidoId: "ped-2" },
    ];
    const r = calcular_rotacion({
      movimientos: movs,
      stockInicial: new Map(),
      catalogo: [foto("A"), foto("B")],
      params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.find((f) => f.sku === sku("A"))!.vecesRepuesto).toBe(1);
    expect(r.valor.find((f) => f.sku === sku("B"))!.vecesRepuesto).toBe(2);
  });
});

describe("P3-6a RT3/RT2.9/RT1.6: ABC, pocos datos y producto nuevo", () => {
  it("el que cruza el 80% queda en A", () => {
    const mk = (s: string, neto: number) =>
      fila(s, { bruto: neto, neto, ingresosCentavos: BigInt(neto) * 100n, gananciaCentavos: BigInt(neto) * 30n });
    const filas = [mk("A", 79), mk("B", 6), mk("C", 5), mk("D", 5), mk("E", 5)];
    const precios = new Map([sku("A"), sku("B"), sku("C"), sku("D"), sku("E")].map((s) => [s, 100n] as const));
    const cls = clasificar_abc(filas, precios, DEFAULT_SETTINGS, 90);
    expect(cls.find((c) => c.sku === sku("B"))?.clase).toBe("A");
    expect(cls.find((c) => c.sku === sku("C"))?.clase).toBe("B");
    expect(cls.find((c) => c.sku === sku("E"))?.clase).toBe("C");
  });
  it("2 ventas en 30 días = pocos datos VENTAS_LT3", () => {
    const r = calcular_rotacion({
      movimientos: [vta("A", "2026-10-01", 1, 1), vta("A", "2026-10-02", 1, 2)],
      stockInicial: new Map(),
      catalogo: [foto("A", { altaDia: "2026-08-01" })],
      params: { desde: "2026-09-08", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor[0]).toMatchObject({ pocosDatos: true, motivoPocosDatos: "VENTAS_LT3", esNuevo: false });
  });
  it("alta 3/10 en ventana 1-7/10: promedios sobre 5 días y marca Nuevo", () => {
    const movs = [1, 2, 3, 4, 5].map((i) => vta("N", `2026-10-0${i + 2}`, 10, i));
    const r = calcular_rotacion({
      movimientos: movs,
      stockInicial: new Map(),
      catalogo: [foto("N", { altaDia: "2026-10-03" })],
      params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.valor[0]!;
    expect(f.diasEfectivos).toBe(5);
    expect(f.ventaDiaria).toBeCloseTo(10, 5);
    expect(f.esNuevo).toBe(true);
  });
});

describe("P3-6a RT1.3/RT2.2: ingresos y ganancia del ejemplo PRD", () => {
  it("84 ventas menos 1 devolución: $116.200 y $33.200, margen 28,6% y markup 40%", () => {
    const movs: MovimientoVentana[] = [
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => vta("COCA", `2026-10-0${i}`, 12, i)),
      { sku: sku("COCA"), delta: 1, tipo: "VENTA", creadoEn: D("2026-10-07"), eventoId: "dev-1", importeCentavos: PRECIO, gananciaCentavos: PRECIO - COSTO },
    ];
    const r = calcular_rotacion({
      movimientos: movs,
      stockInicial: new Map(),
      catalogo: [foto("COCA")],
      params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.valor[0]!;
    expect(f).toMatchObject({ bruto: 84, devuelto: 1, neto: 83 });
    expect(f.ingresosCentavos).toBe(11620000n);
    expect(f.gananciaCentavos).toBe(3320000n);
    expect(f.margenBp).toBe(2857);
    expect(f.markupBp).toBe(4000);
    expect(f.ventaSemanal).toBeCloseTo(83, 1);
    expect(f.ventaMensual).toBeCloseTo(355.7, 1);
  });
  it("empleado no recibe ingresos, ganancia, margen, markup, costo ni valorizado", () => {
    const rec = recortar_para_rol([fila("A")], { rol: "empleado", permisos: ["ver_rotacion_unidades"] });
    const f = rec[0]! as Record<string, unknown>;
    for (const k of ["costoCentavos", "valorizadoCentavos", "ingresosCentavos", "gananciaCentavos", "margenBp", "markupBp"]) {
      expect(k in f).toBe(false);
    }
  });
});

describe("P3-6a RT2.6: la cobertura no cambia con el filtro del tablero", () => {
  const cobertura = {
    desde: "2026-09-10",
    hasta: "2026-10-07",
    movimientos: [1, 2, 3, 4].map((i) => vta("A", `2026-10-0${i}`, 25, i)) as MovimientoVentana[],
  };
  function board(desde: string) {
    return calcular_rotacion({
      movimientos: [vta("A", "2026-10-06", 10, 9)],
      stockInicial: new Map(),
      catalogo: [foto("A", { stockActual: 13 })],
      params: { desde, hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
      cobertura,
    });
  }
  it("7d y 30d dan la misma cobertura con igual ventana de 28d", () => {
    const a = board("2026-10-01");
    const b = board("2026-09-08");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.valor[0]!.coberturaDias).toBe(b.valor[0]!.coberturaDias);
    expect(a.valor[0]!.coberturaDias).toBeCloseTo(3.64, 1);
  });
});

describe("P3-6a RT1.5/RT4/RT5/RT6: listados y resumen", () => {
  it("menos vendidos: stock 0 y archivados fuera; ceros primero por valorizado (dueño)", () => {
    const filas = [
      fila("TOP", { neto: 50, bruto: 50, stockFinal: 5, valorizadoCentavos: 1n, diasSinVenta: 0 }),
      fila("CERO_CARO", { neto: 0, bruto: 0, stockFinal: 30, valorizadoCentavos: 750000n, diasSinVenta: 47 }),
      fila("CERO_BARATO", { neto: 0, bruto: 0, stockFinal: 5, valorizadoCentavos: 10000n, diasSinVenta: 60 }),
      fila("SIN_STOCK", { neto: 0, bruto: 0, stockFinal: 0, valorizadoCentavos: 9n, diasSinVenta: 90 }),
      fila("ARCH", { neto: 0, bruto: 0, stockFinal: 9, valorizadoCentavos: 99n, diasSinVenta: 99, archivado: true }),
    ];
    const ord = ranking_menos_vendidos(filas, "dueno");
    expect(ord.map((f) => f.sku)).toEqual([sku("CERO_CARO"), sku("CERO_BARATO"), sku("TOP")]);
    const emp = ranking_menos_vendidos(filas, "empleado");
    expect(emp.map((f) => f.sku)).toEqual([sku("CERO_BARATO"), sku("CERO_CARO"), sku("TOP")]);
  });
  it("dormidos informan motivo sin-ventas y cobertura", () => {
    const out = listar_dormidos(
      [fila("D", { diasSinVenta: 47, stockFinal: 30, coberturaDias: 80 })],
      new Set(),
      DEFAULT_SETTINGS,
    );
    expect(out[0]!.motivos).toEqual(expect.arrayContaining(["sin_ventas", "cobertura"]));
  });
  it("visita jueves desde lunes: cobertura 2 no llega, 5 sí; cajas redondean a múltiplo", () => {
    const { noLlega } = reponer_primero(
      [
        fila("C2", { coberturaDias: 2, ventaDiaria: 5, neto: 100, bruto: 100 }),
        fila("C5", { coberturaDias: 5, ventaDiaria: 1, neto: 10, bruto: 10 }),
      ],
      DEFAULT_SETTINGS,
      { diasHastaVisita: 3 },
    );
    expect(noLlega.has(sku("C2"))).toBe(true);
    expect(noLlega.has(sku("C5"))).toBe(false);
    expect(cantidad_sugerida({ ventaDiaria: 11.86, stockFinal: 13, diasObjetivo: 6 })).toBe(59);
    expect(cantidad_sugerida({ ventaDiaria: 11.86, stockFinal: 13, diasObjetivo: 6, unidadesPorCaja: 12 })).toBe(60);
  });
  it("mismo snapshot para WA y email: top 3 dentro del top 10 con iguales números", () => {
    const filas = [50, 40, 30, 20, 10, 5, 4, 3, 2, 1, 1, 1].map((n, i) => fila(`P${i}`, { neto: n, bruto: n }));
    const resumen = construir_resumen({ filas, settings: DEFAULT_SETTINGS, excluidos: new Set() });
    const wa = cuerpo_wa({ nombreComercio: "K", desde: "2026-10-01", hasta: "2026-10-07", resumen });
    const email = top_n(filas, 10);
    expect(resumen.top).toHaveLength(3);
    expect(email).toHaveLength(10);
    for (const t of resumen.top) {
      expect(wa).toContain(`${t.nombre} (${t.neto})`);
      expect(email.some((f) => f.nombre === t.nombre && f.neto === t.neto)).toBe(true);
    }
  });
});
