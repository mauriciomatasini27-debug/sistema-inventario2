import { describe, expect, it } from "vitest";
import { ctx } from "./ctx.js";
import { GET as GETExport } from "../../src/pages/api/cash/export.js";

describe("ctx helper", () => {
  it("arma un Request real sobre la url pedida", async () => {
    const c = ctx("/api/cash/history?medio=Efectivo");
    expect(c.request).toBeInstanceOf(Request);
    expect(c.request.url).toBe("http://localhost/api/cash/history?medio=Efectivo");
    expect(c.url.href).toBe("http://localhost/api/cash/history?medio=Efectivo");
    expect(c.request.headers).toBeDefined();
    expect(await c.request.text()).toBe("");
  });

  it("respeta url absoluta, metodo y headers", () => {
    const c = ctx("http://x/api/credit/balance?customer_id=cli-1", {
      method: "POST",
      headers: { "Idempotency-Key": "k-1" },
    });
    expect(c.request.method).toBe("POST");
    expect(c.request.headers.get("Idempotency-Key")).toBe("k-1");
    expect(c.url.searchParams.get("customer_id")).toBe("cli-1");
  });

  it("serializa body objeto como JSON con content-type", async () => {
    const c = ctx("http://x/api/sales", { body: { medio: "Efectivo" } });
    expect(c.request.method).toBe("POST");
    expect(c.request.headers.get("content-type")).toContain("application/json");
    expect(await c.request.json()).toEqual({ medio: "Efectivo" });
  });

  it("pasa body string tal cual", async () => {
    const c = ctx("http://x/api/sales", { method: "POST", body: "hola" });
    expect(await c.request.text()).toBe("hola");
  });

  it("expone params, locals, clientAddress, site y redirect", () => {
    const c = ctx("http://x/job/1", { params: { id: "1" }, locals: { t: "a" } });
    expect(c.params).toEqual({ id: "1" });
    expect(c.locals).toEqual({ t: "a" });
    expect(c.clientAddress).toBe("127.0.0.1");
    expect(c.site).toBeUndefined();
    const r = c.redirect("/login");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/login");
  });

  it("usa params y locals vacios por defecto", () => {
    const c = ctx("http://x/api/health");
    expect(c.params).toEqual({});
    expect(c.locals).toEqual({});
  });

  it("ofrece cookies get/has/set/delete", () => {
    const c = ctx("http://x/api/sales", { cookies: { s: "plano-1" } });
    expect(c.cookies.get("s")?.value).toBe("plano-1");
    expect(c.cookies.has("s")).toBe(true);
    c.cookies.set("nueva", "v");
    expect(c.cookies.get("nueva")?.value).toBe("v");
    c.cookies.delete("s");
    expect(c.cookies.has("s")).toBe(false);
  });

  it("sirve para llamar un handler que exige request con headers", async () => {
    const res = (await GETExport(ctx("/api/cash/export"))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
  });
});
