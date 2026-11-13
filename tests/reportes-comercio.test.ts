import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as reportesDb from "../src/lib/reportes-comercio-db.js";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { resetAdmin } from "../src/lib/admin-store.js";
import { resetReportesComercio } from "../src/lib/reportes-comercio-store.js";
import { resetRateLimitReportes } from "../src/modules/reportes-comercio/rate-limit.js";
import { resetTablaReportesProbe } from "../src/lib/reportes-comercio-db.js";
import { contextoSeguro } from "../src/modules/reportes-comercio/contexto.js";
import { borradorIssueDesdeReporte } from "../src/modules/reportes-comercio/export-issue.js";
import { GET as GETReportes, POST as POSTReportes } from "../src/pages/api/reportes/index.js";
import { GET as GETReporteId } from "../src/pages/api/reportes/[id].js";
import { GET as GETAdminReportes } from "../src/pages/api/admin/reportes/index.js";
import { GET as GETAdminReporteId, PATCH as PATCHAdminReporte } from "../src/pages/api/admin/reportes/[id].js";

function sesionPlano(sub: string, tenantId: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function sembrarTenants() {
  control.tenants.set("t-esquina", {
    id: "t-esquina",
    nombreComercio: "Almacén La Esquina",
    slug: "esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "duena-1",
    esDemo: false,
  });
  control.tenants.set("t-sanjose", {
    id: "t-sanjose",
    nombreComercio: "Despensa San José",
    slug: "sanjose",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "duena-2",
    esDemo: false,
  });
  const permisosDueno: string[] = [];
  const permisosEmpleado: string[] = [];
  control.memberships.set("m1", {
    id: "m1",
    tenantId: "t-esquina",
    googleSub: "duena-1",
    rol: "dueno",
    estado: "activo",
    permisos: permisosDueno,
  });
  control.memberships.set("m2", {
    id: "m2",
    tenantId: "t-esquina",
    googleSub: "empleado-1",
    rol: "empleado",
    estado: "activo",
    permisos: permisosEmpleado,
  });
  control.memberships.set("m3", {
    id: "m3",
    tenantId: "t-sanjose",
    googleSub: "duena-2",
    rol: "dueno",
    estado: "activo",
    permisos: permisosDueno,
  });
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  resetReportesComercio();
  resetRateLimitReportes();
  resetTablaReportesProbe();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
  sembrarTenants();
  vi.spyOn(reportesDb, "persistirReporteComercio").mockResolvedValue({ ok: true });
  vi.spyOn(reportesDb, "actualizarEstadoReporteDb").mockResolvedValue({ ok: true });
  vi.spyOn(reportesDb, "leerPorClaveDb").mockResolvedValue(null);
  vi.spyOn(reportesDb, "leerReporteDb").mockResolvedValue(null);
  vi.spyOn(reportesDb, "listarPropiosDb").mockResolvedValue(null);
  vi.spyOn(reportesDb, "listarPlataformaDb").mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TB-164 reportes comercio", () => {
  it("contexto del servidor no conserva query ni tokens", () => {
    const ctxOk = contextoSeguro({
      rutaSugerida: "/venta?total=999&token=secreto",
      versionApp: "tablero B",
    });
    expect(ctxOk.ruta).toBe("/venta");
    expect(ctxOk.ruta).not.toContain("?");
    expect(ctxOk.pantalla).toBe("Venta mostrador");
  });

  it("dueña envía y empleado del mismo local no ve el envío de la dueña", async () => {
    const planoDuena = sesionPlano("duena-1", "t-esquina");
    const alta = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${planoDuena}`, "Idempotency-Key": "k-duena-1" },
        body: { tipo: "problema", texto: "No veo confirmación al cobrar", ruta_sugerida: "/venta" },
      }),
    )) as Response;
    expect(alta.status).toBe(201);
    const jAlta = (await alta.json()) as { id: string };
    const planoEmp = sesionPlano("empleado-1", "t-esquina");
    const lista = (await GETReportes(
      ctx("http://x/api/reportes", { headers: { cookie: `__Host-sesion=${planoEmp}` } }),
    )) as Response;
    expect(lista.status).toBe(200);
    const jLista = (await lista.json()) as { items: { id: string }[] };
    expect(jLista.items.some((i) => i.id === jAlta.id)).toBe(false);
    const det = (await GETReporteId(
      ctx(`http://x/api/reportes/${jAlta.id}`, {
        headers: { cookie: `__Host-sesion=${planoEmp}` },
        params: { id: jAlta.id },
      }),
    )) as Response;
    expect(det.status).toBe(404);
  });

  it("cruce de tenants: no abre reporte de otro comercio", async () => {
    const planoA = sesionPlano("duena-1", "t-esquina");
    const alta = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${planoA}`, "Idempotency-Key": "k-a" },
        body: { tipo: "sugerencia", texto: "Mejorar búsqueda por código", ruta_sugerida: "/venta" },
      }),
    )) as Response;
    const { id } = (await alta.json()) as { id: string };
    const planoB = sesionPlano("duena-2", "t-sanjose");
    const det = (await GETReporteId(
      ctx(`http://x/api/reportes/${id}`, {
        headers: { cookie: `__Host-sesion=${planoB}` },
        params: { id },
      }),
    )) as Response;
    expect(det.status).toBe(404);
  });

  it("idempotencia: misma clave no duplica", async () => {
    const plano = sesionPlano("duena-1", "t-esquina");
    const body = { tipo: "problema", texto: "Prueba de idempotencia en reportes", ruta_sugerida: "/panel" };
    const r1 = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}`, "Idempotency-Key": "clave-unica" },
        body,
      }),
    )) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}`, "Idempotency-Key": "clave-unica" },
        body,
      }),
    )) as Response;
    expect(r2.status).toBe(200);
    const lista = (await GETReportes(
      ctx("http://x/api/reportes", { headers: { cookie: `__Host-sesion=${plano}` } }),
    )) as Response;
    const j = (await lista.json()) as { items: unknown[] };
    expect(j.items).toHaveLength(1);
  });

  it("admin ve bandeja; comercio recibe 403", async () => {
    const planoDuena = sesionPlano("duena-1", "t-esquina");
    await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${planoDuena}`, "Idempotency-Key": "k-admin" },
        body: { tipo: "problema", texto: "Fallo al importar stock del proveedor", ruta_sugerida: "/panel/stock" },
      }),
    );
    const planoAdmin = sesionPlano("admin-1", "t-esquina");
    const bandeja = (await GETAdminReportes(
      ctx("http://x/api/admin/reportes", { headers: { cookie: `__Host-sesion=${planoAdmin}` } }),
    )) as Response;
    expect(bandeja.status).toBe(200);
    const j = (await bandeja.json()) as { items: { nombre_comercio: string }[] };
    expect(j.items.length).toBeGreaterThan(0);
    const denegado = (await GETAdminReportes(
      ctx("http://x/api/admin/reportes", { headers: { cookie: `__Host-sesion=${planoDuena}` } }),
    )) as Response;
    expect(denegado.status).toBe(403);
  });

  it("admin cambia estado con confirmación", async () => {
    const planoDuena = sesionPlano("duena-1", "t-esquina");
    const alta = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${planoDuena}`, "Idempotency-Key": "k-estado" },
        body: { tipo: "sugerencia", texto: "Mostrar el vuelto más grande al cobrar", ruta_sugerida: "/venta" },
      }),
    )) as Response;
    const { id } = (await alta.json()) as { id: string };
    const planoAdmin = sesionPlano("admin-1", "t-esquina");
    const patch = (await PATCHAdminReporte(
      ctx(`http://x/api/admin/reportes/${id}`, {
        method: "PATCH",
        headers: { cookie: `__Host-sesion=${planoAdmin}` },
        params: { id },
        body: {
          accion: "estado",
          estado: "en_revision",
          confirmo_id: id,
          motivo: "Triaje inicial",
        },
      }),
    )) as Response;
    expect(patch.status).toBe(200);
    const det = (await GETAdminReporteId(
      ctx(`http://x/api/admin/reportes/${id}`, {
        headers: { cookie: `__Host-sesion=${planoAdmin}` },
        params: { id },
      }),
    )) as Response;
    const j = (await det.json()) as { estado: string; borrador_issue: { titulo: string } };
    expect(j.estado).toBe("en_revision");
    expect(j.borrador_issue.titulo).toContain("Sugerencia");
    expect(borradorIssueDesdeReporte).toBeDefined();
  });

  it("sin persistencia durable responde 503 y no deja Recibido en memoria", async () => {
    vi.mocked(reportesDb.persistirReporteComercio).mockResolvedValueOnce({ ok: false, motivo: "sin_tabla" });
    const plano = sesionPlano("duena-1", "t-esquina");
    const r = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}`, "Idempotency-Key": "sin-tabla" },
        body: { tipo: "problema", texto: "Esto no debería guardarse sin tabla", ruta_sugerida: "/venta" },
      }),
    )) as Response;
    expect(r.status).toBe(503);
    const lista = (await GETReportes(
      ctx("http://x/api/reportes", { headers: { cookie: `__Host-sesion=${plano}` } }),
    )) as Response;
    const j = (await lista.json()) as { items: unknown[] };
    expect(j.items).toHaveLength(0);
  });

  it("sin sesión no envía", async () => {
    const r = (await POSTReportes(
      ctx("http://x/api/reportes", {
        method: "POST",
        headers: { "Idempotency-Key": "x" },
        body: { tipo: "problema", texto: "texto suficientemente largo", ruta_sugerida: "/venta" },
      }),
    )) as Response;
    expect(r.status).toBe(403);
  });
});
