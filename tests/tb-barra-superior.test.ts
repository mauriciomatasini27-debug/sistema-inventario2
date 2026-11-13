import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  datosCuentaBarra,
  indiceTabAtrapado,
  inicialAvatar,
  modoDiscretoActivo,
  textoEstadoModoBarra,
} from "../src/lib/panel-topbar.js";
import {
  cuentaMenuAbierto,
  debeCerrarMenuTecla,
  discretoSwitchMarcado,
  temaSwitchMarcado,
} from "../src/lib/panel-cuenta-menu.js";
import { alternarReposo, crearNodoModo, fijarEstado } from "../src/lib/modo.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("TB-BARRA-SUPERIOR: datos de cuenta", () => {
  it("sin nombre usa Miembro y la inicial M", () => {
    const d = datosCuentaBarra(null, "dueno");
    expect(d.nombre).toBe("Miembro");
    expect(d.inicial).toBe("M");
    expect(d.rol).toBe("Dueño");
  });

  it("rol ausente muestra guión", () => {
    expect(datosCuentaBarra("Caro", null).rol).toBe("—");
  });

  it("inicial respeta mayúscula regional", () => {
    expect(inicialAvatar("caro")).toBe("C");
    expect(inicialAvatar("   ")).toBe("?");
  });
});

describe("TB-BARRA-SUPERIOR: estado Modo en la barra", () => {
  it("minimizado coincide con discreto y con alternarReposo", () => {
    expect(textoEstadoModoBarra("minimizado")).toBe("Modo discreto");
    expect(modoDiscretoActivo("minimizado")).toBe(true);
    expect(discretoSwitchMarcado("minimizado")).toBe(true);
    const nodo = fijarEstado(crearNodoModo(), "calmado");
    const reposo = alternarReposo(nodo);
    expect(reposo.estado).toBe("minimizado");
    const vuelta = alternarReposo(reposo);
    expect(vuelta.estado).not.toBe("minimizado");
  });
});

describe("TB-BARRA-SUPERIOR: menú de cuenta", () => {
  it("abre y cierra con aria-expanded y hidden", () => {
    expect(cuentaMenuAbierto(true, false)).toBe(true);
    expect(cuentaMenuAbierto(true, true)).toBe(false);
    expect(debeCerrarMenuTecla("Escape", true)).toBe(true);
    expect(debeCerrarMenuTecla("Escape", false)).toBe(false);
  });

  it("atrapa Tab en orden circular", () => {
    expect(indiceTabAtrapado(3, 0, false)).toBe(1);
    expect(indiceTabAtrapado(3, 2, false)).toBe(0);
    expect(indiceTabAtrapado(3, 0, true)).toBe(2);
  });

  it("el switch de tema sigue el dataset del documento", () => {
    expect(temaSwitchMarcado("oscuro")).toBe(true);
    expect(temaSwitchMarcado("claro")).toBe(false);
    expect(temaSwitchMarcado(undefined)).toBe(true);
  });
});

describe("TB-BARRA-SUPERIOR: cableado Astro", () => {
  const shell = leer("src/components/panel/PanelShell.astro");
  const topbar = leer("src/components/panel/PanelTopbar.astro");
  const menu = leer("src/components/panel/PanelCuentaMenu.astro");

  it("el shell monta la barra nueva fuera del padding", () => {
    expect(shell).toContain("PanelTopbar");
    expect(shell).not.toContain("<TemaToggle");
    expect(shell).not.toContain('class="topbar vidrio-barra"');
    expect(topbar).toContain("flex-wrap: nowrap");
    expect(topbar).toContain("min-height: 44px");
    expect(topbar).toContain("safe-area-inset-top");
  });

  it("móvil sin buscador en barra; escritorio con Ctrl+K", () => {
    const buscar = leer("src/components/panel/PanelBuscar.astro");
    expect(buscar).toContain('ubicacion?: "default" | "topbar"');
    expect(buscar).toContain("panel-buscar-inline");
    expect(buscar).toContain("@media (min-width: 900px)");
    expect(menu).toContain('data-tema-toggle');
    expect(menu).toContain("data-modo-discreto-switch");
    expect(menu).toContain('aria-expanded');
    expect(menu).toContain("prefers-reduced-motion");
  });

  it("Modo emite estado para la barra y el menú", () => {
    expect(leer("src/components/panel/Modo.astro")).toContain('new CustomEvent("modo:estado"');
    expect(menu).toContain("modo:estado");
    expect(topbar).toContain("data-topbar-modo-estado");
  });
});
