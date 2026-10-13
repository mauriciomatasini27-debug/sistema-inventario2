import { describe, expect, it } from "vitest";
import { OFFICIAL_PAYMENT_DOMAINS } from "../src/modules/payments/beneficiarios.js";
import { plan_sincronizar_dominios, semilla_dominios } from "../src/modules/payments/seed-dominios.js";

describe("seed allowlist dominios oficiales", () => {
  it("la semilla cubre la constante cerrada, sin esquema ni mayúsculas", () => {
    const s = semilla_dominios();
    expect(s.map((d) => d.dominio)).toEqual([...OFFICIAL_PAYMENT_DOMAINS]);
    for (const d of s) {
      expect(d.dominio).not.toContain("://");
      expect(d.dominio).toBe(d.dominio.toLowerCase());
      expect(d.activo).toBe(true);
      expect(d.verificadoPor).toBe("plataforma");
    }
  });

  it("base vacía: inserta los 4, sin desactivar", () => {
    const p = plan_sincronizar_dominios([]);
    expect(p.aInsertar).toHaveLength(4);
    expect(p.aDesactivar).toHaveLength(0);
    expect(p.sinCambios).toBe(false);
  });

  it("base al día: sin cambios", () => {
    const p = plan_sincronizar_dominios(
      semilla_dominios().map((d) => ({ dominio: d.dominio, activo: true })),
    );
    expect(p).toMatchObject({ sinCambios: true });
    expect(p.aInsertar).toHaveLength(0);
    expect(p.aDesactivar).toHaveLength(0);
  });

  it("dominio ajeno activo se desactiva sin borrar; inactivo se ignora", () => {
    const p = plan_sincronizar_dominios([
      ...semilla_dominios().map((d) => ({ dominio: d.dominio, activo: true })),
      { dominio: "bit.ly", activo: true },
      { dominio: "viejo.com", activo: false },
    ]);
    expect(p.aDesactivar).toEqual(["bit.ly"]);
    expect(p.aInsertar).toHaveLength(0);
  });
});
