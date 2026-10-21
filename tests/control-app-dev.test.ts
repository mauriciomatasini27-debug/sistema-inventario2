import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as asistente } from "../src/pages/api/asistente.js";
import { GET as sesionActual } from "../src/pages/api/auth/sesion-actual.js";
import { POST, TENANT_CONTROL_APP } from "../src/pages/api/dev/control-app.js";
import { resetStore } from "../src/lib/store.js";
import { ctx } from "./helpers/ctx.js";

function cookieDe(respuesta: Response): string {
  const cabecera = respuesta.headers.get("set-cookie") ?? "";
  const par = (cabecera.split(";")[0] ?? "").trim();
  if (!par.startsWith("__Host-sesion=")) throw new Error(`cookie inesperada: ${par}`);
  return par;
}

async function pedir(cuerpo: unknown, headers?: HeadersInit): Promise<Response> {
  const init = { method: "POST" as const, body: cuerpo as Record<string, unknown>, ...(headers ? { headers } : {}) };
  return await POST(ctx("/api/dev/control-app", init));
}

async function login(rol: "duenio" | "empleado"): Promise<Response> {
  return pedir({ accion: "login", rol });
}

describe("control-app: endpoint dev", () => {
  beforeEach(() => {
    resetStore();
    process.env.CONTROL_APP_DEV = "1";
    process.env.NODE_ENV = "test";
    delete process.env.TENANT_MODE;
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
  });

  afterEach(() => {
    resetStore();
    delete process.env.CONTROL_APP_DEV;
  });

  it("siembra un tenant con productos, roles y device", async () => {
    const r = await pedir({ accion: "seed" });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo).toMatchObject({
      ok: true,
      tenant: { id: TENANT_CONTROL_APP, nombre: "Almacén Control App" },
      usuarios: {
        duenio: { email: "duenio@control-app.local" },
        empleado: { email: "empleado@control-app.local" },
      },
      device_code: "CONTROL-APP-01",
    });
    expect(cuerpo.productos).toHaveLength(3);
    expect(cuerpo.productos.find((p: { sku: string }) => p.sku === "YERBA-002")).toMatchObject({ stock: 3, min_stock: 5 });
  });

  it("siembra dos veces sin duplicar el tenant", async () => {
    await pedir({ accion: "seed" });
    const segunda = await pedir({ accion: "seed" });
    expect(segunda.status).toBe(200);
    const cuerpo = await segunda.json();
    expect(cuerpo.productos).toHaveLength(3);
  });

  it("el login de Dueño devuelve cookie de sesión y la API la reconoce", async () => {
    await pedir({ accion: "seed" });
    const loginR = await login("duenio");
    expect(loginR.status).toBe(200);
    const cookie = cookieDe(loginR);
    expect(cookie).toContain("__Host-sesion=");
    expect(loginR.headers.get("set-cookie")).toMatch(/HttpOnly/i);

    const actual = await sesionActual(ctx("/api/auth/sesion-actual", { headers: { cookie } }));
    expect(await actual.json()).toMatchObject({ logueado: true, nombre: "Mora Dueña" });
  });

  it("el login de empleado devuelve su nombre", async () => {
    await pedir({ accion: "seed" });
    const cookie = cookieDe(await login("empleado"));
    const actual = await sesionActual(ctx("/api/auth/sesion-actual", { headers: { cookie } }));
    expect(await actual.json()).toMatchObject({ logueado: true, nombre: "Tomi Empleado" });
  });

  it("el asistente responde con el proveedor fake bajo control-app", async () => {
    await pedir({ accion: "seed" });
    const cookie = cookieDe(await login("duenio"));
    const r = await asistente(
      ctx("/api/asistente", { body: { pregunta: "¿Cuánto vendí este mes?" }, headers: { cookie } }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ herramienta: "ventas_periodo", rechazada: false });
  });

  it("sin seed, el login pide sembrar primero", async () => {
    const r = await login("duenio");
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ hint: expect.stringContaining("control-app seed") });
  });

  it("rechaza roles y acciones desconocidas con próximo paso", async () => {
    await pedir({ accion: "seed" });
    const rol = await pedir({ accion: "login", rol: "jefe" });
    expect(rol.status).toBe(422);
    expect(await rol.json()).toMatchObject({ error: "Rol inválido.", hint: expect.stringContaining("--rol") });

    const accion = await pedir({ accion: "borrar-todo" });
    expect(accion.status).toBe(422);
    expect(await accion.json()).toMatchObject({ hint: expect.stringContaining("seed, login") });
  });

  it("está apagado fuera de desarrollo local", async () => {
    delete process.env.CONTROL_APP_DEV;
    const apagado = await pedir({ accion: "seed" });
    expect(apagado.status).toBe(404);
    expect(await apagado.json()).toMatchObject({ hint: expect.stringContaining("CONTROL_APP_DEV=1") });

    process.env.CONTROL_APP_DEV = "1";
    process.env.NODE_ENV = "production";
    const produccion = await pedir({ accion: "seed" });
    expect(produccion.status).toBe(404);
  });
});
