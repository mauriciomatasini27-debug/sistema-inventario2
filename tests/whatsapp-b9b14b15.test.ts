// Tests B9/B14/B15: semanal sin ventas, programar+reconfirmar,
// cierre con snapshot exacto sin duplicar, promos top3 + descarte,
// vencimiento max 1/día.

import { describe, expect, it } from "vitest";
import { calcular_semanal } from "../src/modules/email/resumen-semanal.js";
import {
  armar_resumen_semanal_wa,
  programar_lunes,
  recalcular_lunes,
} from "../src/modules/whatsapp/resumen-semanal.js";
import { armar_cierre_wa, decidir_envio_cierre } from "../src/modules/whatsapp/resumen-cierre.js";
import { reclamadorMemoria } from "../src/modules/whatsapp/entregas.js";
import {
  armar_alerta_vencimiento,
  descartar_2_semanas,
  esta_descartada,
  filtrar_descartadas,
  puede_alertar_vencimiento,
  registrar_alerta,
  topear_3_por_impacto,
  type Sugerencia,
} from "../src/modules/whatsapp/promos.js";

const HORA = 1_700_000_000_000;

function sug(sku: string, impacto: bigint): Sugerencia {
  return { sku, nombre: sku, motivo: "dormido", promo: "2x1", impactoCentavos: impacto, detalle: "mover" };
}

describe("B9 semanal WA", () => {
  it("sin ventas igual sale con leyenda", () => {
    const calculo = calcular_semanal({ ventas: [], faltantes: [] });
    const r = armar_resumen_semanal_wa({
      tenantId: "t1",
      nombreComercio: "Kiosco Pepe",
      semanaISO: "2026-W41",
      calculo,
    });
    expect(r.plantilla).toBe("resumen_semanal");
    expect(r.texto).toContain("no hay ventas registradas");
    expect(r.botones.map((b) => b.id)).toEqual(["ver_pedido", "programar_lunes", "resumen_completo"]);
    expect(r.idempotencyKey).toBe("resumen_semanal:wa:t1:2026-W41");
  });

  it("programar lunes + reconfirmar si cambió", () => {
    const tienda = new Map();
    const base = calcular_semanal({
      ventas: [{ sku: "a", nombre: "Alfajor", unidades: 10, importeCentavos: 10000n }],
      faltantes: [],
    });
    const p = programar_lunes(tienda, {
      tenantId: "t1",
      semanaISO: "2026-W41",
      lunesFecha: "2026-10-12",
      calculo: base,
      ahoraMs: HORA,
    });
    expect(p.status).toBe(201);
    const dup = programar_lunes(tienda, {
      tenantId: "t1",
      semanaISO: "2026-W41",
      lunesFecha: "2026-10-12",
      calculo: base,
      ahoraMs: HORA,
    });
    expect(dup.status).toBe(409);
    const igual = recalcular_lunes(tienda, { tenantId: "t1", semanaISO: "2026-W41", calculoActual: base });
    expect(igual?.igual).toBe(true);
    const cambiado = calcular_semanal({
      ventas: [{ sku: "a", nombre: "Alfajor", unidades: 99, importeCentavos: 99000n }],
      faltantes: [],
    });
    const rec = recalcular_lunes(tienda, { tenantId: "t1", semanaISO: "2026-W41", calculoActual: cambiado });
    expect(rec?.igual).toBe(false);
    if (rec && !rec.igual) expect(rec.textoReconfirmar).toContain("¿Lo mandamos igual?");
  });
});

describe("B14 cierre WA", () => {
  it("usa snapshot exacto y no duplica por jornada", async () => {
    const snap = {
      tenantId: "t1",
      cierreId: "c1",
      fechaJornada: "2026-10-10",
      totalCentavos: 123456n,
      porMedio: { efectivo: 100000n, mp: 23456n },
      tipo: "manual" as const,
      nombreComercio: "Kiosco Pepe",
    };
    const r = armar_cierre_wa(snap);
    expect(r.plantilla).toBe("resumen_cierre_caja");
    expect(r.texto).toContain("$ 1.234,56");
    expect(r.texto).toContain("efectivo");
    // El texto sale del snapshot: si cambia el real, el WA no se mueve.
    const tienda = new Map<string, string>();
    const d1 = await decidir_envio_cierre(reclamadorMemoria(tienda), { snapshot: snap, rol: "dueno" });
    expect(d1.ok).toBe(true);
    const d2 = await decidir_envio_cierre(reclamadorMemoria(tienda), { snapshot: snap, rol: "dueno" });
    expect(d2).toEqual({ ok: false, motivo: "duplicado_jornada" });
    const sinPermiso = await decidir_envio_cierre(reclamadorMemoria(new Map()), { snapshot: snap, rol: "empleado", permisos: [] });
    expect(sinPermiso).toEqual({ ok: false, motivo: "sin_permiso" });
    const conPermiso = await decidir_envio_cierre(reclamadorMemoria(new Map()), {
      snapshot: snap,
      rol: "empleado",
      permisos: ["ver_saldos"],
    });
    expect(conPermiso.ok).toBe(true);
  });
});

describe("B15 promos", () => {
  it("max 3 por impacto + descarte 2 semanas", () => {
    const todas = [sug("a", 100n), sug("b", 500n), sug("c", 300n), sug("d", 900n), sug("e", 50n)];
    const top = topear_3_por_impacto(todas);
    expect(top.map((s) => s.sku)).toEqual(["d", "b", "c"]);
    const tienda = new Map<string, number>();
    descartar_2_semanas(tienda, { tenantId: "t1", sku: "d", ahoraMs: HORA });
    expect(esta_descartada(tienda, { tenantId: "t1", sku: "d", ahoraMs: HORA })).toBe(true);
    const resto = filtrar_descartadas(tienda, { tenantId: "t1", ahoraMs: HORA, sugerencias: top });
    expect(resto.map((s) => s.sku)).toEqual(["b", "c"]);
    const dosSemanas = HORA + 14 * 24 * 60 * 60 * 1000;
    expect(esta_descartada(tienda, { tenantId: "t1", sku: "d", ahoraMs: dosSemanas })).toBe(false);
  });

  it("vencimiento max 1/día y solo si activada", () => {
    const tienda = new Map<string, string>();
    expect(puede_alertar_vencimiento(tienda, { tenantId: "t1", diaISO: "2026-10-10", activada: false })).toBe(false);
    expect(puede_alertar_vencimiento(tienda, { tenantId: "t1", diaISO: "2026-10-10", activada: true })).toBe(true);
    const a = armar_alerta_vencimiento({ nombrePromo: "2x1 Alfajor", vence: "2026-10-11" });
    expect(a.plantilla).toBe("alerta_vencimiento_promo");
    expect(registrar_alerta(tienda, { tenantId: "t1", diaISO: "2026-10-10", promoId: "p1" })).toEqual({ status: 201 });
    expect(puede_alertar_vencimiento(tienda, { tenantId: "t1", diaISO: "2026-10-10", activada: true })).toBe(false);
    expect(registrar_alerta(tienda, { tenantId: "t1", diaISO: "2026-10-10", promoId: "p2" })).toEqual({ status: 409 });
    expect(puede_alertar_vencimiento(tienda, { tenantId: "t1", diaISO: "2026-10-11", activada: true })).toBe(true);
  });
});
