import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import {
  MAX_DEUDORES,
  MORA_COBRANZA_DIAS,
  clave_bot_pyme,
  ejecutar_bot_pyme,
  limpiar_corridas_pyme,
  type ClientePyme,
  type ComercioPyme,
  type PagoPyme,
} from "../src/jobs/bot-pyme.js";
import { fechaAR, type FechaAR } from "../src/lib/fecha-ar.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as POSTBot } from "../src/pages/api/jobs/bot-pyme.js";
import { cambiarModuloBot } from "../src/lib/repos/bot-modulos.js";
import { listarClientesConSaldo } from "../src/lib/repos/fiado.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { customerMovements, customers } from "../src/db/schema-credito.js";

const SECRET = "test-secret-jobs";
const DIA = 86_400_000;

// Reloj fijo: 22:00 del 13/10 en Buenos Aires (01:00Z del 14). Solo se
// falsea Date, igual que tests/bot-quiosco.test.ts.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-10-14T01:00:00Z"));
const ahoraMs = Date.now();
const hoy = fechaAR(new Date(ahoraMs)) as FechaAR;

function cliente(id: string, nombre: string, saldo: bigint, over: Partial<ClientePyme> = {}): ClientePyme {
  return { id, nombre, telefono: null, saldoCentavos: saldo, topeCentavos: 0n, diasMax: 0, ...over };
}

// Vencimientos al mediodía de Buenos Aires del día indicado (15:00Z).
function pago(id: string, concepto: string, dia: string, monto: bigint): PagoPyme {
  return { id, concepto, venceEl: `${dia}T15:00:00.000Z`, montoCentavos: monto };
}

function comercio(over: Partial<ComercioPyme> = {}): ComercioPyme {
  return {
    tenantId: "t1",
    nombreComercio: "Distribuidora Sur",
    modulos: ["cobranza"],
    clientes: [],
    cajaCentavos: 0n,
    pagos: [],
    prefs: { optIn: true, avisoHora: "08:00", pausadoHastaMs: null },
    ...over,
  };
}

interface EnvioCapturado {
  tenantId: string;
  texto: string;
  clave: string;
}

function correr(
  comercios: ComercioPyme[],
  yaEnviados?: ReadonlySet<string>,
): { resultados: ReturnType<typeof ejecutar_bot_pyme>["resultados"]; enviados: EnvioCapturado[] } {
  const enviados: EnvioCapturado[] = [];
  const { resultados } = ejecutar_bot_pyme({
    comercios,
    fecha: hoy,
    ahoraMs,
    yaEnviados,
    enviar: (tenantId, payload) => {
      enviados.push({ tenantId, texto: payload.texto, clave: payload.clave });
      return { ok: true };
    },
  });
  return { resultados, enviados };
}

const JUAN = cliente("c1", "Juan Pérez", 1_200_000n, { telefono: "+54 9 11 5555-0000", topeCentavos: 1_000_000n, diasMax: 20 });
const ANA = cliente("c2", "Ana", 300_000n, { diasMax: 14 });
const BETO = cliente("c3", "Beto", 500_000n, { telefono: "1155551111", topeCentavos: 1_000_000n, diasMax: 13 });
const CARO = cliente("c4", "Caro", 0n, { telefono: "1155552222", diasMax: 40 });

const LINK_JUAN =
  "https://wa.me/5491155550000?text=Hola%20Juan%20P%C3%A9rez%2C%20te%20escribimos%20de%20Distribuidora%20Sur.%20Tu%20cuenta%20tiene%20un%20saldo%20pendiente%20de%20%24%2012.000%2C00.%20Cuando%20puedas%2C%20acercate%20a%20regularizar.%20Gracias.";

beforeEach(() => {
  limpiar_corridas_pyme();
});

describe("BOT-S4 pyme: cobranza (FC1-FC9)", () => {
  it("fecha del reloj fijo y constantes del AC", () => {
    expect(hoy).toBe("2026-10-13");
    expect(MORA_COBRANZA_DIAS).toBe(14);
    expect(MAX_DEUDORES).toBe(5);
  });

  it("saldo > tope o mora 14d: lista deudores y propone recordatorio wa.me (texto literal)", () => {
    const { resultados, enviados } = correr([comercio({ clientes: [BETO, ANA, CARO, JUAN] })]);

    expect(resultados[0]?.estado).toBe("enviado");
    expect(resultados[0]?.secciones).toEqual(["cobranza"]);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.texto).toBe(
      "Distribuidora Sur · 2026-10-13\n" +
        "Cobranza:\n" +
        `- Juan Pérez: $ 12.000,00 (supera tope de $ 10.000,00; 20 días de atraso). Recordatorio: ${LINK_JUAN}\n` +
        "- Ana: $ 3.000,00 (14 días de atraso). Sin teléfono para recordatorio.",
    );
    expect(resultados[0]?.deudores.map((d) => [d.id, d.motivos, d.link])).toEqual([
      ["c1", ["tope", "mora"], LINK_JUAN],
      ["c2", ["mora"], null],
    ]);
    expect(enviados[0]?.clave).toBe("bot_pyme:t1:2026-10-13");
  });

  it("solo supera el tope (sin mora) también es deudor; tope 0 no cuenta como tope", () => {
    const { resultados } = correr([
      comercio({
        clientes: [
          cliente("x1", "Solo tope", 150_000n, { topeCentavos: 100_000n, diasMax: 2 }),
          cliente("x2", "Sin tope", 900_000n, { topeCentavos: 0n, diasMax: 13 }),
        ],
      }),
    ]);
    expect(resultados[0]?.deudores.map((d) => [d.id, d.motivos])).toEqual([["x1", ["tope"]]]);
    expect(resultados[0]?.texto).toBe(
      "Distribuidora Sur · 2026-10-13\nCobranza:\n- Solo tope: $ 1.500,00 (supera tope de $ 1.000,00). Sin teléfono para recordatorio.",
    );
  });

  it("más de 5 deudores: 5 líneas + 'y 2 más'; teléfono inválido no arma link", () => {
    const clientes = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      cliente(`d${n}`, `Deudor ${n}`, BigInt(n) * 100_000n, { telefono: n === 7 ? "123" : null, diasMax: 30 }),
    );
    const { resultados } = correr([comercio({ clientes })]);
    const lineas = (resultados[0]?.texto ?? "").split("\n");

    expect(lineas).toEqual([
      "Distribuidora Sur · 2026-10-13",
      "Cobranza:",
      "- Deudor 7: $ 7.000,00 (30 días de atraso). Sin teléfono para recordatorio.",
      "- Deudor 6: $ 6.000,00 (30 días de atraso). Sin teléfono para recordatorio.",
      "- Deudor 5: $ 5.000,00 (30 días de atraso). Sin teléfono para recordatorio.",
      "- Deudor 4: $ 4.000,00 (30 días de atraso). Sin teléfono para recordatorio.",
      "- Deudor 3: $ 3.000,00 (30 días de atraso). Sin teléfono para recordatorio.",
      "- y 2 más",
    ]);
    expect(resultados[0]?.deudores).toHaveLength(7);
  });

  it("sin deudores no hay novedad ni envío", () => {
    const { resultados, enviados } = correr([comercio({ clientes: [BETO, CARO] })]);
    expect(resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(enviados).toHaveLength(0);
  });
});

describe("BOT-S4 pyme: flujo de caja (C1-C18)", () => {
  it("caja contra pagos a 7 días: vencidos, hoy, próximos y faltante (texto literal)", () => {
    const { resultados, enviados } = correr([
      comercio({
        modulos: ["flujo_caja"],
        cajaCentavos: 5_000_000n,
        pagos: [
          pago("v1", "Alquiler", "2026-10-16", 6_000_000n),
          pago("v2", "Luz", "2026-10-12", 2_000_000n),
          pago("v3", "Seguro", "2026-10-30", 1_000_000n),
          pago("v4", "Agua", "2026-10-13", 500_000n),
        ],
      }),
    ]);

    expect(resultados[0]?.secciones).toEqual(["flujo_caja"]);
    expect(enviados[0]?.texto).toBe(
      "Distribuidora Sur · 2026-10-13\n" +
        "Flujo de caja:\n" +
        "- Caja hoy: $ 50.000,00\n" +
        "- Pagos a 7 días: $ 85.000,00\n" +
        "- Luz: $ 20.000,00 vencido el 2026-10-12\n" +
        "- Agua: $ 5.000,00 vence hoy\n" +
        "- Alquiler: $ 60.000,00 vence el 2026-10-16\n" +
        "- Faltan $ 35.000,00 para cubrir los pagos",
    );
  });

  it("ventana: a 7 días exactos entra, a 8 no", () => {
    const entra = correr([comercio({ modulos: ["flujo_caja"], cajaCentavos: 1_000_000n, pagos: [pago("a", "Gas", "2026-10-20", 100_000n)] })]);
    expect(entra.resultados[0]?.texto).toBe(
      "Distribuidora Sur · 2026-10-13\nFlujo de caja:\n- Caja hoy: $ 10.000,00\n- Pagos a 7 días: $ 1.000,00\n- Gas: $ 1.000,00 vence el 2026-10-20",
    );
    limpiar_corridas_pyme();
    const fuera = correr([comercio({ modulos: ["flujo_caja"], pagos: [pago("b", "Gas", "2026-10-21", 100_000n)] })]);
    expect(fuera.resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(fuera.enviados).toHaveLength(0);
  });

  it("acepta vencimiento como fecha AAAA-MM-DD sin correr el día", () => {
    const { resultados } = correr([
      comercio({ modulos: ["flujo_caja"], cajaCentavos: 0n, pagos: [{ id: "p", concepto: "ABL", venceEl: "2026-10-13", montoCentavos: 10_000n }] }),
    ]);
    expect(resultados[0]?.texto).toContain("- ABL: $ 100,00 vence hoy");
  });
});

describe("BOT-S4 pyme: ambos módulos y gating por tenant_bot_modules", () => {
  const pagos = [pago("v1", "Alquiler", "2026-10-15", 1_000_000n)];
  const clientes = [JUAN, cliente("c5", "Eva", 800_000n), cliente("c6", "Fede", -50_000n)];

  it("flujo_caja primero, cobranza después; fiado a cobrar suma solo saldos positivos", () => {
    const { resultados } = correr([comercio({ modulos: ["cobranza", "flujo_caja"], cajaCentavos: 3_000_000n, pagos, clientes })]);

    expect(resultados[0]?.secciones).toEqual(["flujo_caja", "cobranza"]);
    expect(resultados[0]?.texto).toBe(
      "Distribuidora Sur · 2026-10-13\n" +
        "Flujo de caja:\n" +
        "- Caja hoy: $ 30.000,00\n" +
        "- Pagos a 7 días: $ 10.000,00\n" +
        "- Alquiler: $ 10.000,00 vence el 2026-10-15\n" +
        "- Fiado a cobrar: $ 20.000,00\n" +
        "Cobranza:\n" +
        `- Juan Pérez: $ 12.000,00 (supera tope de $ 10.000,00; 20 días de atraso). Recordatorio: ${LINK_JUAN}`,
    );
  });

  it("cobranza apagado: sin sección Cobranza ni deudores aunque haya morosos", () => {
    const { resultados } = correr([comercio({ modulos: ["flujo_caja"], cajaCentavos: 3_000_000n, pagos, clientes })]);
    expect(resultados[0]?.secciones).toEqual(["flujo_caja"]);
    expect(resultados[0]?.texto).not.toContain("Cobranza:");
    expect(resultados[0]?.deudores).toEqual([]);
  });

  it("flujo_caja apagado: sin sección Flujo de caja aunque haya pagos", () => {
    const { resultados } = correr([comercio({ modulos: ["cobranza"], cajaCentavos: 3_000_000n, pagos, clientes })]);
    expect(resultados[0]?.secciones).toEqual(["cobranza"]);
    expect(resultados[0]?.texto).not.toContain("Flujo de caja:");
  });

  it("ambos apagados (otro rubro): sin novedad y sin envío", () => {
    const { resultados, enviados } = correr([comercio({ modulos: ["rotacion", "vencimientos"], cajaCentavos: 0n, pagos, clientes })]);
    expect(resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(resultados[0]?.secciones).toEqual([]);
    expect(enviados).toHaveLength(0);
  });
});

describe("BOT-S4 pyme: aislamiento, idempotencia y opt-in", () => {
  it("aísla tenants: cada mensaje lleva solo sus deudores y va a su tenant", () => {
    const { resultados, enviados } = correr([
      comercio({ tenantId: "ta", nombreComercio: "Pyme A", clientes: [cliente("a1", "Cliente A", 500_000n, { diasMax: 20 })] }),
      comercio({ tenantId: "tb", nombreComercio: "Pyme B", clientes: [cliente("b1", "Cliente B", 700_000n, { diasMax: 30 })] }),
    ]);
    expect(resultados.map((r) => [r.tenantId, r.estado, r.deudores.map((d) => d.id)])).toEqual([
      ["ta", "enviado", ["a1"]],
      ["tb", "enviado", ["b1"]],
    ]);
    expect(enviados.map((e) => e.tenantId)).toEqual(["ta", "tb"]);
    expect(enviados[0]?.texto).toContain("Cliente A");
    expect(enviados[0]?.texto).not.toContain("Cliente B");
    expect(enviados[1]?.texto).toContain("Cliente B");
    expect(enviados[1]?.texto).not.toContain("Cliente A");
  });

  it("idempotente por tenant+fecha: la segunda corrida no reenvía; yaEnviados también omite", () => {
    const c = comercio({ clientes: [ANA] });
    const primera = correr([c]);
    const segunda = correr([c]);
    expect(primera.resultados[0]?.estado).toBe("enviado");
    expect(segunda.resultados[0]?.estado).toBe("omitido_ya_enviado");
    expect(segunda.enviados).toHaveLength(0);

    limpiar_corridas_pyme();
    const externa = correr([c], new Set([clave_bot_pyme("t1", "2026-10-13")]));
    expect(externa.resultados[0]?.estado).toBe("omitido_ya_enviado");
    expect(externa.enviados).toHaveLength(0);
  });

  it("sin opt-in o pausado no envía", () => {
    const sinOptIn = correr([comercio({ clientes: [ANA], prefs: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null } })]);
    const pausado = correr([comercio({ clientes: [ANA], prefs: { optIn: true, avisoHora: "08:00", pausadoHastaMs: ahoraMs + DIA } })]);
    expect(sinOptIn.resultados[0]?.estado).toBe("omitido_optout");
    expect(pausado.resultados[0]?.estado).toBe("omitido_optout");
    expect(sinOptIn.enviados).toHaveLength(0);
    expect(pausado.enviados).toHaveLength(0);
  });

  it("fallo del envío queda como fallo y no bloquea el día", () => {
    const c = comercio({ clientes: [ANA] });
    const { resultados } = ejecutar_bot_pyme({ comercios: [c], fecha: hoy, ahoraMs, enviar: () => ({ ok: false, error: "sin_credenciales" }) });
    expect(resultados[0]).toMatchObject({ estado: "fallo", error: "sin_credenciales", secciones: ["cobranza"] });
    expect(correr([c]).resultados[0]?.estado).toBe("enviado");
  });
});

describe("BOT-S4 repo listarClientesConSaldo (memoria)", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    resetStore();
  });

  it("deriva saldo y días de atraso por cliente desde los movimientos", async () => {
    store.creditMovs.push(
      { customer_id: "cli-1", debe: "1500000", haber: "0", key: "k1", fecha_ms: ahoraMs - 20 * DIA },
      { customer_id: "cli-1", debe: "0", haber: "500000", key: "k2", fecha_ms: ahoraMs - DIA },
      { customer_id: "cli-0", debe: "1000", haber: "0", key: "k3", fecha_ms: ahoraMs - 3 * DIA },
    );
    const r = await listarClientesConSaldo(ahoraMs);
    expect(r.fuente).toBe("memoria");
    expect(r.clientes).toEqual([
      { id: "cli-0", nombre: "cli-0", telefono: null, saldoCentavos: 1000n, topeCentavos: 0n, diasMax: 3 },
      { id: "cli-1", nombre: "cli-1", telefono: null, saldoCentavos: 1_000_000n, topeCentavos: 0n, diasMax: 20 },
    ]);
  });
});

describe("BOT-S4 ruta POST /api/jobs/bot-pyme", () => {
  function semillaRuta(): void {
    delete process.env.TENANT_MODE;
    resetStore();
    limpiar_corridas_pyme();
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
    store.creditMovs.push({ customer_id: "cli-1", debe: "1500000", haber: "0", key: "k1", fecha_ms: ahoraMs - 20 * DIA });
  }

  beforeEach(semillaRuta);
  afterAll(() => {
    vi.useRealTimers();
    delete process.env.JOBS_SECRET;
    delete process.env.TENANT_MODE;
  });

  const conSecret = () => ctx("http://x/api/jobs/bot-pyme", { method: "POST", headers: { "X-Job-Secret": SECRET } });
  type Cuerpo = {
    fecha: string;
    resultados: Array<{ tenant_id: string; estado: string; secciones: string[]; deudores: Array<{ customer_id: string; motivos: string[]; con_link: boolean }> }>;
  };

  it("sin X-Job-Secret es 403", async () => {
    const res = (await POSTBot(ctx("http://x/api/jobs/bot-pyme", { method: "POST" }))) as Response;
    expect(res.status).toBe(403);
  });

  it("con secret y sin credenciales Cloud API: lista el deudor, registra fallo y no marca enviado", async () => {
    const res = (await POSTBot(conSecret())) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as Cuerpo;
    expect(j.fecha).toBe("2026-10-13");
    expect(j.resultados).toEqual([
      { tenant_id: "slice0", estado: "fallo", secciones: ["cobranza"], deudores: [{ customer_id: "cli-1", motivos: ["mora"], con_link: false }] },
    ]);
    expect(store.waEnviados.size).toBe(0);
  });

  it("flujo de caja desde caja y vencimientos pendientes del tenant", async () => {
    store.movements.push({ id: "m1", tipo: "ingreso", metodo: "Efectivo", monto_centavos: "100000", origen: "venta", idempotency_key: "mk1" });
    store.vencimientosCaja.set("v1", { id: "v1", concepto: "Alquiler", venceEl: "2026-10-15T15:00:00.000Z", montoCentavos: "300000", estado: "pendiente" });
    store.vencimientosCaja.set("v2", { id: "v2", concepto: "Pagado", venceEl: "2026-10-15T15:00:00.000Z", montoCentavos: "999", estado: "pagado" });
    const j = (await (await POSTBot(conSecret())).json()) as Cuerpo;
    expect(j.resultados[0]?.secciones).toEqual(["flujo_caja", "cobranza"]);
  });

  it("módulo cobranza apagado en tenant_bot_modules: no lista deudores", async () => {
    await cambiarModuloBot("slice0", "cobranza", false);
    const j = (await (await POSTBot(conSecret())).json()) as Cuerpo;
    expect(j.resultados).toEqual([{ tenant_id: "slice0", estado: "omitido_sin_novedad", secciones: [], deudores: [] }]);
  });

  it("solo el número del tenant del contexto entra en la corrida", async () => {
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
    const j = (await (await POSTBot(conSecret())).json()) as Cuerpo;
    expect(j.resultados.map((r) => r.tenant_id)).toEqual(["slice0"]);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("BOT-S4 listarClientesConSaldo en Postgres por tenant", () => {
  const idCliente = randomUUID();
  const claveMov = `bot-s4-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

  function fijarMulti(): void {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
    process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  }

  beforeAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.insert(customers).values({ id: idCliente, nombre: "Cliente PG BOT-S4", telefono: "1155550000", topeCentavos: 100_000n });
      await db.insert(customerMovements).values({
        customerId: idCliente,
        tipo: "venta",
        debeCentavos: 150_000n,
        haberCentavos: 0n,
        idempotencyKey: claveMov,
        clientOccurredAt: new Date(ahoraMs - 20 * DIA),
      });
    });
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      await db.delete(customerMovements).where(eq(customerMovements.idempotencyKey, claveMov));
      await db.delete(customers).where(eq(customers.id, idCliente));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("A ve su cliente con ficha y saldo desde la base; B no lo ve", async () => {
    fijarMulti();
    const a = await conTenant("tenant-a", () => listarClientesConSaldo(ahoraMs));
    expect(a.fuente).toBe("db");
    expect(a.clientes.find((c) => c.id === idCliente)).toEqual({
      id: idCliente,
      nombre: "Cliente PG BOT-S4",
      telefono: "1155550000",
      saldoCentavos: 150_000n,
      topeCentavos: 100_000n,
      diasMax: 20,
    });
    const b = await conTenant("tenant-b", () => listarClientesConSaldo(ahoraMs));
    expect(b.fuente).toBe("db");
    expect(b.clientes.some((c) => c.id === idCliente)).toBe(false);
  });
});
