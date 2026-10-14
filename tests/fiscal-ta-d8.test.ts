import { describe, expect, it, vi, beforeEach } from "vitest";
import { crear_kms_fake, kms_desde_env } from "../src/modules/fiscal/kms.js";
import { dummy_ok, parse_dummy_response } from "../src/modules/fiscal/wsfe.js";
import { sql_advisory_lock } from "../src/modules/fiscal/lock.js";

describe("fiscal T1 D8/D3 slice homo", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("kms envelope homo cifra y descifra", async () => {
    const kms = crear_kms_fake();
    const e = await kms.encrypt("clave-secreta");
    expect(e.ciphertextB64.length).toBeGreaterThan(0);
    expect(await kms.decrypt(e)).toBe("clave-secreta");
  });

  it("kms_desde_env null sin clave (nunca fallback plano)", () => {
    expect(kms_desde_env({})).toBeNull();
    expect(kms_desde_env({ FISCAL_KMS_KEY_B64: "corta" })).toBeNull();
  });

  it("dummy parser exige app/db/auth y dummy_ok solo OK", () => {
    expect(parse_dummy_response("<r/>")).toBeNull();
    const ok = parse_dummy_response("<r><appserver>OK</appserver><dbserver>OK</dbserver><authserver>OK</authserver></r>")!;
    expect(dummy_ok(ok)).toBe(true);
    expect(dummy_ok({ ...ok, dbserver: "ERROR" })).toBe(false);
  });

  it("lock advisory SQL usa hashtext por clave cuit:pv:tipo", () => {
    const q = sql_advisory_lock("20933331726:3:11");
    expect(q.sql).toContain("pg_advisory_xact_lock(hashtext");
    expect(q.params).toEqual(["20933331726:3:11"]);
  });
});
