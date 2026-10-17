import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import {
  HORA_RESUMEN_MENSUAL,
  ZONA_DEFECTO,
  armar_snapshot_mensual,
  clave_resumen_mensual,
  ejecutar_resumen_mensual,
  en_ventana_mensual,
  limpiar_corridas_mensual,
  mes_cerrado,
  type ComercioResumen,
  type MovimientoResumen,
  type ResultadoResumenMensual,
} from "../src/jobs/resumen-mensual.js";
import type { ClientePyme, PagoPyme } from "../src/jobs/bot-pyme.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as POSTResumen } from "../src/pages/api/jobs/resumen-mensual.js";
import { listarMovimientosConFecha } from "../src/lib/repos/caja.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { cashMovements } from "../src/db/schema.js";

const SECRET = "test-secret-jobs";
const AHORA_ISO = "2026-11-01T12:30:00Z";

// Reloj fijo: 09:30 del 1/11 en Buenos Aires (12:30Z). Solo se falsea Date,
// igual que tests/bot-pyme.test.ts.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(AHORA_ISO));
const ahoraMs = Date.parse(AHORA_ISO);

function mov(tipo: "ingreso" | "egreso", montoCentavos: bigint, origen: string, ocurridoEn: string | null): MovimientoResumen {
  return { tipo, montoCentavos, origen, ocurridoEn };
}

function cliente(id: string, nombre: string, saldo: bigint, over: Partial<ClientePyme> = {}): ClientePyme {
  return { id, nombre, telefono: null, saldoCentavos: saldo, topeCentavos: 0n, diasMax: 0, ...over };
}

function pago(id: string, concepto: string, venceEl: string, montoCentavos: bigint): PagoPyme {
  return { id, concepto, venceEl, montoCentavos };
}

function comercio(over: Partial<ComercioResumen> = {}): ComercioResumen {
  return {
    tenantId: "t1",
    nombreComercio: "Distribuidora Sur",
    modulos: ["cobranza"],
    movimientos: [],
    clientes: [],
    pagos: [],
    prefsWa: { optIn: true, avisoHora: "08:00", pausadoHastaMs: null },
    prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
    destinoEmail: "dueno@sur.test",
    ...over,
  };
}

const ANA = cliente("a", "Ana", 1_200_000n, { diasMax: 20 });
const BETO = cliente("b", "Beto", 300_000n, { topeCentavos: 100_000n });

interface CapturadoWa {
  tenantId: string;
  texto: string;
  clave: string;
}

interface CapturadoEmail {
  tenantId: string;
  destino: string;
  asunto: string;
  texto: string;
  clave: string;
}

let outbox: Set<string>;

async function correr(
  comercios: ReadonlyArray<ComercioResumen>,
  yaEnviadosWa?: ReadonlySet<string>,
  falloWa = false,
): Promise<{ resultados: ReadonlyArray<ResultadoResumenMensual>; wa: CapturadoWa[]; emails: CapturadoEmail[] }> {
  const wa: CapturadoWa[] = [];
  const emails: CapturadoEmail[] = [];
  const { resultados } = await ejecutar_resumen_mensual({
    comercios,
    ahoraMs,
    zona: ZONA_DEFECTO,
    yaEnviadosWa,
    enviarWa: async (tenantId, payload) => {
      wa.push({ tenantId, texto: payload.texto, clave: payload.clave });
      return falloWa ? { ok: false, error: "sin_credenciales" } : { ok: true };
    },
    encolarEmail: async (tenantId, payload) => {
      if (outbox.has(payload.clave)) return { ok: false, codigo: "DUPLICADO" };
      outbox.add(payload.clave);
      emails.push({ tenantId, destino: payload.destino, asunto: payload.asunto, texto: payload.texto, clave: payload.clave });
      return { ok: true };
    },
  });
  return { resultados, wa, emails };
}

beforeEach(() => {
  limpiar_corridas_mensual();
  outbox = new Set();
});

describe("BOT-S7 ventana mensual y mes cerrado", () => {
  it("constantes del AC", () => {
    expect(ZONA_DEFECTO).toBe("America/Argentina/Buenos_Aires");
    expect(HORA_RESUMEN_MENSUAL).toBe(9);
  });

  it("en_ventana_mensual solo el día 1 desde las 09:00 locales", () => {
    expect(en_ventana_mensual(Date.parse("2026-11-01T02:00:00Z"), ZONA_DEFECTO)).toBe(false); // 31/10 23:00 AR
    expect(en_ventana_mensual(Date.parse("2026-11-01T11:59:00Z"), ZONA_DEFECTO)).toBe(false); // 1/11 08:59 AR
    expect(en_ventana_mensual(Date.parse("2026-11-01T12:00:00Z"), ZONA_DEFECTO)).toBe(true); // 1/11 09:00 AR
    expect(en_ventana_mensual(Date.parse("2026-11-02T12:00:00Z"), ZONA_DEFECTO)).toBe(false); // 2/11 09:00 AR
  });

  it("mes_cerrado es el mes anterior a la fecha local, incluso cruzando el año", () => {
    expect(mes_cerrado(Date.parse("2026-11-01T12:00:00Z"), ZONA_DEFECTO)).toBe("2026-10");
    expect(mes_cerrado(Date.parse("2027-01-01T12:00:00Z"), ZONA_DEFECTO)).toBe("2026-12");
    expect(mes_cerrado(Date.parse("2026-03-15T12:00:00Z"), ZONA_DEFECTO)).toBe("2026-02");
  });

  it("clave_resumen_mensual incluye canal, tenant y mes", () => {
    expect(clave_resumen_mensual("t1", "2026-10", "wa")).toBe("resumen_mensual:wa:t1:2026-10");
    expect(clave_resumen_mensual("t1", "2026-10", "email")).toBe("resumen_mensual:email:t1:2026-10");
  });
});

describe("BOT-S7 snapshot mensual", () => {
  it("snapshot con texto literal: movimientos del mes, secciones gateadas por módulos", () => {
    const movimientos = [
      mov("ingreso", 5_000_000n, "venta", "2026-10-15T12:00:00.000Z"),
      mov("ingreso", 2_000_000n, "otro", "2026-10-20T12:00:00.000Z"),
      mov("egreso", 1_000_000n, "compra", "2026-10-25T12:00:00.000Z"),
      mov("ingreso", 9_000_000n, "venta", "2026-09-30T12:00:00.000Z"),
      mov("ingreso", 900_000n, "venta", "2026-11-01T12:00:00.000Z"),
      mov("ingreso", 1_000_000n, "venta", "2026-11-01T02:30:00.000Z"), // 31/10 23:30 AR
      mov("ingreso", 7_000_000n, "venta", null),
    ];
    const s = armar_snapshot_mensual(comercio({ movimientos, clientes: [ANA, BETO, cliente("c", "Caro", -50_000n, { diasMax: 40 })] }), "2026-10", ZONA_DEFECTO);

    expect(s.ingresosCentavos).toBe(8_000_000n);
    expect(s.egresosCentavos).toBe(1_000_000n);
    expect(s.resultadoCentavos).toBe(7_000_000n);
    expect(s.ventas).toBe(2);
    expect(s.texto).toBe(
      "Resumen mensual de Distribuidora Sur · 2026-10\n" +
        "Caja del mes:\n" +
        "- Ingresos: $ 80.000,00\n" +
        "- Egresos: $ 10.000,00\n" +
        "- Resultado: $ 70.000,00\n" +
        "- Ventas registradas: 2\n" +
        "Cobranza:\n" +
        "- Fiado a cobrar: $ 15.000,00 (2 deudores)",
    );
  });

  it("sin movimientos del mes: texto literal", () => {
    const s = armar_snapshot_mensual(
      comercio({ modulos: ["rotacion"], movimientos: [mov("ingreso", 1_000_000n, "venta", "2026-09-10T12:00:00.000Z")] }),
      "2026-10",
      ZONA_DEFECTO,
    );
    expect(s.texto).toBe("Resumen mensual de Distribuidora Sur · 2026-10\nCaja del mes:\n- Sin movimientos registrados en el mes");
  });

  it("flujo_caja: cuenta solo los pendientes que vencen el mes que empieza", () => {
    const s = armar_snapshot_mensual(
      comercio({
        modulos: ["flujo_caja"],
        pagos: [
          pago("p1", "Alquiler", "2026-11-15", 2_000_000n),
          pago("p2", "Luz", "2026-11-30T15:00:00.000Z", 1_000_000n),
          pago("p3", "Seguro", "2026-12-01", 9_000_000n),
          pago("p4", "Agua", "2026-10-31", 7_000_000n),
        ],
      }),
      "2026-10",
      ZONA_DEFECTO,
    );
    expect(s.texto).toBe(
      "Resumen mensual de Distribuidora Sur · 2026-10\n" +
        "Caja del mes:\n" +
        "- Sin movimientos registrados en el mes\n" +
        "Flujo de caja:\n" +
        "- Pagos pendientes en 2026-11: $ 30.000,00 (2)",
    );
  });
});

describe("BOT-S7 ejecución: canales, gating, idempotencia y opt-in", () => {
  it("mismo texto en WhatsApp y email, armado una sola vez", async () => {
    const { resultados, wa, emails } = await correr([comercio({ movimientos: [mov("ingreso", 1_000_000n, "venta", "2026-10-10T12:00:00.000Z")], clientes: [ANA] })]);

    expect(wa).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(wa[0]?.texto).toBe(emails[0]?.texto);
    expect(resultados[0]?.texto).toBe(wa[0]?.texto);
    expect(resultados[0]?.canales).toEqual([
      { canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "enviado", error: null },
      { canal: "email", clave: "resumen_mensual:email:t1:2026-10", estado: "encolado", error: null },
    ]);
  });

  it("gating: sin cobranza no hay sección Cobranza; sin flujo_caja no hay Flujo de caja", async () => {
    const soloFlujo = await correr([comercio({ modulos: ["flujo_caja"], clientes: [ANA], pagos: [pago("p1", "Alquiler", "2026-11-15", 1_000_000n)] })]);
    expect(soloFlujo.resultados[0]?.texto).toContain("Flujo de caja:");
    expect(soloFlujo.resultados[0]?.texto).not.toContain("Cobranza:");

    limpiar_corridas_mensual();
    const soloCobranza = await correr([comercio({ modulos: ["cobranza"], clientes: [ANA], pagos: [pago("p1", "Alquiler", "2026-11-15", 1_000_000n)] })]);
    expect(soloCobranza.resultados[0]?.texto).toContain("Cobranza:");
    expect(soloCobranza.resultados[0]?.texto).not.toContain("Flujo de caja:");
  });

  it("sin módulos activos: ambos canales omitido_sin_modulos", async () => {
    const { resultados, wa, emails } = await correr([comercio({ modulos: [], clientes: [ANA] })]);
    expect(resultados[0]?.texto).toBeNull();
    expect(resultados[0]?.canales).toEqual([
      { canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "omitido_sin_modulos", error: null },
      { canal: "email", clave: "resumen_mensual:email:t1:2026-10", estado: "omitido_sin_modulos", error: null },
    ]);
    expect(wa).toHaveLength(0);
    expect(emails).toHaveLength(0);
  });

  it("opt-in false o pausa: WhatsApp omitido_optout pero el email sale igual", async () => {
    const { resultados, wa, emails } = await correr([
      comercio({ clientes: [ANA], prefsWa: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null } }),
    ]);
    expect(wa).toHaveLength(0);
    expect(emails).toHaveLength(1);
    expect(resultados[0]?.canales[0]).toEqual({ canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "omitido_optout", error: null });
    expect(resultados[0]?.canales[1]?.estado).toBe("encolado");

    limpiar_corridas_mensual();
    outbox = new Set();
    const pausado = await correr([comercio({ clientes: [ANA], prefsWa: { optIn: true, avisoHora: "08:00", pausadoHastaMs: ahoraMs + 86_400_000 } })]);
    expect(pausado.resultados[0]?.canales[0]?.estado).toBe("omitido_optout");
    expect(pausado.resultados[0]?.canales[1]?.estado).toBe("encolado");
  });

  it("sin destino de email: omitido_sin_destino y WhatsApp no se afecta", async () => {
    const { resultados } = await correr([comercio({ clientes: [ANA], destinoEmail: "" })]);
    expect(resultados[0]?.canales).toEqual([
      { canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "enviado", error: null },
      { canal: "email", clave: "resumen_mensual:email:t1:2026-10", estado: "omitido_sin_destino", error: null },
    ]);
  });

  it("idempotente por tenant+mes+canal: la segunda corrida no reenvía y el outbox tiene una sola fila", async () => {
    const c = comercio({ clientes: [ANA] });
    const primera = await correr([c]);
    const segunda = await correr([c]);

    expect(primera.resultados[0]?.canales).toEqual([
      { canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "enviado", error: null },
      { canal: "email", clave: "resumen_mensual:email:t1:2026-10", estado: "encolado", error: null },
    ]);
    expect(segunda.resultados[0]?.canales).toEqual([
      { canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "omitido_ya_enviado", error: null },
      { canal: "email", clave: "resumen_mensual:email:t1:2026-10", estado: "omitido_ya_enviado", error: null },
    ]);
    expect(segunda.wa).toHaveLength(0);
    expect(outbox.size).toBe(1);
  });

  it("yaEnviadosWa externo también omite el canal", async () => {
    const c = comercio({ clientes: [ANA] });
    const { resultados } = await correr([c], new Set([clave_resumen_mensual("t1", "2026-10", "wa")]));
    expect(resultados[0]?.canales[0]?.estado).toBe("omitido_ya_enviado");
    expect(resultados[0]?.canales[1]?.estado).toBe("encolado");
  });

  it("fallo de WhatsApp queda como fallo, no marca y el reintento vuelve a intentar", async () => {
    const c = comercio({ clientes: [ANA] });
    const primera = await correr([c], undefined, true);
    const segunda = await correr([c], undefined, true);

    expect(primera.resultados[0]?.canales[0]).toEqual({ canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "fallo", error: "sin_credenciales" });
    expect(segunda.resultados[0]?.canales[0]).toEqual({ canal: "wa", clave: "resumen_mensual:wa:t1:2026-10", estado: "fallo", error: "sin_credenciales" });
    expect(primera.wa).toHaveLength(1);
    expect(segunda.wa).toHaveLength(1);
  });

  it("aísla tenants: cada texto usa solo sus datos", async () => {
    const { wa } = await correr([
      comercio({
        tenantId: "ta",
        nombreComercio: "Pyme A",
        movimientos: [mov("ingreso", 1_000_000n, "venta", "2026-10-10T12:00:00.000Z")],
        clientes: [cliente("a1", "Cliente A", 500_000n, { diasMax: 20 })],
      }),
      comercio({
        tenantId: "tb",
        nombreComercio: "Pyme B",
        movimientos: [mov("ingreso", 2_000_000n, "venta", "2026-10-11T12:00:00.000Z")],
        clientes: [cliente("b1", "Cliente B", 700_000n, { diasMax: 30 })],
      }),
    ]);

    expect(wa.map((w) => w.tenantId)).toEqual(["ta", "tb"]);
    expect(wa[0]?.texto).toContain("Pyme A");
    expect(wa[0]?.texto).not.toContain("Pyme B");
    expect(wa[1]?.texto).toContain("Pyme B");
    expect(wa[1]?.texto).not.toContain("Pyme A");
  });
});

describe("BOT-S7 ruta POST /api/jobs/resumen-mensual", () => {
  function semillaRuta(): void {
    delete process.env.TENANT_MODE;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    resetStore();
    limpiar_corridas_mensual();
    process.env.JOBS_SECRET = SECRET;
    control.tenants.set("slice0", {
      id: "slice0",
      nombreComercio: "Distribuidora Sur",
      slug: "sur",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "due",
      esDemo: false,
    });
    control.botLinks.set("+5491100000001", { tenantId: "slice0", googleSub: "due", estado: "verificado" });
    control.waPrefs.set("slice0:due", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    control.users.set("due", { googleSub: "due", email: "dueno@sur.test", emailVerificado: true });
    store.movements.push({ id: "m1", tipo: "ingreso", metodo: "Efectivo", monto_centavos: "500000", origen: "venta", idempotency_key: "mk1", ocurrido_en: "2026-10-15T12:00:00.000Z" });
  }

  beforeEach(semillaRuta);
  afterAll(() => {
    vi.useRealTimers();
    delete process.env.JOBS_SECRET;
    delete process.env.TENANT_MODE;
  });

  const conSecret = () => ctx("http://x/api/jobs/resumen-mensual", { method: "POST", headers: { "X-Job-Secret": SECRET } });
  type Cuerpo = { mes: string; resultados: Array<{ tenant_id: string; canales: Array<{ canal: string; estado: string }> }> };

  it("sin X-Job-Secret es 403", async () => {
    const res = (await POSTResumen(ctx("http://x/api/jobs/resumen-mensual", { method: "POST" }))) as Response;
    expect(res.status).toBe(403);
  });

  it("con secret y sin credenciales Cloud API: WA fallo, email encolado; reintento no duplica email", async () => {
    const primera = (await (await POSTResumen(conSecret())).json()) as Cuerpo;
    expect(primera.mes).toBe("2026-10");
    expect(primera.resultados).toEqual([
      {
        tenant_id: "slice0",
        canales: [
          { canal: "wa", estado: "fallo" },
          { canal: "email", estado: "encolado" },
        ],
      },
    ]);
    expect(store.waEnviados.size).toBe(0);
    expect(store.emailOutbox.size).toBe(1);

    const segunda = (await (await POSTResumen(conSecret())).json()) as Cuerpo;
    expect(segunda.resultados[0]?.canales).toEqual([
      { canal: "wa", estado: "fallo" },
      { canal: "email", estado: "omitido_ya_enviado" },
    ]);
    expect(store.waEnviados.size).toBe(0);
    expect(store.emailOutbox.size).toBe(1);
  });

  it("fuera de ventana responde 200 con ambos omitido_fuera_de_ventana", async () => {
    vi.setSystemTime(new Date("2026-11-01T11:00:00Z")); // 1/11 08:00 AR
    try {
      const j = (await (await POSTResumen(conSecret())).json()) as Cuerpo;
      expect(j.resultados[0]?.canales).toEqual([
        { canal: "wa", estado: "omitido_fuera_de_ventana" },
        { canal: "email", estado: "omitido_fuera_de_ventana" },
      ]);
    } finally {
      vi.setSystemTime(new Date(ahoraMs));
    }
  });

  it("solo corre el tenant del contexto", async () => {
    control.tenants.set("otro", {
      id: "otro",
      nombreComercio: "Otra Pyme",
      slug: "otra",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "due2",
      esDemo: false,
    });
    control.botLinks.set("+5491100000002", { tenantId: "otro", googleSub: "due2", estado: "verificado" });
    control.waPrefs.set("otro:due2", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    const j = (await (await POSTResumen(conSecret())).json()) as Cuerpo;
    expect(j.resultados.map((r) => r.tenant_id)).toEqual(["slice0"]);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("BOT-S7 listarMovimientosConFecha en Postgres por tenant", () => {
  const claveMov = `bot-s7-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

  function fijarMulti(): void {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
    process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  }

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(cashMovements).where(eq(cashMovements.idempotencyKey, claveMov));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("A ve su movimiento; B no", async () => {
    vi.setSystemTime(new Date(AHORA_ISO));
    fijarMulti();
    const id = randomUUID();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(cashMovements).values({
        id,
        idempotencyKey: claveMov,
        tipo: "ingreso",
        metodo: "Efectivo",
        categoriaId: "venta",
        origen: "venta",
        montoCentavos: 250_000n,
      });
    });
    const a = await conTenant("tenant-a", () => listarMovimientosConFecha());
    const propio = a.find((m) => m.origen === "venta" && m.montoCentavos === 250_000n);
    expect(propio?.tipo).toBe("ingreso");
    expect(typeof propio?.ocurridoEn).toBe("string");
    const b = await conTenant("tenant-b", () => listarMovimientosConFecha());
    expect(b.some((m) => m.origen === "venta" && m.montoCentavos === 250_000n)).toBe(false);
  });
});
