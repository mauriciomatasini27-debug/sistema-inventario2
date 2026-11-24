import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

describe("PWA instalable PWA-S1/S2 (PRD-PWA-01)", () => {
  it("manifest válido con campos de instalación e iconos existentes", () => {
    const m = JSON.parse(readFileSync(join(ROOT, "public/manifest.webmanifest"), "utf8")) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src?: string; sizes?: string }>;
    };
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons?.some((i) => i.sizes === "192x192")).toBe(true);
    expect(m.icons?.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("BaseLayout, PanelShell y /venta comparten el registro del SW y enlazan el manifest", () => {
    const layout = readFileSync(join(ROOT, "src/layouts/BaseLayout.astro"), "utf8");
    const panelShell = readFileSync(join(ROOT, "src/components/panel/PanelShell.astro"), "utf8");
    const venta = readFileSync(join(ROOT, "src/pages/venta.astro"), "utf8");
    const registro = readFileSync(join(ROOT, "src/components/ui/PwaRegistro.astro"), "utf8");
    expect(layout).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(layout).toContain('rel="apple-touch-icon" href="/icons/icon-192.png"');
    expect(layout).toContain("<PwaRegistro");
    expect(panelShell).toContain("<PwaRegistro");
    expect(venta).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(venta).toContain("<PwaRegistro");
    expect(registro).toContain('"serviceWorker" in navigator');
    expect(registro).toContain('.register("/sw.js")');
    expect(registro).toContain("cachear-assets");
    expect(registro).toContain('console.warn("[pwa] no se pudo registrar el service worker"');
  });

  it("sw.js cachea estático y /venta, hace network-first en sync/pull y nunca toca POST", () => {
    const sw = readFileSync(join(ROOT, "public/sw.js"), "utf8");
    expect(sw).toContain("inventario-v6");
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(sw).toContain("/api/sync/pull");
    expect(sw).toContain('"/venta"');
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toContain("caches.match(req");
    expect(sw).toContain('caches.match("/")');
    // PWA-S2: solo se guardan páginas que funcionan sin red y el pull cacheado sale marcado.
    expect(sw).toContain('PAGINAS_OFFLINE = new Set(["/", "/venta"])');
    expect(sw).toContain("!res.redirected");
    expect(sw).toContain('"x-desde-cache", "1"');
  });
});
