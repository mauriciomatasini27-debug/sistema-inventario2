import { describe, expect, it } from "vitest";
import { diaUTC, fechaAR, horaAR, horaMinutoAR, parseFechaAR, sumarDiasAR, type FechaAR } from "../src/lib/fecha-ar.js";

function f(s: string): FechaAR {
  const v = parseFechaAR(s);
  if (v === null) throw new Error(`fecha de prueba inválida: ${s}`);
  return v;
}

describe("fechaAR: día civil en America/Argentina/Buenos_Aires", () => {
  it("usa la zona AR y no UTC", () => {
    expect(fechaAR(new Date("2026-01-01T02:30:00Z"))).toBe("2025-12-31");
    expect(fechaAR(new Date("2026-01-01T03:30:00Z"))).toBe("2026-01-01");
  });

  it("entre las 21:00 y 23:59 ART el día AR difiere del día UTC", () => {
    const instante = new Date("2026-10-11T01:30:00Z");
    expect(fechaAR(instante)).toBe("2026-10-10");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-10-11");
  });

  it("acepta milisegundos y por defecto usa ahora", () => {
    expect(fechaAR(Date.parse("2026-10-10T12:00:00Z"))).toBe("2026-10-10");
    expect(fechaAR()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("coincide con Intl en-CA en America/Argentina/Buenos_Aires", () => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const casos = [0, 1_700_000_000_000, Date.parse("2026-06-15T02:59:59Z"), Date.parse("2026-06-15T03:00:01Z")];
    for (const ms of casos) expect(fechaAR(new Date(ms))).toBe(fmt.format(new Date(ms)));
  });
});

describe("parseFechaAR: valida YYYY-MM-DD real", () => {
  it("acepta días reales incluido bisiesto", () => {
    expect(parseFechaAR("2026-10-10")).toBe("2026-10-10");
    expect(parseFechaAR("2024-02-29")).toBe("2024-02-29");
  });

  it("rechaza formato o calendario imposible", () => {
    for (const s of ["", "10/10/2026", "2026-1-1", "2026-13-01", "2026-00-10", "2026-02-30", "2023-02-29", "2026-10-32", " 2026-10-10"]) {
      expect(parseFechaAR(s)).toBeNull();
    }
  });
});

describe("sumarDiasAR: aritmética pura de calendario", () => {
  it("suma y resta cruzando mes, año y bisiesto", () => {
    expect(sumarDiasAR(f("2026-10-10"), 1)).toBe("2026-10-11");
    expect(sumarDiasAR(f("2026-10-10"), -10)).toBe("2026-09-30");
    expect(sumarDiasAR(f("2025-12-31"), 1)).toBe("2026-01-01");
    expect(sumarDiasAR(f("2024-02-28"), 1)).toBe("2024-02-29");
    expect(sumarDiasAR(f("2023-02-28"), 1)).toBe("2023-03-01");
    expect(sumarDiasAR(f("2026-10-10"), 0)).toBe("2026-10-10");
  });

  it("no muta la entrada y coincide con aritmética UTC de calendario", () => {
    const base = f("2026-10-10");
    const r = sumarDiasAR(base, 5);
    expect(base).toBe("2026-10-10");
    expect(r).toBe("2026-10-15");
  });
});

describe("horaAR: hora civil en America/Argentina/Buenos_Aires", () => {
  it("deriva la hora del reloj AR, no la UTC", () => {
    expect(horaAR(new Date("2026-10-17T02:00:00Z"))).toBe(23);
    expect(horaAR(new Date("2026-10-17T13:00:00Z"))).toBe(10);
    expect(horaAR(Date.parse("2026-10-17T23:30:00Z"))).toBe(20);
  });

  it("formatea HH:MM con reloj de 24 horas", () => {
    expect(horaMinutoAR(new Date("2026-10-17T02:00:00Z"))).toBe("23:00");
    expect(horaMinutoAR(new Date("2026-10-17T12:05:00Z"))).toBe("09:05");
  });
});

describe("diaUTC: día calendario UTC explícito, sin marca FechaAR", () => {
  it("redondea el instante al día UTC", () => {
    expect(diaUTC(Date.UTC(2026, 9, 14))).toBe("2026-10-14");
    expect(diaUTC(new Date("2026-10-11T01:30:00Z"))).toBe("2026-10-11");
  });
});
