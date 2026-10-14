import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { POST as POSTClose } from "../src/pages/api/cash/close.js";
import { resetStore } from "../src/lib/store.js";

function req(key: string, body: unknown) {
  return ctx("http://localhost/api/cash/close", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: body as Record<string, unknown>,
  });
}

describe("C10 notificacion WA caja al cierre", () => {
  beforeEach(() => resetStore());

  it("cierre 201 incluye aviso wa enviado una vez por jornada", async () => {
    const res = (await POSTClose(
      req("c10-k1", { fecha_jornada: "2026-10-10", close_type: "manual" }),
    )) as Response;
    expect(res.status).toBe(201);
    const j = (await res.json()) as {
      fecha_jornada: string;
      total_centavos: string;
      wa: { estado: string; idempotencyKey: string; texto: string };
    };
    expect(j.fecha_jornada).toBe("2026-10-10");
    expect(j.wa.estado).toBe("enviado");
    expect(j.wa.idempotencyKey).toBe("resumen_cierre:wa:demo:2026-10-10");
    expect(j.wa.texto).toContain("2026-10-10");
  });

  it("reintento con misma key devuelve 409 con wa duplicado, sin segundo aviso", async () => {
    const body = { fecha_jornada: "2026-10-11", close_type: "manual" };
    const r1 = (await POSTClose(req("c10-dup", body))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTClose(req("c10-dup", body))) as Response;
    expect(r2.status).toBe(409);
    const j2 = (await r2.json()) as { wa: { estado: string; idempotencyKey: string } };
    expect(j2.wa.estado).toBe("duplicado");
    expect(j2.wa.idempotencyKey).toBe("resumen_cierre:wa:demo:2026-10-11");
  });
});
