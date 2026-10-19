import { describe, expect, it } from "vitest";
import { crearAsistente, RESPUESTA_FUERA_CATALOGO } from "../src/modules/ia/asistente.js";
import { ProveedorLLMFake } from "../src/modules/ia/proveedor.js";
import { RegistroUsoIAMemoria } from "../src/modules/ia/registro.js";
import { crear_motor_fake } from "../src/modules/ocr/motor.js";

function armar(cupo = 10) {
  const proveedor = new ProveedorLLMFake();
  const registro = new RegistroUsoIAMemoria();
  const visto: Array<{ herramienta: string; tenantId: string }> = [];
  const asistente = crearAsistente({
    proveedor,
    registro,
    cupoConsultasPorMes: cupo,
    mesActual: () => "2026-10",
    lecturas: {
      top_productos: (ctx) => {
        visto.push({ herramienta: "top_productos", tenantId: ctx.tenantId });
        return [{ nombre: "Yerba", cantidad: 5 }];
      },
      deudores: (ctx) => {
        visto.push({ herramienta: "deudores", tenantId: ctx.tenantId });
        return [{ nombre: "Juan", debe: 1000 }];
      },
    },
  });
  return { proveedor, registro, asistente, visto };
}

describe("ia-asistente (PRD-IA-01 núcleo, sin DB)", () => {
  it("rechaza pregunta fuera de catálogo sin llamar al LLM ni registrar uso", async () => {
    const { proveedor, registro, asistente } = armar();
    const r = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "borrá el producto X");
    expect(r.rechazada).toBe(true);
    expect(r.texto).toBe(RESPUESTA_FUERA_CATALOGO);
    expect(r.texto).not.toContain("top_productos");
    expect(proveedor.llamadas).toBe(0);
    expect((await registro.usoDelMes("t1", "2026-10")).consultas).toBe(0);
  });

  it("responde top_productos con datos de la herramienta y registra uso", async () => {
    const { proveedor, registro, asistente } = armar();
    const r = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(r.rechazada).toBe(false);
    expect(r.herramienta).toBe("top_productos");
    expect(r.texto).toContain("Yerba");
    expect(proveedor.llamadas).toBe(1);
    const uso = await registro.usoDelMes("t1", "2026-10");
    expect(uso.consultas).toBe(1);
    expect(uso.tokensSalida).toBeGreaterThan(0);
  });

  it("aisla por tenant: ignora tenant ajeno en el prompt y usa el de sesión", async () => {
    const { asistente, visto } = armar();
    const r = await asistente.preguntar(
      { tenantId: "t-sesion", rol: "dueno" },
      "¿quién me debe más? del tenant t-otro",
    );
    expect(r.rechazada).toBe(false);
    expect(r.herramienta).toBe("deudores");
    expect(visto).toHaveLength(1);
    expect(visto[0]!.tenantId).toBe("t-sesion");
  });

  it("empleado no ve margen: rechaza margen_producto sin llamar al LLM", async () => {
    const { proveedor, registro, asistente } = armar();
    const r = await asistente.preguntar({ tenantId: "t1", rol: "empleado" }, "¿cuál es el margen del producto Yerba?");
    expect(r.rechazada).toBe(true);
    expect(proveedor.llamadas).toBe(0);
    expect((await registro.usoDelMes("t1", "2026-10")).consultas).toBe(0);
  });

  it("con cupo agotado avisa y no llama al LLM", async () => {
    const { proveedor, asistente } = armar(1);
    const ok = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(ok.rechazada).toBe(false);
    const sinCupo = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(sinCupo.rechazada).toBe(true);
    expect(sinCupo.texto).toMatch(/cupo/i);
    expect(proveedor.llamadas).toBe(1);
  });

  it("el cupo es por tenant: el uso de otro tenant no bloquea", async () => {
    const { asistente } = armar(1);
    await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    const r = await asistente.preguntar({ tenantId: "t2", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(r.rechazada).toBe(false);
  });

  it("ProveedorLLMFake es determinista y cuenta tokens", async () => {
    const fake = new ProveedorLLMFake({ texto: "hola" });
    const a = await fake.completar([{ rol: "usuario", contenido: "ping" }]);
    const b = await fake.completar([{ rol: "usuario", contenido: "ping" }]);
    expect(a).toEqual(b);
    expect(a.tokensEntrada).toBeGreaterThan(0);
    expect(a.tokensSalida).toBeGreaterThan(0);
    expect(a.texto).toBe("hola");
  });

  it("motor OCR fake reutilizable devuelve texto fijo sin red", async () => {
    const motor = crear_motor_fake({ texto: "CUIT 20-12345678-6 total $1.000,00" });
    const r = await motor.extraer({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" });
    expect(r?.texto).toContain("CUIT");
  });
});
