import { describe, expect, it } from "vitest";
import {
  clave_bienvenida_panel,
  debe_mostrar_bienvenida_panel,
  marcar_bienvenida_panel,
  ya_vio_bienvenida_panel,
} from "../src/modules/onboarding/bienvenida-panel.js";
import { progreso_checklist, estado_paso_dialogo } from "../src/lib/panel-bienvenida.js";

describe("bienvenida panel BIEN-S2", () => {
  it("Dueño sin marca debe ver el diálogo", () => {
    expect(
      debe_mostrar_bienvenida_panel({
        esDueno: true,
        tenantId: "t-1",
        googleSub: "g-1",
        yaVio: false,
      }),
    ).toBe(true);
  });

  it("empleado nunca debe ver el diálogo", () => {
    expect(
      debe_mostrar_bienvenida_panel({
        esDueno: false,
        tenantId: "t-1",
        googleSub: "g-2",
        yaVio: false,
      }),
    ).toBe(false);
  });

  it("recarga con marca localStorage no vuelve a mostrar", () => {
    const storage = new Map<string, string>();
    const mem: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => {
        storage.set(k, v);
      },
    };
    marcar_bienvenida_panel(mem, "t-1", "g-1");
    expect(clave_bienvenida_panel("t-1", "g-1")).toBe("bienvenida:panel:t-1:g-1");
    expect(ya_vio_bienvenida_panel(mem, "t-1", "g-1")).toBe(true);
    expect(
      debe_mostrar_bienvenida_panel({
        esDueno: true,
        tenantId: "t-1",
        googleSub: "g-1",
        yaVio: ya_vio_bienvenida_panel(mem, "t-1", "g-1"),
      }),
    ).toBe(false);
  });
});

describe("bienvenida panel BIEN-S3 contenido", () => {
  it("TB-165: un paso no aplica se muestra como No aplica sin depender del Set local", () => {
    expect(
      estado_paso_dialogo(
        { id: "empleado", titulo: "Invitá a un empleado", contador: null, listo: false, noAplica: true },
        false,
      ),
    ).toBe("No aplica");
  });

  it("progreso y estado de paso son legibles", () => {
    expect(progreso_checklist(2, 4)).toBe("2 de 4 listos");
    expect(
      estado_paso_dialogo(
        { id: "productos", titulo: "Cargá tus primeros 10 productos", contador: "4 de 10", listo: false },
        false,
      ),
    ).toBe("4 de 10");
    expect(
      estado_paso_dialogo(
        { id: "empleado", titulo: "Invitá a un empleado", contador: null, listo: false },
        true,
      ),
    ).toBe("No aplica");
  });
});
