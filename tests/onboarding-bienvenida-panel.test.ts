import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_PROHIBIDOS_BIENVENIDA_PANEL,
  clave_bienvenida_panel,
  debe_mostrar_bienvenida_panel,
  marcar_bienvenida_panel,
  ya_vio_bienvenida_panel,
} from "../src/modules/onboarding/bienvenida-panel.js";
import { progreso_checklist, estado_paso_dialogo } from "../src/lib/panel-bienvenida.js";

const RAIZ = process.cwd();
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

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
  it("el componente no pide dirección, CUIT, moneda ni cantidad de empleados", () => {
    const html = leer("src/components/panel/BienvenidaDialog.astro").toLowerCase();
    for (const campo of CAMPOS_PROHIBIDOS_BIENVENIDA_PANEL) {
      expect(html, campo).not.toContain(`name="${campo}"`);
      expect(html, campo).not.toContain(`id="${campo}"`);
    }
    expect(html).not.toContain("type=\"number\"");
    expect(html).not.toMatch(/cuil|cuit/i);
  });

  it("panel.astro solo monta el diálogo para Dueño en servidor", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toContain("mostrarBienvenida");
    expect(panel).toContain("esDueno");
    expect(panel).toMatch(/mostrarBienvenida \?/);
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
