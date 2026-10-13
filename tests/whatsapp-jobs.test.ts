import { beforeEach, describe, expect, it } from "vitest";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as POSTAviso } from "../src/pages/api/jobs/whatsapp-aviso.js";
import { POST as POSTSemanal, calculo_vivo } from "../src/pages/api/jobs/whatsapp-semanal.js";
import { POST as POSTLunes, tiendaLunes } from "../src/pages/api/jobs/whatsapp-lunes.js";
import { POST as POSTCierre } from "../src/pages/api/jobs/whatsapp-cierre.js";
import { programar_lunes } from "../src/modules/whatsapp/resumen-semanal.js";
import { fechaBA } from "../src/jobs/whatsapp-aviso-matutino.js";
import { clave_aviso_wa } from "../src/modules/whatsapp/aviso-matutino.js";

const SECRET = "job-secret";

function reqJob(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Job-Secret": SECRET },
    body: body ? JSON.stringify(body) : null,
  });
}

let n = 0;
function comercio(optIn: boolean): { tenantId: string; numero: string; sub: string } {
  n++;
  const tenantId = `t-wa-${n}`;
  const sub = `dueno-${n}`;
  const numero = `+54911000000${String(n).padStart(2, "0")}`;
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: `Kiosco ${n}`,
    slug: `kiosco-${n}`,
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.users.set(sub, { googleSub: sub, email: `${sub}@x.com`, emailVerificado: true });
  control.memberships.set(`m-${n}`, { id: `m-${n}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
  control.botLinks.set(numero, { tenantId, googleSub: sub, estado: "verificado" });
  control.waPrefs.set(`${tenantId}:${sub}`, { optIn, avisoHora: "08:00", pausadoHastaMs: null });
  return { tenantId, numero, sub };
}

async function post(route: typeof POSTAviso, url: string, body?: unknown, secreto = true): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = reqJob(url, body);
  const headers = new Headers(req.headers);
  if (!secreto) headers.delete("X-Job-Secret");
  const res = (await route({ request: new Request(req, { headers }) } as never)) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetStore();
  tiendaLunes.clear();
  process.env.JOBS_SECRET = SECRET;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
});

describe("jobs wa: secreto", () => {
  it("sin secreto rechaza los 4 jobs", async () => {
    for (const [route, url, body] of [
      [POSTAviso, "http://x/api/jobs/whatsapp-aviso", undefined],
      [POSTSemanal, "http://x/api/jobs/whatsapp-semanal", undefined],
      [POSTLunes, "http://x/api/jobs/whatsapp-lunes", undefined],
      [POSTCierre, "http://x/api/jobs/whatsapp-cierre", { tenant_id: "t", fecha_jornada: "2026-10-11" }],
    ] as const) {
      const r = await post(route, url, body, false);
      expect(r.status).toBe(403);
    }
  });
});

describe("job aviso matutino", () => {
  it("sin opt-in omite (B2: ninguna plantilla)", async () => {
    const { tenantId } = comercio(false);
    const r = await post(POSTAviso, "http://x/api/jobs/whatsapp-aviso");
    expect(r.status).toBe(200);
    const resultados = r.json["resultados"] as Array<{ tenant_id: string; estado: string }>;
    expect(resultados.find((x) => x.tenant_id === tenantId)?.estado).toBe("omitido_optout");
  });

  it("sin novedad no sale nada", async () => {
    const { tenantId } = comercio(true);
    store.stock.set("demo-sku-1", 50);
    const r = await post(POSTAviso, "http://x/api/jobs/whatsapp-aviso");
    const resultados = r.json["resultados"] as Array<{ tenant_id: string; estado: string }>;
    expect(resultados.find((x) => x.tenant_id === tenantId)?.estado).toBe("omitido_sin_novedad");
  });

  it("con alerta y sin credenciales registra fallo sin marcar enviado", async () => {
    const { tenantId } = comercio(true);
    const r = await post(POSTAviso, "http://x/api/jobs/whatsapp-aviso");
    const resultados = r.json["resultados"] as Array<{ tenant_id: string; estado: string }>;
    expect(resultados.find((x) => x.tenant_id === tenantId)?.estado).toBe("fallo");
    expect(store.waEnviados.size).toBe(0);
  });

  it("clave ya enviada no se repite en el día", async () => {
    const { tenantId } = comercio(true);
    store.waEnviados.add(clave_aviso_wa(tenantId, fechaBA(new Date())));
    const r = await post(POSTAviso, "http://x/api/jobs/whatsapp-aviso");
    const resultados = r.json["resultados"] as Array<{ tenant_id: string; estado: string }>;
    expect(resultados.find((x) => x.tenant_id === tenantId)?.estado).toBe("omitido_ya_enviado");
  });
});

describe("job resumen semanal", () => {
  it("manda WA+email con el mismo cálculo y no duplica", async () => {
    const { tenantId } = comercio(true);
    const r1 = await post(POSTSemanal, "http://x/api/jobs/whatsapp-semanal");
    expect(r1.status).toBe(200);
    const resultados = r1.json["resultados"] as Array<{ tenant_id: string; canales: Array<{ canal: string; estado: string }> }>;
    const mio = resultados.find((x) => x.tenant_id === tenantId);
    // Sin credenciales WA falla; el email igual sale (canales independientes).
    expect(mio?.canales.find((c) => c.canal === "wa")?.estado).toBe("omitido_pausa");
    expect(mio?.canales.find((c) => c.canal === "email")?.estado).toBe("enviado");
    expect(store.emailOutbox.size).toBe(1);

    const r2 = await post(POSTSemanal, "http://x/api/jobs/whatsapp-semanal");
    const resultados2 = r2.json["resultados"] as Array<{ tenant_id: string; canales: Array<{ canal: string; estado: string }> }>;
    const mio2 = resultados2.find((x) => x.tenant_id === tenantId);
    expect(mio2?.canales.find((c) => c.canal === "email")?.estado).toBe("duplicado");
  });

  it("sin ventas sale igual con la aclaración", () => {
    store.stockMoves = [];
    const c = calculo_vivo();
    expect(c.unidades).toBe(0);
  });
});

describe("job lunes", () => {
  it("sin programados no sale nada; programado reintenta si falla el envío", async () => {
    const v0 = await post(POSTLunes, "http://x/api/jobs/whatsapp-lunes");
    expect(v0.json["resultados"]).toEqual([]);

    const { tenantId } = comercio(true);
    const hoy = fechaBA(new Date());
    const prog = programar_lunes(tiendaLunes, {
      tenantId,
      semanaISO: "2026-W41",
      lunesFecha: hoy,
      calculo: calculo_vivo(),
      ahoraMs: Date.now(),
    });
    expect(prog.status).toBe(201);

    const v1 = await post(POSTLunes, "http://x/api/jobs/whatsapp-lunes");
    const r1 = (v1.json["resultados"] as Array<{ tenant_id: string; estado: string }>).find((x) => x.tenant_id === tenantId);
    expect(r1?.estado).toBe("omitido_pausa");

    // El fallo no se marca: el próximo intento reintenta (reintentable).
    const v2 = await post(POSTLunes, "http://x/api/jobs/whatsapp-lunes");
    const r2 = (v2.json["resultados"] as Array<{ tenant_id: string; estado: string }>).find((x) => x.tenant_id === tenantId);
    expect(r2?.estado).toBe("omitido_pausa");
  });
});

describe("job cierre", () => {
  it("valida secreto, cuerpo, comercio y cierre", async () => {
    const bad = await post(POSTCierre, "http://x/api/jobs/whatsapp-cierre", { tenant_id: "", fecha_jornada: "x" });
    expect(bad.status).toBe(422);
    const sinTenant = await post(POSTCierre, "http://x/api/jobs/whatsapp-cierre", { tenant_id: "nope", fecha_jornada: "2026-10-11" });
    expect(sinTenant.status).toBe(404);
    const { tenantId } = comercio(true);
    const sinCierre = await post(POSTCierre, "http://x/api/jobs/whatsapp-cierre", { tenant_id: tenantId, fecha_jornada: "2026-10-11" });
    expect(sinCierre.status).toBe(404);
  });

  it("sin credenciales no marca la jornada (reintentable)", async () => {
    const { tenantId } = comercio(true);
    store.cierres.set("2026-10-11", {
      cierre: { fechaJornada: "2026-10-11", closeType: "manual", totalCentavos: 10000n, ultimoMovimientoId: null },
    } as never);
    const r = await post(POSTCierre, "http://x/api/jobs/whatsapp-cierre", { tenant_id: tenantId, fecha_jornada: "2026-10-11" });
    expect(r.status).toBe(502);
    expect(r.json["error"]).toBe("sin_credenciales");
    expect(store.waEnviados.size).toBe(0);
  });
});
