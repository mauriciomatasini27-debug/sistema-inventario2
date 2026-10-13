import { describe, expect, it } from "vitest";
import {
  describir_cierre_fallido,
  describir_conexion_vencida,
  describir_stock_negativo,
} from "../src/modules/email/eventos-operacion.js";
import { describir_cuenta, describir_dispositivo_nuevo } from "../src/modules/email/eventos-seguridad.js";
import { describir_vencimientos } from "../src/modules/email/vencimientos.js";
import {
  describir_ajuste_conteo,
  describir_diferencia_turno,
  describir_fiado,
  describir_promo,
  seccion_lotes,
} from "../src/modules/email/eventos-v1.js";

describe("email C NE6 operacion", () => {
  it("stock negativo: un email por sync con dispositivo y link", () => {
    const e = describir_stock_negativo({
      syncId: "s1",
      items: [
        { sku: "a", nombre: "Coca 500", stock: -2 },
        { sku: "b", nombre: "Sprite", stock: -1 },
      ],
      dispositivo: "moto-g",
      usuario: "ana",
    });
    expect(e.dedupeKey).toBe("stock_negativo:s1");
    expect(e.texto).toContain("moto-g");
    expect(e.html).toContain("Revisar y corregir");
  });

  it("cierre fallido y conexion vencida con reconectar", () => {
    expect(describir_cierre_fallido({ jornada: "2026-10-09" }).asunto).toContain("2026-10-09");
    expect(describir_conexion_vencida({ servicio: "gmail", fecha: "2026-10-10" }).html).toContain("Volver a conectar");
  });
});

describe("email C NE7 seguridad y cuenta", () => {
  it("dispositivo nuevo sin baja y con ver dispositivos", () => {
    const e = describir_dispositivo_nuevo({ comercio: "Kiosco", navegador: "Chrome", so: "Windows", lugar: "Córdoba", fecha: "09/10 19:20" });
    expect(e.html).toContain("Ver dispositivos");
    expect(e.html).not.toContain("List-Unsubscribe");
    expect(e.texto).not.toContain("Baja:");
  });

  it("pago rechazado con fecha solo-lectura y cupo 80", () => {
    const p = describir_cuenta({ kind: "pago_rechazado", limiteSoloLectura: "24/10" });
    expect(p.texto).toContain("24/10");
    const c = describir_cuenta({ kind: "cupo", porcentaje: 80, usado: 80, cupo: 100 });
    expect(c.asunto).toContain("80%");
  });
});

describe("email C NE8 vencimientos", () => {
  it("un aviso por vencimiento, pagados fuera, sin boton de pago", () => {
    const e = describir_vencimientos({
      fecha: "2026-10-07",
      modo: "diaria",
      items: [
        { id: "alquiler", concepto: "Alquiler", beneficiario: "dueño", montoCentavos: 45000000n, vence: "2026-10-10", estado: "pendiente", ordenId: "op1" },
        { id: "alquiler-dup", concepto: "Alquiler", beneficiario: "dueño", montoCentavos: 45000000n, vence: "2026-10-10", estado: "pendiente", ordenId: "op1" },
        { id: "luz", concepto: "Luz", beneficiario: "Edenor", montoCentavos: 4800000n, vence: "2026-10-08", estado: "pagado" },
      ],
    });
    expect(e).not.toBeNull();
    expect(e?.texto).toContain("Alquiler");
    expect(e?.html).toContain("Revisar y pagar");
    expect(e?.html).not.toContain("Pagar ahora");
  });
});

describe("email C NE17 v1", () => {
  it("diferencia dentro de tolerancia no avisa; fuera sí", () => {
    expect(
      describir_diferencia_turno({ entregaId: "t1", diferenciaCentavos: 10000n, esperadoCentavos: 100000n, contadoCentavos: 110000n, quienEntrega: "Ana", quienRecibe: "Juan", motivo: "x" }),
    ).toBeNull();
    const e = describir_diferencia_turno({ entregaId: "t1", diferenciaCentavos: 150000n, esperadoCentavos: 100000n, contadoCentavos: 250000n, quienEntrega: "Ana", quienRecibe: "Juan", motivo: "faltante" });
    expect(e?.texto).toContain("Resolver");
  });

  it("ajuste chico no avisa; fiado, lotes y promo", () => {
    expect(describir_ajuste_conteo({ sector: "Heladera", quien: "ana", netoCostoCentavos: 100000n, pctUnidades: 2 })).toBeNull();
    const g = describir_ajuste_conteo({ sector: "Heladera A", quien: "ana", netoCostoCentavos: -3500000n, pctUnidades: 5 });
    expect(g?.texto).toContain("Revisar y confirmar");
    expect(describir_fiado({ cliente: "Rosa", fecha: "2026-10-10", motivo: "sobre_tope", saldoCentavos: 500000n }).tipo).toBe("fiado");
    expect(seccion_lotes({ lotes: [{ producto: "Yogur", dias: 7, unidades: 12 }] }).texto).toContain("Yogur");
    expect(describir_promo({ producto: "Yogur", lote: "l1", unidades: 12, dias: 7, promo: "2x1" }).texto).toContain("Crear promo");
  });
});
