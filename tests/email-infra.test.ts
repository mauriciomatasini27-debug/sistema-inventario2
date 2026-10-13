import { describe, expect, it } from "vitest";
import { clasificar_error, clave_entrega, jitter_programado, proximo_reintento, vencido } from "../src/modules/email/outbox.js";
import { layout, link_app, pie, reply_para, tiene_tracking } from "../src/modules/email/plantillas.js";
import { es_webhook_duplicado, evaluar_supresion, hash_email, metricas, verificar_firma } from "../src/modules/email/entregabilidad.js";
import { listar_historial } from "../src/modules/email/historial.js";

describe("email D NE11 outbox", () => {
  it("503 transitorio con backoff; 422 permanente sin reintento", () => {
    expect(clasificar_error(503)).toBe("transitorio");
    expect(clasificar_error(422)).toBe("permanente");
    const t0 = 1_000_000;
    const r1 = proximo_reintento(0, t0);
    expect(r1).toBeGreaterThan(t0);
    expect(r1).toBeLessThanOrEqual(t0 + 72_000);
    expect(proximo_reintento(5, t0)).toBeNull();
  });

  it("matutino vence 12:00; seguridad no vence; jitter 0-10min", () => {
    expect(vencido("stock_bajo", 12 * 60)).toBe(true);
    expect(vencido("stock_bajo", 11 * 60)).toBe(false);
    expect(vencido("seguridad", 23 * 60)).toBe(false);
    const j = jitter_programado(1000, "t1");
    expect(j - 1000).toBeGreaterThanOrEqual(0);
    expect(j - 1000).toBeLessThan(10 * 60_000);
    expect(clave_entrega({ tenant: "t", tipo: "x", referencia: "r", periodo: "p", usuario: "u", canal: "email" })).toContain("t");
  });
});

describe("email D NE12 plantillas y links", () => {
  it("600px, sin tracking, link manipulado al inicio", () => {
    const h = layout("Cierre", "<p>Hola</p>");
    expect(h).toContain("max-width:600px");
    expect(tiene_tracking(h)).toBe(false);
    expect(tiene_tracking('<img src="open-pixel">')).toBe(true);
    expect(link_app("/caja/cierres/2026-10-08")).toContain("/caja/");
    expect(link_app("https://evil.com/x")).toBe("{{app_url}}/");
    expect(reply_para(false)).toContain("soporte");
    expect(reply_para(true, "kiosco@mail.com")).toBe("kiosco@mail.com");
    expect(pie("Kiosco", true).texto).toContain("Baja:");
    expect(pie("Kiosco", false).texto).not.toContain("Baja:");
  });
});

describe("email D NE13 entregabilidad", () => {
  it("hash nunca plano; duro suprime; duplicado idempotente; firma", () => {
    const h = hash_email("DueNA@Mail.com ");
    expect(h).not.toContain("@");
    expect(h).toBe(hash_email("duena@mail.com"));
    expect(evaluar_supresion({ evento: "duro", blandosSeguidos: 0, ahoraMs: 0 })).not.toBeNull();
    expect(evaluar_supresion({ evento: "blando", blandosSeguidos: 3, ahoraMs: 0 })?.motivo).toBe("blando_temporal");
    expect(evaluar_supresion({ evento: "blando", blandosSeguidos: 1, ahoraMs: 0 })).toBeNull();
    expect(es_webhook_duplicado(new Set(["e1"]), "e1")).toBe(true);
    expect(verificar_firma("ab", "ab")).toBe(true);
    expect(verificar_firma("ab", "xx")).toBe(false);
    expect(metricas({ enviados: 1000, entregados: 990, rebotes: 30, quejas: 0 }).alerta).toBe(true);
    expect(metricas({ enviados: 1000, entregados: 990, rebotes: 5, quejas: 0 }).alerta).toBe(false);
  });
});

describe("email D NE14 historial", () => {
  it("90 dias con estados por canal y pantalla origen", () => {
    const ahora = 100 * 24 * 3600_000;
    const items = listar_historial(
      [
        { tipo: "resumen_cierre", fechaMs: ahora - 1000, estadoEmail: "entregado", estadoWA: "leido", pantalla: "/caja/cierres/2026-10-08" },
        { tipo: "vencimientos", fechaMs: ahora - 100 * 24 * 3600_000, estadoEmail: "reboto", pantalla: "/pagos" },
      ],
      ahora,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.detalle).toContain("entregado");
    expect(items[0]?.pantalla).toBe("/caja/cierres/2026-10-08");
  });
});
