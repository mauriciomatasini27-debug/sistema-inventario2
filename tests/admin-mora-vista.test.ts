import { describe, expect, it } from "vitest";
import { parseFechaAR, sumarDiasAR, type FechaAR } from "../src/lib/fecha-ar.js";
import {
  filasMoraParaTabla,
  particionarMoraVista,
  type TenantAdminListado,
} from "../src/modules/admin/mora-vista.js";

const HOY = parseFechaAR("2026-11-15") as FechaAR;

function tenant(
  id: string,
  estado: string,
  vencimiento: string | null,
  nombre?: string,
): TenantAdminListado {
  return { id, nombre: nombre ?? id, slug: null, estado, vencimiento };
}

describe("vista mora por calendario", () => {
  it("el día 14 sigue en gracia y el día 15 pasa a por suspender", () => {
    const dia14 = `${sumarDiasAR(HOY, -14)}T15:00:00.000Z`;
    const enGracia = particionarMoraVista([tenant("g", "activo", dia14, "Gracia")], HOY);
    expect(enGracia.porCubeta.en_gracia.map((f) => f.diasAtraso)).toEqual([14]);
    expect(enGracia.porCubeta.en_gracia[0]?.accion).toBeNull();
    expect(enGracia.porCubeta.por_suspender).toEqual([]);

    const dia15 = sumarDiasAR(HOY, -15);
    const porSuspender = particionarMoraVista([tenant("p", "activo", dia15, "Tarde")], HOY);
    expect(porSuspender.porCubeta.por_suspender.map((f) => ({ dias: f.diasAtraso, accion: f.accion }))).toEqual([
      { dias: 15, accion: "suspender" },
    ]);
    expect(porSuspender.porCubeta.en_gracia).toEqual([]);
  });

  it("omite al día y a quien no tiene vencimiento", () => {
    const part = particionarMoraVista(
      [
        tenant("sin", "activo", null),
        tenant("hoy", "activo", HOY),
        tenant("maniana", "activo", sumarDiasAR(HOY, 1)),
      ],
      HOY,
    );
    expect(part.totalEnMora).toBe(0);
  });

  it("lista al suspendido aunque no tenga vencimiento y ofrece reactivar", () => {
    const part = particionarMoraVista(
      [
        tenant("s", "suspendido", null, "Kiosco"),
        tenant("f", "suspendido", sumarDiasAR(HOY, 3), "Futuro"),
      ],
      HOY,
    );
    expect(part.porCubeta.suspendido.map((f) => ({ id: f.tenant.id, dias: f.diasAtraso, accion: f.accion }))).toEqual([
      { id: "f", dias: 0, accion: "reactivar" },
      { id: "s", dias: 0, accion: "reactivar" },
    ]);
  });

  it("omite pendiente y baja aunque el vencimiento ya pasó", () => {
    const tarde = sumarDiasAR(HOY, -20);
    const part = particionarMoraVista(
      [tenant("pen", "pendiente", tarde), tenant("baj", "baja", tarde)],
      HOY,
    );
    expect(part.totalEnMora).toBe(0);
  });

  it("todos respeta el orden de cubetas y un filtro deja una sola", () => {
    const part = particionarMoraVista(
      [
        tenant("z", "suspendido", null, "Zeta"),
        tenant("b", "activo", sumarDiasAR(HOY, -3), "Beta"),
        tenant("a", "activo", sumarDiasAR(HOY, -2), "Alfa"),
        tenant("p", "activo", sumarDiasAR(HOY, -15), "Por"),
      ],
      HOY,
    );
    const todos = filasMoraParaTabla(part, "todos");
    expect(todos.map((f) => f.tenant.nombre)).toEqual(["Alfa", "Beta", "Por", "Zeta"]);
    expect(todos.map((f) => f.cubeta)).toEqual(["en_gracia", "en_gracia", "por_suspender", "suspendido"]);
    expect(todos.find((f) => f.cubeta === "en_gracia")?.accion).toBeNull();
    expect(filasMoraParaTabla(part, "por_suspender").map((f) => f.tenant.id)).toEqual(["p"]);
    expect(filasMoraParaTabla(part, "en_gracia")).toHaveLength(2);
    expect(filasMoraParaTabla(part, "suspendido")).toHaveLength(1);
  });
});
