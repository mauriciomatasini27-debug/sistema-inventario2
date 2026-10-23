import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { limpiarAlertasStockMemoria, registrarAlertasStock } from "../src/lib/repos/whatsapp.js";
import { POST } from "../src/pages/api/alertas/armar-pedido.js";
import { fechaAR, viernesDe, asegurarLinea, claveBorrador, destinoDeAlerta } from "../src/modules/alertas/armar-pedido.js";
import { cerrarOrden, crearOrden, type PurchaseOrder } from "../src/modules/purchases/proveedores.js";
const TENANT = "t-1";
const CUIT = "20933331726";
const SUB = "duena-alr-s5";

function sesion(rol: "dueno" | "empleado"): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: SUB, tenantId: TENANT, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: SUB,
    tenantId: TENANT,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  control.memberships.set(`m-${SUB}`, {
    id: `m-${SUB}`,
    tenantId: TENANT,
    googleSub: SUB,
    rol,
    permisos: [],
    estado: "activo",
  });
  return c.idPlano;
}

function pedir(body: Record<string, unknown>, cookie?: string) {
  return POST(
    ctx("http://x/api/alertas/armar-pedido", {
      method: "POST",
      body,
      ...(cookie ? { headers: { cookie: `__Host-sesion=${cookie}` } } : {}),
    }),
  );
}

function prepararProducto(sku: string, stock: number, umbral: number): void {
  conTenant(TENANT, () => {
    store.stock.set(sku, stock);
    store.prices.set(sku, 5000);
    store.productos.set(sku, {
      sku,
      nombre: sku === "yerba" ? "Yerba" : sku,
      precioCentavos: 5000,
      sector: "general",
      locationId: null,
      archivado: false,
      controlaVencimiento: false,
      estado: "activo",
      minStock: umbral,
      reorderQty: null,
    });
    store.suppliers.set(`sup-${CUIT}`, {
      id: `sup-${CUIT}`,
      cuit: CUIT,
      nombre: "Distribuidora Sur",
      email: null,
      telefono: null,
      activo: true,
      creadoEn: "2026-01-01T00:00:00.000Z",
      actualizadoEn: "2026-01-01T00:00:00.000Z",
    });
  });
}

async function alerta(sku: string, fecha: string, urgente: boolean): Promise<void> {
  await registrarAlertasStock(TENANT, fecha, [
    { sku, nombre: sku === "yerba" ? "Yerba" : sku, stock: 2, umbral: 10, urgente },
  ]);
}

beforeEach(() => {
  resetStore();
  limpiarAlertasStockMemoria();
  delete process.env.TENANT_DATABASE_URL;
  prepararProducto("yerba", 2, 10);
});

describe("ALR-S5 ancla de viernes (puro)", () => {
  it("jueves va al viernes siguiente; viernes queda; sábado al viernes próximo", () => {
    expect(viernesDe(fechaAR("2026-10-22")!)).toBe("2026-10-23");
    expect(viernesDe(fechaAR("2026-10-23")!)).toBe("2026-10-23");
    expect(viernesDe(fechaAR("2026-10-24")!)).toBe("2026-10-30");
  });
});

describe("ALR-S5 armar pedido desde historial", () => {
  it("sin sesión 401 y empleado 403", async () => {
    expect((await pedir({ sku: "yerba", fecha: "2026-10-22" })).status).toBe(401);
    expect((await pedir({ sku: "yerba", fecha: "2026-10-22" }, sesion("empleado"))).status).toBe(403);
  });

  it("rechaza cuerpo con urgente (schema estricto)", async () => {
    await alerta("yerba", "2026-10-22", false);
    const r = await pedir({ sku: "yerba", fecha: "2026-10-22", urgente: true }, sesion("dueno"));
    expect(r.status).toBe(422);
  });

  it("segundo toque mismo sku no duplica línea", async () => {
    await alerta("yerba", "2026-10-22", false);
    const cookie = sesion("dueno");
    const r1 = await pedir({ sku: "yerba", fecha: "2026-10-22" }, cookie);
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { order_id: string };
    const r2 = await pedir({ sku: "yerba", fecha: "2026-10-22" }, cookie);
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as { order_id: string; reusado: boolean };
    expect(j2.reusado).toBe(true);
    expect(j2.order_id).toBe(j1.order_id);
    conTenant(TENANT, () => {
      const oc = store.purchaseOrders.get(j1.order_id);
      expect(oc?.lineas).toHaveLength(1);
      expect(oc?.lineas[0]?.qty).toBe(13);
    });
  });

  it("segundo sku en el mismo borrador agrega una línea", async () => {
    prepararProducto("azucar", 3, 10);
    await alerta("yerba", "2026-10-22", false);
    await alerta("azucar", "2026-10-22", false);
    const cookie = sesion("dueno");
    const r1 = await pedir({ sku: "yerba", fecha: "2026-10-22" }, cookie);
    expect(r1.status).toBe(201);
    const id = ((await r1.json()) as { order_id: string }).order_id;
    const r2 = await pedir({ sku: "azucar", fecha: "2026-10-22" }, cookie);
    expect(r2.status).toBe(201);
    conTenant(TENANT, () => {
      const oc = store.purchaseOrders.get(id);
      expect(oc?.lineas.map((l) => l.sku).sort()).toEqual(["azucar", "yerba"]);
    });
  });

  it("borrador cerrado no crece (409)", async () => {
    await alerta("yerba", "2026-10-22", false);
    const destino = destinoDeAlerta(false, "2026-10-22");
    const clave = claveBorrador(CUIT, destino);
    conTenant(TENANT, () => {
      const base = crearOrden({
        idempotencyKey: clave,
        supplierCuit: CUIT,
        lineas: [{ sku: "yerba", qty: 5, costoCentavos: 100n }],
        creadoPor: SUB,
        ahoraIso: "2026-10-22T12:00:00.000Z",
        vistos: new Map(),
      });
      expect(base.status).toBe(201);
      const cerrada = cerrarOrden(
        { ...base.orden, esSemanal: true, origen: "web" },
        SUB,
        "2026-10-22T13:00:00.000Z",
      );
      expect(cerrada.ok).toBe(true);
      store.orderVistos.set(clave, cerrada.orden);
      store.purchaseOrders.set(cerrada.orden.id, cerrada.orden);
    });
    const r = await pedir({ sku: "yerba", fecha: "2026-10-22" }, sesion("dueno"));
    expect(r.status).toBe(409);
    conTenant(TENANT, () => {
      expect(store.purchaseOrders.get(`oc-${clave}`)?.lineas).toHaveLength(1);
    });
  });

  it("urgente usa bucket ahora con esSemanal false", async () => {
    await alerta("yerba", "2026-10-22", true);
    const r = await pedir({ sku: "yerba", fecha: "2026-10-22" }, sesion("dueno"));
    expect(r.status).toBe(201);
    const j = (await r.json()) as { order_id: string; destino: string };
    expect(j.destino).toBe("ahora");
    conTenant(TENANT, () => {
      const oc = store.purchaseOrders.get(j.order_id);
      expect(oc?.esSemanal).toBe(false);
      expect(oc?.origen).toBe("web");
      expect(oc?.idempotencyKey).toBe("alerta-borrador:v1:20933331726:ahora:2026-10-22");
    });
  });

  it("asegurarLinea no suma cantidad en reusado", () => {
    const clave = "alerta-borrador:v1:20933331726:viernes:2026-10-23";
    const plan = {
      clave,
      supplierCuit: CUIT,
      proveedorNombre: "Dist",
      esSemanal: true,
      destino: "viernes" as const,
      linea: { sku: "yerba", qty: 99, costoCentavos: 50n },
      creadoPor: SUB,
      ahoraIso: "2026-10-22T12:00:00.000Z",
      producto: "Yerba",
    };
    const abierta = {
      id: `oc-${clave}`,
      idempotencyKey: clave,
      supplierCuit: CUIT,
      estado: "abierta" as const,
      lineas: [{ sku: "yerba", qty: 13, costoCentavos: 50n }],
      totalCentavos: 650n,
      creadoPor: SUB,
      creadoEn: "2026-10-22T12:00:00.000Z",
      cerradoEn: null,
      esSemanal: true,
      origen: "web" as const,
    };
    const r = asegurarLinea(plan, { estado: "abierta", orden: abierta }, new Map<string, PurchaseOrder>());
    expect(r.tipo).toBe("ya_estaba");
    if (r.tipo === "ya_estaba") expect(r.orden.lineas[0]?.qty).toBe(13);
  });
});
