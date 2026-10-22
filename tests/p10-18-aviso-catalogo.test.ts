import { describe, expect, it } from "vitest";
import {
  avisoCatalogoDescartado,
  claveAvisoCatalogo,
  descartarAvisoCatalogo,
} from "../src/modules/onboarding/catalogo-aviso.js";

class StorageFalso {
  readonly datos = new Map<string, string>();

  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }

  setItem(clave: string, valor: string): void {
    this.datos.set(clave, valor);
  }
}

describe("P10-18 aviso del catálogo sugerido", () => {
  it("descartar en un dispositivo no descarta el aviso en otro del mismo tenant", () => {
    const dispositivoA = new StorageFalso();
    const dispositivoB = new StorageFalso();

    expect(avisoCatalogoDescartado(dispositivoA, "t-1")).toBe(false);
    descartarAvisoCatalogo(dispositivoA, "t-1");

    expect(avisoCatalogoDescartado(dispositivoA, "t-1")).toBe(true);
    expect(dispositivoA.datos.get("stock:aviso-catalogo:t-1")).toBe("1");
    expect(avisoCatalogoDescartado(dispositivoB, "t-1")).toBe(false);
    expect(dispositivoB.datos.size).toBe(0);
  });

  it("aísla el descarte por tenant en el mismo storage", () => {
    const dispositivo = new StorageFalso();

    descartarAvisoCatalogo(dispositivo, "tenant-a");

    expect(avisoCatalogoDescartado(dispositivo, "tenant-a")).toBe(true);
    expect(avisoCatalogoDescartado(dispositivo, "tenant-b")).toBe(false);
    expect(dispositivo.datos.get("stock:aviso-catalogo:tenant-b")).toBeUndefined();
  });

  it("sin tenant no construye clave y descartar no toca el storage", () => {
    const dispositivo = new StorageFalso();

    expect(claveAvisoCatalogo(null)).toBeNull();
    expect(claveAvisoCatalogo(undefined)).toBeNull();
    expect(claveAvisoCatalogo("")).toBeNull();
    expect(claveAvisoCatalogo("tenant-a")).toBe("stock:aviso-catalogo:tenant-a");

    descartarAvisoCatalogo(dispositivo, null);
    descartarAvisoCatalogo(dispositivo, "");

    expect(dispositivo.datos.size).toBe(0);
    expect(avisoCatalogoDescartado(dispositivo, null)).toBe(false);
  });
});
