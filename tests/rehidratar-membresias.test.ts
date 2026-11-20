import { beforeEach, describe, expect, it } from "vitest";
import { membershipActiva } from "../src/lib/control.js";
import { rehidratarMembresias, type FilaMembresiaDurable } from "../src/lib/rehidratar-membresia.js";
import { control, resetStore } from "../src/lib/store.js";

const SUB = "sub-dueno";
const TENANT = "tenant-1";

function fila(extra: Partial<FilaMembresiaDurable> = {}): FilaMembresiaDurable {
  return {
    id: "mem-1",
    tenantId: TENANT,
    googleSub: SUB,
    rol: "dueno",
    permisos: [],
    puedeUsarBot: true,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estadoTenant: "activo",
    plan: "demo",
    moneda: "ARS",
    ownerGoogleSub: SUB,
    esDemo: true,
    rubro: null,
    requestKey: null,
    trialHasta: null,
    wizardCompletado: false,
    wizardPaso: 0,
    ...extra,
  };
}

describe("rehidratar membresías después de un reinicio", () => {
  beforeEach(() => {
    resetStore();
  });

  it("vuelve a autorizar al dueño cuando la sesión quedó sin comercio", async () => {
    control.sessions.set("hash", {
      idHash: "hash",
      googleSub: SUB,
      tenantId: null,
      expiraAt: "2099-01-01T00:00:00.000Z",
    });

    await rehidratarMembresias(SUB, async () => [fila()]);

    expect(control.sessions.get("hash")?.tenantId).toBe(TENANT);
    expect(membershipActiva(TENANT, SUB)?.rol).toBe("dueno");
    expect(control.tenants.get(TENANT)?.nombreComercio).toBe("Kiosco");
  });

  it("no consulta la base si el comercio ya está en memoria", async () => {
    control.tenants.set(TENANT, {
      id: TENANT,
      nombreComercio: "Kiosco",
      slug: "kiosco",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: SUB,
      esDemo: true,
    });
    control.memberships.set("mem-1", {
      id: "mem-1",
      tenantId: TENANT,
      googleSub: SUB,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    let consultas = 0;

    await rehidratarMembresias(SUB, async () => {
      consultas += 1;
      return [fila({ nombreComercio: "Otro" })];
    });

    expect(consultas).toBe(0);
    expect(control.tenants.get(TENANT)?.nombreComercio).toBe("Kiosco");
  });

  it("deja la memoria vacía si la base no responde", async () => {
    await rehidratarMembresias(SUB, async () => null);

    expect(control.memberships.size).toBe(0);
    expect(control.tenants.size).toBe(0);
  });

  it("rehidrata el rubro del comercio tras un reinicio simulado", async () => {
    control.sessions.set("hash", {
      idHash: "hash",
      googleSub: SUB,
      tenantId: null,
      expiraAt: "2099-01-01T00:00:00.000Z",
    });

    await rehidratarMembresias(SUB, async () => [fila({ rubro: "libreria" })]);

    expect(control.tenants.get(TENANT)?.rubro).toBe("libreria");
  });

  it("comercio viejo sin rubro en DB cae en otro al leer la plantilla", async () => {
    await rehidratarMembresias(SUB, async () => [fila({ rubro: null })]);
    expect(control.tenants.get(TENANT)?.rubro).toBeUndefined();
  });

  it("ON12: hidrata wizardCompletado tras un deploy para no mandar a /onboarding", async () => {
    await rehidratarMembresias(SUB, async () => [fila({ wizardCompletado: true, wizardPaso: 5 })]);

    const estado = control.onboardingState.get(`${SUB}:${TENANT}`);
    expect(estado?.wizardCompletado).toBe(true);
    expect(estado?.wizardPaso).toBe(5);
  });

  it("ON12: comercio nuevo sin wizard queda en paso 0 e incompleto", async () => {
    await rehidratarMembresias(SUB, async () => [fila()]);

    const estado = control.onboardingState.get(`${SUB}:${TENANT}`);
    expect(estado?.wizardCompletado).toBe(false);
    expect(estado?.wizardPaso).toBe(0);
  });

  it("ON12: si la base no responde, no se inventa estado de onboarding", async () => {
    await rehidratarMembresias(SUB, async () => null);

    expect(control.onboardingState.size).toBe(0);
  });

  it("no elige un comercio si la persona tiene más de uno y la sesión no trae tenant", async () => {
    control.sessions.set("hash", {
      idHash: "hash",
      googleSub: SUB,
      tenantId: null,
      expiraAt: "2099-01-01T00:00:00.000Z",
    });

    await rehidratarMembresias(SUB, async () => [
      fila(),
      fila({ id: "mem-2", tenantId: "tenant-2", slug: "otro", nombreComercio: "Otro" }),
    ]);

    expect(control.sessions.get("hash")?.tenantId).toBeNull();
    expect(membershipActiva(TENANT, SUB)?.rol).toBe("dueno");
    expect(membershipActiva("tenant-2", SUB)?.rol).toBe("dueno");
  });
});
