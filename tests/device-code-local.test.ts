import { describe, expect, it } from "vitest";
import { codigoDispositivoLocal, type AlmacenDeviceCode } from "../src/offline/device-code-local.js";

function memoria(seed: Record<string, string> = {}) {
  const datos = new Map(Object.entries(seed));
  const storage: AlmacenDeviceCode = {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave)! : null),
    setItem: (clave, valor) => {
      datos.set(clave, valor);
    },
  };
  return storage;
}

describe("codigoDispositivoLocal", () => {
  it("relee el código que el perfil ya guardó", () => {
    const storage = memoria({ "slice0-device": "caja-ab12", "slice0-seq:t1": "400" });
    expect(codigoDispositivoLocal(storage, () => "no-crear")).toBe("caja-ab12");
    expect(codigoDispositivoLocal(storage, () => "tampoco")).toBe("caja-ab12");
    expect(storage.getItem("slice0-device")).toBe("caja-ab12");
    expect(storage.getItem("slice0-seq:t1")).toBe("400");
  });

  it("crea el código una sola vez y lo vuelve a leer", () => {
    const storage = memoria({ "slice0-seq": "900" });
    const primero = codigoDispositivoLocal(storage, () => "ab12cd34");
    const segundo = codigoDispositivoLocal(storage, () => "otra-cosa");
    expect(primero).toBe("caja-ab12cd34");
    expect(segundo).toBe(primero);
    expect(storage.getItem("slice0-device")).toBe(primero);
    expect(storage.getItem("slice0-seq")).toBe("900");
  });

  it("guarda un código de 4 a 32 y reemplaza uno fuera de rango", () => {
    const vacio = memoria();
    const creado = codigoDispositivoLocal(vacio, () => "x".repeat(100));
    expect(creado.length).toBeGreaterThanOrEqual(4);
    expect(creado.length).toBeLessThanOrEqual(32);
    expect(creado.startsWith("caja-")).toBe(true);
    expect(vacio.getItem("slice0-device")).toBe(creado);

    const corto = memoria({ "slice0-device": "ab" });
    expect(codigoDispositivoLocal(corto, () => "ok12")).toBe("caja-ok12");

    const largo = memoria({ "slice0-device": "y".repeat(33) });
    const reemplazo = codigoDispositivoLocal(largo, () => "ok34");
    expect(reemplazo).toBe("caja-ok34");
    expect(reemplazo.length).toBeLessThanOrEqual(32);

    const justo = "z".repeat(32);
    const tope = memoria({ "slice0-device": justo });
    expect(codigoDispositivoLocal(tope, () => "no")).toBe(justo);

    const minimo = "abcd";
    const piso = memoria({ "slice0-device": minimo });
    expect(codigoDispositivoLocal(piso, () => "no")).toBe(minimo);

    const suelto = memoria();
    const real = codigoDispositivoLocal(suelto);
    expect(real.length).toBeGreaterThanOrEqual(4);
    expect(real.length).toBeLessThanOrEqual(32);
    expect(real.startsWith("caja-")).toBe(true);
    expect(suelto.getItem("slice0-device")).toBe(real);
  });
});
