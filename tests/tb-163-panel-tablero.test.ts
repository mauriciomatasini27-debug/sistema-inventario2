import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("TB-163: piel B en todo el panel (solo oscuro tras TB-TEMA-CLARO)", () => {
  it("PanelShell oscurece .tablero solo con data-tema=oscuro", () => {
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(shell).not.toMatch(/^\s*body:has\(\.tablero\)/m);
    expect(shell).toContain(':root[data-tema="oscuro"] .tablero.panel-shell');
    expect(shell).toContain("--tema-fondo: var(--color-void)");
  });

  it("el contenido deja hueco para la barra a 390px", () => {
    const shell = leer("src/components/panel/PanelShell.astro");
    expect(shell).toContain("padding-bottom: calc(72px + env(safe-area-inset-bottom");
    const nav = leer("src/components/panel/NavTablero.astro");
    expect(nav).toContain("safe-area-inset-bottom");
  });

  it("respeta prefers-reduced-motion en el shell", () => {
    expect(leer("src/components/panel/PanelShell.astro")).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe("TB-163: Productos y Fiado mobile-first", () => {
  it("Stock expone acciones rápidas sin links duplicados en la tarjeta", () => {
    const stock = leer("src/pages/panel/stock.astro");
    expect(stock).toContain("TableroAcciones");
    expect(stock).toContain('id="stock-resumen"');
    expect(stock).not.toContain("Importar stock desde CSV");
    expect(stock).toContain("stock-resumen");
  });

  it("Fiado lista cartera con saldo real vía APIs existentes", () => {
    const fiado = leer("src/pages/panel/fiado.astro");
    expect(fiado).toContain('id="fiado-cartera"');
    expect(fiado).toContain("/api/credit/customers");
    expect(fiado).toContain("/api/credit/balance");
    expect(fiado).not.toMatch(/href=["']\/panel\/clientes["']/);
    expect(fiado).toContain("fiado-fila");
    expect(fiado).toContain("min-height: 44px");
  });

  it("Fiado y Stock no usan layout de dos columnas forzado en móvil", () => {
    expect(leer("src/pages/panel/fiado.astro")).not.toContain('class="grid dos"');
  });
});

describe("TB-163: Vender y admin alineados al void", () => {
  it("/venta usa tokens tema en el body", () => {
    expect(leer("src/pages/venta.astro")).toContain("background: var(--tema-fondo)");
  });

  it("/admin declara piel oscura solo en data-tema=oscuro", () => {
    const admin = leer("src/pages/admin.astro");
    expect(admin).toContain(':root[data-tema="oscuro"]');
    expect(admin).toMatch(/:root\[data-tema="oscuro"\]\s*\{[\s\S]*--papel:\s*var\(--color-void\)/);
    expect(admin).toMatch(/:root\[data-tema="oscuro"\]\s*\{[\s\S]*--card:\s*var\(--color-charcoal\)/);
  });
});
