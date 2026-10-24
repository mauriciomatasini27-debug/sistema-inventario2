import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store, type StoredFiscalDoc } from "../src/lib/store.js";
import { tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postFiscal, GET as getFiscal } from "../src/pages/api/fiscal/settings.js";
import {
  aplicarCambioFiscal,
  leerCadenaFiscal,
  registrarCambioFiscal,
  vaciarVersionesFiscales,
  type CadenaFiscal,
  type FichaFiscal,
} from "../src/modules/fiscal/version-settings.js";

const TENANT = tenantPorDefecto();
const DUENO = "fe-s3-dueno";
const EMPLEADO = "fe-s3-empleado";
const AHORA = "2026-10-24T12:00:00.000Z";
const DESPUES = "2026-10-24T13:00:00.000Z";

const BASE: FichaFiscal = {
  cuit: "20933331726",
  razon_social: "Kiosco FE",
  domicilio: "Calle 1",
  condicion_iva: "monotributo",
  inicio_actividades: "2020-01-01",
  pto_vta: "3",
  modo: "automatico",
};

function ficha(parcial: Partial<FichaFiscal>): FichaFiscal {
  return { ...BASE, ...parcial };
}

function sembrarTenant(id = TENANT) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco FE",
    slug: `kiosco-fe-${id}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: DUENO,
    esDemo: false,
  });
  control.memberships.set(`m-${id}-${DUENO}`, {
    id: `m-${id}-${DUENO}`,
    tenantId: id,
    googleSub: DUENO,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.memberships.set(`m-${id}-${EMPLEADO}`, {
    id: `m-${id}-${EMPLEADO}`,
    tenantId: id,
    googleSub: EMPLEADO,
    rol: "empleado",
    permisos: [],
    estado: "activo",
  });
}

function sesion(sub: string, reauthAt?: string): { plano: string; hash: string } {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: TENANT, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: TENANT,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: reauthAt ?? ahora.toISOString(),
  });
  return { plano: c.idPlano, hash: c.registro.idHash };
}

function cuerpo(parcial: Partial<FichaFiscal> = {}) {
  const f = ficha(parcial);
  return {
    cuit: f.cuit,
    razon_social: f.razon_social,
    domicilio: f.domicilio,
    condicion_iva: f.condicion_iva,
    inicio_actividades: f.inicio_actividades,
    pto_vta: f.pto_vta,
    modo: f.modo,
  };
}

function comprobante(tenantId: string, clave: string): StoredFiscalDoc {
  return {
    id: `id-${clave}`,
    idempotency_key: clave,
    sale_id: `sale-${clave}`,
    tenant_id: tenantId,
    cbte_tipo: "11",
    pto_vta: "3",
    cbte_nro: 124,
    cbte_fch: "20261020",
    doc_tipo: "99",
    doc_nro: "0",
    cond_iva_receptor: "5",
    estado: "autorizado",
    cae: "71234567890123",
    cae_vto: "20261030",
    qr_payload: "qr-emitido",
    imp_total_centavos: "266000",
  };
}

function sembrarComprobantes(): { propio: StoredFiscalDoc; ajeno: StoredFiscalDoc } {
  const propio = comprobante(TENANT, "sale:propio:11");
  const ajeno = comprobante("otro-comercio", "sale:ajeno:11");
  store.fiscalDocs.set(propio.idempotency_key, propio);
  store.fiscalDocs.set(ajeno.idempotency_key, ajeno);
  return { propio, ajeno };
}

function copiaDocs(): Map<string, StoredFiscalDoc> {
  return new Map([...store.fiscalDocs.entries()].map(([k, v]) => [k, { ...v }]));
}

async function post(plano: string, parcial: Partial<FichaFiscal> = {}) {
  return (await postFiscal(ctx("http://x/api/fiscal/settings", {
    body: cuerpo(parcial),
    headers: { cookie: `__Host-sesion=${plano}` },
  }))) as Response;
}

beforeEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  resetStore();
  vaciarVersionesFiscales();
  sembrarTenant();
});

describe("FE-S3 decidir versión de identidad fiscal", () => {
  const vacia: CadenaFiscal = { versiones: [], auditoria: [] };

  it("un cambio de condición IVA guarda anterior y nuevo y conserva la versión previa", () => {
    const alta = aplicarCambioFiscal(vacia, null, BASE, AHORA, { tenant_id: "a", actor: DUENO });
    const cambio = aplicarCambioFiscal(alta.cadena, null, ficha({ condicion_iva: "responsable_inscripto" }), DESPUES, {
      tenant_id: "a",
      actor: DUENO,
    });
    expect(cambio.decision.tipo).toBe("cambio");
    const ultima = cambio.cadena.auditoria.at(-1);
    expect(ultima?.anterior).toEqual({ cuit: BASE.cuit, condicion_iva: "monotributo", pto_vta: "3" });
    expect(ultima?.nuevo).toEqual({ cuit: BASE.cuit, condicion_iva: "responsable_inscripto", pto_vta: "3" });
    expect(cambio.cadena.versiones.map((v) => v.ficha.condicion_iva)).toEqual(["monotributo", "responsable_inscripto"]);
    expect(cambio.cadena.versiones[0]?.vigente_desde).toBe(AHORA);
  });

  it("repetir la misma ficha no agrega otra auditoría", () => {
    const alta = aplicarCambioFiscal(vacia, null, BASE, AHORA, { tenant_id: "a", actor: DUENO });
    const otra = aplicarCambioFiscal(alta.cadena, null, BASE, DESPUES, { tenant_id: "a", actor: DUENO });
    expect(otra.decision.tipo).toBe("igual");
    expect(otra.cadena.auditoria).toHaveLength(1);
    expect(otra.cadena.versiones).toHaveLength(1);
  });

  it("domicilio, razón o modo no versionan la identidad", () => {
    const alta = aplicarCambioFiscal(vacia, null, BASE, AHORA, { tenant_id: "a", actor: DUENO });
    const ajuste = aplicarCambioFiscal(
      alta.cadena,
      null,
      ficha({ domicilio: "Calle 9", razon_social: "Kiosco Nuevo", modo: "manual" }),
      DESPUES,
      { tenant_id: "a", actor: DUENO },
    );
    expect(ajuste.decision.tipo).toBe("ajuste");
    expect(ajuste.cadena.auditoria).toHaveLength(1);
    expect(ajuste.cadena.versiones).toHaveLength(1);
    expect(ajuste.cadena.versiones[0]?.ficha.domicilio).toBe("Calle 9");
    expect(ajuste.cadena.versiones[0]?.version).toBe(1);
  });

  it("la cadena de un comercio no entra en la de otro", () => {
    registrarCambioFiscal("comercio-a", null, BASE, AHORA, DUENO);
    registrarCambioFiscal("comercio-b", null, ficha({ cuit: "27123456780", condicion_iva: "exento", pto_vta: "8" }), DESPUES, DUENO);
    const a = leerCadenaFiscal("comercio-a");
    const b = leerCadenaFiscal("comercio-b");
    expect(a.auditoria).toHaveLength(1);
    expect(a.versiones[0]?.ficha.cuit).toBe(BASE.cuit);
    expect(b.auditoria[0]?.nuevo.condicion_iva).toBe("exento");
    expect(b.auditoria[0]?.tenant_id).toBe("comercio-b");
    expect(a.auditoria[0]?.tenant_id).toBe("comercio-a");
  });
});

describe("FE-S3 POST /api/fiscal/settings", () => {
  it("el empleado recibe 403 y no audita ni toca comprobantes emitidos", async () => {
    const dueno = sesion(DUENO);
    const alta = await post(dueno.plano);
    expect(alta.status).toBe(201);
    sembrarComprobantes();
    const foto = copiaDocs();
    const empleado = sesion(EMPLEADO);
    const r = await post(empleado.plano, { condicion_iva: "responsable_inscripto", pto_vta: "9" });
    expect(r.status).toBe(403);
    expect(leerCadenaFiscal(TENANT).auditoria).toHaveLength(1);
    expect(leerCadenaFiscal(TENANT).versiones[0]?.ficha.condicion_iva).toBe("monotributo");
    expect(copiaDocs()).toEqual(foto);
  });

  it("el Dueño con reauth vieja recibe 401 y la identidad queda igual", async () => {
    const dueno = sesion(DUENO);
    expect((await post(dueno.plano)).status).toBe(201);
    sembrarComprobantes();
    const foto = copiaDocs();
    const audios = leerCadenaFiscal(TENANT).auditoria.length;
    const guardada = control.sessions.get(dueno.hash);
    if (!guardada) throw new Error("sesión ausente");
    guardada.reauthAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const r = await post(dueno.plano, { condicion_iva: "responsable_inscripto" });
    expect(r.status).toBe(401);
    const cuerpo401 = (await r.json()) as { codigo?: string; reauth_url?: string };
    expect(cuerpo401.codigo).toBe("reauth_requerida");
    expect(cuerpo401.reauth_url).toBe("/api/auth/reauth");
    expect(leerCadenaFiscal(TENANT).auditoria).toHaveLength(audios);
    expect(leerCadenaFiscal(TENANT).versiones.at(-1)?.ficha.condicion_iva).toBe("monotributo");
    expect(copiaDocs()).toEqual(foto);
  });

  it("el Dueño con reauth fresca audita anterior y nuevo al cambiar condición, CUIT y punto de venta", async () => {
    const dueno = sesion(DUENO);
    sembrarComprobantes();
    const foto = copiaDocs();
    const alta = await post(dueno.plano);
    expect(alta.status).toBe(201);
    const r = await post(dueno.plano, {
      cuit: "27123456780",
      condicion_iva: "responsable_inscripto",
      pto_vta: "9",
    });
    expect(r.status).toBe(201);
    const j = (await r.json()) as {
      version: number;
      condicion_iva: string;
      auditoria: { anterior: { cuit: string; condicion_iva: string; pto_vta: string }; nuevo: { cuit: string; condicion_iva: string; pto_vta: string }; actor: string };
    };
    expect(j.version).toBe(2);
    expect(j.condicion_iva).toBe("responsable_inscripto");
    expect(j.auditoria.anterior).toEqual({ cuit: "20933331726", condicion_iva: "monotributo", pto_vta: "3" });
    expect(j.auditoria.nuevo).toEqual({ cuit: "27123456780", condicion_iva: "responsable_inscripto", pto_vta: "9" });
    expect(j.auditoria.actor).toBe(DUENO);
    const lectura = (await getFiscal(ctx("http://x/api/fiscal/settings", {
      method: "GET",
      headers: { cookie: `__Host-sesion=${dueno.plano}` },
    }))) as Response;
    expect(lectura.status).toBe(200);
    const got = (await lectura.json()) as {
      cuit: string;
      pto_vta: string;
      auditoria: Array<{ anterior: { condicion_iva: string } | null; nuevo: { condicion_iva: string } }>;
    };
    expect(got.cuit).toBe("27123456780");
    expect(got.pto_vta).toBe("9");
    expect(got.auditoria.at(-1)?.anterior?.condicion_iva).toBe("monotributo");
    expect(got.auditoria.at(-1)?.nuevo.condicion_iva).toBe("responsable_inscripto");
    const repetido = await post(dueno.plano, {
      cuit: "27123456780",
      condicion_iva: "responsable_inscripto",
      pto_vta: "9",
    });
    expect(repetido.status).toBe(201);
    const rep = (await repetido.json()) as { auditoria: unknown; version: number };
    expect(rep.auditoria).toBeNull();
    expect(rep.version).toBe(2);
    expect(leerCadenaFiscal(TENANT).auditoria).toHaveLength(2);
    expect(copiaDocs()).toEqual(foto);
    expect(store.fiscalDocs.get("sale:propio:11")?.cae).toBe("71234567890123");
    expect(store.fiscalDocs.get("sale:propio:11")?.pto_vta).toBe("3");
    expect(store.fiscalDocs.get("sale:propio:11")?.estado).toBe("autorizado");
    expect(store.fiscalDocs.get("sale:ajeno:11")?.cae).toBe("71234567890123");
  });
});
