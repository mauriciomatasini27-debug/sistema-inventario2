import { describe, expect, it } from "vitest";
import {
  DIAS_AVISO_PREVIO,
  DIAS_RETENCION_CLIENTES,
  elegir_tenants_retencion,
  fecha_cierre,
  type TenantCerrable,
} from "../src/modules/tenants/retencion-clientes.js";
import { POST as postRetencion } from "../src/pages/api/jobs/retencion-clientes.js";
import { ejecutarVerificacionHash } from "../src/jobs/verificar-hash.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";

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
    expect(r).toEqual({ vencidos: [], sinFechaCierre: [], avisar: [] });
  });

  it("demo en baja sin evento usa trial_hasta; un comercio real sin evento queda sin fecha", () => {
    const demo = t({ id: "demo", esDemo: true, trialHasta: haceDias(100) });
    const real = t({ id: "real", trialHasta: haceDias(100) });
    expect(fecha_cierre(demo)).toBe(haceDias(100));
    expect(fecha_cierre(real)).toBeNull();
    const r = elegir_tenants_retencion([demo, real], AHORA);
    expect(r).toEqual({ vencidos: ["demo"], sinFechaCierre: ["real"], avisar: [] });
  });

  it("el evento de baja gana sobre trial_hasta", () => {
    const demo = t({ id: "demo", esDemo: true, trialHasta: haceDias(200), bajaEn: haceDias(10) });
    expect(elegir_tenants_retencion([demo], AHORA).vencidos).toEqual([]);
  });
});

describe("P10-90 aviso previo al borrado", () => {
  it("avisa en la última semana antes de los 90 días, no antes ni después", () => {
    expect(DIAS_AVISO_PREVIO).toBe(7);
    const r = elegir_tenants_retencion(
      [
        t({ id: "d82", bajaEn: haceDias(82) }),
        t({ id: "d83", bajaEn: haceDias(83) }),
        t({ id: "d89", bajaEn: haceDias(89) }),
        t({ id: "d90", bajaEn: haceDias(90) }),
      ],
      AHORA,
    );
    expect(r.avisar.map((a) => a.id)).toEqual(["d83", "d89"]);
    expect(r.vencidos).toEqual(["d90"]);
    const d83 = r.avisar.find((a) => a.id === "d83");
    expect(d83?.borradoEn).toBe(new Date(AHORA.getTime() + 7 * 86_400_000).toISOString());
  });
});

describe("P10-90 verificar-hash con filas anonimizadas por la retención", () => {
  it("acepta una fila anonimizada si el encadenado sigue sano y detecta una fila adulterada", () => {
    resetAdmin();
    try {
      ejecutarVerificacionHash(AHORA);
      ejecutarVerificacionHash(AHORA);
      ejecutarVerificacionHash(AHORA);
      const [primera, segunda] = adminStore.actos;
      if (!primera || !segunda) throw new Error("faltan actos");
      primera.actorGoogleSub = "anonimizado";
      primera.detalle = { kind: primera.actoKind, anonimizado: true } as unknown as typeof primera.detalle;
      expect(ejecutarVerificacionHash(AHORA).ok).toBe(true);
      // P10-90: sin el actor anonimizado la marca no alcanza: cuenta como adulterada.
      segunda.detalle = { kind: segunda.actoKind, anonimizado: true } as unknown as typeof segunda.detalle;
      const r = ejecutarVerificacionHash(AHORA);
      expect(r.ok).toBe(false);
      expect(r.primeraRota).toBe(segunda.hash);
    } finally {
      resetAdmin();
    }
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
