import { describe, expect, it } from "vitest";
import {
  armar_link_wame,
  armar_pantalla_confirmacion,
  armar_seguimiento_manual,
  armar_texto_proveedor,
  avisar_dueno,
  confirmar_envio,
  decidir_canal,
  marcar_enviado,
  verificar_minimo,
  type Confirmacion,
} from "../src/modules/whatsapp/envio-proveedor.js";
import type { ContextoBot } from "../src/modules/whatsapp/servicio.js";
import {
  listar_pedidos_14d,
  parsear_dia_a_dia,
  ultimos_movimientos,
  type MovimientoVista,
  type PedidoDia,
} from "../src/modules/whatsapp/dia-a-dia.js";

const DUENO: ContextoBot = { userId: "g-1", tenantId: "t-a", rol: "dueno", expiraEnMs: 100000, soloLectura: false };
const EMPLEADO: ContextoBot = { userId: "g-2", tenantId: "t-a", rol: "empleado", expiraEnMs: 100000, soloLectura: false };
const SUSPENDIDO: ContextoBot = { userId: "g-1", tenantId: "t-a", rol: "dueno", expiraEnMs: 100000, soloLectura: true };

const CONF_EMAIL: Confirmacion = { textoFinal: "Pedido test", canal: "email", destinatario: "sur@mail.com" };

describe("track4 B8 envio al proveedor", () => {
  it("sin confirmación explícita no envía", () => {
    const r = confirmar_envio({
      ctx: DUENO,
      confirmacionExplicita: false,
      confirmacion: CONF_EMAIL,
      usuarioId: "g-1",
      fechaIso: "2026-10-11",
      ahoraMs: 500,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("falta_confirmacion");
  });

  it("dueño confirma y el registro sale con origen bot", () => {
    const r = confirmar_envio({
      ctx: DUENO,
      confirmacionExplicita: true,
      confirmacion: CONF_EMAIL,
      usuarioId: "g-1",
      fechaIso: "2026-10-11",
      ahoraMs: 500,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.registro).toMatchObject({ estado: "Confirmado", usuarioId: "g-1", canal: "email", origen: "bot" });
      expect(marcar_enviado(r.registro).estado).toBe("Enviado (Email)");
    }
    const pant = armar_pantalla_confirmacion(CONF_EMAIL);
    expect(pant.texto).toContain("Pedido test");
    expect(pant.texto).toContain("sur@mail.com");
    expect(pant.opciones.map((o) => o.titulo)).toEqual(["Enviar", "Volver"]);
    const seg = armar_seguimiento_manual("https://wa.me/1?text=hola");
    expect(seg.opciones.map((o) => o.titulo)).toEqual(["Sí, lo envié", "Todavía no"]);
  });

  it("wa.me bien encodeado con dígitos pelados", () => {
    const texto = "Hola ¿cómo va? Pedido 2x Milka & Jorgito";
    expect(armar_link_wame("+549 11 5555-1234", texto)).toBe(
      `https://wa.me/5491155551234?text=${encodeURIComponent(texto)}`,
    );
  });

  it("pedido mínimo avisa antes y deja pasar cuando cubre", () => {
    const corto = verificar_minimo({ totalCentavos: 50000n, minimoCentavos: 100000n, proveedorNombre: "Golosinas Sur" });
    expect(corto.ok).toBe(false);
    if (!corto.ok) {
      expect(corto.aviso).toContain("mínimo");
      expect(corto.aviso).toContain("Golosinas Sur");
    }
    expect(verificar_minimo({ totalCentavos: 150000n, minimoCentavos: 100000n, proveedorNombre: "X" })).toEqual({ ok: true });
    expect(verificar_minimo({ totalCentavos: 100n, proveedorNombre: "X" })).toEqual({ ok: true });
  });

  it("sin email ni WA no permite enviar y pide la ficha web", () => {
    expect(decidir_canal({ email: null, telefonoE164: null })).toBe("sin_canal");
    expect(decidir_canal({ email: "a@b.com", telefonoE164: null })).toBe("email");
    expect(decidir_canal({ email: null, telefonoE164: "+5491100000000" })).toBe("wa_manual");
    const r = confirmar_envio({
      ctx: DUENO,
      confirmacionExplicita: true,
      confirmacion: { textoFinal: "Pedido", canal: "sin_canal", destinatario: "Don Pepe" },
      usuarioId: "g-1",
      fechaIso: "2026-10-11",
      ahoraMs: 500,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("sin_canal");
      expect(r.fichaUrl).toContain("proveedores");
    }
  });

  it("empleado sin permiso deriva a avisarle al dueño", () => {
    const r = confirmar_envio({
      ctx: EMPLEADO,
      confirmacionExplicita: true,
      confirmacion: CONF_EMAIL,
      usuarioId: "g-2",
      fechaIso: "2026-10-11",
      ahoraMs: 500,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sin_permiso");
    const p = avisar_dueno({ empleadoNombre: "Mati", comercio: "Kiosco", resumenPedido: "10 Jorgitos" });
    expect(p.texto).toContain("dueño");
    expect(p.opciones.map((o) => o.titulo)).toContain("Avisarle al dueño");
  });

  it("solo-lectura (suspendido) bloquea aunque sea dueño", () => {
    const r = confirmar_envio({
      ctx: SUSPENDIDO,
      confirmacionExplicita: true,
      confirmacion: CONF_EMAIL,
      usuarioId: "g-1",
      fechaIso: "2026-10-11",
      ahoraMs: 500,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("solo_lectura");
  });

  it("texto del pedido usa unidades y montos idénticos a la web", () => {
    const t = armar_texto_proveedor({
      comercio: "Kiosco",
      proveedorNombre: "Sur",
      lineas: [{ sku: "j1", nombre: "Jorgito", qty: 12, costoCentavos: 60000n }],
    });
    expect(t).toContain("12 u.");
    expect(t).toContain("$600");
    expect(t).toContain("$7200");
  });
});

describe("track4 B10 dia a dia P0", () => {
  const DIA = 24 * 60 * 60 * 1000;
  const AHORA = 1_700_000_000_000;

  it("qué pedí lista 14 días con estados y corta lo viejo", () => {
    const pedidos: PedidoDia[] = [
      { id: "a", proveedor: "Sur", estado: "borrador", creadoEnMs: AHORA - 2 * DIA, totalCentavos: 10000n },
      { id: "b", proveedor: "Coca", estado: "enviado", creadoEnMs: AHORA - 10 * DIA, totalCentavos: 20000n },
      { id: "c", proveedor: "Viejo", estado: "programado", creadoEnMs: AHORA - 20 * DIA, totalCentavos: 30000n },
    ];
    const r = listar_pedidos_14d(pedidos, AHORA);
    expect(r.cantidad).toBe(2);
    expect(r.texto).toContain("Sur");
    expect(r.texto).toContain("borrador");
    expect(r.texto).toContain("Coca");
    expect(r.texto).not.toContain("Viejo");
    const f = listar_pedidos_14d(pedidos, AHORA, "coca");
    expect(f.cantidad).toBe(1);
    expect(f.texto).toContain("Coca");
  });

  it("últimos movimientos trae 5 con link web", () => {
    const movs: MovimientoVista[] = Array.from({ length: 7 }, (_, i) => ({
      idemKey: `k${i}`,
      sku: `sku${i}`,
      nombre: `Prod ${i}`,
      delta: i % 2 === 0 ? 3 : -2,
      tipo: i % 2 === 0 ? ("ALTA" as const) : ("VENTA" as const),
      fechaMs: AHORA - (7 - i) * DIA,
    }));
    const r = ultimos_movimientos(movs);
    expect(r.cantidad).toBe(5);
    expect(r.texto).toContain("Prod 6");
    expect(r.texto).not.toContain("Prod 0");
    expect(r.texto).not.toContain("Prod 1");
    expect(r.texto).toContain("/panel#movimientos");
    expect(r.texto).toContain("u.");
  });

  it("parsea qué pedí / a quién / movimientos de X", () => {
    expect(parsear_dia_a_dia("che, qué pedí?")).toEqual({ kind: "que_pedi", proveedor: null });
    expect(parsear_dia_a_dia("qué le pedí a Coca")).toEqual({ kind: "que_pedi", proveedor: "coca" });
    expect(parsear_dia_a_dia("últimos movimientos de Jorgito")).toEqual({ kind: "movimientos", termino: "jorgito" });
    expect(parsear_dia_a_dia("cuántos milka tengo")).toEqual({ kind: "nada" });
  });
});
