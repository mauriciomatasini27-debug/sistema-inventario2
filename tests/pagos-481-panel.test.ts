import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { reiniciarAltaCatalogo, sesionDe, tenantConMiembro } from "./helpers/alta-catalogo.js";
import { GET as getPayees, POST as postPayee } from "../src/pages/api/payees.js";
import { GET as getOrders } from "../src/pages/api/payment-orders.js";
import { POST as postPrepare } from "../src/pages/api/payment-orders/prepare.js";
import { POST as postConfirm } from "../src/pages/api/payment-orders/confirm-paid.js";

const TENANT = "t-pagos-481";
const SUB = "dueno-pagos-481";

function conSesion(url: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) {
  return ctx(url, {
    ...(body !== undefined ? { body } : {}),
    headers: { cookie: `__Host-sesion=${sesionDe(SUB, TENANT)}`, ...headers },
  });
}

describe("#481 /panel/pagos: APIs de soporte", () => {
  beforeEach(() => {
    reiniciarAltaCatalogo();
    process.env.DEFAULT_TENANT_ID = TENANT;
    tenantConMiembro(TENANT, SUB, "dueno");
  });

  afterEach(() => {
    delete process.env.DEFAULT_TENANT_ID;
  });

  it("lista payees activos y prepara/lista una orden", async () => {
    const alta = (await postPayee(
      conSesion("http://x/api/payees", {
        nombre: "Distribuidora Sur",
        tipo: "proveedor",
        medio_preferido: "Transferencia",
        alias: "distri.sur",
      }),
    )) as Response;
    expect(alta.status).toBe(201);
    const { payee_id } = (await alta.json()) as { payee_id: string };

    const payees = (await getPayees(conSesion("http://x/api/payees"))) as Response;
    expect(payees.status).toBe(200);
    const jp = (await payees.json()) as { items: Array<{ payee_id: string; nombre: string }> };
    expect(jp.items.find((p) => p.payee_id === payee_id)).toMatchObject({ nombre: "Distribuidora Sur" });

    const prep = (await postPrepare(
      conSesion(
        "http://x/api/payment-orders/prepare",
        {
          payee_id,
          concepto: "Servicio de limpieza",
          monto_centavos: 25000,
          vence_el_ms: Date.now() + 86_400_000,
          medio_sugerido: "Transferencia",
          instruccion: "transferencia",
          creado_por: "panel-web",
        },
        { "Idempotency-Key": "pagos-481-prep" },
      ),
    )) as Response;
    expect(prep.status).toBe(201);

    const lista = (await getOrders(conSesion("http://x/api/payment-orders"))) as Response;
    expect(lista.status).toBe(200);
    const jl = (await lista.json()) as {
      items: Array<{ order_id: string; numero: string; monto_centavos: string; estado: string; version: number }>;
    };
    expect(jl.items).toHaveLength(1);
    const orden = jl.items[0]!;
    expect(orden).toMatchObject({ numero: "OP-0001", monto_centavos: "25000", estado: "preparada" });

    const confirm = (await postConfirm(
      conSesion(
        "http://x/api/payment-orders/confirm-paid",
        {
          order_id: orden.order_id,
          version_esperada: orden.version,
          monto_pagado_centavos: 25000,
          medio: "Transferencia",
          actor: "panel-web",
        },
        { "Idempotency-Key": "pagos-481-confirm" },
      ),
    )) as Response;
    expect(confirm.status).toBe(200);

    const lista2 = (await getOrders(conSesion("http://x/api/payment-orders"))) as Response;
    const jl2 = (await lista2.json()) as { items: Array<{ estado: string }> };
    expect(jl2.items[0]?.estado).toBe("pagada");
  });

  it("la pantalla existe, llama a las rutas de pago y explica la convivencia", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/pages/panel/pagos.astro", "utf8");
    expect(src).toContain("PanelShell");
    expect(src).toContain('fetch("/api/payees")');
    expect(src).toContain('fetch("/api/payment-orders")');
    expect(src).toContain('fetch("/api/payment-orders/prepare"');
    expect(src).toContain('fetch("/api/payment-orders/confirm-paid"');
    expect(src).toContain('fetch("/api/payment-orders/cancel"');
    expect(src).toContain('href="/panel/proveedores"');
    expect(src).toContain("facturas de proveedor");
  });
});
