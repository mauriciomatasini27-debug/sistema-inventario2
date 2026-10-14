import { describe, expect, it } from "vitest";
import { decidir_respuesta, detectar_intencion, extraer_termino, formatear_stock } from "../src/modules/whatsapp/consulta.js";
import { puede_enviar_whatsapp, parsear_comando_aviso } from "../src/modules/whatsapp/optin.js";
import { normalizar_ar, parsear_vincular, verificar_vincular } from "../src/modules/whatsapp/vincular.js";
import { DeduplicadorWamid, verificar_firma_meta } from "../src/modules/whatsapp/webhook.js";
import { RESPUESTA_NO_VINCULADO, resolver_comercio } from "../src/modules/whatsapp/resolucion.js";
import { puede_enviar_respaldo, verificar_respaldo } from "../src/modules/whatsapp/codigo-respaldo.js";
import {
  atender_consulta,
  autorizar_operacion,
  buscar_en_catalogo,
  emitir_contexto,
  type ContextoBot,
  type ItemVivo,
} from "../src/modules/whatsapp/servicio.js";

describe("bot wa minimo B1 vincular", () => {
  it("normaliza AR sin 0 ni 15 a E.164", () => {
    expect(normalizar_ar("11 5555-1234")).toBe("+5491155551234");
    expect(normalizar_ar("011 15-5555-1234")).toBe("+5491155551234");
    expect(normalizar_ar("+54 9 11 5555 1234")).toBe("+5491155551234");
    expect(normalizar_ar("abc")).toBeNull();
  });

  it("VINCULAR valida remitente + vencimiento sin revelar comercio", () => {
    const pendiente = { codigoHash: "h1", expiraEn: 1000, usado: false, numeroRegistrado: "+5491100000000" };
    const ok = verificar_vincular({
      textoEntrante: "VINCULAR 482913",
      remitenteE164: "+5491100000000",
      codigoIngresadoHash: "h1",
      pendiente,
      ahoraMs: 500,
    });
    expect(ok).toEqual({ ok: true, numero: "+5491100000000" });
    const distinto = verificar_vincular({
      textoEntrante: "VINCULAR 482913",
      remitenteE164: "+5491199999999",
      codigoIngresadoHash: "h1",
      pendiente,
      ahoraMs: 500,
    });
    expect(distinto).toEqual({ ok: false, motivo: "numero_distinto" });
    const vencido = verificar_vincular({
      textoEntrante: "VINCULAR 482913",
      remitenteE164: "+5491100000000",
      codigoIngresadoHash: "h1",
      pendiente,
      ahoraMs: 2000,
    });
    expect(vencido).toEqual({ ok: false, motivo: "vencido" });
    expect(parsear_vincular("cuantos milka tengo")).toBeNull();
  });
});

describe("bot wa minimo B2 opt-in/out", () => {
  it("BAJA desactiva, ALTA reactiva, pausa 7 dias por defecto", () => {
    expect(parsear_comando_aviso("BAJA")).toEqual({ kind: "baja" });
    expect(parsear_comando_aviso("alta")).toEqual({ kind: "alta" });
    expect(parsear_comando_aviso("pausar avisos")).toEqual({ kind: "pausa", dias: 7 });
    expect(parsear_comando_aviso("aviso 7:30")).toEqual({ kind: "cambio_hora", hora: "07:30" });
    expect(puede_enviar_whatsapp({ optIn: false, avisoHora: "08:00", pausadoHastaMs: null }, 0)).toBe(false);
    expect(puede_enviar_whatsapp({ optIn: true, avisoHora: "08:00", pausadoHastaMs: 100 }, 50)).toBe(false);
    expect(puede_enviar_whatsapp({ optIn: true, avisoHora: "08:00", pausadoHastaMs: null }, 50)).toBe(true);
  });
});

describe("bot wa minimo consulta stock", () => {
  it("detecta intencion stock/precio y desambigua por margen", () => {
    expect(detectar_intencion("cuantos Milka tengo")).toBe("stock");
    expect(detectar_intencion("precio del Jorgito")).toBe("precio");
    expect(extraer_termino("cuantos Milka tengo").length).toBeGreaterThan(0);
    const r = decidir_respuesta([
      { sku: "a", nombre: "Milka leche", score: 0.9 },
      { sku: "b", nombre: "Milka oreo", score: 0.88 },
    ]);
    expect(r.kind).toBe("desambiguar");
    const directo = decidir_respuesta([{ sku: "a", nombre: "Jorgito", score: 0.95 }]);
    expect(directo).toEqual({ kind: "directo", sku: "a" });
    expect(decidir_respuesta([])).toEqual({ kind: "sin_resultados" });
    expect(formatear_stock({ nombre: "Jorgito", stock: 14, umbral: 10, precioCentavos: 90000n, comercio: "Kiosco" })).toContain("14 u.");
  });
});

describe("bot wa minimo webhook", () => {
  it("firma invalida se rechaza y wamid no se procesa dos veces", async () => {
    const { createHmac } = await import("node:crypto");
    const secret = "s3cr3t";
    const raw = '{"hola":1}';
    const buena = `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
    expect(verificar_firma_meta({ appSecret: secret, rawBody: raw, signatureHeader: buena })).toBe(true);
    expect(verificar_firma_meta({ appSecret: secret, rawBody: raw, signatureHeader: "sha256=mal" })).toBe(false);
    const d = new DeduplicadorWamid();
    const m = { wamid: "w1", remitenteE164: "+5491100000000", texto: "hola", timestampMs: 0 };
    expect(d.es_duplicado(m, 0)).toBe(false);
    expect(d.es_duplicado(m, 1000)).toBe(true);
  });
});

describe("bot wa B1.4 resolucion comercio", () => {
  const tenants = [{ id: "t-a", estado: "activo" as const }];
  const memberships = [{ tenantId: "t-a", googleSub: "g-1", rol: "dueno" as const, estado: "activo" as const }];
  const identidades = [{ numeroE164: "+5491100000000", googleSub: "g-1", tenantId: "t-a", estado: "verificado" as const }];

  it("resuelve numero a tenant sin leer el contenido del mensaje", () => {
    const r = resolver_comercio({ remitenteE164: "+5491100000000", identidades, memberships, tenants });
    expect(r).toEqual({ ok: true, tenantId: "t-a", googleSub: "g-1", rol: "dueno", soloLectura: false });
  });

  it("numero no vinculado no recibe datos", () => {
    const r = resolver_comercio({ remitenteE164: "+5491199999999", identidades, memberships, tenants });
    expect(r).toEqual({ ok: false, motivo: "no_vinculado" });
    expect(RESPUESTA_NO_VINCULADO).not.toContain("t-a");
  });

  it("un mensaje del comercio A nunca resuelve al comercio B", () => {
    const multi = {
      identidades: [
        ...identidades,
        { numeroE164: "+5491122222222", googleSub: "g-2", tenantId: "t-b", estado: "verificado" as const },
      ],
      memberships: [
        ...memberships,
        { tenantId: "t-b", googleSub: "g-2", rol: "dueno" as const, estado: "activo" as const },
      ],
      tenants: [...tenants, { id: "t-b", estado: "activo" as const }],
    };
    const r = resolver_comercio({ remitenteE164: "+5491100000000", ...multi });
    expect(r).toEqual({ ok: true, tenantId: "t-a", googleSub: "g-1", rol: "dueno", soloLectura: false });
  });

  it("revocado, sin membership y suspendido se degradan sin datos", () => {
    const rev = resolver_comercio({
      remitenteE164: "+5491100000000",
      identidades: [{ ...identidades[0]!, estado: "revocado" }],
      memberships,
      tenants,
    });
    expect(rev).toEqual({ ok: false, motivo: "revocado" });
    const sinM = resolver_comercio({ remitenteE164: "+5491100000000", identidades, memberships: [], tenants });
    expect(sinM).toEqual({ ok: false, motivo: "sin_membership" });
    const susp = resolver_comercio({
      remitenteE164: "+5491100000000",
      identidades,
      memberships,
      tenants: [{ id: "t-a", estado: "suspendido" }],
    });
    expect(susp).toEqual({ ok: true, tenantId: "t-a", googleSub: "g-1", rol: "dueno", soloLectura: true });
  });
});

describe("bot wa B1.2 respaldo codigo por plantilla", () => {
  const base = { numeroE164: "+5491100000000", codigoHash: "h9", expiraEnMs: 1000, usadoEnMs: null, intentos: 0 };

  it("limita a 3 envios por hora y exige plantilla aprobada", () => {
    expect(puede_enviar_respaldo({ enviosPreviosMs: [100, 200], ahoraMs: 500, plantillaDisponible: true })).toEqual({ ok: true });
    expect(
      puede_enviar_respaldo({ enviosPreviosMs: [100, 200, 300], ahoraMs: 500, plantillaDisponible: true }),
    ).toEqual({ ok: false, motivo: "limite_hora" });
    expect(puede_enviar_respaldo({ enviosPreviosMs: [], ahoraMs: 500, plantillaDisponible: false })).toEqual({
      ok: false,
      motivo: "plantilla_no_disponible",
    });
  });

  it("verifica un solo uso con 5 intentos y 10 min", () => {
    expect(verificar_respaldo({ pendiente: base, codigoIngresadoHash: "h9", ahoraMs: 500 })).toEqual({ ok: true });
    expect(verificar_respaldo({ pendiente: base, codigoIngresadoHash: "otro", ahoraMs: 500 })).toEqual({
      ok: false,
      motivo: "codigo_invalido",
    });
    expect(verificar_respaldo({ pendiente: { ...base, intentos: 5 }, codigoIngresadoHash: "h9", ahoraMs: 500 })).toEqual({
      ok: false,
      motivo: "intentos_agotados",
    });
    expect(verificar_respaldo({ pendiente: base, codigoIngresadoHash: "h9", ahoraMs: 2000 })).toEqual({
      ok: false,
      motivo: "vencido",
    });
    expect(
      verificar_respaldo({ pendiente: { ...base, usadoEnMs: 600 }, codigoIngresadoHash: "h9", ahoraMs: 700 }),
    ).toEqual({ ok: false, motivo: "usado" });
    expect(verificar_respaldo({ pendiente: null, codigoIngresadoHash: "h9", ahoraMs: 500 })).toEqual({
      ok: false,
      motivo: "inexistente",
    });
  });
});

describe("bot wa slice C stock en vivo", () => {
  const catalogo: ItemVivo[] = [
    { sku: "j1", nombre: "Alfajor Jorgito", stock: 14, umbral: 10, precioCentavos: 90000n, costoCentavos: 60000n, proveedor: "Golosinas Sur", alias: ["jorjito", "jorgito"] },
    { sku: "m1", nombre: "Milka leche 100 g", stock: 6, umbral: 4, precioCentavos: 230000n, costoCentavos: 150000n, proveedor: "Distribuidora X" },
    { sku: "m2", nombre: "Milka oreo 100 g", stock: 0, umbral: 4, precioCentavos: 230000n, proveedor: "Distribuidora X" },
  ];
  const dueno: ContextoBot = { userId: "g-1", tenantId: "t-a", rol: "dueno", expiraEnMs: 10000, soloLectura: false };
  const empleado: ContextoBot = { userId: "g-2", tenantId: "t-a", rol: "empleado", expiraEnMs: 10000, soloLectura: false };

  it("contexto expira y autorizacion respeta rol y suspension", () => {
    expect(emitir_contexto({ ok: true, tenantId: "t-a", googleSub: "g-1", rol: "dueno", soloLectura: true }, 1000).soloLectura).toBe(true);
    expect(autorizar_operacion(dueno, "ver_costos", [], 500)).toEqual({ ok: true });
    expect(autorizar_operacion(empleado, "ver_costos", [], 500)).toEqual({ ok: false, motivo: "sin_permiso" });
    expect(autorizar_operacion(empleado, "ver_costos", ["ver_costos"], 500)).toEqual({ ok: true });
    expect(autorizar_operacion(empleado, "consultar_stock", [], 500)).toEqual({ ok: true });
    expect(autorizar_operacion(empleado, "pedir", [], 500)).toEqual({ ok: false, motivo: "sin_permiso" });
    expect(autorizar_operacion({ ...dueno, soloLectura: true }, "pedir", [], 500)).toEqual({ ok: false, motivo: "solo_lectura" });
    expect(autorizar_operacion(dueno, "consultar_stock", [], 20000)).toEqual({ ok: false, motivo: "no_resuelto" });
  });

  it("alias resuelve y respuesta directa trae stock+precio+proveedor", () => {
    expect(buscar_en_catalogo(catalogo, "jorjito")[0]?.sku).toBe("j1");
    const r = atender_consulta({ ctx: dueno, texto: "me quedan jorjitos?", catalogo, comercio: "Kiosco" });
    expect(r.kind).toBe("respuesta");
    if (r.kind === "respuesta") {
      expect(r.texto).toContain("14 u.");
      expect(r.texto).toContain("Proveedor: Golosinas Sur");
      expect(r.texto).toContain("Costo $600");
      expect(r.texto).toContain("[Kiosco]");
    }
  });

  it("empleado ve precio pero nunca costo ni margen", () => {
    const r = atender_consulta({ ctx: empleado, texto: "precio del Jorgito", catalogo, comercio: "Kiosco" });
    expect(r.kind).toBe("respuesta");
    if (r.kind === "respuesta") {
      expect(r.texto).toContain("$900");
      expect(r.texto).not.toContain("Costo");
      expect(r.texto).not.toContain("margen");
    }
  });

  it("ambiguedad desambigua y alertas listan stock bajo", () => {
    const d = atender_consulta({ ctx: dueno, texto: "cuantos Milka tengo", catalogo, comercio: "Kiosco" });
    expect(d.kind).toBe("desambiguar");
    const a = atender_consulta({ ctx: dueno, texto: "que me falta", catalogo, comercio: "Kiosco" });
    expect(a.kind).toBe("respuesta");
    if (a.kind === "respuesta") expect(a.texto).toContain("Milka oreo 100 g");
  });
});
