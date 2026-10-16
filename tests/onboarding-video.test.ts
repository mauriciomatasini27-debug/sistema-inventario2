import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { POST as postVideo } from "../src/pages/api/onboarding/video.js";
import { claveOnboarding } from "../src/modules/onboarding/estado.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    reauthAt: ahoraReal.toISOString(),
  });
  return c.idPlano;
}

function reqVideo(plano: string, cuerpo: unknown) {
  return ctx("http://x/api/onboarding/video", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body: cuerpo as Record<string, unknown>,
  });
}

async function altaLista(plano: string, nombre: string) {
  const r = await postAlta(
    ctx("http://x/api/onboarding/alta", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
      body: { nombre_comercio: nombre, rubro: "kiosco" },
    }),
  );
  expect(r.status).toBe(201);
  return (await r.json()) as { tenant_id: string };
}

beforeEach(() => {
  resetStore();
});

describe("video ON6: medición inicio/50/fin", () => {
  it("403 sin sesión y 403 sin membership", async () => {
    const r403 = await postVideo(
      ctx("http://x/api/onboarding/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { tenant_id: "t", progreso: 5, evento: "inicio" },
      }),
    );
    expect(r403.status).toBe(403);
    const plano = sesionEnStore("externo");
    const rSinPermiso = await postVideo(reqVideo(plano, { tenant_id: "t-ajeno", progreso: 5, evento: "inicio" }));
    expect(rSinPermiso.status).toBe(403);
  });

  it("422 con evento inválido", async () => {
    const plano = sesionEnStore("dueno-v");
    const { tenant_id } = await altaLista(plano, "Kiosco Video");
    const r = await postVideo(reqVideo(plano, { tenant_id, progreso: 5, evento: "rebobinar" }));
    expect(r.status).toBe(422);
  });

  it("inicio guarda progreso y emite video_inicio; fin marca visto", async () => {
    const plano = sesionEnStore("dueno-v2");
    const { tenant_id } = await altaLista(plano, "Kiosco Video Dos");
    const r1 = await postVideo(reqVideo(plano, { tenant_id, progreso: 5, evento: "inicio" }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, visto: false, progreso: 5 });
    const r2 = await postVideo(reqVideo(plano, { tenant_id, progreso: 50, evento: "mitad" }));
    expect(((await r2.json()) as { progreso: number }).progreso).toBe(50);
    const r3 = await postVideo(reqVideo(plano, { tenant_id, progreso: 100, evento: "fin" }));
    expect(await r3.json()).toEqual({ ok: true, visto: true, progreso: 100 });
    const estado = control.onboardingState.get(claveOnboarding("dueno-v2", tenant_id));
    expect(estado?.videoVisto).toBe(true);
    const tipos = control.events.filter((e) => e.tenantId === tenant_id).map((e) => e.tipo);
    expect(tipos).toContain("video_inicio");
    expect(tipos).toContain("video_50");
    expect(tipos).toContain("video_fin");
  });
});
