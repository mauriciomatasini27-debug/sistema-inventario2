import { randomUUID } from "node:crypto";
import { control, resetStore, store } from "./store.js";
import { cookieSesion, crearSesion } from "../modules/auth/sesiones.js";
import { crearProveedorCobro } from "./repos/planes.js";
import { altaProducto } from "./repos/catalogo.js";
import { asegurarLoteGenerico } from "./repos/lote-generico.js";
import { aplicarMovimiento } from "./repos/stock.js";
import { parseEmailInvitacion } from "../modules/tenants/invitar-empleado.js";
import { decidirAceptacion } from "../modules/tenants/invitaciones.js";
import { aplicarAceptacionInvitacion } from "../modules/tenants/aplicar-invitacion.js";
import { marcarFalloProvision } from "../modules/tenants/provision-admin.js";
import { normalizarEmail } from "../modules/auth/oidc.js";
import { fechaAR, sumarDiasAR } from "./fecha-ar.js";

export const TENANT_CONTROL_APP = "control-app";
const SUBS = {
  duenio: "control-app-duenio",
  empleado: "control-app-empleado",
} as const;
const DEVICE = "CONTROL-APP-01";

const PRODUCTOS = [
  { sku: "CAFE-001", nombre: "Café molido 500 g", precioCentavos: 850_000, stock: 12, minStock: 4, sector: "almacen" },
  { sku: "YERBA-002", nombre: "Yerba mate 1 kg", precioCentavos: 420_000, stock: 3, minStock: 5, sector: "almacen" },
  { sku: "GASEOSA-003", nombre: "Gaseosa 2,25 L", precioCentavos: 310_000, stock: 0, minStock: 2, sector: "bebidas" },
] as const;

export function controlAppDevHabilitado(): boolean {
  return process.env.CONTROL_APP_DEV === "1" && process.env.NODE_ENV !== "production";
}

function ahora(): string {
  return new Date().toISOString();
}

function sembrar(vencidoHaceDias?: number, flota = false): Response {
  resetStore();
  const creadoEn = ahora();
  control.tenants.set(TENANT_CONTROL_APP, {
    id: TENANT_CONTROL_APP,
    nombreComercio: "Almacén Control App",
    slug: "almacen-control-app",
    estado: "activo",
    plan: "plus",
    moneda: "ARS",
    ownerGoogleSub: SUBS.duenio,
    esDemo: true,
    rubro: "almacen",
    // Fase 1: con vencido_hace_dias el tenant entra en mora para probar suspensión y gracia.
    trialHasta:
      vencidoHaceDias === undefined ? undefined : new Date(`${sumarDiasAR(fechaAR(), -vencidoHaceDias)}T00:00:00Z`).toISOString(),
  });
  if (flota) {
    const dia = 86_400_000;
    const isoHace = (d: number) => new Date(Date.now() - d * dia).toISOString();
    const isoEn = (d: number) => new Date(Date.now() + d * dia).toISOString();
    control.tenants.set("kiosco-activo", {
      id: "kiosco-activo",
      nombreComercio: "Almacén Norte",
      slug: "almacen-norte",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: SUBS.duenio,
      esDemo: false,
      trialHasta: isoEn(30),
    });
    control.tenants.set("kiosco-gracia", {
      id: "kiosco-gracia",
      nombreComercio: "Kiosco Sur",
      slug: "kiosco-sur",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: SUBS.duenio,
      esDemo: false,
      trialHasta: isoHace(7),
    });
    control.tenants.set("kiosco-suspendido", {
      id: "kiosco-suspendido",
      nombreComercio: "Depósito Centro",
      slug: "deposito-centro",
      estado: "suspendido",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: SUBS.duenio,
      esDemo: false,
      trialHasta: isoHace(20),
      suspensionTipo: "mora",
    });
  }
  control.users.set(SUBS.duenio, {
    googleSub: SUBS.duenio,
    email: "duenio@control-app.local",
    emailVerificado: true,
    nombre: "Mora Dueña",
    ultimoLoginAt: creadoEn,
  });
  control.users.set(SUBS.empleado, {
    googleSub: SUBS.empleado,
    email: "empleado@control-app.local",
    emailVerificado: true,
    nombre: "Tomi Empleado",
    ultimoLoginAt: creadoEn,
  });
  control.memberships.set("control-app-m-duenio", {
    id: "control-app-m-duenio",
    tenantId: TENANT_CONTROL_APP,
    googleSub: SUBS.duenio,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set("control-app-m-empleado", {
    id: "control-app-m-empleado",
    tenantId: TENANT_CONTROL_APP,
    googleSub: SUBS.empleado,
    rol: "empleado",
    permisos: ["registrar_devoluciones"],
    estado: "activo",
  });
  control.devices.set(DEVICE, {
    deviceCode: DEVICE,
    tenantId: TENANT_CONTROL_APP,
    registradoPor: SUBS.duenio,
    registradoEn: creadoEn,
  });
  control.offlineGrants.set("control-app-grant", {
    grantId: "control-app-grant",
    tokenHash: "control-app-token-hash",
    tenantId: TENANT_CONTROL_APP,
    googleSub: SUBS.duenio,
    deviceCode: DEVICE,
    alcance: "venta",
    expiraEn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });

  const mostrador = randomUUID();
  const deposito = randomUUID();
  store.ubicaciones.set(mostrador, { id: mostrador, nombre: "Mostrador", archivada: false });
  store.ubicaciones.set(deposito, { id: deposito, nombre: "Depósito", archivada: false });

  return Response.json({
    ok: true,
    accion: "seed",
    tenant: { id: TENANT_CONTROL_APP, nombre: "Almacén Control App", estado: "activo" },
    usuarios: {
      duenio: { email: "duenio@control-app.local", nombre: "Mora Dueña" },
      empleado: { email: "empleado@control-app.local", nombre: "Tomi Empleado" },
    },
    ubicaciones: [
      { id: mostrador, nombre: "Mostrador" },
      { id: deposito, nombre: "Depósito" },
    ],
    productos: PRODUCTOS.map((p) => ({ sku: p.sku, nombre: p.nombre, stock: p.stock, min_stock: p.minStock })),
    device_code: DEVICE,
    siguiente: "control-app login --rol duenio",
  });
}

export async function sembrarControlApp(vencidoHaceDias?: number, flota = false): Promise<Response> {
  const r = sembrar(vencidoHaceDias, flota);
  if (!r.ok) return r;
  for (const p of PRODUCTOS) {
    const alta = await altaProducto({
      sku: p.sku,
      nombre: p.nombre,
      precioCentavos: p.precioCentavos,
      sector: p.sector,
      controlaVencimiento: false,
      minStock: p.minStock,
      reorderQty: Math.max(1, p.minStock),
    });
    if (!alta.ok) return Response.json({ error: `No pude sembrar ${p.sku}: ${alta.error}` }, { status: 500 });
    const loteId = await asegurarLoteGenerico(p.sku);
    await aplicarMovimiento({
      idemKey: `control-app:alta:${p.sku}`,
      sku: p.sku,
      loteId,
      delta: p.stock,
      tipo: "ALTA",
      motivo: "seed control-app",
      condicionResto: 0,
    });
  }
  await crearProveedorCobro().crearSuscripcion({ tenantId: TENANT_CONTROL_APP, planId: "plus" });
  const cuerpo = (await r.json()) as Record<string, unknown>;
  return Response.json({ ...cuerpo, plan: "plus" });
}

export function iniciarSesionControlApp(rol: "duenio" | "empleado"): Response {
  if (!control.tenants.has(TENANT_CONTROL_APP)) {
    return Response.json(
      {
        error: "No hay tenant sembrado.",
        hint: "Corré `control-app seed` antes de `control-app login`.",
      },
      { status: 409 },
    );
  }
  const googleSub = SUBS[rol];
  const membership = control.memberships.get(rol === "duenio" ? "control-app-m-duenio" : "control-app-m-empleado");
  if (!membership || membership.estado !== "activo") {
    return Response.json(
      {
        error: `No hay membership activa para ${rol}.`,
        hint: "Corré `control-app seed` para recrear el tenant de prueba.",
      },
      { status: 409 },
    );
  }
  const creada = crearSesion({ googleSub, tenantId: TENANT_CONTROL_APP });
  const creadoEn = ahora();
  control.sessions.set(creada.registro.idHash, {
    idHash: creada.registro.idHash,
    googleSub,
    tenantId: TENANT_CONTROL_APP,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: creadoEn,
    reauthAt: creadoEn,
    agente: "control-app",
  });
  const cookie = cookieSesion(creada.idPlano, creada.registro.expiraAt);
  return Response.json(
    {
      ok: true,
      accion: "login",
      rol,
      tenant_id: TENANT_CONTROL_APP,
      nombre: control.users.get(googleSub)?.nombre ?? rol,
      cookie,
      siguiente: rol === "duenio" ? "control-app ir /panel" : "control-app ir /venta",
    },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}

export async function iniciarSesionInvitadoControlApp(emailCrudo: string): Promise<Response> {
  const email = parseEmailInvitacion(emailCrudo);
  if (!email) {
    return Response.json({ error: "El email no es válido." }, { status: 422 });
  }
  const buscado = normalizarEmail(email);
  const inv = [...control.invitations.values()].find(
    (i) => i.estado === "pendiente" && normalizarEmail(i.email) === buscado,
  );
  if (!inv) {
    return Response.json({ error: "No hay una invitación pendiente para ese email." }, { status: 404 });
  }
  const tenant = control.tenants.get(inv.tenantId);
  if (!tenant) {
    return Response.json({ error: "No hay una invitación pendiente para ese email." }, { status: 404 });
  }
  const googleSub = `dev-invitado:${buscado}`;
  const ahoraIso = ahora();
  control.users.set(googleSub, {
    googleSub,
    email: buscado,
    emailVerificado: true,
    nombre: "Dueño invitado",
    ultimoLoginAt: ahoraIso,
  });
  const miembros = [...control.memberships.values()].filter((m) => m.tenantId === inv.tenantId && m.estado === "activo").length;
  const yaEs = [...control.memberships.values()].some(
    (m) => m.tenantId === inv.tenantId && m.googleSub === googleSub && m.estado === "activo",
  );
  const d = decidirAceptacion({
    invitacion: inv,
    emailSesion: buscado,
    emailVerificado: true,
    miembrosActivos: miembros,
    plan: tenant.plan,
    yaEsMiembro: yaEs,
  });
  if (!d.acepta) {
    return Response.json({ error: "No se pudo aceptar la invitación.", motivo: d.motivo }, { status: 409 });
  }
  const aceptada = await aplicarAceptacionInvitacion(inv, googleSub);
  const creada = crearSesion({ googleSub, tenantId: aceptada.tenantId });
  control.sessions.set(creada.registro.idHash, {
    idHash: creada.registro.idHash,
    googleSub,
    tenantId: aceptada.tenantId,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahoraIso,
    reauthAt: ahoraIso,
    agente: "control-app",
  });
  const cookie = cookieSesion(creada.idPlano, creada.registro.expiraAt);
  return Response.json(
    {
      ok: true,
      accion: "login_invitado",
      tenant_id: aceptada.tenantId,
      rol: aceptada.rol,
      google_sub: googleSub,
      owner_google_sub: control.tenants.get(aceptada.tenantId)?.ownerGoogleSub,
      cookie,
    },
    { status: 200, headers: { "Set-Cookie": cookie } },
  );
}

export function fallarProvisionControlApp(tenantId: string): Response {
  if (!control.tenants.has(tenantId)) {
    return Response.json({ error: "Tenant desconocido." }, { status: 404 });
  }
  marcarFalloProvision(tenantId, "fallo simulado de prueba");
  return Response.json({ ok: true, accion: "fallar_provision", tenant_id: tenantId, estado: "error_aprovisionamiento" });
}

export function agregarMiembrosControlApp(tenantId: string, cantidad: number): Response {
  if (!control.tenants.has(tenantId)) {
    return Response.json({ error: "Tenant desconocido." }, { status: 404 });
  }
  const n = Math.floor(cantidad);
  if (!Number.isFinite(n) || n < 1 || n > 20) {
    return Response.json({ error: "Cantidad inválida." }, { status: 422 });
  }
  const creados: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const sub = `miembro-prueba-${randomUUID()}`;
    control.users.set(sub, {
      googleSub: sub,
      email: `${sub}@test.local`,
      emailVerificado: true,
      nombre: "Miembro de prueba",
      ultimoLoginAt: new Date().toISOString(),
    });
    const id = `m-${sub}`;
    control.memberships.set(id, {
      id,
      tenantId,
      googleSub: sub,
      rol: "empleado",
      permisos: [],
      estado: "activo",
    });
    creados.push(sub);
  }
  return Response.json({ ok: true, accion: "agregar_miembros", tenant_id: tenantId, agregados: creados.length });
}
