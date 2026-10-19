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

  it("una herramienta sin lectura responde honesto sin llamar al LLM ni registrar uso", async () => {
    const { proveedor, prompts } = espia();
    const registro = new RegistroUsoIAMemoria();

    const r = await asistente(proveedor, registro).preguntar(
      { tenantId: "t-1", rol: "dueno" },
      "¿qué vendí más esta semana?",
    );

    expect(r).toEqual({
      rechazada: true,
      texto: "Todavía no puedo leer productos más vendidos del período desde el asistente.",
    });
    expect(prompts).toHaveLength(0);
    expect((await registro.usoDelMes("t-1", MES)).consultas).toBe(0);
  });
});
