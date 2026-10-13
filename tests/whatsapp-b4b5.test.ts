import { describe, expect, it } from "vitest";
import {
  agrupar_por_proveedor,
  armar_texto_alertas,
  botones_alertas,
  calcular_alertas,
  clasificar_urgencia,
  responder_que_falta,
} from "../src/modules/whatsapp/alertas.js";
import {
  PLANTILLA_MATUTINO_WA,
  armar_cuerpo_matutino,
  armar_variables_matutino,
  botones_matutino,
  clave_aviso_wa,
  decidir_envio_matutino,
  debe_enviar_matutino_wa,
} from "../src/modules/whatsapp/aviso-matutino.js";
import { clave_matutino } from "../src/modules/email/stock-matutino.js";
import {
  demora_para,
  ejecutar_aviso_matutino_wa,
  limpiar_corridas_wa,
  type ComercioMatutinoWa,
} from "../src/jobs/whatsapp-aviso-matutino.js";

const prefsOk = { optIn: true, avisoHora: "08:00", pausadoHastaMs: null };
const prefsOff = { optIn: false, avisoHora: "08:00", pausadoHastaMs: null };

describe("wa B4.1 umbral 0 nunca alerta", () => {
  it("items sin umbral no generan alerta aunque estén en 0", () => {
    const alertas = calcular_alertas([
      { sku: "s0", nombre: "Sin umbral", stock: 0, umbral: 0, proveedor: "X" },
      { sku: "ok", nombre: "Con umbral", stock: 0, umbral: 5, proveedor: "X" },
    ]);
    expect(alertas.map((a) => a.sku)).toEqual(["ok"]);
    const d = decidir_envio_matutino(
      [
        { sku: "s0", nombre: "Sin umbral", stock: 0, umbral: 0, proveedor: "X" },
      ],
      new Set(),
    );
    expect(d.enviar).toBe(false);
  });
});

describe("wa B4.4 urgente por 0 / crítico / mitad", () => {
  it("clasifica cada causa", () => {
    expect(clasificar_urgencia(0, 10)).toBe(true);
    expect(clasificar_urgencia(8, 10, true)).toBe(true);
    expect(clasificar_urgencia(4, 10)).toBe(true);
    expect(clasificar_urgencia(5, 10)).toBe(false);
    expect(clasificar_urgencia(9, 10)).toBe(false);
  });

  it("urgentes rankean primero", () => {
    const alertas = calcular_alertas([
      { sku: "comun", nombre: "Común", stock: 9, umbral: 10, proveedor: "X" },
      { sku: "cero", nombre: "Cero", stock: 0, umbral: 10, proveedor: "X" },
    ]);
    expect(alertas[0]?.sku).toBe("cero");
    expect(alertas[0]?.urgente).toBe(true);
    expect(alertas[1]?.urgente).toBe(false);
  });
});

describe("wa B4.2 agrupación por proveedor", () => {
  it("sin dato cae en Sin proveedor", () => {
    const alertas = calcular_alertas([
      { sku: "a", nombre: "A", stock: 1, umbral: 5, proveedor: null },
      { sku: "b", nombre: "B", stock: 1, umbral: 5, proveedor: "  " },
      { sku: "c", nombre: "C", stock: 1, umbral: 5, proveedor: "Distri X" },
    ]);
    const grupos = agrupar_por_proveedor(alertas);
    expect(grupos.get("Sin proveedor")?.map((i) => i.sku).sort()).toEqual(["a", "b"]);
    expect(grupos.get("Distri X")?.map((i) => i.sku)).toEqual(["c"]);
  });
});

describe("wa B4.5 qué me falta en vivo + paginado de a 10", () => {
  const catalogo = Array.from({ length: 12 }, (_, i) => ({
    sku: `s${i}`,
    nombre: `Prod ${String(i).padStart(2, "0")}`,
    stock: i,
    umbral: 20,
    proveedor: "X" as const,
  }));

  it("pagina de a 10 con ranking", () => {
    const p1 = responder_que_falta(catalogo, "Kiosco", 1);
    expect(p1.total).toBe(12);
    expect(p1.totalPaginas).toBe(2);
    expect(p1.texto).toContain("Página 1 de 2");
    const p2 = responder_que_falta(catalogo, "Kiosco", 2);
    expect(p2.pagina).toBe(2);
    expect(p2.texto).toContain("Página 2 de 2");
    // El más urgente (stock 0) aparece en la primera página.
    expect(p1.texto).toContain("Prod 00");
  });

  it("sin faltantes avisa tranqui y botones respetan Meta", () => {
    const vacio = armar_texto_alertas([], "Kiosco");
    expect(vacio.texto).toContain("no te falta nada");
    const botones = botones_alertas();
    expect(botones.length).toBeLessThanOrEqual(3);
    for (const b of botones) expect([...b.titulo].length).toBeLessThanOrEqual(20);
  });
});

describe("wa B5 matutino", () => {
  it("sin novedad no envía", () => {
    const d = decidir_envio_matutino(
      [{ sku: "b", nombre: "Sprite", stock: 4, umbral: 6, proveedor: "X" }],
      new Set(["b"]),
    );
    expect(d.enviar).toBe(false);
    expect(debe_enviar_matutino_wa({ prefs: prefsOk, ahoraMs: 50, decision: d })).toBe(false);
  });

  it("plantilla de utilidad con variables comercio/cantidad/urgentes", () => {
    expect(PLANTILLA_MATUTINO_WA).toBe("aviso_matutino_stock_bajo");
    const d = decidir_envio_matutino(
      [{ sku: "a", nombre: "Coca", stock: 0, umbral: 12, proveedor: "X" }],
      new Set(),
    );
    const v = armar_variables_matutino({ comercio: "Kiosco", fecha: "2026-10-11", alertas: d.alertas });
    expect(v).toMatchObject({ comercio: "Kiosco", cantidad: 1, urgentes: 1 });
    expect(armar_cuerpo_matutino(v)).toContain("Kiosco");
    const botones = botones_matutino();
    expect(botones.map((b) => b.titulo)).toEqual(["Ver y pedir", "Guardar p/ viernes", "Pausar"]);
    expect(botones.length).toBeLessThanOrEqual(3);
    for (const b of botones) expect([...b.titulo].length).toBeLessThanOrEqual(20);
  });

  it("B5.6 WA y email con idempotencia independiente", () => {
    const wa = clave_aviso_wa("t-a", "2026-10-11");
    const mail = clave_matutino("t-a", "2026-10-11");
    expect(wa).not.toBe(mail);
    expect(wa).toContain("whatsapp");
    expect(wa).toContain("t-a");
    expect(wa).toContain("2026-10-11");
    expect(clave_aviso_wa("t-a", "2026-10-11")).toBe(wa);
  });
});

describe("wa B5.1 job por comercio", () => {
  const comercio = (override: Partial<ComercioMatutinoWa> = {}): ComercioMatutinoWa => ({
    tenantId: "t-a",
    nombreComercio: "Kiosco",
    prefs: prefsOk,
    catalogoVivo: [{ sku: "a", nombre: "Coca", stock: 0, umbral: 12, proveedor: "X" }],
    enAlertaPrevia: new Set<string>(),
    ...override,
  });

  it("solo envía si hay novedad y respeta opt-in", () => {
    limpiar_corridas_wa();
    const enviados: string[] = [];
    const sinNovedad = ejecutar_aviso_matutino_wa({
      comercios: [comercio({ catalogoVivo: [{ sku: "b", nombre: "Sprite", stock: 4, umbral: 6, proveedor: "X" }], enAlertaPrevia: new Set(["b"]) })],
      fecha: "2026-10-11",
      ahoraMs: 50,
      enviar: (t) => {
        enviados.push(t);
        return { ok: true };
      },
    });
    expect(sinNovedad.resultados[0]?.estado).toBe("omitido_sin_novedad");
    expect(enviados).toHaveLength(0);

    const sinOptin = ejecutar_aviso_matutino_wa({
      comercios: [comercio({ prefs: prefsOff })],
      fecha: "2026-10-11",
      ahoraMs: 50,
      enviar: (t) => {
        enviados.push(t);
        return { ok: true };
      },
    });
    expect(sinOptin.resultados[0]?.estado).toBe("omitido_optout");
    expect(enviados).toHaveLength(0);
  });

  it("idempotente por comercio y reparte en el tiempo; fallo no bloquea al resto", () => {
    limpiar_corridas_wa();
    const enviados: string[] = [];
    const base = {
      fecha: "2026-10-11",
      ahoraMs: 50,
      enviar: (t: string) => {
        enviados.push(t);
        return t === "t-b" ? { ok: false, error: "red" } : { ok: true };
      },
    };
    const dos = [
      comercio({ tenantId: "t-a" }),
      comercio({ tenantId: "t-b", nombreComercio: "Almacén" }),
    ];
    const r1 = ejecutar_aviso_matutino_wa({ comercios: dos, ...base });
    expect(r1.resultados.map((r) => r.estado)).toEqual(["enviado", "fallo"]);
    // El fallo de t-b quedó registrado por canal sin tirar abajo a t-a.
    expect(r1.resultados[1]?.error).toBe("red");
    const r2 = ejecutar_aviso_matutino_wa({ comercios: dos, ...base });
    expect(r2.resultados.map((r) => r.estado)).toEqual(["omitido_ya_enviado", "fallo"]);
    // Registro externo también vale como ya enviado.
    const r3 = ejecutar_aviso_matutino_wa({
      comercios: [comercio({ tenantId: "t-a" })],
      fecha: "2026-10-11",
      ahoraMs: 50,
      yaEnviados: new Set([clave_aviso_wa("t-a", "2026-10-11")]),
      enviar: () => ({ ok: true }),
    });
    expect(r3.resultados[0]?.estado).toBe("omitido_ya_enviado");
    // Reparto en el tiempo: ordenado y dentro de la ventana.
    expect(demora_para(0, 2, 600000)).toBe(0);
    expect(demora_para(1, 2, 600000)).toBe(300000);
  });
});
