import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ESTADOS_MODO,
  ANTENA_MODO,
  CUERPO_MODO,
  alTecla,
  alternarPanel,
  alternarReposo,
  aplicarEvento,
  avisosModo,
  conAvisos,
  crearNodoModo,
  etiquetaModo,
  fijarEstado,
  gestoModo,
  leerCuentaOpcional,
  leerStockBajo,
  muestraConfeti,
  reducirModo,
  tamanoModo,
  vistaModo,
} from "../src/lib/modo.js";

const leer = (p: string) => readFileSync(p, "utf8");

describe("Modo: estados que se leen y se ven", () => {
  it("el aria-label nombra a Modo y el estado, con éxito acentuado", () => {
    expect(etiquetaModo("calmado")).toBe("Modo, calmado");
    expect(etiquetaModo("pensando")).toBe("Modo, pensando");
    expect(etiquetaModo("exito")).toBe("Modo, éxito");
    expect(etiquetaModo("alerta")).toBe("Modo, alerta");
    expect(etiquetaModo("minimizado")).toBe("Modo, minimizado");
  });

  it("sin movimiento reducido cada estado tiene su gesto, y con reducido ninguno", () => {
    expect(gestoModo("calmado", false)).toBe("flotar");
    expect(gestoModo("pensando", false)).toBe("mecer");
    expect(gestoModo("exito", false)).toBe("saltar");
    expect(gestoModo("alerta", false)).toBe("sacudir");
    expect(gestoModo("minimizado", false)).toBe("flotar-lento");
    for (const estado of ESTADOS_MODO) {
      expect(gestoModo(estado, true)).toBe("quieto");
      expect(vistaModo(estado, true, false).confeti).toBe(false);
    }
  });

  it("el confeti solo aparece en éxito y con movimiento", () => {
    expect(muestraConfeti("exito", false)).toBe(true);
    expect(muestraConfeti("exito", true)).toBe(false);
    expect(muestraConfeti("alerta", false)).toBe(false);
    expect(muestraConfeti("calmado", false)).toBe(false);
  });

  it("la figura mide 36px y 28px mientras se cobra", () => {
    expect(tamanoModo(false)).toBe(36);
    expect(tamanoModo(true)).toBe(28);
    expect(vistaModo("calmado", false, true).figuraPx).toBe(28);
  });

  it("la antena apunta a los tokens cuyo hex es el del issue", () => {
    const css = leer("src/styles/global.css");
    expect(css).toContain("--color-llama: #ffd600");
    expect(css).toContain("--color-pendiente-oscuro: #8cc4e3");
    expect(css).toContain("--color-ok-oscuro: #7fd468");
    expect(css).toContain("--color-peligro: #b3261e");
    expect(css).toContain("--color-naranja: #f57c00");
    expect(css).toContain("--color-star-warm: #e64a19");
    expect(css).toContain("--color-void: #1a1a1a");
    expect(css).toContain("linear-gradient(135deg, var(--color-llama)");
    expect(ANTENA_MODO.calmado).toBe("var(--color-llama)");
    expect(ANTENA_MODO.pensando).toBe("var(--color-pendiente-oscuro)");
    expect(ANTENA_MODO.exito).toBe("var(--color-ok-oscuro)");
    expect(ANTENA_MODO.alerta).toBe("var(--color-peligro)");
    expect(ANTENA_MODO.minimizado).toBe("var(--color-llama)");
    expect(CUERPO_MODO).toEqual([
      "var(--color-llama)",
      "var(--color-naranja)",
      "var(--color-star-warm)",
    ]);
  });
});

describe("Modo: panel, avisos y reposo", () => {
  it("abre y cierra, y Escape cierra solo si está abierto", () => {
    const cerrado = crearNodoModo();
    expect(alTecla(cerrado, "Escape")).toBe(cerrado);
    const abierto = alternarPanel(cerrado);
    expect(abierto.panelAbierto).toBe(true);
    expect(abierto.ariaExpanded).toBe(true);
    const otra = alTecla(abierto, "Enter");
    expect(otra.panelAbierto).toBe(true);
    const deNuevo = alTecla(abierto, "Escape");
    expect(deNuevo.panelAbierto).toBe(false);
    expect(deNuevo.ariaExpanded).toBe(false);
    expect(deNuevo.ariaLabel).toBe("Modo, calmado");
  });

  it("minimizado no cambia de humor con avisos, y mostrar vuelve a alerta si hay", () => {
    const quieto = aplicarEvento(crearNodoModo(), "minimizar");
    expect(quieto.estado).toBe("minimizado");
    expect(reducirModo("minimizado", "avisos")).toBe("minimizado");
    expect(reducirModo("minimizado", "cargar")).toBe("minimizado");
    const conStock = conAvisos(quieto, avisosModo({ stockBajo: 2, fiadoAtrasado: null }));
    expect(conStock.estado).toBe("minimizado");
    expect(conStock.avisos).toHaveLength(1);
    const despierto = alternarReposo(conStock);
    expect(despierto.estado).toBe("alerta");
    expect(despierto.ariaLabel).toBe("Modo, alerta");
  });

  it("el stock bajo sale del número que ya existe y el fiado vacío no inventa un aviso", () => {
    expect(leerStockBajo(null, false)).toBeNull();
    expect(leerStockBajo("1 producto con stock bajo.", true)).toBe(0);
    expect(leerStockBajo("Sin avisos de stock por ahora.", false)).toBe(0);
    expect(leerStockBajo("3 productos con stock bajo. Ver productos", false)).toBe(3);
    expect(leerCuentaOpcional(undefined)).toBeNull();
    expect(leerCuentaOpcional("")).toBeNull();
    expect(leerCuentaOpcional("no")).toBeNull();
    expect(avisosModo({ stockBajo: 0, fiadoAtrasado: null })).toEqual([]);
    expect(avisosModo({ stockBajo: 1, fiadoAtrasado: null })).toEqual([
      { id: "stock", texto: "1 producto con stock bajo.", href: "/panel/stock" },
    ]);
    expect(avisosModo({ stockBajo: null, fiadoAtrasado: 2 })).toEqual([
      { id: "fiado", texto: "2 fiados atrasados.", href: "/panel/fiado" },
    ]);
    const nodo = conAvisos(aplicarEvento(crearNodoModo(), "cargar"), avisosModo({ stockBajo: 0, fiadoAtrasado: null }));
    expect(nodo.estado).toBe("calmado");
    const alerta = conAvisos(fijarEstado(crearNodoModo(), "pensando"), avisosModo({ stockBajo: 4, fiadoAtrasado: null }));
    expect(alerta.estado).toBe("alerta");
  });

  it("celebrar llega a éxito y calmar vuelve a calmado", () => {
    expect(reducirModo("calmado", "celebrar")).toBe("exito");
    expect(reducirModo("exito", "calmar")).toBe("calmado");
    expect(etiquetaModo(reducirModo("alerta", "celebrar"))).toBe("Modo, éxito");
  });
});

describe("Modo: en el cascarón, sin tapar la venta", () => {
  const modo = leer("src/components/panel/Modo.astro");
  const shell = leer("src/components/panel/PanelShell.astro");
  const venta = leer("src/pages/venta.astro");
  const nav = leer("src/components/panel/NavTablero.astro");

  it("el botón mide 44px, la figura 36 y el cobro la deja en 28 sin position fixed", () => {
    expect(modo).toContain("min-width: 44px");
    expect(modo).toContain("min-height: 44px");
    expect(modo).toContain("width: 36px");
    expect(modo).toContain('data-modo-cobrando="no"');
    expect(modo).toContain('[data-modo-cobrando="si"] .modo-figura');
    expect(modo).toContain("width: 28px");
    expect(modo).toContain("position: relative");
    expect(modo).not.toMatch(/position:\s*fixed/);
    expect(modo).toContain('aria-label="Modo, calmado"');
    expect(modo).toContain("setAttribute(\"aria-label\", nodo.ariaLabel)");
  });

  it("cada estado cambia antena, ojos o gesto, y el movimiento reducido apaga confeti", () => {
    for (const estado of ESTADOS_MODO) {
      expect(modo).toContain(`data-modo-estado="${estado}"`);
    }
    expect(modo).toContain("modo-ojos-sonrisa");
    expect(modo).toContain("modo-ojos-cerrados");
    expect(modo).toContain("modo-puntos");
    expect(modo).toContain("modo-bang");
    expect(modo).toContain('x1="0" y1="0" x2="1" y2="1"');
    expect(modo).toContain("fill=\"var(--color-void)\"");
    expect(modo).toContain("fill=\"var(--color-llama)\"");
    expect(modo).toContain("fill=\"var(--color-star-white)\"");
    const noPref = modo.slice(
      modo.indexOf("prefers-reduced-motion: no-preference"),
      modo.indexOf("prefers-reduced-motion: reduce"),
    );
    expect(noPref).toContain("modo-flotar");
    expect(noPref).toContain("modo-mecer");
    expect(noPref).toContain("modo-salto");
    expect(noPref).toContain("modo-sacudir");
    expect(noPref).toContain("modo-parpadeo");
    expect(noPref).toContain('.modo[data-modo-confeti="si"] .modo-confeti');
    const reduce = modo.slice(modo.indexOf("prefers-reduced-motion: reduce"));
    expect(reduce).toContain("animation: none");
    expect(reduce).toContain(".modo-confeti { display: none !important; }");
    expect(modo).toContain('event.key');
    expect(modo).toContain("alTecla");
  });

  it("la barra principal sigue en el cascarón y el bot de WhatsApp no se toca", () => {
    expect(shell).toContain("<Modo />");
    expect(shell).toContain("<NavTablero");
    expect(venta).toContain("<Modo />");
    expect(venta).toContain('id="cobrar"');
    expect(venta).toContain(":not(.modo-control)");
    for (const href of ['href: "/panel"', 'href: "/panel/stock"', 'href: "/venta"', 'href: "/panel/fiado"']) {
      expect(nav).not.toContain(href);
    }
    const barra = leer("src/lib/panel-modulos.ts");
    for (const href of ["/panel", "/panel/stock", "/venta", "/panel/fiado"]) {
      expect(barra).toContain(href);
    }
    expect(nav).toContain("BARRA_TABLERO");
    const bot = leer("src/pages/panel/bot/config.astro");
    expect(bot).not.toContain("<Modo");
    expect(bot).not.toContain("data-modo");
    expect(modo).not.toContain("AsistenteDrawer");
    expect(leer("src/components/panel/AsistenteDrawer.astro")).not.toContain("data-modo");
    expect(modo.toLowerCase()).not.toContain("misión");
    expect(modo.toLowerCase()).not.toContain("racha");
    expect(modo.toLowerCase()).not.toContain("metas");
  });
});
