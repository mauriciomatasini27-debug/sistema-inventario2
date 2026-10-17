import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("ConfirmDialog: diálogo accesible con <dialog> nativo", () => {
  const astro = leer("src/components/ui/ConfirmDialog.astro");
  const dom = leer("src/lib/confirmar-dom.ts");

  it("usa showModal y cierra con Esc como cancelación", () => {
    expect(dom).toContain(".showModal()");
    expect(dom).toContain('addEventListener("cancel"');
  });

  it("relaciona título y mensaje con aria-labelledby y aria-describedby", () => {
    expect(astro).toContain('aria-labelledby="confirmar-titulo"');
    expect(astro).toContain('aria-describedby="confirmar-mensaje"');
  });

  it("el diálogo y su id coinciden entre markup y controlador", () => {
    expect(astro).toContain('id="confirmar-dialogo"');
    expect(dom).toContain('"confirmar-dialogo"');
  });

  it("atrapa Tab dentro del diálogo y devuelve el foco al elemento previo", () => {
    expect(dom).toContain('"Tab"');
    expect(dom).toContain("focusablesDe");
    expect(dom).toContain("focus()");
  });

  it("deshabilita Confirmar hasta que puedaConfirmar sea true", () => {
    expect(dom).toContain("puedeConfirmar");
    expect(dom).toContain(".disabled =");
  });

  it("respeta prefers-reduced-motion y botones de 44px", () => {
    expect(astro).toContain("prefers-reduced-motion");
    expect(astro).toContain("min-height: 44px");
  });

  it("no usa hex ni rgb hardcodeado (tokens de Tema Papel)", () => {
    const sinVars = astro.replace(/var\([^)]*\)/g, "");
    expect(sinVars).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sinVars).not.toMatch(/\brgba?\s*\(/i);
  });
});

describe("T-UI-02: las 5 acciones destructivas pasan por confirmar", () => {
  const acciones = [
    { nombre: "edición masiva por sector", archivo: "src/pages/panel/alertas/umbrales.astro", critico: true },
    { nombre: "apagar módulo del bot", archivo: "src/components/panel/BotModulosCard.astro", critico: true },
    { nombre: "egreso de caja", archivo: "src/pages/panel/caja.astro", critico: false },
    { nombre: "pagar factura", archivo: "src/pages/panel/consumos.astro", critico: false },
    { nombre: "registrar cobro", archivo: "src/pages/panel/fiado.astro", critico: false },
  ];

  it("cada acción llama a confirmar y las críticas piden el nombre", () => {
    for (const accion of acciones) {
      const src = leer(accion.archivo);
      expect(src, accion.nombre + " usa confirmar").toContain("confirmar(");
      if (accion.critico) {
        expect(src, accion.nombre + " exige nombreRequerido").toContain("nombreRequerido");
      }
    }
  });

  it("el egreso de caja solo confirma cuando el tipo es egreso", () => {
    const caja = leer("src/pages/panel/caja.astro");
    expect(caja).toContain('"egreso"');
    expect(caja.indexOf("confirmar(")).toBeGreaterThan(caja.indexOf('"egreso"'));
  });

  it("cada layout que monta las acciones incluye ConfirmDialog una vez", () => {
    expect(leer("src/components/panel/PanelShell.astro")).toContain("<ConfirmDialog />");
    expect(leer("src/pages/panel.astro")).toContain("<ConfirmDialog />");
  });
});
