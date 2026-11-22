import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilaRotacion, SkuRot } from "../src/modules/analytics/tipos.js";
import { control, resetStore } from "../src/lib/store.js";
import { ctx } from "./helpers/ctx.js";

const estado = vi.hoisted(() => ({
  enviados: [] as Array<{ destino: string; texto: string }>,
  filas: [] as FilaRotacion[],
}));

vi.mock("../src/jobs/whatsapp-adaptador.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/jobs/whatsapp-adaptador.js")>();
  return {
    ...real,
    enviar_texto_wa: async (destino: string, texto: string) => {
      estado.enviados.push({ destino, texto });
      return true;
    },
  };
});

vi.mock("../src/jobs/resumen-rotacion.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/jobs/resumen-rotacion.js")>();
  return { ...real, filas_rotacion: () => estado.filas };
});

import { POST } from "../src/pages/api/jobs/whatsapp-semanal.js";
import { sugerencias_promos_rotacion } from "../src/jobs/promos-semanales.js";

const SECRET = "promos-semanal-secret";

function dormido(over: Partial<FilaRotacion> = {}): FilaRotacion {
  return {
    sku: "d1" as SkuRot,
    nombre: "Alfajor",
    categoria: null,
    ubicacion: null,
    bruto: 3,
    devuelto: 0,
    neto: 3,
    diasConVenta: 3,
    diasEfectivos: 7,
    diasSinVenta: 45,
    stockInicial: 12,
    stockFinal: 12,
    stockPromedio: 12,
    rotacion: 0.25,
    ventaDiaria: 0.4,
    ventaSemanal: 3,
    ventaMensual: 12,
    coberturaDias: 30,
    vecesRepuesto: 0,
    costoCentavos: 25000n,
    valorizadoCentavos: 300000n,
    ingresosCentavos: 120000n,
    gananciaCentavos: 45000n,
    margenBp: 3750,
    markupBp: 6000,
    pocosDatos: false,
    motivoPocosDatos: null,
    ultimaVenta: "2026-09-01",
    archivado: false,
    esNuevo: false,
    nuncaVendido: false,
    ...over,
  };
}

let n = 0;

beforeEach(() => {
  resetStore();
  estado.enviados = [];
  estado.filas = [];
  process.env.JOBS_SECRET = SECRET;
  n++;
  const tenantId = `t-promos-semanal-${n}`;
  const sub = `dueno-promos-semanal-${n}`;
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco Promos",
    slug: `kiosco-promos-${n}`,
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.users.set(sub, { googleSub: sub, email: "dueno@x.com", emailVerificado: true });
  control.memberships.set(`m-promos-${n}`, {
    id: `m-promos-${n}`,
    tenantId,
    googleSub: sub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.botLinks.set(`+549110000099${n}`, { tenantId, googleSub: sub, estado: "verificado" });
  control.waPrefs.set(`${tenantId}:${sub}`, { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
});

async function correrSemanal(): Promise<void> {
  const r = (await POST(
    ctx("http://x/api/jobs/whatsapp-semanal", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Job-Secret": SECRET },
    }),
  )) as Response;
  expect(r.status).toBe(200);
}

describe("resumen semanal: bloque de promos RT9", () => {
  it("incluye la sugerencia RT9 del dormido en el texto del resumen", async () => {
    estado.filas = [dormido()];
    await correrSemanal();
    expect(estado.enviados).toHaveLength(1);
    const texto = estado.enviados[0]?.texto ?? "";
    expect(texto).toContain("Promos:");
    expect(texto).toContain("Alfajor");
    expect(texto).toContain("2da unidad al 10%");
    expect(texto).toContain("Ver promos:");
  });

  it("sin dormidos no agrega el bloque de promos", async () => {
    await correrSemanal();
    expect(estado.enviados).toHaveLength(1);
    expect(estado.enviados[0]?.texto ?? "").not.toContain("Promos:");
  });

  it("RT9 recorta el descuento cuando el piso de costo no permite el 20%", () => {
    const sugerencias = sugerencias_promos_rotacion([
      dormido({ diasSinVenta: 95, costoCentavos: 34000n }),
    ]);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0]?.detalle).toContain("2da unidad al 15%");
    expect(sugerencias[0]?.detalle).toContain("recortado por piso de costo");
  });

  it("RT9 descarta el candidato si ningún descuento respeta el piso", () => {
    expect(sugerencias_promos_rotacion([dormido({ costoCentavos: 39000n })])).toEqual([]);
  });
});
