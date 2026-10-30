import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEYENDA_CONSTANCIA, type CuestionarioEntrega } from "../src/modules/fiscal/entrega.js";
import { leer_avisos_entrega, registrar_entrega } from "../src/modules/sales/entrega.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";
import {
  LEYENDA_NO_FISCAL,
  vender_mostrador,
  type TicketEmitido,
  type VenderMostradorInput,
} from "../src/modules/sales/vender_mostrador.js";
import type { Lote, LotId, Sku } from "../src/modules/inventario/inventario.js";
import { resetStore, store } from "../src/lib/store.js";

const LINK_WSREMCARNE = "https://www.arca.gob.ar/ws/remitoElecCarnico/Manual_Desarrollador_WSREMCARNE_v3_5.pdf";
const LINK_WSREMHARINA = "https://arca.gob.ar/ws/remitoHTSDMT/Manual_Desarrollador_WSREMHARINA_v2.9.pdf";
const LINK_COT_ARBA =
  "https://web.arba.gov.ar/preguntas-frecuentes/que-es-el-cot-quienes-y-bajo-que-condiciones-estan-obligados-generarlo-en-que";

const AVISO_CARNE = { regimen: "wsremcarne", texto: "wsremcarne RG 5259", link: LINK_WSREMCARNE };
const AVISO_HARINA = { regimen: "wsremharina", texto: "wsremharina RG 5264", link: LINK_WSREMHARINA };
const AVISO_COT = { regimen: "cot-arba", texto: "COT ARBA", link: LINK_COT_ARBA };

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number, venceEl: Date | null = null): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl,
  costoCentavos: 1000n,
});

function base(over: Partial<VenderMostradorInput> = {}): VenderMostradorInput {
  return {
    idempotencyKey: "k-" + Math.random().toString(36).slice(2),
    lineas: [{ sku: sku("YERBA"), cantidad: 2, precioCentavos: 15000n }],
    medio: "Efectivo",
    deviceCode: "KIOSCO-01",
    seqLocal: 41,
    offline: false,
    lotes: [lote("l1", "YERBA", 10)],
    vistos: new Map<string, TicketEmitido>(),
    ultimoDefinitivo: { n: 128 },
    grant: { rol: "dueno" },
    ...over,
  };
}

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function cuestionario(over: Partial<CuestionarioEntrega> = {}): CuestionarioEntrega {
  return {
    carne: false,
    harina: false,
    trasladoBuenosAires: false,
    kilos: 0,
    importeCentavos: 0n,
    ...over,
  };
}

function cuestionarioTres(): CuestionarioEntrega {
  return cuestionario({
    carne: true,
    harina: true,
    trasladoBuenosAires: true,
    kilos: 4501,
    importeCentavos: 0n,
  });
}

async function ventaEnMemoria(): Promise<string> {
  store.stock.set("YERBA", 10);
  const resultado = await registrar_venta({
    key: crypto.randomUUID(),
    lineas: [{ product_id: "YERBA", qty: 2, precio_centavos: 15000 }],
    medio: "Efectivo",
    deviceCode: "caja-01",
    seqLocal: 1,
    offline: false,
    clientOccurredAt: new Date().toISOString(),
  });
  expect(resultado.ok).toBe(true);
  if (!resultado.ok) throw new Error("la venta en memoria falló");
  return resultado.venta.saleId;
}

describe("entrega sin factura de una venta (FE-S28)", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("el ticket lleva la leyenda de factura y la entrega guarda los tres avisos de la venta", async () => {
    const mostrador = vender_mostrador(base());
    expect(mostrador.ok).toBe(true);
    if (!mostrador.ok) return;
    expect(mostrador.efecto.ticket.leyenda).toBe(LEYENDA_NO_FISCAL);

    const tenantId = "fe-s28-tres";
    const saleId = await ventaEnMemoria();
    const espia = vi.spyOn(globalThis, "fetch");
    try {
      const entrega = registrar_entrega({
        tenantId,
        saleId,
        cuestionario: cuestionarioTres(),
      });
      expect(espia).not.toHaveBeenCalled();

      expect(entrega.constancia.leyenda).toBe(LEYENDA_CONSTANCIA);
      expect(entrega.constancia.titulo).toBe("Constancia de entrega interna");
      expect(entrega.constancia.titulo.toLowerCase()).not.toContain("remito");
      expect(entrega.constancia.titulo).not.toMatch(/\bR\b/);
      expect(entrega.constancia.letra).toBeNull();
      const fueraDeLaLeyenda = `${entrega.constancia.titulo} ${String(entrega.constancia.letra)}`;
      expect(fueraDeLaLeyenda.toLowerCase()).not.toContain("remito");
      expect(fueraDeLaLeyenda).not.toMatch(/\bR\b/);
      expect(entrega.emite).toBe(false);
      expect(entrega.avisos.map((aviso) => aviso.regimen)).toEqual(["wsremcarne", "wsremharina", "cot-arba"]);
      expect(entrega.avisos).toEqual([AVISO_CARNE, AVISO_HARINA, AVISO_COT]);
      expect(leer_avisos_entrega({ tenantId, saleId })).toEqual([AVISO_CARNE, AVISO_HARINA, AVISO_COT]);
      expect(leer_avisos_entrega({ tenantId: "fe-s28-ajeno", saleId })).toBeUndefined();
      expect(JSON.stringify(entrega)).not.toMatch(/CAE|FECAE|wsfe|CbteTipo|solicitud/i);
      expect("cae" in entrega).toBe(false);
    } finally {
      espia.mockRestore();
    }
  });

  it("una segunda entrega del mismo tenant y venta reemplaza los avisos", async () => {
    const tenantId = "fe-s28-reemplazo";
    const saleId = await ventaEnMemoria();
    registrar_entrega({ tenantId, saleId, cuestionario: cuestionarioTres() });
    registrar_entrega({ tenantId, saleId, cuestionario: cuestionario({ harina: true }) });

    const leidos = leer_avisos_entrega({ tenantId, saleId });
    expect(leidos).toEqual([AVISO_HARINA]);
    expect(leidos).toHaveLength(1);
  });

  it("un cuestionario sin marcas guarda la lista vacía de esa venta", async () => {
    const tenantId = "fe-s28-vacio";
    const saleId = await ventaEnMemoria();
    const entrega = registrar_entrega({ tenantId, saleId, cuestionario: cuestionario() });

    expect(entrega.constancia.leyenda).toBe(LEYENDA_CONSTANCIA);
    expect(entrega.constancia.titulo).toBe("Constancia de entrega interna");
    expect(entrega.emite).toBe(false);
    expect(leer_avisos_entrega({ tenantId, saleId })).toEqual([]);
  });
});
