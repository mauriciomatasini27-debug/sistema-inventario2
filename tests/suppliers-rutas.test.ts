import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { GET as GETSuppliers, POST as POSTSupplier } from "../src/pages/api/suppliers.js";
import { POST as POSTOrder } from "../src/pages/api/purchase-orders.js";
import { resetStore } from "../src/lib/store.js";

const CUIT = "20-93333172-6";

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

function req(url: string, key: string | null, body: unknown) {
  return ctx(url, {
    method: "POST",
    headers: key !== null ? { "Idempotency-Key": key } : {},
    body: body as Record<string, unknown>,
  });
}

describe("suppliers + orders PERS-S4 (sin DB no rompe)", () => {
  it("alta 201 + duplicado 409 y orden 201 idempotente", async () => {
    const s1 = await POSTSupplier(
      req("http://x/api/suppliers", null, { cuit: CUIT, nombre: "Distribuidora Sur" }),
    );
    expect(s1.status).toBe(201);
    const s2 = await POSTSupplier(
      req("http://x/api/suppliers", null, { cuit: CUIT, nombre: "Distribuidora Sur" }),
    );
    expect(s2.status).toBe(409);

    const o1 = await POSTOrder(
      req("http://x/api/purchase-orders", "oc-t1", {
        supplier_cuit: CUIT,
        lineas: [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }],
        creado_por: "d",
      }),
    );
    expect(o1.status).toBe(201);
    expect(((await o1.json()) as Record<string, unknown>)["total_centavos"]).toBe("16480000");
    const o2 = await POSTOrder(
      req("http://x/api/purchase-orders", "oc-t1", {
        supplier_cuit: CUIT,
        lineas: [{ sku: "yerba", qty: 10, costo_centavos: 1648000 }],
        creado_por: "d",
      }),
    );
    expect(o2.status).toBe(409);
  });
});

async function alta(cuit: string, nombre: string): Promise<void> {
  const r = await POSTSupplier(req("http://x/api/suppliers", null, { cuit, nombre }));
  expect(r.status).toBe(201);
}

describe("GET /api/suppliers — listado tenant-scoped con q/limit/cursor", () => {
  beforeEach(() => {
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });

  it("lista proveedores de memoria con next_cursor", async () => {
    await alta("20933331726", "Distribuidora Sur");
    await alta("30712345671", "Almacen Norte");
    const r = (await GETSuppliers(ctx("http://x/api/suppliers"))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { items: Array<Record<string, unknown>>; next_cursor: string | null; fuente: string };
    expect(j.items.map((i) => i.nombre).sort()).toEqual(["Almacen Norte", "Distribuidora Sur"]);
    expect(j.items[0]?.cuit).toBeDefined();
    expect(j.next_cursor).toBeNull();
    expect(j.fuente).toBe("memoria");
  });

  it("filtra por q sin distinguir mayúsculas, en nombre o CUIT", async () => {
    await alta("20933331726", "Distribuidora Sur");
    await alta("30712345671", "Almacen Norte");
    const porNombre = (await ((await GETSuppliers(ctx("http://x/api/suppliers?q=SUR"))) as Response).json()) as {
      items: Array<{ nombre: string }>;
    };
    expect(porNombre.items.map((i) => i.nombre)).toEqual(["Distribuidora Sur"]);
    const porCuit = (await ((await GETSuppliers(ctx("http://x/api/suppliers?q=30712345"))) as Response).json()) as {
      items: Array<{ nombre: string }>;
    };
    expect(porCuit.items.map((i) => i.nombre)).toEqual(["Almacen Norte"]);
  });

  it("pagina por offset con limit y devuelve next_cursor", async () => {
    await alta("20933331726", "A Sur");
    await alta("30712345671", "B Norte");
    await alta("20111111112", "C Centro");
    const primera = (await ((await GETSuppliers(ctx("http://x/api/suppliers?limit=2"))) as Response).json()) as {
      items: unknown[];
      next_cursor: string | null;
    };
    expect(primera.items).toHaveLength(2);
    expect(primera.next_cursor).toBe("2");
    const segunda = (await ((await GETSuppliers(ctx("http://x/api/suppliers?limit=2&cursor=2"))) as Response).json()) as {
      items: unknown[];
      next_cursor: string | null;
    };
    expect(segunda.items).toHaveLength(1);
    expect(segunda.next_cursor).toBeNull();
  });

  it("rechaza limit sobre el tope, cero o no numérico y cursor negativo", async () => {
    for (const query of ["?limit=51", "?limit=0", "?limit=x", "?cursor=-1"]) {
      const r = (await GETSuppliers(ctx(`http://x/api/suppliers${query}`))) as Response;
      expect(r.status, query).toBe(422);
    }
  });
});
