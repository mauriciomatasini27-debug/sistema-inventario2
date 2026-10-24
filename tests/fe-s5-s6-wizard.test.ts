import { beforeEach, describe, expect, it } from "vitest";
import { probar_delegacion } from "../src/modules/fiscal/wsfe.js";
import {
  aplicar_resultado_prueba_delegacion,
  cola_fiscal_pausada,
  confirmar_delegacion,
  limpiar_estado_wizard_volatil,
  mensaje_delegacion_dueno,
  revocar_delegacion_en_comercio,
  wizard_inicial,
} from "../src/modules/fiscal/wizard.js";

beforeEach(() => {
  limpiar_estado_wizard_volatil();
});

describe("FE-S5/S6 wizard delegación", () => {
  it("probar_delegacion con 601 devuelve Falta confirmar delegación", async () => {
    const r = await probar_delegacion(
      "homo",
      { token: "t", sign: "s", cuit: "20123456789" },
      3,
      11,
      {
        fe_dummy: async () => ({ appserver: "OK", dbserver: "OK", authserver: "OK" }),
        fe_param_get_ptos_venta: async () => [3],
        fe_ultimo: async () => {
          throw new Error("ARCA Error 601 notAuthorized");
        },
      },
    );
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("Falta confirmar delegación");
    expect(r.motivo).not.toMatch(/Error 601/);
  });

  it("tras Ya lo hice el dueño ve espera del proveedor", () => {
    const w = confirmar_delegacion(wizard_inicial());
    expect(mensaje_delegacion_dueno(w)).toContain("confirmando tu alta");
  });

  it("revocación pausa la cola y avisa", () => {
    const w = confirmar_delegacion(wizard_inicial());
    const { wizard, aviso } = revocar_delegacion_en_comercio(w, "tenant-z");
    expect(wizard.delegacion).toBe("revocada");
    expect(cola_fiscal_pausada("tenant-z")).toBe(true);
    expect(aviso.length).toBeGreaterThan(20);
  });

  it("prueba técnica ok activa el comercio", () => {
    let w = confirmar_delegacion(wizard_inicial());
    w = aplicar_resultado_prueba_delegacion(w, { ok: true, motivo: "delegación activa" });
    expect(w.delegacion).toBe("activa");
  });
});
