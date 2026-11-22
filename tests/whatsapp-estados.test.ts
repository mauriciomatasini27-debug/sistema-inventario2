// WA-ESTADOS: el webhook de estados informa cada salto del mensaje. Cubre el
// parseo del payload real de Meta y la regla de "nunca retroceder".
import { describe, expect, it } from "vitest";
import { extraer_estados_meta, ganaEstado, rangoDeEstado } from "../src/modules/whatsapp/estados.js";

function sobre(statuses: unknown[]): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1305622728311468",
        changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses } }],
      },
    ],
  };
}

describe("extraer_estados_meta", () => {
  it("lee un delivered con wamid, destinatario y hora", () => {
    const r = extraer_estados_meta(
      sobre([{ id: "wamid.AAA", status: "delivered", timestamp: "1763800123", recipient_id: "5493513592875" }]),
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.wamid).toBe("wamid.AAA");
    expect(r[0]?.estado).toBe("entregado");
    expect(r[0]?.destinatario).toBe("5493513592875");
    expect(r[0]?.timestampMs).toBe(1763800123000);
  });

  it("lee un failed con código y motivo sacado de error_data.details", () => {
    const r = extraer_estados_meta(
      sobre([
        {
          id: "wamid.BBB",
          status: "failed",
          timestamp: "1763800200",
          recipient_id: "5493513592875",
          errors: [
            {
              code: 131026,
              title: "Message Undeliverable",
              message: "Message undeliverable",
              error_data: { details: "El número no está en WhatsApp" },
            },
          ],
        },
      ]),
    );
    expect(r[0]?.estado).toBe("fallido");
    expect(r[0]?.codigoError).toBe(131026);
    expect(r[0]?.motivoError).toBe("El número no está en WhatsApp");
  });

  it("no arrastra código ni motivo en un estado que no falló", () => {
    const r = extraer_estados_meta(
      sobre([{ id: "wamid.CCC", status: "read", timestamp: "1763800300", recipient_id: "5493513592875" }]),
    );
    expect(r[0]?.codigoError).toBeNull();
    expect(r[0]?.motivoError).toBeNull();
  });

  it("ignora los estados que no son un salto del mensaje", () => {
    expect(
      extraer_estados_meta(sobre([{ id: "wamid.DDD", status: "deleted", recipient_id: "5493513592875" }])),
    ).toHaveLength(0);
  });

  it("ignora un estado sin destinatario, porque sin número no hay comercio", () => {
    expect(extraer_estados_meta(sobre([{ id: "wamid.EEE", status: "delivered" }]))).toHaveLength(0);
  });

  it("devuelve vacío con un body que no trae estados", () => {
    expect(extraer_estados_meta({ entry: [{ changes: [{ value: { messages: [] } }] }] })).toHaveLength(0);
    expect(extraer_estados_meta(null)).toHaveLength(0);
    expect(extraer_estados_meta("no es un objeto")).toHaveLength(0);
  });

  it("levanta varios estados del mismo webhook", () => {
    const r = extraer_estados_meta(
      sobre([
        { id: "wamid.F1", status: "delivered", timestamp: "1763800400", recipient_id: "5493513592875" },
        { id: "wamid.F2", status: "read", timestamp: "1763800401", recipient_id: "5493513599999" },
      ]),
    );
    expect(r.map((x) => x.wamid)).toEqual(["wamid.F1", "wamid.F2"]);
  });
});

describe("ganaEstado", () => {
  it("acepta el primero cuando no hay estado guardado", () => {
    expect(ganaEstado(null, "enviado")).toBe(true);
  });

  it("avanza en el orden enviado, entregado, leído", () => {
    expect(ganaEstado("enviado", "entregado")).toBe(true);
    expect(ganaEstado("entregado", "leido")).toBe(true);
  });

  it("nunca retrocede: un sent atrasado no pisa un read", () => {
    expect(ganaEstado("leido", "entregado")).toBe(false);
    expect(ganaEstado("entregado", "enviado")).toBe(false);
    expect(ganaEstado("leido", "enviado")).toBe(false);
  });

  it("fallido es terminal y gana sobre cualquier salto", () => {
    expect(ganaEstado("leido", "fallido")).toBe(true);
    expect(ganaEstado("enviado", "fallido")).toBe(true);
    expect(ganaEstado("fallido", "leido")).toBe(false);
    expect(ganaEstado("fallido", "entregado")).toBe(false);
  });
});

describe("rangoDeEstado", () => {
  it("ordena los estados de menor a mayor y deja fallido al final", () => {
    expect(rangoDeEstado("enviado")).toBeLessThan(rangoDeEstado("entregado"));
    expect(rangoDeEstado("entregado")).toBeLessThan(rangoDeEstado("leido"));
    expect(rangoDeEstado("leido")).toBeLessThan(rangoDeEstado("fallido"));
  });
});
