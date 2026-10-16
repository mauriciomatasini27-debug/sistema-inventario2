import { describe, expect, it, beforeEach } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import {
  tenantSchema,
  membershipSchema,
  PERMISOS_EMPLEADO,
} from "../src/lib/validation.js";
import {
  crearSesion,
  validarSesion,
  rotarSesion,
  cookieSesion,
  sha256Hex,
} from "../src/modules/auth/sesiones.js";
import {
  normalizarEmail,
  verificarIdToken,
  buildAuthorizationUrl,
  LOGIN_SCOPES,
} from "../src/modules/auth/oidc.js";
import {
  decidirAlta,
  avanzarJob,
  esperaReintentoMs,
  trialHasta,
  normalizarNombre,
  type EstadoJob,
} from "../src/modules/tenants/aprovisionar.js";
import {
  crearInvitacion,
  decidirAceptacion,
  reenviarInvitacion,
  cancelarInvitacion,
  decidirRevocacion,
  hashToken,
} from "../src/modules/tenants/invitaciones.js";
import { resolverSesionPorPlano } from "../src/lib/control.js";
import { POST as postTenants } from "../src/pages/api/tenants.js";
import { POST as postMemberships } from "../src/pages/api/tenants/[id]/memberships.js";
import { POST as postAccept } from "../src/pages/api/invitations/accept.js";
import * as schema from "../src/db/schema.js";

const AHORA = new Date("2026-10-10T12:00:00.000Z");

function sesionEnStore(sub: string, tenantId: string | null = null) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    // Reauth fresca con reloj real: las rutas sensibles usan Date.now().
    reauthAt: ahoraReal.toISOString(),
  });
  return c.idPlano;
}

function tenantEnStore(id: string, dueno: string, plan = "base") {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan,
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  const mid = `m-${dueno}`;
  control.memberships.set(mid, {
    id: mid,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

beforeEach(() => {
  resetStore();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-sub";
});

describe("oidc login", () => {
  it("la URL pide S256, state, nonce y solo openid email profile", () => {
    const url = buildAuthorizationUrl({
      clientId: "c",
      redirectUri: "http://x/cb",
      state: "s",
      nonce: "n",
      codeChallenge: "ch",
    });
    expect(url).toContain("code_challenge_method=S256");
    const params = new URL(url).searchParams;
    expect(params.get("state")).toBe("s");
    expect(params.get("nonce")).toBe("n");
    expect(params.get("scope")).toBe(LOGIN_SCOPES);
    expect(url).not.toContain("gmail");
    expect(url).not.toContain("offline");
  });

  it("valida firma, iss, aud, nonce y email_verified con JWKS mockeado (sin red)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "mock-1", alg: "RS256", use: "sig" };
    const clave = createLocalJWKSet({ keys: [jwk] });
    const firmar = (extra: Record<string, unknown>) =>
      new SignJWT({ nonce: "n-1", email: "Ana@Gmail.com", email_verified: true, name: "Ana", ...extra })
        .setProtectedHeader({ alg: "RS256", kid: "mock-1" })
        .setIssuer("https://accounts.google.com")
        .setAudience("login-client")
        .setSubject("sub-1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    const ok = await verificarIdToken({ idToken: await firmar({}), expectedAud: "login-client", nonceEsperado: "n-1", clave });
    expect(ok.sub).toBe("sub-1");
    // sub es identidad estable; email solo empareja (lowercase, sin tocar puntos)
    expect(normalizarEmail(ok.email)).toBe("ana@gmail.com");
    expect(normalizarEmail("a.b@gmail.com")).toBe("a.b@gmail.com");

    await expect(verificarIdToken({ idToken: await firmar({}), expectedAud: "otro-client", nonceEsperado: "n-1", clave })).rejects.toThrow();
    await expect(verificarIdToken({ idToken: await firmar({}), expectedAud: "login-client", nonceEsperado: "otro", clave })).rejects.toThrow();
    await expect(
      verificarIdToken({ idToken: await firmar({ email_verified: false }), expectedAud: "login-client", nonceEsperado: "n-1", clave }),
    ).rejects.toThrow();
  });
});

describe("sesiones", () => {
  it("guarda solo el hash SHA-256 del id de 256 bits", () => {
    const c = crearSesion({ googleSub: "s", tenantId: "t", ahora: AHORA });
    expect(c.idPlano).toHaveLength(64);
    expect(c.registro.idHash).toBe(sha256Hex(c.idPlano));
    expect(c.registro.idHash).not.toContain(c.idPlano);
  });

  it("rolling con throttle de 1 escritura/hora", () => {
    const c = crearSesion({ googleSub: "s", tenantId: "t", ahora: AHORA });
    const reciente = validarSesion({ idPlano: c.idPlano, registro: c.registro, ahora: AHORA });
    expect(reciente.valida).toBe(true);
    expect(reciente.necesitaReescritura).toBe(false);
    const tarde = validarSesion({
      idPlano: c.idPlano,
      registro: { ...c.registro, lastSeenAt: new Date(AHORA.getTime() - 2 * 3600 * 1000).toISOString() },
      ahora: AHORA,
    });
    expect(tarde.necesitaReescritura).toBe(true);
    expect(new Date(tarde.expiraAtNueva ?? "").getTime()).toBeGreaterThan(AHORA.getTime());
  });

  it("sesión alterada, vencida o revocada no valida", () => {
    const c = crearSesion({ googleSub: "s", tenantId: "t", ahora: AHORA });
    expect(validarSesion({ idPlano: `${c.idPlano.slice(0, -1)}x`, registro: c.registro, ahora: AHORA }).valida).toBe(false);
    expect(
      validarSesion({ idPlano: c.idPlano, registro: { ...c.registro, expiraAt: "2020-01-01T00:00:00.000Z" }, ahora: AHORA }).motivo,
    ).toBe("vencida_inactividad");
    expect(
      validarSesion({ idPlano: c.idPlano, registro: { ...c.registro, revocadaAt: AHORA.toISOString() }, ahora: AHORA }).motivo,
    ).toBe("revocada");
  });

  it("rotación cambia el id y la cookie es __Host- HttpOnly Secure Lax", () => {
    const c = crearSesion({ googleSub: "s", tenantId: "t", ahora: AHORA });
    const r = rotarSesion({ registro: c.registro, ahora: AHORA });
    expect(r.registro.idHash).not.toBe(c.registro.idHash);
    const cookie = cookieSesion(r.idPlano, r.registro.expiraAt, AHORA);
    expect(cookie.startsWith("__Host-sesion=")).toBe(true);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age="]) {
      expect(cookie).toContain(flag);
    }
  });
});

describe("aprovisionamiento", () => {
  it("decide crear, reusar por nombre y entrar al existente (un comercio por usuario)", () => {
    const sol = { ownerGoogleSub: "d", nombreComercio: "Kiosco La Esquina", plan: "base" as const, requestKey: "k1" };
    expect(decidirAlta({ solicitud: sol, existentes: [] })).toEqual({ accion: "crear" });
    const ex = [{ tenantId: "t1", ownerGoogleSub: "d", nombreComercio: "kiosco  la esquina", requestKey: "k0" }];
    expect(decidirAlta({ solicitud: sol, existentes: ex })).toMatchObject({ accion: "reusar", tenantId: "t1", status: 409 });
    expect(decidirAlta({ solicitud: { ...sol, nombreComercio: "Otro", requestKey: "k0" }, existentes: ex })).toMatchObject({
      accion: "reusar",
      tenantId: "t1",
      status: 409,
    });
    expect(normalizarNombre("  Kiosco   LA Esquina ")).toBe("kiosco la esquina");
  });

  it("recorre los 6 pasos hasta activo; 3 fallos dejan error sin membership previa", () => {
    let job: EstadoJob = { estado: "aprovisionando", pasoActual: "crear_base", intentos: 0 };
    for (const paso of ["crear_base", "aplicar_migraciones", "sembrar_plantillas_rubro", "registrar_catalogo", "crear_membership_dueno", "marcar_activo"] as const) {
      job = avanzarJob({ ...job, pasoActual: paso }, { tipo: "paso_ok", paso });
    }
    expect(job.estado).toBe("activo");
    let f: EstadoJob = { estado: "aprovisionando", pasoActual: "aplicar_migraciones", intentos: 0 };
    f = avanzarJob(f, { tipo: "paso_fallo", paso: "aplicar_migraciones", error: "mig rota" });
    f = avanzarJob(f, { tipo: "paso_fallo", paso: "aplicar_migraciones", error: "mig rota" });
    f = avanzarJob(f, { tipo: "paso_fallo", paso: "aplicar_migraciones", error: "mig rota" });
    expect(f.estado).toBe("error_aprovisionamiento");
    expect(esperaReintentoMs(1)).toBeLessThan(esperaReintentoMs(2));
    expect(new Date(trialHasta(AHORA)).getTime() - AHORA.getTime()).toBe(14 * 24 * 3600 * 1000);
  });
});

describe("invitaciones", () => {
  it("crea con hash y 7 días; aceptar valida email, plan y estado", () => {
    const { tokenPlano, registro } = crearInvitacion({ tenantId: "t", email: "Juan@Gmail.com", rol: "empleado", ahora: AHORA });
    expect(tokenPlano).not.toBe(registro.tokenHash);
    expect(registro.tokenHash).toBe(hashToken(tokenPlano));
    expect(new Date(registro.expiraAt).getTime() - AHORA.getTime()).toBe(7 * 24 * 3600 * 1000);
    const base = { invitacion: registro, emailSesion: "juan@gmail.com", emailVerificado: true, ahora: AHORA, miembrosActivos: 1, plan: "base", yaEsMiembro: false };
    expect(decidirAceptacion({ ...base }).acepta).toBe(true);
    expect(decidirAceptacion({ ...base, emailSesion: "otro@gmail.com" }).motivo).toBe("email_distinto");
    expect(decidirAceptacion({ ...base, miembrosActivos: 2 }).motivo).toBe("cupo_plan");
    expect(decidirAceptacion({ ...base, yaEsMiembro: true }).motivo).toBe("miembro_duplicado");
    expect(decidirAceptacion({ ...base, emailSesion: "juan@gmail.com", invitacion: { ...registro, estado: "aceptada" } }).motivo).toBe("usada");
    expect(decidirAceptacion({ ...base, emailSesion: "juan@gmail.com", invitacion: cancelarInvitacion(registro) }).motivo).toBe("cancelada");
    expect(
      decidirAceptacion({ ...base, emailSesion: "juan@gmail.com", invitacion: { ...registro, expiraAt: "2020-01-01T00:00:00.000Z" } }).motivo,
    ).toBe("vencida");
  });

  it("reenviar invalida el token anterior", () => {
    const { registro } = crearInvitacion({ tenantId: "t", email: "j@g.com", rol: "empleado", ahora: AHORA });
    const r = reenviarInvitacion({ invitacion: registro, ahora: AHORA });
    expect(r.anterior.estado).toBe("cancelada");
    expect(r.nueva.tokenHash).not.toBe(registro.tokenHash);
  });

  it("revocación en cascada; el dueño no se revoca a sí mismo", () => {
    const ok = decidirRevocacion({ esDueno: false, sesionesActivas: 2, botLinksActivos: 1, invitacionesPendientes: 1, revocadoPor: "d", ahora: AHORA });
    expect(ok).toMatchObject({ membershipEstado: "revocado", sesionesARevocar: 2, botLinksARevocar: 1, invitacionesACancelar: 1 });
    expect(decidirRevocacion({ esDueno: true, sesionesActivas: 1, botLinksActivos: 0, invitacionesPendientes: 0, revocadoPor: "d" })).toEqual({
      error: "dueno_no_revocable",
    });
  });
});

describe("rutas", () => {
  it("POST /api/tenants: 201 y doble envío 409 con el mismo tenant", async () => {
    const plano = sesionEnStore("admin-sub");
    const cuerpo = { nombre_comercio: "Kiosco La Esquina", plan: "base", owner_google_sub: "dueno-1", moneda: "ARS", request_key: "alta-1" };
    const req = () =>
      ctx("http://x/api/tenants", {
        method: "POST",
        body: cuerpo,
        headers: { cookie: `__Host-sesion=${plano}` },
      });
    const r1 = await postTenants(req());
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { tenant_id: string };
    const r2 = await postTenants(req());
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);
    expect(control.tenants.size).toBe(1);
  });

  it("POST /api/tenants: 403 fuera de allowlist y 422 con plan inválido", async () => {
    const planoFuera = sesionEnStore("nadie");
    const r403 = await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: { nombre_comercio: "Kiosco X", plan: "base", owner_google_sub: "d", moneda: "ARS" },
        headers: { cookie: `__Host-sesion=${planoFuera}` },
      }),
    );
    expect(r403.status).toBe(403);

    const planoAdmin = sesionEnStore("admin-sub");
    const r422 = await postTenants(
      ctx("http://x/api/tenants", {
        method: "POST",
        body: { nombre_comercio: "Kiosco X", plan: "oro", owner_google_sub: "d", moneda: "ARS" },
        headers: { cookie: `__Host-sesion=${planoAdmin}` },
      }),
    );
    expect(r422.status).toBe(422);
    expect(tenantSchema.safeParse({ nombre_comercio: "K", plan: "oro", owner_google_sub: "d", moneda: "ARS" }).success).toBe(false);
  });

  it("memberships: 201, duplicada 409, cross-tenant y tamper 403", async () => {
    tenantEnStore("t-1", "dueno-1");
    const planoDueno = sesionEnStore("dueno-1", "t-1");
    const cuerpo = { google_sub: "emp-1", rol: "empleado" };
    const req = (cookie: string) =>
      ctx("http://x/api/tenants/t-1/memberships", {
        method: "POST",
        body: cuerpo,
        headers: { cookie },
        params: { id: "t-1" },
      });
    const r1 = await postMemberships(req(`__Host-sesion=${planoDueno}`));
    expect(r1.status).toBe(201);
    const r2 = await postMemberships(req(`__Host-sesion=${planoDueno}`));
    expect(r2.status).toBe(409);

    const planoAjeno = sesionEnStore("vecino");
    const rCross = await postMemberships(req(`__Host-sesion=${planoAjeno}`));
    expect(rCross.status).toBe(403);

    const tamper = `${planoDueno.slice(0, -1)}x`;
    const rTamper = await postMemberships(req(`__Host-sesion=${tamper}`));
    expect(rTamper.status).toBe(403);
    expect(membershipSchema.safeParse({ google_sub: "e", rol: "jefe" }).success).toBe(false);
  });

  it("accept: acepta, mismatch 403 sin datos, vencida/cancelada/usada 410, revocar invalida sesión", async () => {
    tenantEnStore("t-1", "dueno-1");
    control.users.set("emp-1", { googleSub: "emp-1", email: "juan@gmail.com", emailVerificado: true });
    const { tokenPlano, registro } = crearInvitacion({ tenantId: "t-1", email: "juan@gmail.com", rol: "empleado", ahora: AHORA });
    control.invitations.set(registro.tokenHash, { ...registro, estado: "pendiente" });
    const plano = sesionEnStore("emp-1");
    const setCookies: Array<[string, string]> = [];
    const cAceptar = ctx("http://x/api/invitations/accept", {
      method: "POST",
      body: { token: tokenPlano },
      headers: { cookie: `__Host-sesion=${plano}` },
    });
    const origSet = cAceptar.cookies.set.bind(cAceptar.cookies);
    cAceptar.cookies.set = ((k: string, v: string, o?: Record<string, unknown>) => {
      setCookies.push([k, v]);
      return origSet(k, v);
    }) as typeof cAceptar.cookies.set;
    const r = await postAccept(cAceptar);
    expect(r.status).toBe(201);
    // Rotación: la sesión con la que aceptó queda revocada.
    expect(resolverSesionPorPlano(plano)).toBeNull();

    control.users.set("otro", { googleSub: "otro", email: "otro@gmail.com", emailVerificado: true });
    const inv2 = crearInvitacion({ tenantId: "t-1", email: "juan@gmail.com", rol: "empleado", ahora: AHORA });
    control.invitations.set(inv2.registro.tokenHash, { ...inv2.registro, estado: "pendiente" });
    const planoOtro = sesionEnStore("otro");
    const rMismatch = await postAccept(
      ctx("http://x/api/invitations/accept", {
        method: "POST",
        body: { token: inv2.tokenPlano },
        headers: { cookie: `__Host-sesion=${planoOtro}` },
      }),
    );
    expect(rMismatch.status).toBe(403);
    expect(JSON.stringify(await rMismatch.json())).not.toContain("Kiosco");

    for (const estado of ["vencida", "cancelada", "aceptada"] as const) {
      const inv = crearInvitacion({ tenantId: "t-1", email: "nuevo@gmail.com", rol: "empleado", ahora: AHORA });
      control.invitations.set(inv.registro.tokenHash, {
        ...inv.registro,
        estado: estado === "vencida" ? "pendiente" : estado,
        expiraAt: estado === "vencida" ? "2020-01-01T00:00:00.000Z" : inv.registro.expiraAt,
      });
      control.users.set("nuevo", { googleSub: "nuevo", email: "nuevo@gmail.com", emailVerificado: true });
      const p = sesionEnStore("nuevo");
      const rr = await postAccept(
        ctx("http://x/api/invitations/accept", {
          method: "POST",
          body: { token: inv.tokenPlano },
          headers: { cookie: `__Host-sesion=${p}` },
        }),
      );
      expect(rr.status).toBe(410);
    }

    // Revocación: la siguiente request con esa sesión se rechaza.
    const m = [...control.memberships.values()].find((x) => x.googleSub === "emp-1");
    expect(m).toBeDefined();
    const nuevaSesion = setCookies.length > 0 ? String(setCookies[0]?.[1] ?? "") : "";
    if (m && nuevaSesion) {
      m.estado = "revocado";
      m.revocadoAt = AHORA.toISOString();
      m.revocadoPor = "dueno-1";
      for (const s of control.sessions.values()) {
        if (s.googleSub === "emp-1") s.revocadaAt = AHORA.toISOString();
      }
      expect(resolverSesionPorPlano(nuevaSesion)).toBeNull();
    }
  });
});

describe("contratos", () => {
  it("identidad sin columnas de contraseña y permisos de lista cerrada", () => {
    for (const nombre of Object.keys(schema)) {
      expect(nombre).not.toMatch(/password|passwd|hash_clave|refresh_token|access_token/i);
    }
    expect([...PERMISOS_EMPLEADO]).toEqual(["registrar_devoluciones", "registrar_retiros_caja", "ver_saldos_caja", "crear_productos"]);
  });
});
