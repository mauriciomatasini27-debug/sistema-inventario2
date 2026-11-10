import { describe, expect, it } from "vitest";
import { crear_cliente, fijar_tope_plazo, validar_ficha, es_duplicado } from "../src/modules/credit/clientes.js";
import {
  C18_INGRESO_CAJA,
  MEDIOS_COBRO,
  cobro_fiado,
  link_whatsapp,
  registrar_ajuste,
  revertir_movimiento,
  texto_pago_ticket,
  venta_a_cuenta,
  type CobroRegistrado,
  type TicketFiado,
} from "../src/modules/credit/fiado.js";
import type { Lote, LotId, Sku } from "../src/modules/inventario/inventario.js";
import type { MovimientoCredito } from "../src/modules/credit/saldos.js";
import { resolverCredito } from "../src/modules/credit/limite.js";
import type { Rol } from "../src/modules/cash/caja.js";

const sku = (s: string) => s as Sku;
const lot = (s: string) => s as LotId;
const lote = (id: string, s: string, cantidad: number): Lote => ({
  id: lot(id),
  sku: sku(s),
  cantidad,
  venceEl: null,
  costoCentavos: 1000n,
});

const AHORA = 1_789_000_000_000;
const LINEAS = [{ sku: sku("YERBA"), cantidad: 2, precioCentavos: 15000n }] as const;
const TOTAL = 30000n;

function ventaBase(
  over: Partial<Omit<Parameters<typeof venta_a_cuenta>[0], "credito">> & {
    saldoActualCentavos?: bigint;
    topeCentavos?: bigint;
    rol?: Rol;
    customerId?: string;
  } = {},
) {
  const { saldoActualCentavos = 0n, topeCentavos = 100000n, rol = "empleado", customerId = "cli-1", ...resto } = over;
  const credito = resolverCredito({ customerId, topeAlmacenado: topeCentavos, saldoCentavos: saldoActualCentavos, rol });
  if (!credito.ok) throw new Error(credito.codigo);
  return {
    idempotencyKey: "fiado-" + Math.random().toString(36).slice(2),
    lineas: [...LINEAS],
    deviceCode: "KIOSCO-01",
    seqLocal: 7,
    offline: false,
    lotes: [lote("l1", "YERBA", 10)],
    vistos: new Map<string, TicketFiado>(),
    ultimoDefinitivo: { n: 41 },
    ahoraMs: AHORA,
    credito: credito.valor,
    ...resto,
  };
}

describe("FC1 ficha cliente", () => {
  it("ficha valida con nombre + telefono/DNI/notas", () => {
    expect(validar_ficha({ nombre: "Juan Perez", telefono: "+54 9 11 5555 1234", dni: "30123456", notas: "paga viernes" })).toEqual([]);
    const r = crear_cliente({ nombre: "Juan Perez", telefono: "+54 9 11 5555 1234" }, [], { id: "c1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cliente.telefono).toBe("5491155551234");
    expect(r.cliente.topeCentavos).toBe(0n);
  });

  it("422 sin nombre y notas sobre 280c", () => {
    expect(validar_ficha({ nombre: "   " })).toContain("nombre requerido");
    expect(validar_ficha({ nombre: "A", notas: "x".repeat(281) })).toContain("notas maximo 280 caracteres");
    const r = crear_cliente({ nombre: "   " }, []);
    expect(r).toMatchObject({ ok: false, codigo: "FICHA_INVALIDA", status: 422 });
  });

  it("409 anti-duplicados por nombre, telefono o dni", () => {
    const existentes = [{ nombre: "Juan Perez", telefono: "5491155551234", dni: "30123456" }];
    expect(es_duplicado({ nombre: "  juan  PEREZ ", telefono: null, dni: null }, existentes)).toBe(true);
    expect(es_duplicado({ nombre: "Otro", telefono: "5491155551234", dni: null }, existentes)).toBe(true);
    expect(es_duplicado({ nombre: "Otro", telefono: null, dni: "30123456" }, existentes)).toBe(true);
    expect(es_duplicado({ nombre: "Distinto", telefono: "1100000000", dni: "999" }, existentes)).toBe(false);
    const r = crear_cliente({ nombre: "juan perez" }, existentes);
    expect(r).toMatchObject({ ok: false, codigo: "DUPLICADO", status: 409, existente: existentes[0] });
    const primera = { nombre: "Ana", telefono: "5491155551234", dni: null };
    const segunda = { nombre: "Otra", telefono: "5491155551234", dni: null };
    const porTelefono = crear_cliente({ nombre: "Nueva", telefono: "+54 9 11 5555 1234" }, [primera, segunda]);
    expect(porTelefono).toMatchObject({ ok: false, codigo: "DUPLICADO", existente: primera });
  });

  it("FC9 tope/plazo personalizado solo dueno", () => {
    const emp = crear_cliente({ nombre: "A" }, [], { topeCentavos: 5000n, rol: "empleado" });
    expect(emp).toMatchObject({ ok: false, codigo: "SOLO_DUENO", status: 403 });
    const due = crear_cliente({ nombre: "A" }, [], { id: "c2", topeCentavos: 5000n, plazoDias: 15, rol: "dueno" });
    expect(due.ok).toBe(true);
    if (!due.ok) return;
    expect(fijar_tope_plazo(due.cliente, 9000n, 30, "empleado")).toMatchObject({ status: 403 });
    const ok = fijar_tope_plazo(due.cliente, 9000n, 30, "dueno");
    expect(ok.ok && ok.cliente.topeCentavos).toBe(9000n);
    // No muta el original.
    expect(due.cliente.topeCentavos).toBe(5000n);
  });
});

describe("FC2/FC3 venta a cuenta + C18", () => {
  it("descuenta stock, ticket Pago: A cuenta, NO ingresa a caja", () => {
    const r = venta_a_cuenta(ventaBase({ idempotencyKey: "fa-1" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket).toMatchObject({
      kind: "online",
      definitivo: "T-000042",
      provisorio: "KIOSCO-01-7",
      pago: "Pago: A cuenta",
      leyenda: "DOCUMENTO NO VÁLIDO COMO FACTURA",
    });
    expect(texto_pago_ticket()).toBe("Pago: A cuenta");
    expect(r.efecto.movimientosStock).toHaveLength(1);
    expect(r.efecto.movimientoCredito).toMatchObject({ tipo: "venta", debeCentavos: TOTAL, haberCentavos: 0n });
    expect(r.efecto.ingresaACaja).toBe(false);
    expect(C18_INGRESO_CAJA.venta_a_cuenta).toBe(false);
  });

  it("retry identico 409 sin consumir numero", () => {
    const vistos = new Map<string, TicketFiado>();
    const r1 = venta_a_cuenta(ventaBase({ idempotencyKey: "fa-doble", vistos, ultimoDefinitivo: { n: 10 } }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    vistos.set("fa-doble", r1.efecto.ticket);
    const r2 = venta_a_cuenta(ventaBase({ idempotencyKey: "fa-doble", vistos, ultimoDefinitivo: { n: 11 } }));
    expect(r2).toMatchObject({ ok: false, codigo: "YA_VISTA", status: 409 });
  });

  it("online sin stock revierte todo (422)", () => {
    const r = venta_a_cuenta(ventaBase({ lotes: [lote("l1", "YERBA", 1)] }));
    expect(r).toMatchObject({ ok: false, codigo: "SIN_STOCK", status: 422 });
  });

  it("offline acepta con provisorio y sobreventa sin definitivo", () => {
    const r = venta_a_cuenta(ventaBase({ offline: true, lotes: [lote("l1", "YERBA", 1)], ultimoDefinitivo: { n: 99 } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.ticket.definitivo).toBeNull();
    expect(r.efecto.faltantes).toEqual([{ sku: "YERBA", faltante: 1 }]);
    expect(r.efecto.ingresaACaja).toBe(false);
  });
});

describe("FC6 tope + plazo", () => {
  it("empleado 403 al superar tope, dueno supera marcado", () => {
    const emp = venta_a_cuenta(ventaBase({ saldoActualCentavos: 90000n, topeCentavos: 100000n, rol: "empleado" }));
    expect(emp).toMatchObject({ ok: false, codigo: "TOPE_SUPERADO", status: 403, disponibleCentavos: 10000n });
    const due = venta_a_cuenta(
      ventaBase({ idempotencyKey: "fa-dueno", saldoActualCentavos: 90000n, topeCentavos: 100000n, rol: "dueno" }),
    );
    expect(due.ok).toBe(true);
    if (!due.ok) return;
    expect(due.efecto.superaTope).toBe(true);
    expect(due.efecto.movimientoCredito.customerId).toBe("cli-1");
  });

  it("tope 0 no bloquea al empleado y el igual al techo entra", () => {
    const abierto = venta_a_cuenta(ventaBase({ saldoActualCentavos: 90000n, topeCentavos: 0n, rol: "empleado" }));
    expect(abierto.ok).toBe(true);
    if (!abierto.ok) return;
    expect(abierto.efecto.superaTope).toBe(false);
    const justo = venta_a_cuenta(
      ventaBase({ idempotencyKey: "fa-justo", saldoActualCentavos: 70000n, topeCentavos: 100000n, rol: "empleado" }),
    );
    expect(justo.ok).toBe(true);
    if (!justo.ok) return;
    expect(justo.efecto.superaTope).toBe(false);
  });

  it("dentro de tope no marca y offline controla contra saldo local", () => {
    const r = venta_a_cuenta(ventaBase({ offline: true, saldoActualCentavos: 50000n, topeCentavos: 100000n }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.superaTope).toBe(false);
    const pasado = venta_a_cuenta(
      ventaBase({ idempotencyKey: "fa-off2", offline: true, saldoActualCentavos: 95000n, topeCentavos: 100000n }),
    );
    expect(pasado).toMatchObject({ ok: false, codigo: "TOPE_SUPERADO", status: 403, disponibleCentavos: 5000n });
  });
});

describe("FC5 cobro de fiado + C18", () => {
  it.each(MEDIOS_COBRO)("cobra por %s e ingresa a caja", (medio) => {
    const r = cobro_fiado({
      idempotencyKey: `cobro-${medio}`,
      customerId: "cli-1",
      montoCentavos: 12000n,
      medio,
      ahoraMs: AHORA,
      vistos: new Map<string, CobroRegistrado>(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.movimientoCredito).toMatchObject({ tipo: "cobro", debeCentavos: 0n, haberCentavos: 12000n });
    expect(r.efecto.ingresoCaja).toMatchObject({ tipo: "ingreso", origen: "cobro_fiado", metodo: medio, monto_centavos: 12000n });
    expect(r.efecto.ingresaACaja).toBe(true);
    expect(C18_INGRESO_CAJA.cobro_fiado).toBe(true);
  });

  it("409 retry, 422 monto cero", () => {
    const vistos = new Map<string, CobroRegistrado>();
    const r1 = cobro_fiado({ idempotencyKey: "c1", customerId: "cli-1", montoCentavos: 1000n, medio: "Efectivo", ahoraMs: AHORA, vistos });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    vistos.set("c1", r1.efecto);
    expect(
      cobro_fiado({ idempotencyKey: "c1", customerId: "cli-1", montoCentavos: 1000n, medio: "Efectivo", ahoraMs: AHORA, vistos }),
    ).toMatchObject({ status: 409 });
    expect(
      cobro_fiado({ idempotencyKey: "c0", customerId: "cli-1", montoCentavos: 0n, medio: "Efectivo", ahoraMs: AHORA, vistos }),
    ).toMatchObject({ ok: false, codigo: "MONTO_INVALIDO", status: 422 });
  });
});

describe("FC9 ajustes/incobrables/reversion + FC8", () => {
  const vistosAjuste = () => new Map<string, MovimientoCredito>();

  it("ajuste e incobrable solo dueno (403 empleado), motivo obligatorio", () => {
    const base = { idempotencyKey: "aj-1", customerId: "cli-1", montoCentavos: 500n, motivo: "redondeo", ahoraMs: AHORA, vistos: vistosAjuste() } as const;
    expect(registrar_ajuste({ ...base, tipo: "ajuste_debito", rol: "empleado" })).toMatchObject({ status: 403 });
    const deb = registrar_ajuste({ ...base, tipo: "ajuste_debito", rol: "dueno" });
    expect(deb.ok && deb.movimiento).toMatchObject({ tipo: "ajuste_debito", debeCentavos: 500n });
    const inc = registrar_ajuste({ ...base, idempotencyKey: "aj-2", tipo: "incobrable", rol: "dueno" });
    expect(inc.ok && inc.movimiento).toMatchObject({ tipo: "incobrable", haberCentavos: 500n });
    expect(registrar_ajuste({ ...base, idempotencyKey: "aj-3", tipo: "ajuste_credito", rol: "dueno", motivo: "  " })).toMatchObject({ status: 422 });
  });

  it("reversion espeja el original y revierte_a es unico", () => {
    const original: MovimientoCredito = {
      customerId: "cli-1",
      tipo: "venta",
      debeCentavos: 30000n,
      haberCentavos: 0n,
      fecha: AHORA,
      idempotencyKey: "fa-1",
    };
    const movs = new Map([["fa-1", original]]);
    const r = revertir_movimiento({
      idempotencyKey: "rev-1",
      customerId: "cli-1",
      revierteA: "fa-1",
      motivo: "error carga",
      ahoraMs: AHORA,
      movimientos: movs,
      revertidos: new Set(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movimiento).toMatchObject({ tipo: "reversion", debeCentavos: 0n, haberCentavos: 30000n, revierteA: "fa-1" });
    expect(
      revertir_movimiento({
        idempotencyKey: "rev-2",
        customerId: "cli-1",
        revierteA: "fa-1",
        motivo: "otra",
        ahoraMs: AHORA,
        movimientos: movs,
        revertidos: new Set(["fa-1"]),
      }),
    ).toMatchObject({ ok: false, codigo: "YA_REVERTIDO", status: 409 });
    expect(
      revertir_movimiento({
        idempotencyKey: "rev-3",
        customerId: "cli-1",
        revierteA: "inexistente",
        motivo: "x",
        ahoraMs: AHORA,
        movimientos: movs,
        revertidos: new Set(),
      }),
    ).toMatchObject({ ok: false, codigo: "NO_EXISTE", status: 422 });
  });

  it("FC8 link wa.me determinista", () => {
    const r = link_whatsapp("+54 9 11 5555 1234", "Hola, tu saldo es $300");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toBe("https://wa.me/5491155551234?text=" + encodeURIComponent("Hola, tu saldo es $300"));
    expect(link_whatsapp("abc", "hola")).toMatchObject({ status: 422 });
  });
});
