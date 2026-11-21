import { describe, expect, it } from "vitest";
import {
  DIAS_RETENCION_CLIENTES,
  elegir_tenants_retencion,
  fecha_cierre,
  type TenantCerrable,
} from "../src/modules/tenants/retencion-clientes.js";
import { POST as postRetencion } from "../src/pages/api/jobs/retencion-clientes.js";

const AHORA = new Date("2026-11-21T12:00:00.000Z");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

function t(p: Partial<TenantCerrable> & { id: string }): TenantCerrable {
  return { estado: "baja", esDemo: false, trialHasta: null, bajaEn: null, ...p };
}

// P10-90: núcleo puro de la retención de 90 días tras el cierre.
describe("P10-90 elegir comercios para la retención de 90 días", () => {
  it("anonimiza a los 91 días del cierre y no a los 89", () => {
    const r = elegir_tenants_retencion([t({ id: "a91", bajaEn: haceDias(91) }), t({ id: "b89", bajaEn: haceDias(89) })], AHORA);
    expect(r.vencidos).toEqual(["a91"]);
  });

  it("el día 90 exacto ya vence", () => {
    expect(DIAS_RETENCION_CLIENTES).toBe(90);
    const r = elegir_tenants_retencion([t({ id: "x", bajaEn: haceDias(90) })], AHORA);
    expect(r.vencidos).toEqual(["x"]);
  });

  it("un comercio activo o suspendido nunca entra, aunque tenga un evento de baja viejo", () => {
    const r = elegir_tenants_retencion(
      [t({ id: "act", estado: "activo", bajaEn: haceDias(400) }), t({ id: "sus", estado: "suspendido", bajaEn: haceDias(400) })],
      AHORA,
    );
    expect(r).toEqual({ vencidos: [], sinFechaCierre: [] });
  });

  it("demo en baja sin evento usa trial_hasta; un comercio real sin evento queda sin fecha", () => {
    const demo = t({ id: "demo", esDemo: true, trialHasta: haceDias(100) });
    const real = t({ id: "real", trialHasta: haceDias(100) });
    expect(fecha_cierre(demo)).toBe(haceDias(100));
    expect(fecha_cierre(real)).toBeNull();
    const r = elegir_tenants_retencion([demo, real], AHORA);
    expect(r).toEqual({ vencidos: ["demo"], sinFechaCierre: ["real"] });
  });

  it("el evento de baja gana sobre trial_hasta", () => {
    const demo = t({ id: "demo", esDemo: true, trialHasta: haceDias(200), bajaEn: haceDias(10) });
    expect(elegir_tenants_retencion([demo], AHORA).vencidos).toEqual([]);
  });
});

describe("P10-90 POST /api/jobs/retencion-clientes", () => {
  it("sin X-Job-Secret responde 403 y no corre", async () => {
    const previo = process.env.JOBS_SECRET;
    process.env.JOBS_SECRET = "secreto-ret90";
    try {
      const req = new Request("http://x/api/jobs/retencion-clientes", { method: "POST" });
      const res = (await postRetencion({ request: req } as Parameters<typeof postRetencion>[0])) as Response;
      expect(res.status).toBe(403);
    } finally {
      if (previo === undefined) delete process.env.JOBS_SECRET;
      else process.env.JOBS_SECRET = previo;
    }
  });
});
