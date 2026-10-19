import { beforeEach, describe, expect, it } from "vitest";
import { RegistroUsoIAMemoria } from "../src/modules/ia/registro.js";
import {
  preguntar_asistente_bot,
  reconoce_pregunta_ia,
} from "../src/modules/whatsapp/asistente.js";

function espia() {
  return {
    llamadas: 0,
    async completar() {
      this.llamadas += 1;
      return { texto: "Vendiste 5 unidades de Yerba", tokensEntrada: 4, tokensSalida: 5 };
    },
  };
}

const MES = "2026-10";

function base(sobre: Partial<Parameters<typeof preguntar_asistente_bot>[0]> = {}) {
  const proveedor = espia();
  const registro = new RegistroUsoIAMemoria();
  return {
    proveedor,
    registro,
    entrada: {
      texto: "¿qué productos tienen stock bajo?",
      tenantId: "t-1",
      rol: "dueno" as const,
      proveedor,
      registro,
      mesActual: () => MES,
      ...sobre,
    },
  };
}

describe("IA-S4 asistente por WhatsApp", () => {
  it("reconoce solo preguntas del catálogo del asistente", () => {
    expect(reconoce_pregunta_ia("¿qué vendí más esta semana?")).toBe(true);
    expect(reconoce_pregunta_ia("¿quién me debe más?")).toBe(true);
    expect(reconoce_pregunta_ia("hola, buen día")).toBe(false);
  });

  it("responde con el asistente y registra uso", async () => {
    const { entrada, proveedor, registro } = base({ lecturas: { stock_bajo: () => [] } });
    const r = await preguntar_asistente_bot(entrada);
    expect(r).toEqual({
      rechazada: false,
      texto: "Vendiste 5 unidades de Yerba",
      herramienta: "stock_bajo",
      datos: [],
    });
    expect(proveedor.llamadas).toBe(1);
    expect((await registro.usoDelMes("t-1", MES)).consultas).toBe(1);
  });

  it("espera una lectura async antes de mandar los datos al LLM", async () => {
    const { entrada } = base({
      texto: "¿quién me debe más?",
      lecturas: {
        deudores: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return [{ nombre: "Juan", saldoCentavos: "1000" }];
        },
      },
    });
    const r = await preguntar_asistente_bot(entrada);
    expect(r?.rechazada).toBe(false);
    expect(r?.datos).toEqual([{ nombre: "Juan", saldoCentavos: "1000" }]);
  });

  it("un mensaje que el catálogo no reconoce sigue el flujo actual sin LLM", async () => {
    const { entrada, proveedor } = base({ texto: "hola, buen día" });
    const r = await preguntar_asistente_bot(entrada);
    expect(r).toBeNull();
    expect(proveedor.llamadas).toBe(0);
  });

  it("un empleado no ve costos por WhatsApp y el LLM no se llama", async () => {
    const { entrada, proveedor } = base({
      texto: "¿cuál es el margen del producto Yerba?",
      rol: "empleado",
    });
    const r = await preguntar_asistente_bot(entrada);
    expect(r?.rechazada).toBe(true);
    expect(r?.texto).toContain("No tenés permiso");
    expect(proveedor.llamadas).toBe(0);
  });
});

describe("IA-S4 asistente por WhatsApp usa el tenant del vínculo", () => {
  let visto: string[];
  beforeEach(() => {
    visto = [];
  });

  it("pasa el tenant de la entrada a la lectura del catálogo", async () => {
    const { entrada, proveedor } = base({
      texto: "¿quién me debe más?",
      tenantId: "t-del-vinculo",
      lecturas: {
        deudores: (ctx) => {
          visto.push(ctx.tenantId);
          return [{ nombre: "Juan", debe: 1000 }];
        },
      },
    });
    const r = await preguntar_asistente_bot(entrada);
    expect(r?.rechazada).toBe(false);
    expect(proveedor.llamadas).toBe(1);
    expect(visto).toEqual(["t-del-vinculo"]);
  });
});
