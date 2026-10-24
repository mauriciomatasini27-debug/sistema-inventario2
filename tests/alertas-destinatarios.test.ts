import { describe, expect, it } from "vitest";
import {
  aplicarEleccion,
  aplicarOptIn,
  armarPantallaDestinatarios,
  parsearEleccion,
  TEXTO_VINCULAR,
} from "../src/modules/alertas/destinatarios.js";
import { canalesEfectivos } from "../src/modules/alertas/stock-bajo.js";

describe("parsearEleccion", () => {
  it("rechaza opt_in en el cuerpo", () => {
    const r = parsearEleccion({ canal: "email", aviso_hora: "08:00", opt_in: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("opt_in");
  });

  it("acepta canal hora y pausa", () => {
    const r = parsearEleccion({ canal: "ambos", aviso_hora: "09:30", pausado_hasta: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido.canal).toBe("ambos");
    expect(r.pedido.avisoHora).toBe("09:30");
  });
});

describe("aplicarEleccion PUT repetido converge", () => {
  it("mismo pedido dos veces deja el mismo estado", () => {
    const prev = { canal: "email" as const, avisoHora: "08:00", pausadoHastaMs: null };
    const pedido = { canal: "whatsapp" as const, avisoHora: "10:00", pausadoHastaMs: 5000 };
    const a = aplicarEleccion(prev, pedido);
    const b = aplicarEleccion(prev, pedido);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.eleccion).toEqual(b.eleccion);
    expect(a.eleccion).toEqual(pedido);
  });
});

describe("armarPantallaDestinatarios", () => {
  const nombres = new Map([
    ["d1", "Dueño"],
    ["e1", "Encargado"],
  ]);

  it("dueño fijo sin editable", () => {
    const filas = armarPantallaDestinatarios({
      sesionSub: "d1",
      sesionRol: "dueno",
      duenos: [{ rol: "dueno", googleSub: "d1", optInWa: true, avisoHora: "08:00", pausaHastaMs: null }],
      encargados: [],
      nombres,
      ahoraMs: 1,
    });
    expect(filas[0]?.rol).toBe("dueno");
    expect(filas[0] && "fijo" in filas[0] && filas[0].fijo).toBe(true);
  });

  it("ofrecerCodigo sin opt-in en whatsapp", () => {
    const filas = armarPantallaDestinatarios({
      sesionSub: "e1",
      sesionRol: "empleado",
      duenos: [],
      encargados: [
        {
          rol: "encargado",
          googleSub: "e1",
          optInWa: false,
          email: "e@x.com",
          canal: "whatsapp",
          avisoHora: "08:00",
          pausaHastaMs: null,
        },
      ],
      nombres,
      ahoraMs: 1,
    });
    const f = filas[0];
    expect(f?.rol).toBe("encargado");
    if (!f || f.rol !== "encargado") return;
    expect(f.ofrecerCodigo).toBe(true);
    expect(f.explicacion).toBe(TEXTO_VINCULAR);
    expect(f.canales).toEqual(["email"]);
    expect(
      canalesEfectivos({
        rol: "encargado",
        googleSub: "e1",
        optInWa: false,
        email: "e@x.com",
        canal: "ambos",
        avisoHora: "08:00",
        pausaHastaMs: null,
      }),
    ).toEqual(["email"]);
  });

  it("empleado solo ve su fila", () => {
    const filas = armarPantallaDestinatarios({
      sesionSub: "e1",
      sesionRol: "empleado",
      duenos: [{ rol: "dueno", googleSub: "d1", optInWa: true, avisoHora: "08:00", pausaHastaMs: null }],
      encargados: [
        {
          rol: "encargado",
          googleSub: "e1",
          optInWa: true,
          canal: "email",
          avisoHora: "08:00",
          pausaHastaMs: null,
        },
        {
          rol: "encargado",
          googleSub: "e2",
          optInWa: true,
          canal: "email",
          avisoHora: "08:00",
          pausaHastaMs: null,
        },
      ],
      nombres: new Map([
        ["d1", "Dueño"],
        ["e1", "Yo"],
        ["e2", "Otro"],
      ]),
      ahoraMs: 1,
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.googleSub).toBe("e1");
  });
});

describe("aplicarOptIn", () => {
  it("ALTA conserva optInAt si ya estaba activo", () => {
    const prev = { optIn: true, optInAtMs: 100 };
    expect(aplicarOptIn(prev, true, 200)).toEqual(prev);
  });
});
