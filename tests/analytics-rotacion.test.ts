import { describe, expect, it } from "vitest";
import { calcular_rotacion } from "../src/modules/analytics/agregador.js";
import {
  cantidad_sugerida,
  clasificar_abc,
  listar_dormidos,
  pagina_ranking,
  ranking_neto,
  reponer_primero,
} from "../src/modules/analytics/selectores.js";
import { confirmar_promo, sugerir_promo } from "../src/modules/analytics/promociones.js";
import { clave_snapshot, describir_snapshot, encolar_snapshot } from "../src/modules/analytics/snapshots.js";
import { consultar_tablero } from "../src/modules/analytics/tablero.js";
import { armar_csv, decidir_modo_export } from "../src/modules/analytics/export.js";
import { puede_exportar, puede_ver_tablero, recortar_para_rol } from "../src/modules/analytics/permisos.js";
import { DEFAULT_SETTINGS, type FotoCatalogo, type MovimientoVentana, type SkuRot } from "../src/modules/analytics/tipos.js";

const sku = (s: string) => s as SkuRot;
const D = (s: string) => new Date(s + "T12:00:00Z");

function foto(s: string, over: Partial<FotoCatalogo> = {}): FotoCatalogo {
  return {
    sku: sku(s),
    nombre: s,
    categoria: null,
    ubicacion: null,
    costoCentavos: 100000n,
    precioCentavos: 140000n,
    excluidoDormidos: false,
    stockActual: 13,
    ...over,
  };
}

function venta(s: string, dia: string, qty: number, i: number): MovimientoVentana {
  return { sku: sku(s), delta: -qty, tipo: "VENTA", creadoEn: D(dia), eventoId: `v-${s}-${i}` };
}

describe("analytics RT1-RT2 ejemplo PRD (Coca 84-1=83)", () => {
  const movs: MovimientoVentana[] = [
    venta("COCA", "2026-10-01", 10, 1),
    venta("COCA", "2026-10-02", 12, 2),
    venta("COCA", "2026-10-03", 11, 3),
    venta("COCA", "2026-10-04", 14, 4),
    venta("COCA", "2026-10-05", 9, 5),
    venta("COCA", "2026-10-06", 13, 6),
    venta("COCA", "2026-10-07", 15, 7),
    // Devolución: VENTA delta positivo, imputada a su fecha.
    { sku: sku("COCA"), delta: 1, tipo: "VENTA", creadoEn: D("2026-10-07"), eventoId: "dev-1" },
    // Dos reposiciones (RT2.5: eventos, no unidades).
    { sku: sku("COCA"), delta: 48, tipo: "ALTA", creadoEn: D("2026-10-02"), eventoId: "ped-42" },
    { sku: sku("COCA"), delta: 24, tipo: "ALTA", creadoEn: D("2026-10-06"), eventoId: "carga-6" },
  ];
  const r = calcular_rotacion({
    movimientos: movs,
    stockInicial: new Map([[sku("COCA"), 24]]),
    catalogo: [foto("COCA")],
    params: { desde: "2026-10-01", hasta: "2026-10-07", hoy: "2026-10-07", ventanaCoberturaDias: 28 },
  });
  it("neto 83 y veces repuesto 2", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.valor[0];
    expect(f).toMatchObject({ bruto: 84, devuelto: 1, neto: 83, vecesRepuesto: 2 });
  });
  it("promedio 11.86 y rotación sobre cierres diarios", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.valor[0]!;
    // D efectivo global = 7 días con venta; 83/7 = 11.86.
    expect(f.ventaDiaria).toBeCloseTo(11.86, 1);
    // Cierres: 14,50,39,25,16,27,13 => suma 184, promedio 26.29.
    expect(f.stockPromedio).toBeCloseTo(26.29, 1);
    expect(f.rotacion).toBeCloseTo(83 / f.stockPromedio, 2);
  });
});

describe("analytics RT1.8 desempate + keyset", () => {
  it("orden determinista y paginado sin OFFSET", () => {
    const base = {
      categoria: null,
      ubicacion: null,
      diasConVenta: 3,
      diasEfectivos: 7,
      diasSinVenta: 4,
      stockInicial: 10,
      stockFinal: 5,
      stockPromedio: 8,
      rotacion: 2,
      ventaDiaria: 3,
      coberturaDias: 1,
      vecesRepuesto: 1,
      costoCentavos: 1n,
      valorizadoCentavos: 5n,
      pocosDatos: false,
      motivoPocosDatos: null,
      ultimaVenta: "2026-10-07",
    } as const;
    const filas = [
      { ...base, sku: sku("B"), nombre: "B", bruto: 20, devuelto: 0, neto: 20 },
      { ...base, sku: sku("A"), nombre: "A", bruto: 22, devuelto: 2, neto: 20 },
      { ...base, sku: sku("C"), nombre: "C", bruto: 30, devuelto: 0, neto: 30 },
    ];
    const ord = ranking_neto(filas);
    expect(ord.map((f) => f.sku)).toEqual([sku("C"), sku("A"), sku("B")]);
    const p1 = pagina_ranking(ord, 2, null);
    expect(p1.items.map((f) => f.sku)).toEqual([sku("C"), sku("A")]);
    expect(p1.next).toMatchObject({ neto: 20, bruto: 22 });
    const p2 = pagina_ranking(ord, 2, p1.next);
    expect(p2.items.map((f) => f.sku)).toEqual([sku("B")]);
  });
});

describe("analytics RT3/RT4/RT5", () => {
  it("ABC: el que cruza 80% queda en A; sin ventas aparte", () => {
    const mk = (s: string, neto: number) => ({
      sku: sku(s),
      nombre: s,
      categoria: null,
      ubicacion: null,
      bruto: neto,
      devuelto: 0,
      neto,
      diasConVenta: 5,
      diasEfectivos: 30,
      diasSinVenta: 1,
      stockInicial: 10,
      stockFinal: 10,
      stockPromedio: 10,
      rotacion: 1,
      ventaDiaria: 1,
      coberturaDias: 10,
      vecesRepuesto: 1,
      costoCentavos: 1n,
      valorizadoCentavos: 1n,
      pocosDatos: false,
      motivoPocosDatos: null,
      ultimaVenta: "2026-10-07",
    });
    const filas = [mk("A", 80), mk("B", 15), mk("C", 5), mk("D", 0)];
    const precios = new Map([[sku("A"), 100n], [sku("B"), 100n], [sku("C"), 100n], [sku("D"), 100n]]);
    const cls = clasificar_abc(filas, precios, DEFAULT_SETTINGS, 90);
    expect(cls.find((c) => c.sku === sku("A"))?.clase).toBe("A");
    expect(cls.find((c) => c.sku === sku("D"))?.clase).toBe("SinVentas");
    // Ventana corta: P1_pendiente.
    expect(clasificar_abc(filas, precios, DEFAULT_SETTINGS, 20)[0]?.clase).toBe("P1_pendiente");
  });
  it("dormidos N=30 excluye stock 0, pocos datos y excluidos", () => {
    const mk = (s: string, sin: number, stock: number, pocos = false) => ({
      sku: sku(s),
      nombre: s,
      categoria: null,
      ubicacion: null,
      bruto: 10,
      devuelto: 0,
      neto: 10,
      diasConVenta: 1,
      diasEfectivos: 30,
      diasSinVenta: sin,
      stockInicial: stock,
      stockFinal: stock,
      stockPromedio: stock,
      rotacion: 0,
      ventaDiaria: 0.1,
      coberturaDias: 300,
      vecesRepuesto: 0,
      costoCentavos: 25000n,
      valorizadoCentavos: BigInt(stock) * 25000n,
      pocosDatos: pocos,
      motivoPocosDatos: pocos ? ("VENTAS_LT3" as const) : null,
      ultimaVenta: "2026-08-01",
    });
    const filas = [mk("DORM", 47, 30), mk("SIN_STOCK", 90, 0), mk("POCOS", 90, 5, true)];
    const out = listar_dormidos(filas, new Set([sku("EXCL")]), DEFAULT_SETTINGS);
    expect(out.map((d) => d.sku)).toEqual([sku("DORM")]);
    expect(out[0]).toMatchObject({ diasSinVenta: 47, critico: false });
  });
  it("reponer primero: cobertura baja + alta rotación antes", () => {
    const mk = (s: string, cob: number | null, diaria: number | null, neto: number) => ({
      sku: sku(s),
      nombre: s,
      categoria: null,
      ubicacion: null,
      bruto: neto,
      devuelto: 0,
      neto,
      diasConVenta: 7,
      diasEfectivos: 28,
      diasSinVenta: 0,
      stockInicial: 20,
      stockFinal: 13,
      stockPromedio: 20,
      rotacion: neto / 20,
      ventaDiaria: diaria,
      coberturaDias: cob,
      vecesRepuesto: 2,
      costoCentavos: 1n,
      valorizadoCentavos: 13n,
      pocosDatos: false,
      motivoPocosDatos: null,
      ultimaVenta: "2026-10-07",
    });
    const filas = [mk("ALFAJOR", 5, 2, 40), mk("COCA", 1.1, 11.9, 300), mk("SIN_VENTAS", null, null, 0)];
    const { items } = reponer_primero(filas, DEFAULT_SETTINGS);
    expect(items.map((f) => f.sku)).toEqual([sku("COCA"), sku("ALFAJOR")]);
    expect(cantidad_sugerida({ ventaDiaria: 11.86, stockFinal: 13, diasObjetivo: 6 })).toBe(59);
  });
});

describe("analytics RT9/RT10/RT6/RT8/RT11", () => {
  it("promo: sugerencia 10% y piso de costo", () => {
    const sugs = sugerir_promo({ vigenteCentavos: 40000n, costoCentavos: 25000n, markupMinBp: 0 });
    expect(sugs[0]).toMatchObject({ pct: 10, precioPromoCentavos: 36000n, viable: true });
    const caro = sugerir_promo({ vigenteCentavos: 40000n, costoCentavos: 38000n, markupMinBp: 0 });
    expect(caro.find((s) => s.pct === 20)?.viable).toBe(false);
    const ok = confirmar_promo({
      sku: sku("SH"),
      pct: 10,
      vigenteCentavos: 40000n,
      costoCentavos: 25000n,
      markupMinBp: 0,
      confirmado: true,
      vistos: new Map(),
      idempotencyKey: "k1",
    });
    expect(ok.ok).toBe(true);
    const piso = confirmar_promo({
      sku: sku("SH"),
      pct: 20,
      vigenteCentavos: 40000n,
      costoCentavos: 38000n,
      markupMinBp: 0,
      confirmado: true,
      vistos: new Map(),
      idempotencyKey: "k2",
    });
    expect(piso).toMatchObject({ ok: false, codigo: "PISO_VIOLADO" });
  });
  it("permisos: empleado sin financieros ni export", () => {
    expect(puede_ver_tablero({ rol: "empleado", permisos: ["ver_rotacion_unidades"] })).toBe(true);
    expect(puede_ver_tablero({ rol: "empleado", permisos: [] })).toBe(false);
    expect(puede_exportar({ rol: "empleado", permisos: ["ver_rotacion_unidades"] })).toBe(false);
    const filas = [
      {
        sku: sku("A"),
        nombre: "A",
        categoria: null,
        ubicacion: null,
        bruto: 5,
        devuelto: 0,
        neto: 5,
        diasConVenta: 2,
        diasEfectivos: 10,
        diasSinVenta: 1,
        stockInicial: 5,
        stockFinal: 5,
        stockPromedio: 5,
        rotacion: 1,
        ventaDiaria: 0.5,
        coberturaDias: 10,
        vecesRepuesto: 1,
        costoCentavos: 9n,
        valorizadoCentavos: 45n,
        pocosDatos: false,
        motivoPocosDatos: null,
        ultimaVenta: "2026-10-07",
      },
    ];
    const rec = recortar_para_rol(filas, { rol: "empleado", permisos: ["ver_rotacion_unidades"] });
    expect("costoCentavos" in rec[0]!).toBe(false);
  });
  it("snapshot dedupeKey estable + CSV con BOM + modo export + tablero", () => {
    expect(clave_snapshot("2026-10-01", "2026-10-07", "viernes18h")).toBe("rotacion:2026-10-01:2026-10-07:viernes18h");
    const tienda = new Map();
    const snap = describir_snapshot({ id: "s1", desde: "2026-10-01", hasta: "2026-10-07", filas: [], origen: "viernes18h", creadoEn: new Date().toISOString() });
    expect(encolar_snapshot(tienda, snap)).toMatchObject({ status: 201 });
    expect(encolar_snapshot(tienda, snap)).toMatchObject({ status: 409 });
    expect(decidir_modo_export(2000)).toBe("sincronico");
    expect(decidir_modo_export(8000)).toBe("worker");
    const csv = armar_csv({ filas: [], desde: "2026-10-01", hasta: "2026-10-07", generadoEn: "x", generador: "t" });
    expect(csv.startsWith("﻿")).toBe(true);
    const vista = consultar_tablero([], { orden: "neto", dir: "desc", limite: 50 });
    expect(vista.items).toEqual([]);
  });
});
