import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { getControlDb } from "../src/lib/db.js";
import { arcaTokens, fiscalComputers } from "../src/db/schema-fiscal-control.js";
import {
  guardarComputadorFiscal,
  guardarTaFiscal,
  leerComputadorFiscal,
  leerTaFiscal,
} from "../src/lib/repos/fiscal-control.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const ALIAS = `pg-fiscal-${Date.now().toString(36)}`;

describe.skipIf(!hayPG)("store drizzle del control fiscal", () => {
  let url = "";

  beforeAll(async () => {
    url = await asegurarBasePrivada("pers_ficontrol", process.env.PG_TEST_URL_A ?? "");
    process.env.CONTROL_DATABASE_URL = url;
    process.env.FISCAL_KMS_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(async () => {
    if (url) {
      await getControlDb().delete(arcaTokens).where(eq(arcaTokens.ambiente, "homo"));
      await getControlDb().delete(fiscalComputers).where(eq(fiscalComputers.alias, ALIAS));
    }
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.FISCAL_KMS_KEY_B64;
  });

  const cfg = {
    ambiente: "homo" as const,
    alias: ALIAS,
    cuitProveedor: "20933331726",
    certPem: "CERT-PUBLICO",
    keyPem: "CLAVE-SECRETA",
  };

  it("el alta repetida devuelve el id persistido y la TA vuelve descifrada", async () => {
    const id1 = await guardarComputadorFiscal(cfg);
    const id2 = await guardarComputadorFiscal(cfg);
    expect(id2).toBe(id1);

    const expiraEn = Date.now() + 6 * 60 * 60 * 1000;
    await guardarTaFiscal(cfg, { token: "TOKEN-1", sign: "SIGN-1", expiraEn });

    const computador = await leerComputadorFiscal("homo", ALIAS);
    expect(computador).toMatchObject({
      id: id1,
      cuitProveedor: "20933331726",
      certPem: "CERT-PUBLICO",
      keyPem: "CLAVE-SECRETA",
    });
    expect(await leerTaFiscal(cfg)).toEqual({ token: "TOKEN-1", sign: "SIGN-1", expiraEn });
  });
});
