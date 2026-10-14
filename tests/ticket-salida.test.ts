import { describe, expect, it, beforeEach } from "vitest";
import { resetStore } from "../src/lib/store.js";
import { ctx } from "./helpers/ctx.js";
import { POST as postSales } from "../src/pages/api/sales.js";
import { POST as postLink, GET as getLink, DELETE as deleteLink } from "../src/pages/api/tickets/link.js";
import { POST as postRender } from "../src/pages/api/tickets/render.js";
import { POST as postCompartir } from "../src/pages/api/tickets/compartir.js";
import { resolver_link } from "../src/modules/sales/ticket_link.js";

beforeEach(() => {
  resetStore();
});

function ventaBody(over: Record<string, unknown> = {}) {
  return {
    lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 15000 }],
    medio: "Efectivo",
    device_code: "caja-01",
    seq_local: 1,
    client_occurred_at: new Date().toISOString(),
    offline: false,
    ...over,
  };
}

async function crearVenta(key = "ts-1") {
  const r = await postSales(
    ctx("http://x/api/sales", { body: ventaBody(), headers: { "Idempotency-Key": key } }),
  );
  expect(r.status).toBe(201);
  return (await r.json()) as { sale_id: string };
}

function renderBody(over: Record<string, unknown> = {}) {
  return {
    comercio: "Demo",
    ticket: {
      kind: "online",
      definitivo: "T-000001",
      provisorio: "P-1",
      totalCentavos: "15000",
      medio: "Efectivo",
    },
    lineas: [
      {
        sku: "demo-sku-1",
        cantidad: 1,
        brutoCentavos: "15000",
        descLineaCentavos: "0",
        descTicketCentavos: "0",
        netoCentavos: "15000",
      },
    ],
    linkPublico: "https://x/t/abcdefghijklmnopqrstuv",
    fechaIso: new Date().toISOString(),
    ...over,
  };
}

describe("ticket salida: link (TV9)", () => {
  it("POST sin Idempotency-Key => 422; con venta inexistente => 404", async () => {
    const sinKey = await postLink(ctx("http://x/api/tickets/link", { body: { sale_id: "nope" } }));
    expect(sinKey.status).toBe(422);

    const fantasma = await postLink(
      ctx("http://x/api/tickets/link", { body: { sale_id: "venta-inexistente" }, headers: { "Idempotency-Key": "lk-fantasma" } }),
    );
    expect(fantasma.status).toBe(404);
  });

  it("POST OK => 201 token 22 chars + url; retry misma key => 409 sin re-emitir plano", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink(
      ctx("http://x/api/tickets/link", { body: { sale_id }, headers: { "Idempotency-Key": "lk-1" } }),
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { token: string; url: string };
    expect(j.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(j.url).toContain(j.token);

    const retry = await postLink(
      ctx("http://x/api/tickets/link", { body: { sale_id }, headers: { "Idempotency-Key": "lk-1" } }),
    );
    expect(retry.status).toBe(409);
    const jr = (await retry.json()) as Record<string, unknown>;
    expect(jr).not.toHaveProperty("token");
  });

  it("GET token válido => 200 con leyenda; token roto => 404", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink(
      ctx("http://x/api/tickets/link", { body: { sale_id }, headers: { "Idempotency-Key": "lk-get" } }),
    );
    const { token } = (await r.json()) as { token: string };

    const ok = await getLink(ctx(`http://x/api/tickets/link?token=${token}`));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { leyenda: string }).leyenda).toBe("DOCUMENTO NO VÁLIDO COMO FACTURA");

    const roto = await getLink(ctx("http://x/api/tickets/link?token=***roto***"));
    expect(roto.status).toBe(404);
  });

  it("núcleo puro: expirado y revocado => 410", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink(
      ctx("http://x/api/tickets/link", { body: { sale_id }, headers: { "Idempotency-Key": "lk-410" } }),
    );
    const { token } = (await r.json()) as { token: string };
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const { store } = await import("../src/lib/store.js");
    const link = store.ticketLinksByHash.get(hash);
    expect(link).toBeDefined();

    const expirado = resolver_link({
      tokenPlano: token,
      tokenHash: hash,
      nowMs: (link?.expiraAtMs ?? 0) + 1,
      porHash: store.ticketLinksByHash,
      revocadas: new Set(),
    });
    expect(expirado.ok).toBe(false);
    if (!expirado.ok) expect(expirado.status).toBe(410);

    const revocado = resolver_link({
      tokenPlano: token,
      tokenHash: hash,
      nowMs: Date.now(),
      porHash: store.ticketLinksByHash,
      revocadas: new Set([link?.id ?? ""]),
    });
    expect(revocado.ok).toBe(false);
    if (!revocado.ok) {
      expect(revocado.status).toBe(410);
      expect(revocado.codigo).toBe("REVOCADO");
    }
  });

  it("DELETE revoke => 200 con revocadas N; retry => 409", async () => {
    const { sale_id } = await crearVenta();
    await postLink(ctx("http://x/api/tickets/link", { body: { sale_id }, headers: { "Idempotency-Key": "lk-rev" } }));
    const body = { sale_id, actor: "dueno", motivo: "perdido" };
    const r = await deleteLink(ctx("http://x/api/tickets/link", { method: "DELETE", body, headers: { "Idempotency-Key": "rev-1" } }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { revocadas: number }).revocadas).toBeGreaterThanOrEqual(1);

    const retry = await deleteLink(ctx("http://x/api/tickets/link", { method: "DELETE", body, headers: { "Idempotency-Key": "rev-1" } }));
    expect(retry.status).toBe(409);
  });
});

describe("ticket salida: render (TV10)", () => {
  it("POST totales que no cuadran => 422", async () => {
    const r = await postRender(
      ctx("http://x/api/tickets/render", {
        body: renderBody({
          ticket: {
            kind: "online",
            definitivo: "T-000001",
            provisorio: "P-1",
            totalCentavos: "15001",
            medio: "Efectivo",
          },
        }),
        headers: { "Idempotency-Key": "irrelevante" },
      }),
    );
    expect(r.status).toBe(422);
  });

  it("POST válido => 200 con html+text+qrPayload y leyenda presente", async () => {
    const r = await postRender(
      ctx("http://x/api/tickets/render", { body: renderBody(), headers: { "Idempotency-Key": "irrelevante" } }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as { html: string; text: string; qrPayload: string };
    expect(typeof j.html).toBe("string");
    expect(typeof j.text).toBe("string");
    expect(j.qrPayload).toContain("https://");
    expect(j.html).toContain("DOCUMENTO NO VÁLIDO COMO FACTURA");
    expect(j.text).toContain("DOCUMENTO NO VÁLIDO COMO FACTURA");
  });
});

describe("ticket salida: compartir (TV11)", () => {
  it("POST sin sale => 404", async () => {
    const r = await postCompartir(
      ctx("http://x/api/tickets/compartir", { body: { sale_id: "venta-inexistente", toE164: "+5491100000000" }, headers: { "Idempotency-Key": "sh-404" } }),
    );
    expect(r.status).toBe(404);
  });

  it("POST con toE164 inválido => 422", async () => {
    const { sale_id } = await crearVenta();
    const r = await postCompartir(
      ctx("http://x/api/tickets/compartir", { body: { sale_id, toE164: "no-es-telefono" }, headers: { "Idempotency-Key": "sh-422" } }),
    );
    expect(r.status).toBe(422);
  });

  it("POST válido => 200 con wa_me_url https://wa.me/", async () => {
    const { sale_id } = await crearVenta("ts-share");
    const r = await postCompartir(
      ctx("http://x/api/tickets/compartir", { body: { sale_id, toE164: "+5491100000000" }, headers: { "Idempotency-Key": "sh-ok" } }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as { wa_me_url: string };
    expect(j.wa_me_url.startsWith("https://wa.me/")).toBe(true);
  });
});
