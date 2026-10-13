import { describe, expect, it } from "vitest";
import { crear_padron_stub_homo } from "../src/modules/fiscal/padron.js";

describe("fiscal padrón stub homo (FE-S9)", () => {
  it("devuelve RI y monotributo conocidos, null resto/inválido", async () => {
    const p = crear_padron_stub_homo();
    expect((await p.constancia("20-93333172-6"))?.condIva).toBe(1);
    expect((await p.constancia("27293331729"))?.condIva).toBe(6);
    expect(await p.constancia("20111111111")).toBeNull();
    expect(await p.constancia("no-cuit")).toBeNull();
  });
});
