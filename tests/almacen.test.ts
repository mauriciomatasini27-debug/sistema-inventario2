import { beforeEach, describe, expect, it } from "vitest";
import { conTenant } from "../src/lib/tenant-mode.js";
import { resetStore } from "../src/lib/store.js";
import { BaseNoDisponible } from "../src/lib/server-db.js";
import {
  crearAlmacenAjustes,
  crearAlmacenCierres,
  crearAlmacenDropVistos,
  crearAlmacenDrops,
  crearAlmacenQrRecibos,
  crearAlmacenReversiones,
  crearAlmacenReversionVistos,
  crearAlmacenShiftKeys,
  crearAlmacenTurnoVistos,
  crearAlmacenTurnos,
  crearAlmacenVencimientosCaja,
  crearConjuntoWaEnviados,
  crearListaAuditoria,
  crearListaMovimientos,
} from "../src/lib/repos/_almacen.js";
import { crearAjuste, type Ajuste } from "../src/modules/pricing/precios.js";

function ajusteFalso(key: string): Ajuste {
  return Object.freeze({
    id: `aj-${key}`,
    idempotencyKey: key,
    direccion: "suba" as const,
    porcentaje: 10,
    pasoCentavos: 100n,
    vigenciaTipo: "ahora" as const,
    aplicaEn: null,
    estado: "pendiente" as const,
    creadoPor: "dueno-1",
    creadoEn: "2026-10-10T12:00:00.000Z",
    items: Object.freeze([{ sku: "demo-sku-1", vigenteCentavos: 15000n, costoCentavos: 0n }]),
  });
}

describe("ARQ-S4 Almacen de ajustes (corte 1)", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    resetStore();
  });

  it("memoria: guardar luego obtener y contiene, ausente es undefined", () => {
    const almacen = crearAlmacenAjustes();
    expect(almacen.obtener("k-1")).toBeUndefined();
    expect(almacen.contiene("k-1")).toBe(false);
    const a = ajusteFalso("k-1");
    almacen.guardar("k-1", a);
    expect(almacen.obtener("k-1")).toBe(a);
    expect(almacen.contiene("k-1")).toBe(true);
  });

  it("la vista de solo lectura alimenta la idempotencia de crearAjuste", () => {
    const almacen = crearAlmacenAjustes();
    almacen.guardar("k-2", ajusteFalso("k-2"));
    const r = crearAjuste({
      idempotencyKey: "k-2",
      direccion: "suba",
      porcentaje: 10,
      vigenciaTipo: "ahora",
      aplicaEn: null,
      confirmado: true,
      online: true,
      rol: "dueno",
      creadoPor: "dueno-1",
      ahoraIso: "2026-10-10T12:00:00.000Z",
      items: [],
      vistos: almacen.comoMapaSoloLectura(),
    });
    expect(r).toMatchObject({ status: 409 });
  });

  it("single: el fallo de persistencia no lanza y deja guardar en memoria", () => {
    const almacen = crearAlmacenAjustes();
    expect(() => almacen.anteFalloPersistencia(new Error("caida"))).not.toThrow();
    const a = ajusteFalso("k-3");
    almacen.guardar("k-3", a);
    expect(almacen.obtener("k-3")).toBe(a);
  });

  it("multi: el fallo de persistencia lanza BaseNoDisponible", () => {
    process.env.TENANT_MODE = "multi";
    try {
      const almacen = conTenant("tenant-a", () => crearAlmacenAjustes());
      expect(() => almacen.anteFalloPersistencia(new Error("caida"))).toThrow(BaseNoDisponible);
    } finally {
      delete process.env.TENANT_MODE;
    }
  });
});

describe("ARQ-S4 Almacenes de caja (corte 2)", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    resetStore();
  });

  it("mapas: guardar luego obtener con valores literales", () => {
    const cierres = crearAlmacenCierres();
    const cierre = {
      status: 201 as const,
      cierre: { fechaJornada: "2026-10-14", closeType: "manual" as const, totalCentavos: 15000n, ultimoMovimientoId: null },
    };
    cierres.guardar("k-cierre", cierre);
    expect(cierres.obtener("k-cierre")).toBe(cierre);
    expect(cierres.contiene("2026-10-14")).toBe(false);

    const turnos = crearAlmacenTurnos();
    const turno = { id: "t-1", fechaJornada: "2026-10-14", turno: "manana", entregadoPor: "ana", esperadoCentavos: 10000n, estado: "pendiente" as const };
    turnos.guardar("t-1", turno);
    expect(turnos.obtener("t-1")).toBe(turno);

    const llaves = crearAlmacenShiftKeys();
    llaves.guardar("key-1", "t-1");
    expect(llaves.obtener("key-1")).toBe("t-1");

    const turnoVistos = crearAlmacenTurnoVistos();
    turnoVistos.guardar("v-1", { status: 201 as const, turno });
    expect(turnoVistos.obtener("v-1")?.turno).toBe(turno);

    const drops = crearAlmacenDrops();
    const drop = { id: "d-1", fechaJornada: "2026-10-14", montoCentavos: 5000n, creadoPor: "ana", sorpresa: false };
    drops.guardar("d-1", drop);
    expect(drops.obtener("d-1")).toBe(drop);

    const dropVistos = crearAlmacenDropVistos();
    dropVistos.guardar("dv-1", { status: 201 as const, drop });
    expect(dropVistos.obtener("dv-1")?.drop).toBe(drop);

    const reversiones = crearAlmacenReversiones();
    reversiones.guardar("rev-a", "mov-2");
    expect(reversiones.obtener("rev-a")).toBe("mov-2");

    const reversionVistos = crearAlmacenReversionVistos();
    const revOk = {
      status: 201 as const,
      movimiento: { id: "mov-2", tipo: "egreso" as const, metodo: "Efectivo" as const, monto_centavos: 1200n, origen: "venta" as const, revierteA: "mov-1" },
      auditoria: { accion: "reversion" as const, movimientoId: "mov-2", revierteA: "mov-1", actor: "ana" },
    };
    reversionVistos.guardar("rk-1", revOk);
    expect(reversionVistos.obtener("rk-1")).toBe(revOk);

    const qr = crearAlmacenQrRecibos();
    qr.guardar("num-1", { numeroOperacion: "num-1", montoCentavos: "1200", estado: "pendiente", idemKey: "qk-1" });
    expect(qr.obtener("num-1")?.montoCentavos).toBe("1200");

    const vencimientos = crearAlmacenVencimientosCaja();
    vencimientos.guardar("vto-1", { id: "vto-1", concepto: "luz", venceEl: "2026-10-20", montoCentavos: "3000", estado: "pendiente" });
    expect(vencimientos.obtener("vto-1")?.concepto).toBe("luz");
  });

  it("listas: agregar es visible en listar con el valor literal", () => {
    const movimientos = crearListaMovimientos();
    expect(movimientos.listar()).toEqual([]);
    const mov = { id: "m-1", tipo: "ingreso" as const, metodo: "Efectivo" as const, monto_centavos: "1500", origen: "venta", idempotency_key: "mk-1" };
    movimientos.agregar(mov);
    expect(movimientos.listar()).toEqual([mov]);

    const auditoria = crearListaAuditoria();
    auditoria.agregar({ accion: "reversion", movimientoId: "m-1", revierteA: "m-0", actor: "ana" });
    expect(auditoria.listar()).toHaveLength(1);
    expect(auditoria.listar()[0]?.movimientoId).toBe("m-1");
  });

  it("conjunto wa: agregar luego contiene, vivos() entrega el Set vivo", () => {
    const wa = crearConjuntoWaEnviados();
    expect(wa.contiene("aviso-1")).toBe(false);
    wa.agregar("aviso-1");
    expect(wa.contiene("aviso-1")).toBe(true);
    wa.vivos().add("aviso-2");
    expect(wa.contiene("aviso-2")).toBe(true);
  });

  it("mapaVivo entrega el mapa vivo que el dominio muta", () => {
    const cierres = crearAlmacenCierres();
    const cierre = {
      status: 201 as const,
      cierre: { fechaJornada: "2026-10-14", closeType: "manual" as const, totalCentavos: 15000n, ultimoMovimientoId: null },
    };
    cierres.mapaVivo().set("k-vivo", cierre);
    expect(cierres.obtener("k-vivo")).toBe(cierre);
  });

  it("single: el fallo de persistencia no lanza en ningun puerto de caja", () => {
    const puertos = [
      crearAlmacenCierres(), crearAlmacenTurnos(), crearAlmacenShiftKeys(), crearAlmacenTurnoVistos(),
      crearAlmacenDrops(), crearAlmacenDropVistos(), crearAlmacenReversiones(), crearAlmacenReversionVistos(),
      crearAlmacenQrRecibos(), crearAlmacenVencimientosCaja(), crearListaMovimientos(), crearListaAuditoria(),
      crearConjuntoWaEnviados(),
    ];
    for (const p of puertos) expect(() => p.anteFalloPersistencia(new Error("caida"))).not.toThrow();
  });

  it("multi: el fallo de persistencia lanza BaseNoDisponible en cada puerto de caja", () => {
    process.env.TENANT_MODE = "multi";
    try {
      const puertos = conTenant("tenant-a", () => [
        crearAlmacenCierres(), crearAlmacenTurnos(), crearAlmacenShiftKeys(), crearAlmacenTurnoVistos(),
        crearAlmacenDrops(), crearAlmacenDropVistos(), crearAlmacenReversiones(), crearAlmacenReversionVistos(),
        crearAlmacenQrRecibos(), crearAlmacenVencimientosCaja(), crearListaMovimientos(), crearListaAuditoria(),
        crearConjuntoWaEnviados(),
      ]);
      for (const p of puertos) expect(() => p.anteFalloPersistencia(new Error("caida"))).toThrow(BaseNoDisponible);
    } finally {
      delete process.env.TENANT_MODE;
    }
  });
});
