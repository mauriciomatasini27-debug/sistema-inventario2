import { describe, expect, it, beforeEach } from "vitest";
import { resetStore } from "../src/lib/store.js";
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

function req(url: string, key: string | null, body: unknown, method = "POST") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Idempotency-Key"] = key;
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}

async function crearVenta(key = "ts-1") {
  const r = await postSales({
    request: req("http://x/api/sales", key, ventaBody()),
  } as never);
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
    const sinKey = await postLink({
      request: new Request("http://x/api/tickets/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: "nope" }),
      }),
    } as never);
    expect(sinKey.status).toBe(422);

    const fantasma = await postLink({
      request: req("http://x/api/tickets/link", "lk-fantasma", { sale_id: "venta-inexistente" }),
    } as never);
    expect(fantasma.status).toBe(404);
  });

  it("POST OK => 201 token 22 chars + url; retry misma key => 409 sin re-emitir plano", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink({
      request: req("http://x/api/tickets/link", "lk-1", { sale_id }),
    } as never);
    expect(r.status).toBe(201);
    const j = (await r.json()) as { token: string; url: string };
    expect(j.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(j.url).toContain(j.token);

    const retry = await postLink({
      request: req("http://x/api/tickets/link", "lk-1", { sale_id }),
    } as never);
    expect(retry.status).toBe(409);
    const jr = (await retry.json()) as Record<string, unknown>;
    expect(jr).not.toHaveProperty("token");
  });

  it("GET token válido => 200 con leyenda; token roto => 404", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink({
      request: req("http://x/api/tickets/link", "lk-get", { sale_id }),
    } as never);
    const { token } = (await r.json()) as { token: string };

    const ok = await getLink({ request: new Request(`http://x/api/tickets/link?token=${token}`) } as never);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { leyenda: string }).leyenda).toBe("DOCUMENTO NO VÁLIDO COMO FACTURA");

    const roto = await getLink({ request: new Request("http://x/api/tickets/link?token=***roto***") } as never);
    expect(roto.status).toBe(404);
  });

  it("núcleo puro: expirado y revocado => 410", async () => {
    const { sale_id } = await crearVenta();
    const r = await postLink({
      request: req("http://x/api/tickets/link", "lk-410", { sale_id }),
    } as never);
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
    await postLink({ request: req("http://x/api/tickets/link", "lk-rev", { sale_id }) } as never);
    const body = { sale_id, actor: "dueno", motivo: "perdido" };
    const r = await deleteLink({ request: req("http://x/api/tickets/link", "rev-1", body, "DELETE") } as never);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { revocadas: number }).revocadas).toBeGreaterThanOrEqual(1);

    const retry = await deleteLink({ request: req("http://x/api/tickets/link", "rev-1", body, "DELETE") } as never);
    expect(retry.status).toBe(409);
  });
});

describe("ticket salida: render (TV10)", () => {
  it("POST totales que no cuadran => 422", async () => {
    const r = await postRender({
      request: req("http://x/api/tickets/render", "irrelevante", renderBody({
        ticket: {
          kind: "online",
          definitivo: "T-000001",
          provisorio: "P-1",
          totalCentavos: "15001",
          medio: "Efectivo",
        },
      })),
    } as never);
    expect(r.status).toBe(422);
  });

  it("POST válido => 200 con html+text+qrPayload y leyenda presente", async () => {
    const r = await postRender({
      request: req("http://x/api/tickets/render", "irrelevante", renderBody()),
    } as never);
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
    const r = await postCompartir({
      request: req("http://x/api/tickets/compartir", "sh-404", { sale_id: "venta-inexistente", toE164: "+5491100000000" }),
    } as never);
    expect(r.status).toBe(404);
  });

  it("POST con toE164 inválido => 422", async () => {
    const { sale_id } = await crearVenta();
    const r = await postCompartir({
      request: req("http://x/api/tickets/compartir", "sh-422", { sale_id, toE164: "no-es-telefono" }),
    } as never);
    expect(r.status).toBe(422);
  });

  it("POST válido => 200 con wa_me_url https://wa.me/", async () => {
    const { sale_id } = await crearVenta("ts-share");
    const r = await postCompartir({
      request: req("http://x/api/tickets/compartir", "sh-ok", { sale_id, toE164: "+5491100000000" }),
    } as never);
    expect(r.status).toBe(200);
    const j = (await r.json()) as { wa_me_url: string };
    expect(j.wa_me_url.startsWith("https://wa.me/")).toBe(true);
  });
});
