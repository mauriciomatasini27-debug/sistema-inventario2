import { afterEach, describe, expect, it } from "vitest";
import { resetStore, store, type StoredFiscalDoc } from "../src/lib/store.js";
import { PREFIJOS_DATOS, gateTenantDatos } from "../src/lib/tenant-context.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { asegurarFiscalDoc } from "../src/lib/fiscal-db.js";

afterEach(() => {
  delete process.env.TENANT_MODE;
});

function doc(key: string): StoredFiscalDoc {
  return {
    id: crypto.randomUUID(), idempotency_key: key, sale_id: "v", cbte_tipo: "11", pto_vta: "3", cbte_nro: 1,
    cbte_fch: "20261013", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "autorizado",
    cae: null, cae_vto: null, qr_payload: null,
  } as StoredFiscalDoc;
}

describe("ISO-02 arch-test: ninguna ruta de datos corre sin tenant en multi", () => {
  it("cada prefijo de datos (y una subruta) responde 403 sin sesión en multi", async () => {
    process.env.TENANT_MODE = "multi";
    for (const p of PREFIJOS_DATOS) {
      for (const ruta of [p, `${p}/x`]) {
        const g = gateTenantDatos(new Request(`http://x${ruta}`), ruta);
        expect(g, ruta).not.toBeNull();
        expect(g?.ok, ruta).toBe(false);
        if (g && !g.ok) expect(g.respuesta.status, ruta).toBe(403);
      }
    }
  });

  it("un prefijo parecido no es ruta de datos (sin falsos positivos)", () => {
    process.env.TENANT_MODE = "multi";
    expect(gateTenantDatos(new Request("http://x/api/salesforce"), "/api/salesforce")).toBeNull();
  });
});

describe("ISO-S8 dueño desde el contexto", () => {
  it("en multi dentro de conTenant el doc sin tenant_id queda con el tenant del contexto", async () => {
    resetStore();
    process.env.TENANT_MODE = "multi";
    const r = await conTenant("tenant-a", () => asegurarFiscalDoc(doc("k-ctx")));
    expect(r.doc.tenant_id).toBe("tenant-a");
    expect(conTenant("tenant-a", () => store.fiscalDocs.size)).toBe(0);
  });
});
