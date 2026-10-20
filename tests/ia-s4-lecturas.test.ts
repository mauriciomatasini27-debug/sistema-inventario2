import { beforeEach, describe, expect, it } from "vitest";
import { resetStore, store } from "../src/lib/store.js";
import { crearAsistente } from "../src/modules/ia/asistente.js";
import { RegistroUsoIAMemoria } from "../src/modules/ia/registro.js";
import type { ProveedorLLM } from "../src/modules/ia/proveedor.js";
import { crearLecturasIA } from "../src/lib/repos/ia-lecturas.js";

const MES = "2026-10";
const AHORA = new Date("2026-10-17T12:00:00.000Z");

function espia() {
  const prompts: string[] = [];
  const proveedor: ProveedorLLM = {
    async completar(mensajes) {
      prompts.push(mensajes.map((m) => m.contenido).join("\n"));
      return { texto: "Respuesta del asistente", tokensEntrada: 3, tokensSalida: 2 };
    },
  };
  return { proveedor, prompts };
}

function sembrarProducto(sku: string, nombre: string, precioCentavos: number, stock: number) {
  store.productos.set(sku, {
    sku,
    nombre,
    precioCentavos,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: false,
    estado: "activo",
    minStock: null,
    reorderQty: null,
  });
  store.prices.set(sku, precioCentavos);
  store.stock.set(sku, stock);
}

function semillaStockBajo() {
  store.stock.set("demo-sku-1", 4);
}

function asistente(proveedor: ProveedorLLM, registro: RegistroUsoIAMemoria) {
  return crearAsistente({
    proveedor,
    registro,
    lecturas: crearLecturasIA({ ahora: () => AHORA }),
    mesActual: () => MES,
  });
}

beforeEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  resetStore();
});

describe("IA-S4 lecturas reales del asistente", () => {
  it("stock_bajo devuelve el stock cargado en el store y lo manda al prompt", async () => {
    semillaStockBajo();
    const { proveedor, prompts } = espia();
    const registro = new RegistroUsoIAMemoria();

    const r = await asistente(proveedor, registro).preguntar(
      { tenantId: "t-1", rol: "dueno" },
      "¿qué productos tienen stock bajo?",
    );

    expect(r.rechazada).toBe(false);
    expect(r.datos).toEqual([{ sku: "demo-sku-1", nombre: "Alfajor Jorgito", stock: 4, minimo: 10 }]);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('"nombre":"Alfajor Jorgito"');
    expect(prompts[0]).toContain('"stock":4');
    expect((await registro.usoDelMes("t-1", MES)).consultas).toBe(1);
  });

  it("top_productos lee líneas y descuentos de memoria y descuenta devoluciones", async () => {
    sembrarProducto("A-1", "Yerba", 1500, 10);
    sembrarProducto("B-2", "Mate", 700, 10);
    store.ticketLineas.push(
      { sale_id: "s-1", product_id: "A-1", qty: 3, precio_centavos: "1000" },
      { sale_id: "s-2", product_id: "B-2", qty: 1, precio_centavos: "500" },
    );
    store.ticketDescuentos.push({
      sale_id: "s-1",
      linea_idx: 0,
      sku: "A-1",
      bruto_centavos: "3000",
      desc_linea_centavos: "0",
      desc_ticket_centavos: "0",
      neto_centavos: "3000",
    });
    store.returnVistos.set("dev-1", { numero_devolucion: "D-1", sale_id: "s-1" });
    store.stockMoves.push({ idemKey: "dev-1", sku: "A-1", loteId: null, delta: 1, tipo: "COMPENSATORIO" });

    const { proveedor, prompts } = espia();
    const r = await asistente(proveedor, new RegistroUsoIAMemoria()).preguntar(
      { tenantId: "t-1", rol: "dueno" },
      "¿Qué productos se vendieron más este mes?",
    );

    expect(r.rechazada).toBe(false);
    expect(r.datos).toEqual({
      productos: [
        { sku: "A-1", nombre: "Yerba", cantidad: 2, totalCentavos: "3000" },
        { sku: "B-2", nombre: "Mate", cantidad: 1, totalCentavos: "500" },
      ],
      fuente: "memoria",
    });
    expect(prompts[0]).toContain('"nombre":"Yerba"');
  });

  it("margen_producto busca por sku y no inventa margen sin costo", async () => {
    sembrarProducto("A-1", "Yerba", 10000, 5);
    sembrarProducto("B-2", "Mate", 5000, 5);
    store.lotes.set("lote-a", {
      id: "lote-a",
      sku: "A-1",
      cantidad: 5,
      cantidadRestante: 5,
      venceEl: null,
      costoCentavos: "6000",
    });
    const lecturas = crearLecturasIA({ ahora: () => AHORA });

    const conCosto = await lecturas.margen_producto!({ tenantId: "t-1" }, { producto: "A-1" });
    expect(conCosto).toEqual({
      producto: {
        sku: "A-1",
        nombre: "Yerba",
        precioCentavos: "10000",
        costoCentavos: "6000",
        margenCentavos: "4000",
        margenPorcentaje: 40,
      },
      fuente: "memoria",
    });

    const sinCosto = await lecturas.margen_producto!({ tenantId: "t-1" }, { producto: "B-2" });
    expect(sinCosto).toEqual({
      producto: {
        sku: "B-2",
        nombre: "Mate",
        precioCentavos: "5000",
        costoCentavos: null,
        margenCentavos: null,
        margenPorcentaje: null,
      },
      fuente: "memoria",
    });
  });

  it("rotacion_lenta ordena por unidades vendidas y stock", async () => {
    store.stock.clear();
    sembrarProducto("A-1", "Yerba", 1500, 5);
    sembrarProducto("B-2", "Mate", 700, 3);
    sembrarProducto("C-3", "Azúcar", 900, 0);
    store.returnVistos.set("d-1", { numero_devolucion: "D-1", sale_id: "s-1" });
    store.stockMoves.push(
      { idemKey: "v-1", sku: "A-1", loteId: null, delta: -1, tipo: "VENTA" },
      { idemKey: "d-1", sku: "A-1", loteId: null, delta: 1, tipo: "COMPENSATORIO" },
    );
    const lecturas = crearLecturasIA({ ahora: () => AHORA });

    const r = await lecturas.rotacion_lenta!({ tenantId: "t-1" }, {});
    expect(r).toEqual({
      productos: [
        { sku: "A-1", nombre: "Yerba", stock: 5, unidadesVendidas: 0, ultimaVentaEl: null },
        { sku: "B-2", nombre: "Mate", stock: 3, unidadesVendidas: 0, ultimaVentaEl: null },
      ],
      fuente: "memoria",
    });
  });
});
