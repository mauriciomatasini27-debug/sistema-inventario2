import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { puedeVerTenantDeRequest } from "../src/lib/tenant-context.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { ctx } from "./helpers/ctx.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

function frontmatter(src: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) throw new Error("página sin frontmatter");
  return m[1] ?? "";
}

const integraciones = leer("src/pages/panel/integraciones.astro");
const remitentes = leer("src/pages/panel/integraciones-remitentes.astro");
const gmail = leer("src/components/panel/IntegracionGmail.astro");
const listaRemitentes = leer("src/components/panel/RemitentesGmail.astro");
const shell = leer("src/components/panel/PanelShell.astro");

describe("NAV-S2: datos lentos fuera del render crítico", () => {
  it("las páginas no esperan las consultas de Gmail en el frontmatter", () => {
    expect(frontmatter(integraciones)).not.toContain("await ");
    expect(frontmatter(integraciones)).not.toContain("leerSaludConexionGmail");
    expect(frontmatter(remitentes)).not.toContain("listarRemitentesIngesta");
    expect(frontmatter(remitentes)).toContain("actualizarActivoRemitenteIngesta");
    const fmRemitentes = frontmatter(remitentes);
    const inicioPost = fmRemitentes.indexOf('Astro.request.method === "POST"');
    expect(inicioPost).toBeGreaterThan(-1);
    expect(fmRemitentes.slice(0, inicioPost)).not.toContain("await ");
  });

  it("las consultas viven en componentes que se renderizan como server islands", () => {
    expect(integraciones).toContain("<IntegracionGmail server:defer");
    expect(remitentes).toContain("<RemitentesGmail server:defer");
    expect(frontmatter(gmail)).toContain("await leerSaludConexionGmail(tenantId)");
    expect(frontmatter(listaRemitentes)).toContain("await listarRemitentesIngesta(tenantId)");
  });

  it("cada isla declara un fallback accesible para el primer byte", () => {
    expect(integraciones).toContain('id="gmail-skeleton"');
    expect(integraciones).toContain('aria-busy="true"');
    expect(integraciones).toContain('slot="fallback"');
    expect(remitentes).toContain('id="remitentes-skeleton"');
    expect(remitentes).toContain('aria-busy="true"');
    expect(remitentes).toContain('slot="fallback"');
  });

  it("PanelShell resuelve sesión, tenant y membresía sin await en el frontmatter", () => {
    expect(frontmatter(shell)).not.toContain("await ");
  });

  it("las islas no se cachean y reciben el tenant ya autorizado por la página", () => {
    for (const src of [gmail, listaRemitentes]) {
      expect(src).toContain('Astro.response.headers.set("Cache-Control", "private, no-store")');
      expect(src).toContain("puedeVerTenantDeRequest(Astro.request, tenantId)");
      expect(src).toContain("errorCarga");
    }
    expect(integraciones).toContain("tenantId={tenant.tenantId}");
    expect(remitentes).toContain("tenantId={tenant.tenantId}");
  });
});

describe("NAV-S2: autorización de las server islands", () => {
  const modoPrevio = process.env.TENANT_MODE;

  afterEach(() => {
    if (modoPrevio === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = modoPrevio;
    resetStore();
  });

  it("en multi, sin sesión no puede ver el tenant de la isla", () => {
    process.env.TENANT_MODE = "multi";
    resetStore();
    const request = ctx("http://localhost/_server-islands/IntegracionGmail").request;
    expect(puedeVerTenantDeRequest(request, "tenant-a")).toBe(false);
  });

  it("en multi, con sesión y membership activa solo ve su tenant", () => {
    process.env.TENANT_MODE = "multi";
    resetStore();
    const googleSub = "g-nav-s2";
    const tenantId = "tenant-a";
    control.memberships.set("m-nav-s2", {
      id: "m-nav-s2",
      tenantId,
      googleSub,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const sesion = crearSesion({ googleSub, tenantId });
    control.sessions.set(sesion.registro.idHash, {
      idHash: sesion.registro.idHash,
      googleSub,
      tenantId,
      expiraAt: sesion.registro.expiraAt,
      expiraAbsoluta: sesion.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
    });
    const request = ctx("http://localhost/_server-islands/IntegracionGmail", {
      headers: { cookie: `__Host-sesion=${sesion.idPlano}` },
    }).request;
    expect(puedeVerTenantDeRequest(request, tenantId)).toBe(true);
    expect(puedeVerTenantDeRequest(request, "tenant-otro")).toBe(false);
  });

  it("en single conserva el acceso legado sin sesión", () => {
    delete process.env.TENANT_MODE;
    resetStore();
    const request = ctx("http://localhost/_server-islands/IntegracionGmail").request;
    expect(puedeVerTenantDeRequest(request, "tenant-a")).toBe(true);
  });
});
