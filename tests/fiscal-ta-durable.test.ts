import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { crear_arca_provider, limpiar_ta_cache } from "../src/modules/fiscal/arca-provider.js";
import { generarCertificadoPrueba, opensslDisponible } from "./helpers/openssl-cert.js";

const TIENE_OPENSSL = opensslDisponible();
if (!TIENE_OPENSSL) console.warn("openssl no disponible: se omite tests/fiscal-ta-durable.test.ts");

let certPem = "";
let keyPem = "";

beforeAll(() => {
  if (!TIENE_OPENSSL) return;
  const par = generarCertificadoPrueba();
  certPem = par.certPem;
  keyPem = par.keyPem;
});

function cfg() {
  return { ambiente: "homo" as const, cuitProveedor: "20933331726", certPem, keyPem };
}

beforeEach(() => {
  limpiar_ta_cache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.skipIf(!TIENE_OPENSSL)("TA WSAA persistida", () => {
  it("usa la TA durable de otro worker y no pide login", async () => {
    let login = 0;
    const provider = crear_arca_provider(cfg(), {
      ta: {
        leer: async () => ({ token: "DURABLE", sign: "SIGN-D", expiraEn: Date.now() + 6 * 60 * 60 * 1000 }),
        guardar: async () => {},
      },
      login: async () => {
        login += 1;
        return { token: "NUEVA", sign: "SIGN-N" };
      },
    });

    expect(await provider.get_ta()).toEqual({ token: "DURABLE", sign: "SIGN-D" });
    expect(login).toBe(0);
  });

  it("persiste la TA nueva después del login", async () => {
    const capturada: { valor: { token: string; sign: string; expiraEn: number } | null } = { valor: null };
    const provider = crear_arca_provider(cfg(), {
      ta: {
        leer: async () => null,
        guardar: async (t) => {
          capturada.valor = t;
        },
      },
      login: async () => ({ token: "NUEVA", sign: "SIGN-N" }),
    });

    const ta = await provider.get_ta();
    expect(ta).toEqual({ token: "NUEVA", sign: "SIGN-N" });
    expect(capturada.valor).toMatchObject({ token: "NUEVA", sign: "SIGN-N" });
    expect(capturada.valor?.expiraEn ?? 0).toBeGreaterThan(Date.now());
  });

  it("si la TA durable falla, sigue con el login", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = crear_arca_provider(cfg(), {
      ta: {
        leer: async () => {
          throw new Error("base caida");
        },
        guardar: async () => {},
      },
      login: async () => ({ token: "FALLBACK", sign: "SIGN-F" }),
    });

    expect(await provider.get_ta()).toEqual({ token: "FALLBACK", sign: "SIGN-F" });
  });

  it("una TA durable por vencer se renueva con login", async () => {
    let login = 0;
    const provider = crear_arca_provider(cfg(), {
      ta: {
        leer: async () => ({ token: "VIEJA", sign: "S", expiraEn: Date.now() + 30 * 60 * 1000 }),
        guardar: async () => {},
      },
      login: async () => {
        login += 1;
        return { token: "RENOVADA", sign: "SIGN-R" };
      },
    });

    expect(await provider.get_ta()).toEqual({ token: "RENOVADA", sign: "SIGN-R" });
    expect(login).toBe(1);
  });
});
