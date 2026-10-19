import { beforeEach, describe, expect, it, vi } from "vitest";
import { crear_kms_fake } from "../src/modules/fiscal/kms.js";
import { storeFiscalControlMemoria, type FiscalControlStore } from "../src/lib/fiscal-control-almacen.js";
import {
  guardarComputadorFiscal,
  guardarTaFiscal,
  leerComputadorFiscal,
  leerTaFiscal,
} from "../src/lib/repos/fiscal-control.js";

const CFG = {
  ambiente: "homo" as const,
  cuitProveedor: "20933331726",
  certPem: "CERT-PUBLICO",
  keyPem: "CLAVE-SECRETA",
};

beforeEach(() => {
  delete process.env.FISCAL_KMS_KEY_B64;
});

describe("persistencia fiscal control", () => {
  it("guarda el computador con la clave cifrada y la recupera", async () => {
    const store = storeFiscalControlMemoria();
    const deps = { almacen: store, kms: crear_kms_fake() };

    await guardarComputadorFiscal({ ...CFG, alias: "homo-principal" }, deps);

    const fila = await store.buscarComputador("homo", "homo-principal");
    expect(fila?.certPem).toBe("CERT-PUBLICO");
    expect(fila?.keyCiphertext).not.toBe("CLAVE-SECRETA");
    const leido = await leerComputadorFiscal("homo", "homo-principal", deps);
    expect(leido).toMatchObject({ cuitProveedor: CFG.cuitProveedor, certPem: "CERT-PUBLICO", keyPem: "CLAVE-SECRETA" });
  });

  it("la TA se guarda cifrada y se lee mientras no venció", async () => {
    const deps = {
      almacen: storeFiscalControlMemoria(),
      kms: crear_kms_fake(),
      ahora: () => new Date("2026-10-19T18:00:00Z"),
    };
    const expiraEn = Date.parse("2026-10-19T20:00:00Z");
    await guardarTaFiscal(CFG, { token: "TOKEN", sign: "SIGN", expiraEn }, deps);

    expect(await leerTaFiscal(CFG, deps)).toEqual({ token: "TOKEN", sign: "SIGN", expiraEn });
  });

  it("la TA vencida no se usa", async () => {
    const deps = {
      almacen: storeFiscalControlMemoria(),
      kms: crear_kms_fake(),
      ahora: () => new Date("2026-10-19T21:00:00Z"),
    };
    await guardarTaFiscal(CFG, { token: "T", sign: "S", expiraEn: Date.parse("2026-10-19T20:00:00Z") }, deps);
    expect(await leerTaFiscal(CFG, deps)).toBeNull();
  });

  it("sin computador no hay TA durable", async () => {
    const deps = { almacen: storeFiscalControlMemoria(), kms: crear_kms_fake() };
    expect(await leerTaFiscal(CFG, deps)).toBeNull();
  });

  it("sin FISCAL_KMS_KEY_B64 no cae a texto plano", async () => {
    const store = storeFiscalControlMemoria();
    await expect(guardarComputadorFiscal({ ...CFG, alias: "x" }, { almacen: store })).rejects.toThrow("FISCAL_KMS_KEY_B64");
  });

  it("sin control DB avisa y sigue con memoria", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const leido = await leerTaFiscal(CFG, { kms: crear_kms_fake() });
    expect(leido).toBeNull();
    expect(warn).toHaveBeenCalledWith("fiscal: control DB no disponible, uso memoria", "Falta CONTROL_DATABASE_URL");
  });

  it("un ambiente invalido en la fila corta con error nombrado", async () => {
    const fila = {
      id: "c1",
      ambiente: "qa",
      alias: "x",
      cuitProveedor: CFG.cuitProveedor,
      certPem: "CERT-PUBLICO",
      keyCiphertext: "cifrado",
      kmsKeyId: "k",
      notAfter: null,
    };
    const almacen: FiscalControlStore = {
      async guardarComputador() {
        return "c1";
      },
      async buscarComputador() {
        return fila;
      },
      async guardarTa() {},
      async buscarTa() {
        return null;
      },
    };
    await expect(leerComputadorFiscal("homo", "x", { almacen, kms: crear_kms_fake() })).rejects.toThrow(
      "ambiente invalido en fiscal_computers: qa",
    );
  });
});
