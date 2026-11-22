import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { sesionEnStore } from "./helpers/sesion.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../src/modules/auth/modelo.js";
import { POST as postProducts } from "../src/pages/api/products.js";
import { POST as confirmarImportar } from "../src/pages/api/stock/importar/confirmar.js";
import { registrar_venta } from "../src/modules/sales/registro_venta.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function empleadoConSesion(tenantId: string, sub: string): string {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco T3",
    slug: "kiosco-t3",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-t3",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, {
    id: mid,
    tenantId,
    googleSub: sub,
    rol: "empleado",
    permisos: [...PERMISOS_EMPLEADO_DEFAULT],
    estado: "activo",
  });
  return sesionEnStore(sub, tenantId);
}

function csvConSha(texto: string): FormData {
  const fd = new FormData();
  fd.append("archivo", new Blob([texto], { type: "text/csv" }), "stock.csv");
  fd.append("archivo_sha256", createHash("sha256").update(texto, "utf8").digest("hex"));
  return fd;
}

describe("spec 433 T3: ninguna vía de alta crea un producto pendiente_revision", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("Alta de catálogo explícita: la respuesta y el espejo quedan activos", async () => {
    const plano = empleadoConSesion("t3-explicita", "emp-explicita");
    const r = (await postProducts(
      ctx("http://x/api/products", {
        headers: { cookie: `__Host-sesion=${plano}` },
        body: { sku: "T3-EXP-1", nombre: "Alta explícita", precio_centavos: 1000, codigo: "T3E-1" },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { estado: string }).estado).toBe("activo");
    expect(store.productos.get("T3-EXP-1")?.estado).toBe("activo");
  });

  it("importación de catálogo: las filas nuevas quedan activas", async () => {
    const plano = empleadoConSesion("t3-import", "emp-import");
    const csv = ["sku,nombre,precio,cantidad,sector", "T3-IMP-1,Arroz,1500.00,2,almacen", ""].join("\n");
    const r = (await confirmarImportar(
      ctx("http://x/api/stock/importar/confirmar", {
        method: "POST",
        form: csvConSha(csv),
        headers: { cookie: `__Host-sesion=${plano}`, "Idempotency-Key": "t3-imp-1" },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { filas_nuevas: number }).filas_nuevas).toBe(1);
    expect(store.productos.get("T3-IMP-1")?.estado).toBe("activo");
  });

  it("Alta al vuelo: el Producto provisorio queda activo", async () => {
    const r = await registrar_venta({
      key: crypto.randomUUID(),
      lineas: [{ product_id: "T3-VUELO-1", qty: 1, precio_centavos: 500, alta: { nombre: "Provisorio T3" } }],
      medio: "Efectivo",
      deviceCode: "caja-01",
      seqLocal: 1,
      offline: false,
      clientOccurredAt: new Date().toISOString(),
    });
    expect(r.ok).toBe(true);
    expect(store.productos.get("T3-VUELO-1")?.estado).toBe("activo");
    expect(store.altasAlVender.has("T3-VUELO-1")).toBe(true);
  });
});
