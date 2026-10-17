import { describe, expect, it } from "vitest";
import { estadoNumeroCentral, resumenConsultas } from "../src/modules/whatsapp/tarjeta-bot.js";

describe("DASH-S3 estado del número central", () => {
  it("sin credenciales => sin_configurar y el texto explica que el bot no responde", () => {
    const r = estadoNumeroCentral({ credencialesConfiguradas: false, ultimoEnvio: { ok: true, enMs: 1 } });
    expect(r.estado).toBe("sin_configurar");
    expect(r.texto).toBe(
      "Sin configurar: el número central de WhatsApp todavía no está dado de alta, el bot no responde.",
    );
  });

  it("con credenciales y sin envíos => sin_envios", () => {
    const r = estadoNumeroCentral({ credencialesConfiguradas: true, ultimoEnvio: null });
    expect(r.estado).toBe("sin_envios");
    expect(r.texto).toBe("Configurado, todavía sin envíos.");
  });

  it("último envío ok => operativo", () => {
    const r = estadoNumeroCentral({ credencialesConfiguradas: true, ultimoEnvio: { ok: true, enMs: 10 } });
    expect(r.estado).toBe("operativo");
    expect(r.texto).toBe("Operativo: el último envío salió bien.");
  });

  it("último envío fallido => degradado, nunca solo el color", () => {
    const r = estadoNumeroCentral({ credencialesConfiguradas: true, ultimoEnvio: { ok: false, enMs: 10 } });
    expect(r.estado).toBe("degradado");
    expect(r.texto).toBe("Degradado: el último envío por la Cloud API falló; las respuestas pueden no llegar.");
  });

  it("todo estado trae texto en palabras, no el código pelado", () => {
    const entradas = [
      { credencialesConfiguradas: false, ultimoEnvio: null },
      { credencialesConfiguradas: true, ultimoEnvio: null },
      { credencialesConfiguradas: true, ultimoEnvio: { ok: true, enMs: 0 } },
      { credencialesConfiguradas: true, ultimoEnvio: { ok: false, enMs: 0 } },
    ] as const;
    for (const e of entradas) {
      const r = estadoNumeroCentral(e);
      expect(r.texto.length).toBeGreaterThan(20);
      expect(r.texto).not.toBe(r.estado);
    }
  });
});

describe("DASH-S3 resumen de consultas por día de Argentina", () => {
  // 2026-10-17T02:30:00Z es 2026-10-16 23:30 en Buenos Aires (UTC-3).
  const anocheTarde = Date.parse("2026-10-17T02:30:00Z");
  // 2026-10-17T03:05:00Z es 2026-10-17 00:05 en Buenos Aires.
  const hoyTemprano = Date.parse("2026-10-17T03:05:00Z");
  const ahora = Date.parse("2026-10-17T03:30:00Z");

  it("cuenta solo las consultas del día AR y devuelve la última de todas", () => {
    const r = resumenConsultas([{ creadoEnMs: anocheTarde }, { creadoEnMs: hoyTemprano }], ahora);
    expect(r).toEqual({ hoy: 1, ultimaEnMs: hoyTemprano });
  });

  it("sin registros devuelve 0 y sin última", () => {
    expect(resumenConsultas([], ahora)).toEqual({ hoy: 0, ultimaEnMs: null });
  });

  it("la última es la más reciente aunque sea de ayer", () => {
    const r = resumenConsultas([{ creadoEnMs: anocheTarde }], ahora);
    expect(r).toEqual({ hoy: 0, ultimaEnMs: anocheTarde });
  });
});
