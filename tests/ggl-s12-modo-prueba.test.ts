import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  LIMITE_USUARIOS_PRUEBA_GMAIL,
  TEXTO_FUERA_DE_LISTA_PRUEBA,
  TEXTO_LISTA_PRUEBA_INVALIDA,
  TEXTO_REFRESH_7_DIAS,
  decidirInicioGmail,
  vistaModoPruebaGmail,
} from "../src/modules/integraciones/google-oauth.js";
import { POST as postStart } from "../src/pages/api/integrations/start.js";

const tenantId = "tenant-ggl-s12";
const googleSub = "g-s12-dueno";
const emailDueno = "Dueno@Ejemplo.com";

const envOAuth = {
  GOOGLE_INTEGRATIONS_CLIENT_ID: "cliente-s12",
  GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto-s12",
  GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost:4321/api/integrations/callback",
  INTEGRATIONS_STATE_SECRET: "state-s12",
};

describe("GGL-S12 modo prueba", () => {
  let plano = "";
  const envPrevios = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const clave of [
      ...Object.keys(envOAuth),
      "GOOGLE_INTEGRATIONS_MODO",
      "GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA",
      "DEFAULT_TENANT_ID",
      "TENANT_MODE",
    ]) {
      envPrevios.set(clave, process.env[clave]);
    }
    delete process.env.TENANT_MODE;
    process.env.DEFAULT_TENANT_ID = tenantId;
    for (const [clave, valor] of Object.entries(envOAuth)) process.env[clave] = valor;

    resetStore();
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: "Modo prueba",
      slug: "modo-prueba",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: googleSub,
      esDemo: false,
    });
    control.users.set(googleSub, {
      googleSub,
      email: emailDueno,
      emailVerificado: true,
    });
    control.memberships.set("m-s12", {
      id: "m-s12",
      tenantId,
      googleSub,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const sesion = crearSesion({ googleSub, tenantId });
    plano = sesion.idPlano;
    control.sessions.set(sesion.registro.idHash, {
      idHash: sesion.registro.idHash,
      googleSub,
      tenantId,
      expiraAt: sesion.registro.expiraAt,
      expiraAbsoluta: sesion.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
    });
  });

  afterAll(() => {
    for (const [clave, valor] of envPrevios) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
    resetStore();
  });

  function lista(emails: string): void {
    process.env.GOOGLE_INTEGRATIONS_MODO = "testing";
    process.env.GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA = emails;
  }

  function post(contentType?: string) {
    const headers: Record<string, string> = { cookie: `__Host-sesion=${plano}` };
    if (contentType) {
      headers["content-type"] = contentType;
      return postStart(
        ctx("http://x/api/integrations/start", {
          method: "POST",
          body: new URLSearchParams({
            tipo: "gmail",
            consentimiento_version: "2026-10-19-v1",
          }).toString(),
          headers,
        }),
      );
    }
    return postStart(
      ctx("http://x/api/integrations/start", {
        body: { tipo: "gmail", consentimiento_version: "2026-10-19-v1" },
        headers,
      }),
    );
  }

  it("fuera de la lista no abre Google y la respuesta explica el límite", async () => {
    lista("otra@ejemplo.com");
    const r = await post("application/x-www-form-urlencoded");
    expect(r.status).toBe(403);
    expect(r.headers.get("location")).toBeNull();
    const html = await r.text();
    expect(html).toContain(TEXTO_FUERA_DE_LISTA_PRUEBA);
    expect(html).not.toContain("accounts.google.com");
  });

  it("en la lista el OAuth sigue hacia Google", async () => {
    lista("dueno@ejemplo.com");
    const r = await post();
    expect(r.status).toBe(303);
    const location = new URL(r.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("login_hint")).toBe("dueno@ejemplo.com");
    expect(location.searchParams.get("scope")).not.toContain("gmail.modify");
  });

  it("en modo verificada el OAuth sigue aunque el mail no esté en la lista", async () => {
    process.env.GOOGLE_INTEGRATIONS_MODO = "verificada";
    process.env.GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA = "otra@ejemplo.com";
    const r = await post();
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location") ?? "").origin).toBe("https://accounts.google.com");
  });

  it("en testing la vista pide reconectar a los 7 días y no promete ingesta continua", () => {
    const decision = decidirInicioGmail({
      email: emailDueno,
      env: {
        GOOGLE_INTEGRATIONS_MODO: "testing",
        GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA: "dueno@ejemplo.com",
      },
    });
    const vista = vistaModoPruebaGmail({ decision, hayConexion: false, esDueno: true });
    expect(vista.mostrarFormulario).toBe(true);
    expect(vista.textoLimite).toBeNull();
    expect(vista.textoRefresh7Dias).toBe(TEXTO_REFRESH_7_DIAS);
    expect(vista.textoRefresh7Dias).toContain("7 días");
    expect(vista.textoRefresh7Dias).toContain("no sigue sola");
  });

  it("en verificada la vista no avisa los 7 días", () => {
    const decision = decidirInicioGmail({
      email: emailDueno,
      env: { GOOGLE_INTEGRATIONS_MODO: "verificada" },
    });
    const vista = vistaModoPruebaGmail({ decision, hayConexion: true, esDueno: true });
    expect(vista.mostrarFormulario).toBe(true);
    expect(vista.textoRefresh7Dias).toBeNull();
  });

  it("el Dueño fuera de la lista no ve el formulario", () => {
    const decision = decidirInicioGmail({
      email: "nadie@ejemplo.com",
      env: { GOOGLE_INTEGRATIONS_MODO: "testing", GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA: "dueno@ejemplo.com" },
    });
    const vista = vistaModoPruebaGmail({ decision, hayConexion: false, esDueno: true });
    expect(vista.mostrarFormulario).toBe(false);
    expect(vista.textoLimite).toBe(TEXTO_FUERA_DE_LISTA_PRUEBA);
    expect(vista.textoRefresh7Dias).toBeNull();
  });

  it("una lista de 100 cuentas todavía deja entrar al Dueño", () => {
    const muchos = Array.from({ length: LIMITE_USUARIOS_PRUEBA_GMAIL - 1 }, (_, i) => `u${i}@ejemplo.com`);
    const decision = decidirInicioGmail({
      email: emailDueno,
      env: {
        GOOGLE_INTEGRATIONS_MODO: "testing",
        GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA: [...muchos, emailDueno].join(","),
      },
    });
    expect(decision).toEqual({ iniciar: true, modo: "testing" });
  });

  it("una lista de más de 100 cuentas no abre OAuth", async () => {
    const muchos = Array.from({ length: LIMITE_USUARIOS_PRUEBA_GMAIL + 1 }, (_, i) => `u${i}@ejemplo.com`);
    lista(muchos.join(","));
    const r = await post("application/x-www-form-urlencoded");
    expect(r.status).toBe(403);
    expect(r.headers.get("location")).toBeNull();
    expect(await r.text()).toContain(TEXTO_LISTA_PRUEBA_INVALIDA);
  });

  it("sin modo explícito queda en testing y una lista vacía no abre OAuth", async () => {
    delete process.env.GOOGLE_INTEGRATIONS_MODO;
    delete process.env.GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA;
    const r = await post();
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "fuera_de_lista_prueba" });
  });

  it("la pantalla ata el formulario al gate y no promete el vencimiento siempre", () => {
    const pagina = readFileSync("src/pages/panel/integraciones.astro", "utf8");
    const componente = readFileSync("src/components/panel/IntegracionGmail.astro", "utf8");
    expect(pagina).toContain("<IntegracionGmail server:defer");
    expect(componente).toContain("vista.mostrarFormulario");
    expect(componente).toContain("vista.textoLimite");
    expect(componente).toContain("vista.textoRefresh7Dias");
    expect(componente).toContain('id="limite-lista-prueba"');
    expect(componente).toContain('id="aviso-refresh-7-dias"');
    expect(componente).not.toContain("puede vencer a los 7 días");
    const form = componente.indexOf('action="/api/integrations/start"');
    const rama = componente.indexOf("vista.mostrarFormulario");
    expect(rama).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(rama);
  });
});
