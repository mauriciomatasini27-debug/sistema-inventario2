import { describe, expect, it } from "vitest";
import {
  alcanceHistorial,
  cursorDe,
  filaVisible,
  LARGO_VISTA,
  parsearConsultaHistorial,
  personasDelFiltro,
  TOPE_TEXTO,
  truncarParaGuardar,
} from "../src/modules/bot/historial.js";
import { inicioDiaAR } from "../src/modules/planes/ciclo.js";
import type { FechaAR } from "../src/lib/fecha-ar.js";

const sesionDueno = { tenantId: "t1", rol: "dueno" as const, googleSub: "dueno-sub" };
const sesionEmp = { tenantId: "t1", rol: "empleado" as const, googleSub: "emp-sub" };

describe("parsearConsultaHistorial fechas AR y cursor", () => {
  it("desde y hasta convierten a ms con hasta exclusivo al día siguiente", () => {
    const r = parsearConsultaHistorial(
      { persona: null, desde: "2026-03-15", hasta: "2026-03-16", cursor: null },
      sesionDueno,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consulta.desdeMs).toBe(inicioDiaAR("2026-03-15" as FechaAR).getTime());
    expect(r.consulta.hastaMsExcl).toBe(inicioDiaAR("2026-03-17" as FechaAR).getTime());
  });

  it("fecha inválida devuelve error fecha", () => {
    expect(parsearConsultaHistorial({ persona: null, desde: "x", hasta: null, cursor: null }, sesionDueno).ok).toBe(false);
  });

  it("cursor inválido devuelve error cursor", () => {
    const r = parsearConsultaHistorial({ persona: null, desde: null, hasta: null, cursor: "!!!" }, sesionDueno);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("cursor");
  });

  it("cursor válido round-trip con cursorDe", () => {
    const c = cursorDe({ creadoEnMs: 100, id: "uuid-1" });
    const r = parsearConsultaHistorial({ persona: null, desde: null, hasta: null, cursor: c }, sesionDueno);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consulta.cursor).toBe(c);
  });
});

describe("alcanceHistorial", () => {
  it("empleado siempre es uno aunque el query traiga otra persona", () => {
    const consulta = {
      tenantId: "t1",
      rol: "empleado" as const,
      googleSub: "emp-sub",
      persona: "otro-sub",
      desdeMs: null,
      hastaMsExcl: null,
      cursor: null,
    };
    expect(alcanceHistorial(consulta)).toEqual({ tipo: "uno", googleSub: "emp-sub" });
  });

  it("dueño sin persona ve todos", () => {
    const consulta = {
      tenantId: "t1",
      rol: "dueno" as const,
      googleSub: "dueno-sub",
      persona: null,
      desdeMs: null,
      hastaMsExcl: null,
      cursor: null,
    };
    expect(alcanceHistorial(consulta)).toEqual({ tipo: "todos" });
  });

  it("dueño con persona filtra esa persona", () => {
    const consulta = {
      tenantId: "t1",
      rol: "dueno" as const,
      googleSub: "dueno-sub",
      persona: "emp-sub",
      desdeMs: null,
      hastaMsExcl: null,
      cursor: null,
    };
    expect(alcanceHistorial(consulta)).toEqual({ tipo: "uno", googleSub: "emp-sub" });
  });
});

describe("filaVisible enmascara y recorta", () => {
  it("el teléfono enmascarado no contiene el E.164 completo", () => {
    const f = filaVisible({
      id: "1",
      creadoEnMs: 1,
      numeroE164: "+5491155551234",
      pregunta: "hola",
      respuesta: "chau",
      fuente: "db",
    });
    expect(f.telefono).not.toContain("55551234");
    expect(f.pregunta).toBe("hola");
  });

  it("recorta pregunta y respuesta a LARGO_VISTA", () => {
    const largo = "x".repeat(LARGO_VISTA + 50);
    const f = filaVisible({
      id: "1",
      creadoEnMs: 1,
      numeroE164: "+5491100000000",
      pregunta: largo,
      respuesta: largo,
      fuente: "memoria",
    });
    expect(f.pregunta.length).toBeLessThanOrEqual(LARGO_VISTA);
    expect(f.respuesta.length).toBeLessThanOrEqual(LARGO_VISTA);
  });
});

describe("personasDelFiltro", () => {
  it("empleado no recibe lista", () => {
    expect(
      personasDelFiltro({
        rol: "empleado",
        memberships: [{ googleSub: "e", rol: "empleado", estado: "activo", nombre: "Ana" }],
      }),
    ).toBeNull();
  });

  it("dueño ve activos con dueños primero", () => {
    const p = personasDelFiltro({
      rol: "dueno",
      memberships: [
        { googleSub: "e", rol: "empleado", estado: "activo", nombre: "Ana" },
        { googleSub: "d", rol: "dueno", estado: "activo", nombre: "Dueño" },
        { googleSub: "x", rol: "empleado", estado: "inactivo", nombre: "Fuera" },
      ],
    });
    expect(p?.map((x) => x.googleSub)).toEqual(["d", "e"]);
  });
});

describe("truncarParaGuardar", () => {
  it("respeta TOPE_TEXTO", () => {
    expect(truncarParaGuardar("a".repeat(TOPE_TEXTO + 100)).length).toBeLessThanOrEqual(TOPE_TEXTO);
  });
});
