import { beforeEach, describe, expect, it } from "vitest";
import { control } from "../src/lib/store.js";
import { guardarEleccion, prefsDe } from "../src/lib/repos/alerta-prefs.js";

// Repo de preferencias en memoria (sin DB): el canal elegido tiene que
// guardarse y volver tal cual, y faltar => "email".
const T = "t-canal-mem";
const S = "sub-canal-mem";

describe("alerta-prefs en memoria guarda canal", () => {
  beforeEach(() => control.waPrefs.clear());

  it("sin preferencias devuelve canal email por defecto", async () => {
    expect((await prefsDe(T, S)).canal).toBe("email");
  });

  it("guarda y devuelve el canal elegido", async () => {
    await guardarEleccion({ tenantId: T, googleSub: S, pedido: { canal: "whatsapp", avisoHora: "09:00", pausadoHastaMs: null } });
    expect(control.waPrefs.get(`${T}:${S}`)?.canal).toBe("whatsapp");
    const p = await prefsDe(T, S);
    expect(p.canal).toBe("whatsapp");
    expect(p.avisoHora).toBe("09:00");
    await guardarEleccion({ tenantId: T, googleSub: S, pedido: { canal: "ambos", avisoHora: "09:00", pausadoHastaMs: null } });
    expect((await prefsDe(T, S)).canal).toBe("ambos");
  });

  it("entrada vieja sin canal cae a email", async () => {
    control.waPrefs.set(`${T}:${S}`, { optIn: true, avisoHora: "07:00", pausadoHastaMs: null });
    const p = await prefsDe(T, S);
    expect(p.canal).toBe("email");
    expect(p.optIn).toBe(true);
  });
});
