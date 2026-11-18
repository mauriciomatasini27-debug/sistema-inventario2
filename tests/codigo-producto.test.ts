import { describe, expect, it, vi } from "vitest";
import { normalizarCodigo, reemplazarCodigo, type PersistenciaCodigos } from "../src/lib/repos/codigo-producto.js";

function persistenciaFalsa(extra: Partial<PersistenciaCodigos> = {}): PersistenciaCodigos {
  return {
    async codigoViejo() {
      return null;
    },
    async dueno() {
      return null;
    },
    async borrar() {},
    async guardar() {},
    ...extra,
  };
}

describe("Código de producto", () => {
  it("normaliza el código a mayúsculas sin espacios", () => {
    expect(normalizarCodigo("  c5a1 ")).toBe("C5A1");
    expect(normalizarCodigo("   ")).toBeNull();
  });

  it("un choque único al guardar devuelve CODIGO_DUPLICADO", async () => {
    const persistencia = persistenciaFalsa({
      async guardar() {
        throw Object.assign(new Error("unique violation"), { code: "23505" });
      },
    });
    expect(await reemplazarCodigo("SKU-1", "C1", persistencia)).toEqual({ ok: false, codigo: "CODIGO_DUPLICADO" });
  });

  it("un fallo al borrar el código viejo se registra y frena sin guardar el nuevo", async () => {
    const guardados: string[] = [];
    const persistencia = persistenciaFalsa({
      async codigoViejo() {
        return "C-VIEJO";
      },
      async borrar() {
        throw new Error("db down");
      },
      async guardar(_sku, codigo) {
        guardados.push(codigo);
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(reemplazarCodigo("SKU-1", "C-NUEVO", persistencia)).rejects.toThrow("db down");
    expect(guardados).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[codigo-producto]"), expect.any(Error));
    warn.mockRestore();
  });

  it("cambiar de código borra el viejo antes de guardar el nuevo", async () => {
    const operaciones: string[] = [];
    const persistencia = persistenciaFalsa({
      async codigoViejo() {
        return "C-VIEJO";
      },
      async borrar(_sku, codigo) {
        operaciones.push(`borrar:${codigo}`);
      },
      async guardar(_sku, codigo) {
        operaciones.push(`guardar:${codigo}`);
      },
    });
    expect(await reemplazarCodigo("SKU-1", "c-nuevo", persistencia)).toEqual({ ok: true });
    expect(operaciones).toEqual(["borrar:C-VIEJO", "guardar:C-NUEVO"]);
  });
});
