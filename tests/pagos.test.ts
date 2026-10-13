import { describe, expect, it } from "vitest";
import { registrar_movimiento } from "../src/modules/cash/caja.js";
import {
  crear_payee,
  contiene_secreto,
  enmascarar_payee,
  validar_alias,
  validar_cbu,
  validar_cuit,
  type Payee,
} from "../src/modules/payments/beneficiarios.js";
import {
  cancelar_orden,
  confirmar_pago,
  marcar_vencidas,
  preparar_orden,
  proximas_a_vencer,
  type PagoConfirmado,
  type PaymentOrder,
} from "../src/modules/payments/ordenes.js";

// CBU con verificadores BCRA válidos (bloque1 0000001-7, bloque2 …001-7).
const CBU_OK = "0000001700000000000017";
// CUIT 30-00000000-7 (verificador 7).
const CUIT_OK = "30000000007";

function payeeBase(over: Partial<Payee> = {}): Payee {
  return {
    id: "pay-1",
    nombre: "Distribuidora X SRL",
    tipo: "proveedor",
    medioPreferido: "Transferencia",
    alias: "distri.x.pagos",
    cbu: CBU_OK,
    cuit: CUIT_OK,
    activo: true,
    ...over,
  };
}

function prepararBase(over: Partial<Parameters<typeof preparar_orden>[0]> = {}) {
  const payee = payeeBase();
  return {
    id: "ord-1",
    idempotencyKey: "ord-key-1",
    numero: "OP-0042",
    payeeId: payee.id,
    payees: new Map([[payee.id, payee]]),
    concepto: "Factura A 0003-00012345",
    montoCentavos: 18250000n,
    venceElMs: Date.UTC(2026, 9, 31),
    medioSugerido: "Transferencia" as const,
    instruccion: "transferencia" as const,
    referencia: "Fact 0003-00012345",
    supplierInvoiceId: "fac-123",
    creadoPor: "dueno-1",
    origen: "bot" as const,
    ahoraMs: Date.UTC(2026, 9, 28),
    vistos: new Map<string, PaymentOrder>(),
    ...over,
  };
}

function ordenPreparada(over: Partial<Parameters<typeof preparar_orden>[0]> = {}): PaymentOrder {
  const r = preparar_orden(prepararBase(over));
  if (!r.ok) throw new Error(`setup falló: ${JSON.stringify(r)}`);
  return r.orden;
}

describe("lane G payees (OP6)", () => {
  it("validadores deterministas: CBU/CUIT/alias", () => {
    expect(validar_cbu(CBU_OK)).toBe(true);
    expect(validar_cbu("0000001700000000000018")).toBe(false);
    expect(validar_cbu("123")).toBe(false);
    expect(validar_cuit(CUIT_OK)).toBe(true);
    expect(validar_cuit("30-00000000-7")).toBe(true);
    expect(validar_cuit("30000000008")).toBe(false);
    expect(validar_alias("distri.x.pagos")).toBe(true);
    expect(validar_alias("corto")).toBe(false);
  });

  it("crea payee con datos públicos y enmascara el CBU en listados", () => {
    const r = crear_payee({
      id: "pay-1",
      nombre: "Distribuidora X SRL",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      alias: "distri.x.pagos",
      cbu: CBU_OK,
      cuit: CUIT_OK,
      existentes: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const vista = enmascarar_payee(r.payee);
    expect(vista.cbuEnmascarado).toBe("…0017");
    expect(JSON.stringify(vista)).not.toContain(CBU_OK);
  });

  it("anti-duplicados: mismo alias/CBU en otro payee activo => 409", () => {
    const existentes = [payeeBase()];
    const r = crear_payee({
      id: "pay-2",
      nombre: "Distribuidora X (otra)",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      alias: "DISTRI.X.PAGOS",
      existentes,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
  });

  it("CBU con verificador inválido => 422 y secreto en nombre => 422", () => {
    const mala = crear_payee({
      id: "pay-9",
      nombre: "Proveedor Y",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      cbu: "0000001700000000000018",
      existentes: [],
    });
    expect(mala.ok).toBe(false);
    const secreta = crear_payee({
      id: "pay-10",
      nombre: "mi clave de MP es 1234",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      existentes: [],
    });
    expect(secreta.ok).toBe(false);
    if (!secreta.ok && secreta.status === 422) {
      expect(secreta.error).not.toContain("1234");
    }
  });
});

describe("lane G preparar (OP7/OP8)", () => {
  it("prepara orden 201 con evento inicial y vínculo opaco a factura", () => {
    const r = preparar_orden(prepararBase());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orden.estado).toBe("preparada");
    expect(r.orden.version).toBe(1);
    expect(r.orden.supplierInvoiceId).toBe("fac-123");
    expect(r.orden.eventos).toHaveLength(1);
    expect(r.orden.eventos[0]).toMatchObject({ de: null, a: "preparada" });
  });

  it("doble preparación con mismo Idempotency-Key => 409 con original", () => {
    const vistos = new Map<string, PaymentOrder>();
    const r1 = preparar_orden(prepararBase({ vistos, idempotencyKey: "dup-1" }));
    expect(r1.ok).toBe(true);
    const r2 = preparar_orden(prepararBase({ vistos, idempotencyKey: "dup-1" }));
    if (r2.ok) throw new Error("debió ser 409");
    expect(r2.status).toBe(409);
    expect(r2.codigo).toBe("YA_VISTA");
    if (!r1.ok) throw new Error("setup");
    if (r2.codigo === "YA_VISTA") expect(r2.original).toEqual(r1.orden);
    expect(vistos.size).toBe(1);
  });

  it("monto en cero, payee inexistente y medio inválido => 422", () => {
    expect(preparar_orden(prepararBase({ montoCentavos: 0n })).ok).toBe(false);
    expect(preparar_orden(prepararBase({ payeeId: "nadie" })).ok).toBe(false);
    const r = preparar_orden(prepararBase({ medioSugerido: "Bitcoin" as unknown as "Transferencia" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
  });

  it("OP1: concepto con credencial => 422 sin eco del secreto", () => {
    expect(contiene_secreto("mi clave del banco es 1234")).toBe(true);
    expect(contiene_secreto("Factura A 0003-00012345")).toBe(false);
    const r = preparar_orden(prepararBase({ concepto: "mi password de MP: hola123" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    if (r.status === 422) expect(r.error).not.toContain("hola123");
  });

  it("instrucción link exige URL de dominio oficial", () => {
    const ok = preparar_orden(
      prepararBase({ instruccion: "link", linkUrl: "https://www.mercadopago.com.ar/checkout/abc" }),
    );
    expect(ok.ok).toBe(true);
    const mala = preparar_orden(prepararBase({ instruccion: "link", linkUrl: "https://bit.ly/paga-aqui" }));
    expect(mala.ok).toBe(false);
    if (!mala.ok && mala.status === 422) expect(mala.codigo).toBe("LINK_NO_OFICIAL");
    const sinLink = preparar_orden(prepararBase({ instruccion: "link" }));
    expect(sinLink.ok).toBe(false);
  });
});

describe("lane G Ya pagué (OP9)", () => {
  function pagoBase(orden: PaymentOrder, over: Partial<Parameters<typeof confirmar_pago>[0]> = {}) {
    return {
      idempotencyKey: "pago-1",
      orden,
      versionEsperada: orden.version,
      medio: "Transferencia" as const,
      rol: "dueno" as const,
      actor: "dueno-1",
      origen: "bot" as const,
      ahoraMs: Date.UTC(2026, 9, 30),
      vistosPagos: new Map<string, PagoConfirmado>(),
      ...over,
    };
  }

  it("toque explícito => pagada + egreso compatible con caja", () => {
    const orden = ordenPreparada();
    const r = confirmar_pago(pagoBase(orden));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.efecto.orden.estado).toBe("pagada");
    expect(r.efecto.orden.version).toBe(2);
    // El descriptor pasa registrar_movimiento de caja sin tirar (compat real).
    expect(() =>
      registrar_movimiento({
        tipo: r.efecto.egreso.tipo,
        metodo: r.efecto.egreso.metodo,
        monto_centavos: r.efecto.egreso.monto_centavos,
        origen: "retiro",
        categoria_id: orden.categoria,
        nota: "revalida",
        rol: "dueno",
        tipo_retiro: "gasto_operativo",
      }),
    ).not.toThrow();
    expect(r.efecto.egreso).toMatchObject({ tipo: "egreso", metodo: "Transferencia", monto_centavos: 18250000n });
    expect(r.efecto.orden.eventos.at(-1)).toMatchObject({ de: "preparada", a: "pagada" });
  });

  it("doble toque mismo Idempotency-Key => 409 con original, sin segundo egreso", () => {
    const orden = ordenPreparada();
    const vistosPagos = new Map<string, PagoConfirmado>();
    const r1 = confirmar_pago(pagoBase(orden, { vistosPagos, idempotencyKey: "doble-pago" }));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = confirmar_pago(pagoBase(r1.efecto.orden, { vistosPagos, idempotencyKey: "doble-pago" }));
    if (r2.ok) throw new Error("debió ser 409");
    expect(r2.status).toBe(409);
    expect(r2.codigo).toBe("YA_VISTA");
    if (r2.codigo === "YA_VISTA") expect(r2.original).toEqual(r1.efecto.orden);
    expect(vistosPagos.size).toBe(1);
  });

  it("empleado no confirma (403, mismo criterio que caja) y la orden sigue preparada", () => {
    const orden = ordenPreparada();
    const r = confirmar_pago(pagoBase(orden, { rol: "empleado", actor: "juan" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(orden.estado).toBe("preparada");
  });

  it("toque con versión vieja => 409 (OP7.6), terminal pagada => 422", () => {
    const orden = ordenPreparada();
    const vieja = confirmar_pago(pagoBase(orden, { versionEsperada: 99 }));
    expect(vieja.ok).toBe(false);
    if (!vieja.ok && vieja.status === 409) expect(vieja.codigo).toBe("VERSION_DESACTUALIZADA");
    const r1 = confirmar_pago(pagoBase(orden));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = confirmar_pago(pagoBase(r1.efecto.orden, { idempotencyKey: "otro-intento" }));
    expect(r2.ok).toBe(false);
    if (!r2.ok && r2.status === 422) expect(r2.codigo).toBe("TRANSICION_INVALIDA");
  });

  it("sin_factura exige nota (OP9.9)", () => {
    const orden = ordenPreparada({ categoria: "sin_factura" });
    const sinNota = confirmar_pago(pagoBase(orden));
    expect(sinNota.ok).toBe(false);
    if (!sinNota.ok && sinNota.status === 422) expect(sinNota.codigo).toBe("NOTA_REQUERIDA");
    const conNota = confirmar_pago(pagoBase(orden, { nota: "Pedido #63, pagado al preventista, sin factura" }));
    expect(conNota.ok).toBe(true);
  });
});

describe("lane G cancelar + vencimientos (OP2/OP11/OP13)", () => {
  it("cancelar exige motivo, exige dueño y deja auditoría", () => {
    const orden = ordenPreparada();
    const sinMotivo = cancelar_orden({
      orden,
      versionEsperada: 1,
      motivo: "   ",
      rol: "dueno",
      actor: "dueno-1",
      origen: "web",
      ahoraMs: 1,
    });
    expect(sinMotivo.ok).toBe(false);
    const empleado = cancelar_orden({
      orden,
      versionEsperada: 1,
      motivo: "duplicada",
      rol: "empleado",
      actor: "juan",
      origen: "web",
      ahoraMs: 1,
    });
    expect(empleado.ok).toBe(false);
    if (!empleado.ok) expect(empleado.status).toBe(403);
    const ok = cancelar_orden({
      orden,
      versionEsperada: 1,
      motivo: "factura anulada",
      rol: "dueno",
      actor: "dueno-1",
      origen: "web",
      ahoraMs: 2,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.orden.estado).toBe("cancelada");
    expect(ok.orden.motivoCancelacion).toBe("factura anulada");
    expect(ok.orden.eventos.at(-1)).toMatchObject({ a: "cancelada", motivo: "factura anulada" });
    // Terminal inmutable: ni pagar ni cancelar de nuevo.
    const paga = confirmar_pago({
      idempotencyKey: "x",
      orden: ok.orden,
      versionEsperada: 2,
      medio: "Transferencia",
      rol: "dueno",
      actor: "dueno-1",
      origen: "web",
      ahoraMs: 3,
      vistosPagos: new Map(),
    });
    expect(paga.ok).toBe(false);
    expect(cancelar_orden({ orden: ok.orden, versionEsperada: 2, motivo: "otra", rol: "dueno", actor: "d", origen: "web", ahoraMs: 4 }).ok).toBe(false);
  });

  it("marcar_vencidas es pura y determinista; vencida se puede pagar igual", () => {
    const hoy = Date.UTC(2026, 9, 11);
    const vencida = ordenPreparada({ id: "a", idempotencyKey: "k-a", numero: "OP-0001", venceElMs: Date.UTC(2026, 9, 10) });
    const vigente = ordenPreparada({ id: "b", idempotencyKey: "k-b", numero: "OP-0002", venceElMs: Date.UTC(2026, 9, 11) });
    const r1 = marcar_vencidas([vencida, vigente], hoy);
    const r2 = marcar_vencidas([vencida, vigente], hoy);
    expect(r1).toEqual(r2);
    expect(r1.vencidasIds).toEqual(["a"]);
    expect(vencida.estado).toBe("preparada"); // no muta la entrada
    const tomada = r1.actualizadas[0];
    if (!tomada) throw new Error("setup");
    expect(tomada.estado).toBe("vencida");
    const paga = confirmar_pago({
      idempotencyKey: "pago-tarde",
      orden: tomada,
      versionEsperada: tomada.version,
      medio: "Transferencia",
      rol: "dueno",
      actor: "dueno-1",
      origen: "web",
      ahoraMs: hoy,
      vistosPagos: new Map(),
    });
    expect(paga.ok).toBe(true);
  });

  it("próximas a vencer: filtra por ventana y ordena por vencimiento", () => {
    const hoy = Date.UTC(2026, 9, 7);
    const o1 = ordenPreparada({ id: "1", idempotencyKey: "k-1", numero: "OP-0001", venceElMs: Date.UTC(2026, 9, 10) });
    const o2 = ordenPreparada({ id: "2", idempotencyKey: "k-2", numero: "OP-0002", venceElMs: Date.UTC(2026, 9, 8) });
    const lejos = ordenPreparada({ id: "3", idempotencyKey: "k-3", numero: "OP-0003", venceElMs: Date.UTC(2026, 10, 1) });
    const prox = proximas_a_vencer([o1, o2, lejos], hoy, 7);
    expect(prox.map((o) => o.id)).toEqual(["2", "1"]);
    expect(proximas_a_vencer([o1, o2, lejos], hoy, 7)).toEqual(prox);
    expect(proximas_a_vencer([], hoy, 7)).toEqual([]);
  });
});
