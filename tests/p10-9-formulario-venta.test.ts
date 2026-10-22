import { describe, expect, it } from "vitest";
import {
  borradorDePayload,
  conLineaNueva,
  conPagoNuevo,
  diferenciaCentavos,
  payloadCorregido,
  sinLinea,
  sinPago,
  sumaPagosCentavos,
  totalCentavos,
  validarBorrador,
} from "../src/lib/ventas-pendientes-form.js";
import type {
  BorradorVenta,
  LineaBorrador,
  PagoBorrador,
} from "../src/lib/ventas-pendientes-form.js";

function primero<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("falta el primer elemento");
  return item;
}

function linea(id: string): LineaBorrador {
  return {
    id,
    origen: null,
    product_id: "sku",
    nombre: null,
    qtyTexto: "1",
    precioTexto: "1,00",
  };
}

function pago(id: string): PagoBorrador {
  return { id, origen: null, medio: "Efectivo", montoTexto: "1,00" };
}

describe("P10-9 formulario por línea de ventas pendientes", () => {
  it("marca sinPagos y conserva el medio cuando el payload no trae pagos", () => {
    const borrador = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 2, precio_centavos: 1500 }],
      medio: "Mercado Pago",
    });

    expect(borrador.sinPagos).toBe(true);
    expect(borrador.pagos).toEqual([]);
    expect(borrador.medio).toBe("Mercado Pago");

    const invalido = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 2, precio_centavos: 1500 }],
      medio: "Cheque",
      pagos: [{ medio: "Efectivo", monto_centavos: 0 }],
    });
    expect(invalido.sinPagos).toBe(true);
    expect(invalido.pagos).toEqual([]);
    expect(invalido.medio).toBe("Efectivo");
  });

  it("mapea los pagos existentes con su id y su origen", () => {
    const borrador = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 2, precio_centavos: 1500 }],
      medio: "QR",
      pagos: [
        { medio: "QR", monto_centavos: 3500 },
        { medio: "Efectivo", monto_centavos: 1500 },
      ],
    });

    expect(borrador.sinPagos).toBe(false);
    expect(borrador.pagos).toEqual([
      { id: "pago-0", origen: 0, medio: "QR", montoTexto: "35,00" },
      { id: "pago-1", origen: 1, medio: "Efectivo", montoTexto: "15,00" },
    ]);
  });

  it("no agrega pagos ni pierde campos desconocidos al corregir sin pagos", () => {
    const payload = {
      lineas: [
        {
          product_id: "sku-1",
          qty: 1,
          precio_centavos: 1500,
          precio_id: "p-1",
          alta: { nombre: "Yerba" },
        },
      ],
      medio: "QR",
      device_code: "caja-02",
      seq_local: 4,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
      offline: true,
      fiscal_receptor_cuit: "20123456789",
    };

    expect(payloadCorregido(payload, borradorDePayload(payload))).toEqual({
      lineas: [
        {
          product_id: "sku-1",
          qty: 1,
          precio_centavos: 1500,
          precio_id: "p-1",
          alta: { nombre: "Yerba" },
        },
      ],
      medio: "QR",
      device_code: "caja-02",
      seq_local: 4,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
      offline: true,
      fiscal_receptor_cuit: "20123456789",
    });
  });

  it("edita cantidad, precio y nombre en texto y los proyecta al payload", () => {
    const payload = {
      lineas: [
        {
          product_id: "sku-1",
          qty: 2,
          precio_centavos: 1500,
          precio_id: "p-1",
          alta: { nombre: "Yerba" },
        },
      ],
      medio: "Efectivo",
    };
    const borrador = borradorDePayload(payload);
    const original = primero(borrador.lineas);
    const editado: BorradorVenta = {
      ...borrador,
      lineas: [
        {
          ...original,
          qtyTexto: "3",
          precioTexto: "1.400,50",
          nombre: "Yerba nueva",
        },
      ],
    };

    expect(payloadCorregido(payload, editado)["lineas"]).toEqual([
      {
        product_id: "sku-1",
        qty: 3,
        precio_centavos: 140050,
        precio_id: "p-1",
        alta: { nombre: "Yerba nueva" },
      },
    ]);
  });

  it("inserta una línea nueva sin precio_id y conserva las originales por origen", () => {
    const payload = {
      lineas: [
        { product_id: "sku-1", qty: 2, precio_centavos: 1500, precio_id: "p-1" },
        { product_id: "sku-2", qty: 1, precio_centavos: 500, precio_id: "p-2" },
      ],
      medio: "Efectivo",
    };
    const borrador = borradorDePayload(payload);
    const nueva: LineaBorrador = {
      id: "nueva-1",
      origen: null,
      product_id: "sku-3",
      nombre: null,
      qtyTexto: "1",
      precioTexto: "99,00",
    };
    const conNueva: BorradorVenta = {
      ...borrador,
      lineas: [primero(borrador.lineas), nueva, ...borrador.lineas.slice(1)],
    };

    expect(payloadCorregido(payload, conNueva)["lineas"]).toEqual([
      { product_id: "sku-1", qty: 2, precio_centavos: 1500, precio_id: "p-1" },
      { product_id: "sku-3", qty: 1, precio_centavos: 9900 },
      { product_id: "sku-2", qty: 1, precio_centavos: 500, precio_id: "p-2" },
    ]);
  });

  it("rechaza cantidades vacías, cero, decimales o fuera de rango con el mismo mensaje", () => {
    const base = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 1, precio_centavos: 100 }],
      medio: "Efectivo",
    });
    const original = primero(base.lineas);

    for (const texto of ["0", "2,5", "1000", ""]) {
      const errores = validarBorrador({
        ...base,
        lineas: [{ ...original, qtyTexto: texto }],
      });
      expect(errores.lineas[original.id]).toEqual({
        qty: "Poné un entero entre 1 y 999.",
      });
    }

    const valido = validarBorrador({
      ...base,
      lineas: [{ ...original, qtyTexto: "999" }],
    });
    expect(valido.lineas[original.id]).toBeUndefined();
  });

  it("acepta el precio máximo y distingue el tope de los decimales", () => {
    const base = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 1, precio_centavos: 100 }],
      medio: "Efectivo",
    });
    const original = primero(base.lineas);

    expect(
      validarBorrador({
        ...base,
        lineas: [{ ...original, precioTexto: "9.999.999,99" }],
      }).lineas[original.id],
    ).toBeUndefined();

    expect(
      validarBorrador({
        ...base,
        lineas: [{ ...original, precioTexto: "10.000.000" }],
      }).lineas[original.id],
    ).toEqual({ precio: "Usá hasta $ 9.999.999,99." });

    expect(
      validarBorrador({
        ...base,
        lineas: [{ ...original, precioTexto: "10000000.00" }],
      }).lineas[original.id],
    ).toEqual({ precio: "Usá hasta $ 9.999.999,99." });

    expect(
      validarBorrador({
        ...base,
        lineas: [{ ...original, precioTexto: "1,234" }],
      }).lineas[original.id],
    ).toEqual({ precio: "Usá hasta 2 decimales, con coma (ej. 1.234,50)" });
  });

  it("valida el monto de cada pago y su tope", () => {
    const base = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 1, precio_centavos: 1000 }],
      medio: "Efectivo",
      pagos: [{ medio: "Efectivo", monto_centavos: 1000 }],
    });
    const original = primero(base.pagos);

    expect(
      validarBorrador({
        ...base,
        pagos: [{ ...original, montoTexto: "0" }],
      }).pagos[original.id],
    ).toEqual({ monto: "Poné un monto mayor a cero." });

    expect(
      validarBorrador({
        ...base,
        pagos: [{ ...original, montoTexto: "10.000.000" }],
      }).pagos[original.id],
    ).toEqual({ monto: "Usá hasta $ 9.999.999,99." });

    expect(
      validarBorrador({
        ...base,
        pagos: [{ ...original, montoTexto: "" }],
      }).pagos[original.id],
    ).toEqual({ monto: "Escribí un monto" });
  });

  it("calcula la diferencia contra el total y avisa cuánto falta o sobra", () => {
    const payload = {
      lineas: [{ product_id: "sku-1", qty: 1, precio_centavos: 150000 }],
      medio: "Efectivo",
      pagos: [{ medio: "Efectivo", monto_centavos: 100000 }],
    };
    const faltan = borradorDePayload(payload);

    expect(totalCentavos(faltan)).toBe(150000);
    expect(sumaPagosCentavos(faltan)).toBe(100000);
    expect(diferenciaCentavos(faltan)).toBe(-50000);
    expect(validarBorrador(faltan).general).toEqual([
      "Faltan $ 500,00 en los pagos.",
    ]);

    const sobran = borradorDePayload({
      ...payload,
      pagos: [{ medio: "Efectivo", monto_centavos: 200000 }],
    });
    expect(diferenciaCentavos(sobran)).toBe(50000);
    expect(validarBorrador(sobran).general).toEqual([
      "Sobran $ 500,00 en los pagos.",
    ]);

    const sinPagos = borradorDePayload({
      lineas: [{ product_id: "sku-1", qty: 1, precio_centavos: 150000 }],
      medio: "Efectivo",
    });
    expect(diferenciaCentavos(sinPagos)).toBe(0);
    expect(validarBorrador(sinPagos).general).toEqual([]);
  });

  it("respeta los límites de líneas y de pagos sin mutar el borrador", () => {
    const cincuenta: BorradorVenta = {
      lineas: Array.from({ length: 50 }, (_, indice) => linea("l-" + indice)),
      pagos: [],
      sinPagos: true,
      medio: "Efectivo",
    };
    expect(conLineaNueva(cincuenta, "extra")).toBe(cincuenta);

    const unaLinea: BorradorVenta = {
      lineas: [linea("l-1")],
      pagos: [],
      sinPagos: true,
      medio: "Efectivo",
    };
    expect(sinLinea(unaLinea, "l-1")).toBe(unaLinea);

    const cincoPagos: BorradorVenta = {
      lineas: [linea("l-1")],
      pagos: Array.from({ length: 5 }, (_, indice) => pago("p-" + indice)),
      sinPagos: false,
      medio: "Efectivo",
    };
    expect(conPagoNuevo(cincoPagos, "extra")).toBe(cincoPagos);

    const unPago: BorradorVenta = {
      lineas: [linea("l-1")],
      pagos: [pago("p-1")],
      sinPagos: false,
      medio: "Efectivo",
    };
    expect(sinPago(unPago, "p-1")).toBe(unPago);

    const sinPagos: BorradorVenta = {
      lineas: [linea("l-1")],
      pagos: [],
      sinPagos: true,
      medio: "Efectivo",
    };
    expect(conPagoNuevo(sinPagos, "extra")).toBe(sinPagos);

    const dosLineas = conLineaNueva(unaLinea, "nueva-1");
    expect(dosLineas.lineas).toHaveLength(2);
    expect(dosLineas.lineas[1]).toEqual({
      id: "nueva-1",
      origen: null,
      product_id: "",
      nombre: null,
      qtyTexto: "1",
      precioTexto: "",
    });
  });

  it("hace ida y vuelta entre el payload corregido y el borrador", () => {
    const payload = {
      lineas: [
        {
          product_id: "sku-1",
          qty: 2,
          precio_centavos: 1500,
          precio_id: "p-1",
          alta: { nombre: "Yerba" },
        },
        { product_id: "sku-2", qty: 1, precio_centavos: 500, precio_id: "p-2" },
      ],
      medio: "Mercado Pago",
      pagos: [{ medio: "Mercado Pago", monto_centavos: 3500 }],
      device_code: "caja-01",
      seq_local: 7,
      client_occurred_at: "2026-10-22T10:00:00.000-03:00",
      offline: true,
      fiscal_receptor_cuit: "20123456789",
    };
    const borrador = borradorDePayload(payload);
    const primeraLinea = primero(borrador.lineas);
    const editado: BorradorVenta = {
      ...borrador,
      lineas: [
        {
          ...primeraLinea,
          qtyTexto: "3",
          precioTexto: "1.400,50",
          nombre: "Yerba nueva",
        },
        ...borrador.lineas.slice(1),
      ],
      pagos: [{ ...primero(borrador.pagos), montoTexto: "4.206,50" }],
    };

    const primeraVez = payloadCorregido(payload, editado);
    const json = JSON.stringify(primeraVez);
    const segundaVez = payloadCorregido(
      JSON.parse(json),
      borradorDePayload(JSON.parse(json)),
    );

    expect(segundaVez).toEqual(primeraVez);
  });

  it("devuelve una línea vacía editable ante un payload inválido sin lanzar", () => {
    const vacio = borradorDePayload({ lineas: "x", pagos: "x" });
    expect(vacio.lineas).toEqual([
      {
        id: "nueva-0",
        origen: null,
        product_id: "",
        nombre: null,
        qtyTexto: "",
        precioTexto: "",
      },
    ]);
    expect(vacio.sinPagos).toBe(true);
    expect(vacio.medio).toBe("Efectivo");

    const nulo = borradorDePayload(null);
    expect(nulo.lineas).toHaveLength(1);
    expect(primero(nulo.lineas).product_id).toBe("");

    const mixto = borradorDePayload({
      lineas: [
        { product_id: "", qty: 1, precio_centavos: 0 },
        { product_id: "sku-2", qty: 2, precio_centavos: 100 },
      ],
      medio: "Efectivo",
    });
    expect(mixto.lineas).toEqual([
      {
        id: "linea-1",
        origen: 1,
        product_id: "sku-2",
        nombre: null,
        qtyTexto: "2",
        precioTexto: "1,00",
      },
    ]);

    const borrador: BorradorVenta = {
      lineas: [linea("l-1")],
      pagos: [],
      sinPagos: true,
      medio: "Efectivo",
    };
    expect(payloadCorregido("no es objeto", borrador)).toEqual({});
  });

  it("usa el valor original o los valores por defecto cuando el texto no parsea", () => {
    const payload = {
      lineas: [
        { product_id: "sku-1", qty: 2, precio_centavos: 1500, alta: { nombre: "Yerba" } },
      ],
      medio: "Efectivo",
      pagos: [{ medio: "Efectivo", monto_centavos: 3000 }],
    };
    const borrador = borradorDePayload(payload);
    const original = primero(borrador.lineas);
    const pagoOriginal = primero(borrador.pagos);
    const roto: BorradorVenta = {
      ...borrador,
      lineas: [{ ...original, qtyTexto: "x", precioTexto: "y" }],
      pagos: [{ ...pagoOriginal, montoTexto: "z" }],
    };

    expect(payloadCorregido(payload, roto)["lineas"]).toEqual([
      {
        product_id: "sku-1",
        qty: 2,
        precio_centavos: 1500,
        alta: { nombre: "Yerba" },
      },
    ]);
    expect(payloadCorregido(payload, roto)["pagos"]).toEqual([
      { medio: "Efectivo", monto_centavos: 3000 },
    ]);

    const nueva: LineaBorrador = {
      id: "nueva-1",
      origen: null,
      product_id: "sku-nuevo",
      nombre: null,
      qtyTexto: "x",
      precioTexto: "y",
    };
    const conNueva: BorradorVenta = {
      ...borrador,
      lineas: [...borrador.lineas, nueva],
    };
    expect(payloadCorregido(payload, conNueva)["lineas"]).toContainEqual({
      product_id: "sku-nuevo",
      qty: 1,
      precio_centavos: 0,
    });
  });
});
