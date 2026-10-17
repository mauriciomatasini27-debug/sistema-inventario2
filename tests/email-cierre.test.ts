import { describe, expect, it } from "vitest";
import { armar_cierre, formatear_pesos } from "../src/modules/email/plantilla-cierre.js";
import { ProveedorFake, puede_enviar_email } from "../src/modules/email/proveedor.js";
import {
  describir_resumen_cierre,
  encolar_resumen_cierre,
  procesar_pendientes,
} from "../src/modules/email/resumen-cierre.js";

function tiendas() {
  return {
    eventos: new Map(),
    outbox: new Map(),
  };
}

const DATOS = {
  nombreComercio: "Kiosco Lo de Marta",
  fechaJornada: "2026-10-09",
  totalCentavos: 80000n,
  porMedio: { Efectivo: 100000n, Retiro: -20000n },
  tipo: "manual" as const,
};

describe("email NE4 resumen cierre", () => {
  it("formatea pesos AR sin perder centavos bigint", () => {
    expect(formatear_pesos(80000n)).toBe("$ 800,00");
    expect(formatear_pesos(266050n)).toBe("$ 2.660,50");
  });

  it("plantilla 600px 1 columna, CTA llama, sin tracking ni emojis", () => {
    const p = armar_cierre(DATOS);
    expect(p.asunto).toContain("2026-10-09");
    expect(p.asunto).toContain("Kiosco Lo de Marta");
    expect(p.asunto).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(p.html).toContain("max-width:600px");
    expect(p.html).toContain("#bf360c");
    expect(p.html).toContain("Efectivo");
    expect(p.html).not.toContain("open-pixel");
    expect(p.html).not.toContain("utm_");
    expect(p.texto).toContain("$ 800,00");
  });

  it("dedupe key estable por tenant+jornada", () => {
    const a = describir_resumen_cierre({
      tenantId: "t1",
      cierreId: "c1",
      fechaJornada: "2026-10-09",
      totalCentavos: 80000n,
      porMedio: { Efectivo: 80000n },
      tipo: "manual",
    });
    const b = describir_resumen_cierre({
      tenantId: "t1",
      cierreId: "c2",
      fechaJornada: "2026-10-09",
      totalCentavos: 90000n,
      porMedio: { Efectivo: 90000n },
      tipo: "manual",
    });
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it("encolar 201 y duplicado 409 (misma jornada)", () => {
    const t = tiendas();
    const base = {
      tenantId: "t1",
      cierreId: "c1",
      fechaJornada: "2026-10-09",
      totalCentavos: 80000n,
      porMedio: { Efectivo: 80000n },
      tipo: "manual",
      datosPlantilla: DATOS,
      destinatario: "duena@mail.com",
    };
    const r1 = encolar_resumen_cierre(t, base);
    expect(r1.status).toBe(201);
    const r2 = encolar_resumen_cierre(t, { ...base, cierreId: "c2" });
    expect(r2).toMatchObject({ status: 409 });
    expect(t.outbox.size).toBe(1);
  });

  it("pausa u opt-out no envían (gate NE9)", async () => {
    const t = tiendas();
    encolar_resumen_cierre(t, {
      tenantId: "t1",
      cierreId: "c1",
      fechaJornada: "2026-10-09",
      totalCentavos: 80000n,
      porMedio: { Efectivo: 80000n },
      tipo: "manual",
      datosPlantilla: DATOS,
      destinatario: "duena@mail.com",
    });
    const fake = new ProveedorFake();
    expect(puede_enviar_email({ resumenCierre: false, pausadoHastaMs: null }, 0)).toBe(false);
    const r = await procesar_pendientes(t, fake, { resumenCierre: false, pausadoHastaMs: null }, 0);
    expect(r).toEqual({ enviados: 0, omitidos: 1 });
    expect(fake.enviados).toHaveLength(0);
    const r2 = await procesar_pendientes(t, fake, { resumenCierre: true, pausadoHastaMs: 100 }, 50);
    expect(r2.omitidos).toBe(1);
  });

  it("procesa pendiente una vez, sin duplicar (idempotencia provider)", async () => {
    const t = tiendas();
    encolar_resumen_cierre(t, {
      tenantId: "t1",
      cierreId: "c1",
      fechaJornada: "2026-10-09",
      totalCentavos: 80000n,
      porMedio: { Efectivo: 80000n },
      tipo: "manual",
      datosPlantilla: DATOS,
      destinatario: "duena@mail.com",
    });
    const fake = new ProveedorFake();
    const prefs = { resumenCierre: true, pausadoHastaMs: null };
    const r1 = await procesar_pendientes(t, fake, prefs, 0);
    expect(r1.enviados).toBe(1);
    const r2 = await procesar_pendientes(t, fake, prefs, 0);
    expect(r2.enviados).toBe(0);
    expect(fake.enviados).toHaveLength(1);
    const envio = t.outbox.get("cierre-email:t1:2026-10-09");
    expect(envio?.estado).toBe("enviado");
    expect(envio?.providerMessageId).toBe("fake-1");
  });
});
