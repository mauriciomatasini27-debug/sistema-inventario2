import { describe, expect, it } from "vitest";
import { formatearCentavos } from "../src/lib/panel-modulos.js";
import {
  estadoInicial,
  reducir,
  vistaDe,
  type EstadoDevolucion,
  type PedidoPost,
} from "../src/lib/devolucion-borrador.js";

const SALE = "11111111-1111-4111-8111-111111111111";
const ISO = "2026-11-09T23:00:00.000Z";
const ISO2 = "2026-11-09T23:05:00.000Z";

type Cuerpo = {
  monto_centavos?: number;
  items?: { product_id: string; qty: number }[];
  medio?: string;
  actor?: string;
  client_occurred_at?: string;
};

function ticket(parcial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sale_id: SALE,
    ticket_definitivo: "T-000010",
    ticket_provisorio: "A1-1",
    total_centavos: "100",
    medio: "Efectivo",
    lineas: [{ sku: "SKU-A", qty: 3, neto_centavos: 100 }],
    ...parcial,
  };
}

function cargar(json: unknown, numero = "T-000010"): EstadoDevolucion {
  const buscado = reducir(estadoInicial(), { tipo: "buscar", numero });
  if (buscado.efecto.tipo !== "buscar") throw new Error("se esperaba buscar");
  return reducir(buscado.estado, {
    tipo: "respuestaTicket",
    status: 200,
    json,
    busqueda: buscado.efecto.busqueda,
  }).estado;
}

function conUnidades(estado: EstadoDevolucion, qty: number): EstadoDevolucion {
  const linea = vistaDe(estado, formatearCentavos).lineas[0];
  if (!linea) throw new Error("sin línea");
  const marcada = reducir(estado, { tipo: "cantidad", lineaId: linea.lineaId, qty }).estado;
  return reducir(marcada, { tipo: "motivo", texto: "Producto fallado" }).estado;
}

function cuerpo(paso: ReturnType<typeof reducir>): { pedido: PedidoPost; json: Cuerpo } {
  if (paso.efecto.tipo !== "post") throw new Error("se esperaba un POST");
  const json: unknown = JSON.parse(paso.efecto.pedido.body);
  if (typeof json !== "object" || json === null) throw new Error("cuerpo ilegible");
  return { pedido: paso.efecto.pedido, json: json as Cuerpo };
}

describe("devolución: borrador del panel", () => {
  it("el piso del neto deja 33 y 66, y la fila completa aporta el neto", () => {
    const base = cargar(ticket());
    expect(vistaDe(base, formatearCentavos).actor).toBe("panel-web");

    const una = cuerpo(reducir(conUnidades(base, 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k1" }));
    expect(una.json.monto_centavos).toBe(33);
    expect(una.json.items).toEqual([{ product_id: "SKU-A", qty: 1 }]);
    expect(una.json.actor).toBe("panel-web");

    const dos = cuerpo(reducir(conUnidades(base, 2), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k2" }));
    expect(dos.json.monto_centavos).toBe(66);

    const tres = cuerpo(reducir(conUnidades(base, 3), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k3" }));
    expect(tres.json.monto_centavos).toBe(100);
  });

  it("el ticket completo que supera el total se recorta al total, y una fila sola no", () => {
    const json = ticket({
      total_centavos: "100",
      lineas: [
        { sku: "SKU-A", qty: 1, neto_centavos: "60" },
        { sku: "SKU-B", qty: 1, neto_centavos: "60" },
      ],
    });
    let completo = reducir(cargar(json), { tipo: "devolverTodo" }).estado;
    completo = reducir(completo, { tipo: "motivo", texto: "Se arrepintió" }).estado;
    const todo = cuerpo(reducir(completo, { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" }));
    expect(todo.json.monto_centavos).toBe(100);
    expect(todo.json.items).toEqual([
      { product_id: "SKU-A", qty: 1 },
      { product_id: "SKU-B", qty: 1 },
    ]);

    const linea = vistaDe(cargar(json), formatearCentavos).lineas[0];
    if (!linea) throw new Error("sin línea");
    let parcial = reducir(cargar(json), { tipo: "cantidad", lineaId: linea.lineaId, qty: 1 }).estado;
    parcial = reducir(parcial, { tipo: "motivo", texto: "Se arrepintió" }).estado;
    expect(cuerpo(reducir(parcial, { tipo: "enviar", ahoraIso: ISO, claveNueva: "k2" })).json.monto_centavos).toBe(60);
  });

  it("dos filas del mismo sku se suman en un solo ítem", () => {
    const json = ticket({
      total_centavos: 100,
      lineas: [
        { sku: "SKU-A", qty: 1, neto_centavos: "40" },
        { sku: "SKU-A", qty: 2, neto_centavos: "60" },
      ],
    });
    let estado = reducir(cargar(json), { tipo: "devolverTodo" }).estado;
    estado = reducir(estado, { tipo: "motivo", texto: "Equivocación" }).estado;
    const posteado = cuerpo(reducir(estado, { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" }));
    expect(posteado.json.items).toEqual([{ product_id: "SKU-A", qty: 3 }]);
    expect(posteado.json.monto_centavos).toBe(100);
  });

  it("una venta a cuenta esconde el medio y el cuerpo manda Efectivo", () => {
    for (const medio of ["A cuenta", "Pago: A cuenta"]) {
      let estado = cargar(ticket({ medio, lineas: [{ sku: "SKU-A", qty: 1, neto_centavos: "100" }] }));
      const vista = vistaDe(estado, formatearCentavos);
      expect(vista.mostrarMedio, medio).toBe(false);
      expect(vista.medio, medio).toBeNull();
      expect(vista.textoFiado, medio).toBe("Se acredita al fiado. La caja no se mueve.");
      const linea = vista.lineas[0];
      if (!linea) throw new Error("sin línea");
      estado = reducir(estado, { tipo: "medio", medio: "Debito" }).estado;
      estado = reducir(estado, { tipo: "cantidad", lineaId: linea.lineaId, qty: 1 }).estado;
      estado = reducir(estado, { tipo: "motivo", texto: "Equivocación" }).estado;
      const posteado = cuerpo(reducir(estado, { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" }));
      expect(posteado.json.medio, medio).toBe("Efectivo");
      const mensaje = vistaDe(estado, formatearCentavos).confirmacion?.mensaje ?? "";
      expect(mensaje, medio).toContain("T-000010");
      expect(mensaje, medio).toContain("Se acredita al fiado. La caja no se mueve.");
      expect(mensaje, medio).not.toContain("Debito");
      expect(mensaje, medio).not.toContain("Efectivo");
    }
  });

  it("un 503 y un corte de red reintentan con la misma clave y la misma hora", () => {
    const primero = reducir(conUnidades(cargar(ticket()), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "clave-1" });
    const original = cuerpo(primero);

    const por503 = reducir(primero.estado, {
      tipo: "respuestaDevolucion",
      status: 503,
      json: { error: "base_no_disponible" },
    }).estado;
    const vista503 = vistaDe(por503, formatearCentavos);
    expect(vista503.status).toBe(
      "La base no respondió. Reintentá. Si cambiás la selección, puede generarse otra devolución.",
    );
    expect(vista503.boton?.etiqueta).toBe("Reintentar");
    expect(vista503.bloquearEdicion).toBe(true);
    const reintento = cuerpo(reducir(por503, { tipo: "enviar", ahoraIso: ISO2, claveNueva: "clave-2" }));
    expect(reintento.pedido.headers["Idempotency-Key"]).toBe("clave-1");
    expect(reintento.json).toEqual(original.json);
    expect(reintento.json.client_occurred_at).toBe(ISO);

    const porRed = reducir(primero.estado, { tipo: "redEnvio" }).estado;
    const trasRed = cuerpo(reducir(porRed, { tipo: "enviar", ahoraIso: ISO2, claveNueva: "clave-3" }));
    expect(trasRed.pedido.headers["Idempotency-Key"]).toBe(original.pedido.headers["Idempotency-Key"]);
    expect(trasRed.json.client_occurred_at).toBe(ISO);
  });

  it("cambiar después de un corte suelta la clave congelada", () => {
    const primero = reducir(conUnidades(cargar(ticket()), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "clave-1" });
    const cortado = reducir(primero.estado, { tipo: "redEnvio" }).estado;
    const editando = reducir(cortado, { tipo: "cambiar" }).estado;
    expect(vistaDe(editando, formatearCentavos).bloquearEdicion).toBe(false);
    const nuevo = cuerpo(reducir(editando, { tipo: "enviar", ahoraIso: ISO2, claveNueva: "clave-nueva" }));
    expect(nuevo.pedido.headers["Idempotency-Key"]).toBe("clave-nueva");
    expect(nuevo.json.client_occurred_at).toBe(ISO2);
  });

  it("un 201 muestra el número D- y no el id de la venta", () => {
    const primero = reducir(conUnidades(cargar(ticket()), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" });
    const estado = reducir(primero.estado, {
      tipo: "respuestaDevolucion",
      status: 201,
      json: {
        numero_devolucion: "D-000007",
        fiscal_estado: "sin_factura",
        sale_id: SALE,
        monto_centavos: 33,
      },
    }).estado;
    const status = vistaDe(estado, formatearCentavos).status;
    expect(status).toContain("D-000007");
    expect(status).toContain("Sin nota de crédito.");
    expect(status).not.toContain(SALE);
    expect(status).not.toMatch(/centavos/i);
    expect(vistaDe(estado, formatearCentavos).mostrarOtra).toBe(true);
  });

  it("un 409 muestra el número de la devolución original", () => {
    const primero = reducir(conUnidades(cargar(ticket()), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" });
    const estado = reducir(primero.estado, {
      tipo: "respuestaDevolucion",
      status: 409,
      json: { error: "repetida", original: { numero_devolucion: "D-000042", sale_id: SALE } },
    }).estado;
    const status = vistaDe(estado, formatearCentavos).status;
    expect(status).toContain("D-000042");
    expect(status).not.toContain(SALE);
    expect(status).not.toContain("sale_id");
    expect(vistaDe(estado, formatearCentavos).mostrarOtra).toBe(true);
  });

  it("una búsqueda vacía no dispara el pedido", () => {
    const paso = reducir(estadoInicial(), { tipo: "buscar", numero: "   " });
    expect(paso.efecto).toEqual({ tipo: "nada" });
    const vista = vistaDe(paso.estado, formatearCentavos);
    expect(vista.busqueda).toBe(0);
    expect(vista.buscando).toBe(false);
  });

  it("una respuesta vieja no pisa una búsqueda más nueva", () => {
    const primera = reducir(estadoInicial(), { tipo: "buscar", numero: "T-1" });
    const segunda = reducir(primera.estado, { tipo: "buscar", numero: "T-2" });
    if (primera.efecto.tipo !== "buscar" || segunda.efecto.tipo !== "buscar") throw new Error("se esperaba buscar");
    const vieja = reducir(segunda.estado, {
      tipo: "respuestaTicket",
      status: 200,
      json: ticket({ ticket_definitivo: "T-1" }),
      busqueda: primera.efecto.busqueda,
    }).estado;
    expect(vistaDe(vieja, formatearCentavos).buscando).toBe(true);
    const nueva = reducir(vieja, {
      tipo: "respuestaTicket",
      status: 200,
      json: ticket({ ticket_definitivo: "T-2", lineas: [{ sku: "SKU-Z", qty: 1, neto_centavos: "100" }] }),
      busqueda: segunda.efecto.busqueda,
    }).estado;
    expect(vistaDe(nueva, formatearCentavos).lineas.map((l) => l.titulo)).toEqual(["SKU-Z"]);
  });

  it("un 422 de tope dice los pesos ya devueltos y lo que queda", () => {
    const json = ticket({
      total_centavos: "10000",
      lineas: [{ sku: "SKU-A", qty: 1, neto_centavos: "10000" }],
    });
    const primero = reducir(conUnidades(cargar(json), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "clave-vieja" });
    const estado = reducir(primero.estado, {
      tipo: "respuestaDevolucion",
      status: 422,
      json: { error: "supera el total de la venta", acumulado_centavos: "7000" },
    }).estado;
    const vista = vistaDe(estado, formatearCentavos);
    expect(vista.status).toBe("Ya se devolvieron $70.00 de $100.00. Quedan $30.00.");
    expect(vista.status).not.toMatch(/centavos/i);
    expect(vista.bloquearEdicion).toBe(false);
    const reintento = cuerpo(reducir(estado, { tipo: "enviar", ahoraIso: ISO2, claveNueva: "clave-nueva" }));
    expect(reintento.pedido.headers["Idempotency-Key"]).toBe("clave-nueva");
    expect(reintento.json.client_occurred_at).toBe(ISO2);
  });

  it("un 422 de validación no muestra sale_id ni la palabra centavos", () => {
    const primero = reducir(conUnidades(cargar(ticket()), 1), { tipo: "enviar", ahoraIso: ISO, claveNueva: "k" });
    const estado = reducir(primero.estado, {
      tipo: "respuestaDevolucion",
      status: 422,
      json: { error: { formErrors: [], fieldErrors: { sale_id: ["Invalid uuid"], monto_centavos: ["Expected number"] } } },
    }).estado;
    const status = vistaDe(estado, formatearCentavos).status;
    expect(status).not.toContain("sale_id");
    expect(status).not.toContain("monto_centavos");
    expect(status).not.toMatch(/centavos/i);
    expect(status.length).toBeGreaterThan(0);
    expect(vistaDe(estado, formatearCentavos).bloquearEdicion).toBe(false);
  });
});
