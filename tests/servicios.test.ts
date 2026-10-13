import { describe, expect, it } from "vitest";
import {
  crear_cuenta,
  desactivar_cuenta,
  es_cuenta_duplicada,
  normalizar_numero_cuenta,
  validar_cuenta,
} from "../src/modules/utilities/cuentas.js";
import {
  categoria_para,
  derivar_estado,
  dias_para_vencer,
  evento_factura,
  pagar_servicio,
  parsear_fecha_ar,
  parsear_monto_ar,
  periodo_de,
  proximas_a_vencer,
  registrar_factura,
  senal_ops_servicios,
  suma_items_cuadra,
  vencidas,
  type FacturaServicio,
} from "../src/modules/utilities/facturas_servicios.js";
import { puede_registrar, registrar_movimiento } from "../src/modules/cash/caja.js";

function facturaBase(over: Partial<FacturaServicio> = {}): FacturaServicio {
  return {
    id: "f-" + Math.random().toString(36).slice(2),
    accountId: "c-luz",
    messageId: "m-" + Math.random().toString(36).slice(2),
    periodo: "2026-10",
    vencimiento: "2026-10-20",
    montoCentavos: 4_800_000n,
    estado: "pendiente",
    necesitaRevision: false,
    origen: "pdf_digital",
    confianzaMonto: "alta",
    confianzaVencimiento: "alta",
    ...over,
  };
}

describe("CS8 cuentas de servicio", () => {
  it("crea válida normalizando proveedor/número", () => {
    const r = crear_cuenta(
      { servicio: "luz", proveedor: "  Edenor  ", titular: "Kiosco La Esquina", numeroCuenta: "12-345" },
      [],
      { id: "c1" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cuenta).toMatchObject({
      id: "c1",
      servicio: "luz",
      proveedor: "Edenor",
      numeroCuenta: "12345",
      activa: true,
    });
    expect(normalizar_numero_cuenta("12 345")).toBe("12345");
  });

  it("422 servicio fuera de lista, proveedor corto, día y email inválidos", () => {
    expect(validar_cuenta({ servicio: "cable", proveedor: "X", titular: "T" })).toContain(
      "servicio fuera de lista (luz|gas|agua|internet|telefono|tasas|arca|otro)",
    );
    expect(crear_cuenta({ servicio: "luz", proveedor: "E", titular: "T" }, [])).toMatchObject({
      ok: false,
      codigo: "CUENTA_INVALIDA",
      status: 422,
    });
    expect(
      validar_cuenta({ servicio: "gas", proveedor: "Metrogas", titular: "Kiosco", vencimientoTipicoDia: 32 }),
    ).toContain("vencimiento tipico 1 a 31");
    expect(
      validar_cuenta({ servicio: "gas", proveedor: "Metrogas", titular: "Kiosco", emailOrigen: "no-es-email" }),
    ).toContain("email origen invalido");
  });

  it("409 anti-duplicados (CS8/CS9.3)", () => {
    const existentes = [{ servicio: "luz", proveedor: "Edenor", titular: "Kiosco La Esquina", numeroCuenta: "12345" }];
    // Mismo número con otro formato => duplicada.
    expect(
      crear_cuenta({ servicio: "luz", proveedor: "edenor", titular: "Otro", numeroCuenta: "12 345" }, existentes),
    ).toMatchObject({ ok: false, codigo: "DUPLICADA", status: 409 });
    // Sin número: mismo servicio+proveedor+titular => duplicada.
    expect(
      es_cuenta_duplicada(
        { servicio: "agua", proveedor: "AySA", titular: "Kiosco", numeroCuenta: null },
        [{ servicio: "agua", proveedor: "aysa", titular: "kiosco", numeroCuenta: null }],
      ),
    ).toBe(true);
    // Distinto número o distinto servicio => no duplica.
    expect(
      crear_cuenta({ servicio: "luz", proveedor: "Edenor", titular: "Kiosco La Esquina", numeroCuenta: "99999" }, existentes),
    ).toMatchObject({ ok: true });
    expect(
      crear_cuenta({ servicio: "gas", proveedor: "Edenor", titular: "Kiosco La Esquina", numeroCuenta: "12345" }, existentes),
    ).toMatchObject({ ok: true });
  });

  it("desactivar conserva facturas (solo apaga, no muta)", () => {
    const r = crear_cuenta({ servicio: "internet", proveedor: "Telecom", titular: "Kiosco" }, [], { id: "c2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const off = desactivar_cuenta(r.cuenta);
    expect(off.activa).toBe(false);
    expect(off.proveedor).toBe("Telecom");
    expect(r.cuenta.activa).toBe(true);
  });
});

describe("CS4.6 normalización AR", () => {
  it("montos con punto de miles y coma decimal al mismo valor", () => {
    expect(parsear_monto_ar("164.800,00")).toBe(16_480_000n);
    expect(parsear_monto_ar("48000")).toBe(4_800_000n);
    expect(parsear_monto_ar("$ 48.000")).toBe(4_800_000n);
    expect(parsear_monto_ar("1.234,56")).toBe(123_456n);
    expect(parsear_monto_ar("48,5")).toBe(4_850n);
  });

  it("monto negativo o inválido lanza", () => {
    expect(() => parsear_monto_ar("-100")).toThrow();
    expect(() => parsear_monto_ar("abc")).toThrow();
    expect(() => parsear_monto_ar("")).toThrow();
  });

  it("fechas dd/mm/aaaa a ISO + validación calendario", () => {
    expect(parsear_fecha_ar("20/10/2026")).toBe("2026-10-20");
    expect(parsear_fecha_ar("2026-10-20")).toBe("2026-10-20");
    expect(parsear_fecha_ar("5-1-2026")).toBe("2026-01-05");
    expect(() => parsear_fecha_ar("31/02/2026")).toThrow();
    expect(() => parsear_fecha_ar("2026-13-01")).toThrow();
    expect(periodo_de("2026-10-08")).toBe("2026-10");
  });

  it("suma ítems vs total tolera 1% (ADR-0005)", () => {
    expect(suma_items_cuadra([6_000n, 4_000n], 10_000n)).toBe(true);
    expect(suma_items_cuadra([10_050n], 10_000n)).toBe(true);
    expect(suma_items_cuadra([10_200n], 10_000n)).toBe(false);
  });
});

describe("CS4/CS5 facturas de servicios", () => {
  it("registra 201 sin advertencias cuando todo cuadra", () => {
    const r = registrar_factura(
      { accountId: "c-luz", messageId: "m-1", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 4_800_000n, hoyIso: "2026-10-10" },
      new Map(),
    );
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.factura.estado).toBe("pendiente");
    expect(r.advertencias).toEqual([]);
  });

  it("advierte sin bloquear: vencida, desvío >50% promedio, suma difiere (CS4.7)", () => {
    const r = registrar_factura(
      {
        accountId: "c-luz",
        messageId: "m-adv",
        periodo: "2026-09",
        vencimiento: "2026-09-05",
        montoCentavos: 16_200n,
        promedioUltimos3Centavos: 10_000n,
        itemsCentavos: [5_000n],
        hoyIso: "2026-10-10",
      },
      new Map(),
    );
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.advertencias).toContain("vencimiento_pasado");
    expect(r.advertencias).toContain("monto_muy_distinto_promedio");
    expect(r.advertencias).toContain("suma_items_difiere");
    // Dentro del ±50% no advierte.
    const ok = registrar_factura(
      { accountId: "c-luz", messageId: "m-ok", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 14_000n, promedioUltimos3Centavos: 10_000n, hoyIso: "2026-10-10" },
      new Map(),
    );
    if (ok.status !== 201) return;
    expect(ok.advertencias).not.toContain("monto_muy_distinto_promedio");
  });

  it("409 message-id repetido devuelve el existente sin reprocesar", () => {
    const vistos = new Map<string, FacturaServicio>();
    const r1 = registrar_factura(
      { accountId: "c-luz", messageId: "m-doble", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 1_000n },
      vistos,
    );
    expect(r1.status).toBe(201);
    if (r1.status !== 201) return;
    vistos.set("m-doble", r1.factura);
    const r2 = registrar_factura(
      { accountId: "c-luz", messageId: "m-doble", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 9_999n },
      vistos,
    );
    expect(r2.status).toBe(409);
    if (r2.status !== 409) return;
    expect(r2.original.montoCentavos).toBe(1_000n);
    expect(vistos.size).toBe(1);
  });

  it("422 monto cero, message-id vacío, período mal formato", () => {
    const vistos = new Map<string, FacturaServicio>();
    expect(
      registrar_factura({ accountId: "c", messageId: "m0", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 0n }, vistos),
    ).toMatchObject({ status: 422 });
    expect(
      registrar_factura({ accountId: "c", messageId: "", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 1n }, vistos),
    ).toMatchObject({ status: 422 });
    expect(
      registrar_factura({ accountId: "c", messageId: "m1", periodo: "10/2026", vencimiento: "2026-10-20", montoCentavos: 1n }, vistos),
    ).toMatchObject({ status: 422 });
  });

  it("estado derivado: vencida no se persiste; pagada queda pagada", () => {
    const f = facturaBase({ vencimiento: "2026-10-05" });
    expect(derivar_estado(f, "2026-10-10")).toBe("vencida");
    expect(f.estado).toBe("pendiente");
    expect(derivar_estado(facturaBase({ vencimiento: "2026-10-20" }), "2026-10-10")).toBe("pendiente");
    expect(derivar_estado(facturaBase({ estado: "pagada", vencimiento: "2026-10-05" }), "2026-10-10")).toBe("pagada");
    expect(dias_para_vencer("2026-10-10", "2026-10-13")).toBe(3);
  });

  it("próximas a vencer (ventana) + vencidas ordenadas por fecha", () => {
    const facturas = [
      facturaBase({ id: "a", vencimiento: "2026-10-12" }),
      facturaBase({ id: "b", vencimiento: "2026-10-05" }),
      facturaBase({ id: "c", vencimiento: "2026-11-20" }),
      facturaBase({ id: "d", vencimiento: "2026-10-04", estado: "pagada" }),
    ];
    const prox = proximas_a_vencer(facturas, "2026-10-10", 7);
    expect(prox.map((f) => f.id)).toEqual(["a"]);
    const ven = vencidas(facturas, "2026-10-10");
    expect(ven.map((f) => f.id)).toEqual(["b"]);
  });

  it("pago genera egreso compatible con caja sin modificar cash/ (CS5.1)", () => {
    const f = facturaBase({ periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 4_800_000n });
    const r = pagar_servicio(f, {
      servicio: "luz",
      proveedor: "Edenor",
      numeroCuenta: "12345",
      medio: "Mercado Pago",
    });
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    // Inmutable salvo la transición pendiente->pagada.
    expect(r.factura).toMatchObject({ estado: "pagada", periodo: "2026-10", vencimiento: "2026-10-20", montoCentavos: 4_800_000n });
    expect(f.estado).toBe("pendiente");
    // Descriptor válido para registrar_movimiento (origen retiro +
    // gasto_operativo pasa para Dueño y Empleado con permiso).
    expect(r.egreso).toMatchObject({
      tipo: "egreso",
      monto_centavos: 4_800_000n,
      origen: "retiro",
      categoria_id: "luz",
      tipo_retiro: "gasto_operativo",
    });
    expect(
      puede_registrar({ origen: "retiro", categoria_id: r.egreso.categoria_id, rol: "empleado", tipo_retiro: "gasto_operativo" }),
    ).toBe(true);
    expect(() =>
      registrar_movimiento({
        tipo: "egreso",
        metodo: r.egreso.metodo,
        monto_centavos: r.egreso.monto_centavos,
        origen: "retiro",
        categoria_id: r.egreso.categoria_id,
        tipo_retiro: "gasto_operativo",
        rol: "empleado",
      }),
    ).not.toThrow();
    expect(categoria_para("arca")).toBe("arca");
    // Segundo pago => 409.
    expect(pagar_servicio(r.factura, { servicio: "luz", proveedor: "Edenor", numeroCuenta: "12345", medio: "Efectivo" })).toMatchObject({
      status: 409,
    });
  });

  it("eventos y señales ops no llevan montos al panel", () => {
    const f = facturaBase({ id: "f1", accountId: "c1" });
    expect(evento_factura(f, "servicios_factura_registrada")).toMatchObject({
      facturaId: "f1",
      accountId: "c1",
      periodo: "2026-10",
    });
    const s = senal_ops_servicios({ tipo: "servicios_factura_detectada", cantidad: 3, ventana: "2026-10" });
    expect(s).toMatchObject({ cantidad: 3 });
    expect(Object.keys(s)).not.toContain("monto");
    expect(Object.keys(s)).not.toContain("montoCentavos");
  });
});
