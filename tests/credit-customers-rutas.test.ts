import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { GET as GETCustomers } from "../src/pages/api/credit/customers.js";
import { crearListaMovimientosCredito } from "../src/lib/repos/_almacen.js";
import { resetStore } from "../src/lib/store.js";

function sembrarCliente(customerId: string, key: string): void {
  crearListaMovimientosCredito().agregar({ customer_id: customerId, debe: "0", haber: "0", key });
}

describe("GET /api/credit/customers — listado tenant-scoped con q/limit/cursor", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("lista clientes de memoria con next_cursor", async () => {
    sembrarCliente("cli-uno", "k1");
    sembrarCliente("cli-dos", "k2");
    const r = (await GETCustomers(ctx("http://x/api/credit/customers"))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { items: Array<{ customer_id: string; nombre: string }>; next_cursor: string | null; fuente: string };
    expect(j.items.map((i) => i.customer_id).sort()).toEqual(["cli-dos", "cli-uno"]);
    expect(j.items[0]?.nombre).toBe("cli-dos");
    expect(j.next_cursor).toBeNull();
    expect(j.fuente).toBe("memoria");
  });

  it("filtra por q sin distinguir mayúsculas", async () => {
    sembrarCliente("cli-uno", "k1");
    sembrarCliente("cli-dos", "k2");
    const j = (await ((await GETCustomers(ctx("http://x/api/credit/customers?q=DOS"))) as Response).json()) as {
      items: Array<{ customer_id: string }>;
    };
    expect(j.items.map((i) => i.customer_id)).toEqual(["cli-dos"]);
  });

  it("pagina por offset con limit y devuelve next_cursor", async () => {
    sembrarCliente("cli-uno", "k1");
    sembrarCliente("cli-dos", "k2");
    const primera = (await ((await GETCustomers(ctx("http://x/api/credit/customers?limit=1"))) as Response).json()) as {
      items: unknown[];
      next_cursor: string | null;
    };
    expect(primera.items).toHaveLength(1);
    expect(primera.next_cursor).toBe("1");
    const segunda = (await ((await GETCustomers(ctx("http://x/api/credit/customers?limit=1&cursor=1"))) as Response).json()) as {
      items: unknown[];
      next_cursor: string | null;
    };
    expect(segunda.items).toHaveLength(1);
    expect(segunda.next_cursor).toBeNull();
  });

  it("rechaza limit sobre el tope, cero o no numérico y cursor negativo", async () => {
    for (const query of ["?limit=51", "?limit=0", "?limit=x", "?cursor=-1"]) {
      const r = (await GETCustomers(ctx(`http://x/api/credit/customers${query}`))) as Response;
      expect(r.status, query).toBe(422);
    }
  });
});
