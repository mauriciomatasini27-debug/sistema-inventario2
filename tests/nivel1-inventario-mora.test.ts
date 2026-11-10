import { describe, expect, it } from "vitest";
import { compensar, verificar_movimientos, type Sku } from "../src/modules/inventario/inventario.js";
import { conteo_por_sector, normalizarSector } from "../src/modules/inventario/sectores.js";
import { UMBRAL_MORA_DIAS, esta_en_mora, estado_mora_por_dias, texto_mora, vence_el, MS_POR_DIA } from "../src/modules/credit/saldos.js";
import { venta_a_cuenta } from "../src/modules/credit/fiado.js";
import { resolverCredito } from "../src/modules/credit/limite.js";
import { lotesDesdeStock } from "../src/modules/inventario/inventario.js";

const sku = (s: string) => s as Sku;
const DIA = MS_POR_DIA;
const HOY = 1_789_000_000_000;

describe("Nivel 1 inventario inmutable", () => {
  it("compensar exige motivo y cantidad no cero", () => {
    expect(compensar({ sku: sku("A"), loteId: null, cantidad: 0, motivo: "x", idemKey: "k" }).ok).toBe(false);
    expect(compensar({ sku: sku("A"), loteId: null, cantidad: 2, motivo: "  ", idemKey: "k" }).ok).toBe(false);
    const ok = compensar({ sku: sku("A"), loteId: null, cantidad: -2, motivo: "conteo kiosco", idemKey: "k1" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.valor).toMatchObject({ tipo: "COMPENSATORIO", delta: -2 });
  });

  it("verificar_movimientos deriva sin autocorregir y detecta duplicados", () => {
    const c1 = compensar({ sku: sku("A"), loteId: null, cantidad: 5, motivo: "conteo", idemKey: "a" });
    const c2 = compensar({ sku: sku("A"), loteId: null, cantidad: -2, motivo: "conteo", idemKey: "b" });
    if (!c1.ok || !c2.ok) throw new Error("setup");
    const v = verificar_movimientos([c1.valor, c2.valor, { ...c2.valor, idemKey: "b" }]);
    expect(v.derivadoPorSku.get(sku("A"))).toBe(1);
    expect(v.idemDuplicados).toEqual(["b"]);
  });
});

describe("Nivel 1 conteo por sector", () => {
  it("normaliza sector y usa general por defecto", () => {
    expect(normalizarSector("")).toBe("general");
    expect(normalizarSector(" Kiosco-1 ")).toBe("kiosco-1");
    expect(normalizarSector("CON ESPACIO")).toBe("general");
  });

  it("cuenta solo el sector pedido y emite COMPENSATORIO", () => {
    const teorico = new Map([["A", 10], ["B", 4]]);
    const sectorDe = new Map([["A", "kiosco"], ["B", "deposito"]]);
    const r = conteo_por_sector({
      teorico,
      fisico: [{ sku: sku("A"), fisico: 7 }],
      sectorDe,
      sector: "kiosco",
      idemKey: "cnt-1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.diferencias).toEqual([{ sku: "A", teorico: 10, fisico: 7, diferencia: -3 }]);
    expect(r.valor.movimientos).toMatchObject([{ tipo: "COMPENSATORIO", delta: -3 }]);
    expect(r.valor.unidadesAjuste).toBe(3);
    expect(teorico.get("A")).toBe(10);
  });

  it("rechaza sku de otro sector y duplicados", () => {
    const teorico = new Map([["A", 10]]);
    const sectorDe = new Map([["A", "kiosco"]]);
    const otro = conteo_por_sector({ teorico, fisico: [{ sku: sku("A"), fisico: 1 }], sectorDe, sector: "deposito", idemKey: "k" });
    expect(otro.ok).toBe(false);
    const dupl = conteo_por_sector({
      teorico,
      fisico: [{ sku: sku("A"), fisico: 1 }, { sku: sku("A"), fisico: 2 }],
      sectorDe,
      sector: "kiosco",
      idemKey: "k",
    });
    expect(dupl.ok).toBe(false);
  });
});

describe("Nivel 1 mora día 15", () => {
  it("umbral 15: 14 al_dia, 15 en_mora", () => {
    expect(UMBRAL_MORA_DIAS).toBe(15);
    expect(estado_mora_por_dias(14)).toBe("al_dia");
    expect(estado_mora_por_dias(15)).toBe("en_mora");
    const m = esta_en_mora([{ fecha: HOY - 14 * DIA }], HOY);
    expect(m.enMora).toBe(false);
    const m2 = esta_en_mora([{ fecha: HOY - 15 * DIA }], HOY);
    expect(m2).toMatchObject({ enMora: true, diasMax: 15, estado: "en_mora" });
    expect(esta_en_mora([], HOY).enMora).toBe(false);
  });

  it("vence_el suma plazo y texto_mora es determinista", () => {
    expect(vence_el(HOY, 30)).toBe(HOY + 30 * DIA);
    expect(texto_mora("Juan", 20, 150000n)).toContain("20 d");
  });

  it("venta_a_cuenta bloquea MORA a empleado, dueño pasa marcado", () => {
    const armar = (key: string, rol: "dueno" | "empleado") => {
      const credito = resolverCredito({ customerId: "cli-1", topeAlmacenado: 0n, saldoCentavos: 0n, rol });
      if (!credito.ok) throw new Error(credito.codigo);
      return {
        idempotencyKey: key,
        lineas: [{ sku: sku("demo-sku-1"), cantidad: 1, precioCentavos: 10000n }],
        deviceCode: "D-001",
        seqLocal: 1,
        offline: false,
        lotes: lotesDesdeStock(new Map([["demo-sku-1", 10]])),
        vistos: new Map(),
        ultimoDefinitivo: null,
        credito: credito.valor,
        ahoraMs: HOY,
        mora: { estado: "al_dia" as const, diasMax: 0 },
      };
    };
    const mora = { estado: "en_mora" as const, diasMax: 15 };
    const emp = venta_a_cuenta({ ...armar("mora-1", "empleado"), mora });
    expect(emp).toMatchObject({ ok: false, codigo: "MORA", status: 403, diasMax: 15 });
    const due = venta_a_cuenta({ ...armar("mora-2", "dueno"), mora });
    expect(due.ok).toBe(true);
    if (!due.ok) return;
    expect(due.efecto.superaMora).toBe(true);
    const alDia = venta_a_cuenta({ ...armar("mora-3", "empleado"), mora: { estado: "al_dia", diasMax: 20 } });
    expect(alDia.ok).toBe(true);
    if (!alDia.ok) return;
    expect(alDia.efecto.superaMora).toBe(false);
  });
});
