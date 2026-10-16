import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contiene_secreto } from "../src/modules/payments/beneficiarios.js";
import { preparar_orden, type PaymentOrder } from "../src/modules/payments/ordenes.js";
import {
  cancelOrderSchema,
  confirmOrderPaymentSchema,
  payeeSchema,
  prepareOrderSchema,
} from "../src/lib/validation.js";
import type { Payee } from "../src/modules/payments/beneficiarios.js";

// OP1 (criterio de aceptación): no existe en el código ni en la base ningún
// campo, tabla, secreto o variable de entorno para guardar credenciales de
// cuentas del comerciante (verificado por revisión de esquema y test
// automático sobre el modelo de datos). Este archivo es ese test automático.

function leerFuente(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

// Nombres de columna/campo que delatarían un lugar donde guardar
// credenciales de Mercado Pago, homebanking, ARCA o tarjetas.
const PATRON_CREDENCIAL = /\b(password|passwd|credencial|credential|secreto|secret|clave_?fiscal|homebanking|pin_seguridad|cvv|cvc|coordenadas|tarjeta_?credito|nro_?tarjeta)\b/i;

function columnasDeclaradas(fuente: string): string[] {
  return fuente
    .split("\n")
    .map((l) => /^\s*([A-Za-z][A-Za-z0-9]*)\s*:/.exec(l)?.[1])
    .filter((n): n is string => n !== undefined);
}

describe("OP1 sin lugar para credenciales (test automático del criterio)", () => {
  it("schema-pagos declara columnas sin rastro de credenciales", () => {
    const fuente = leerFuente("src/db/schema-pagos.ts");
    expect(fuente).toContain("payment_orders");
    const malas = columnasDeclaradas(fuente).filter((c) => PATRON_CREDENCIAL.test(c));
    expect(malas).toEqual([]);
  });

  it("los schemas de payees y payment-orders no exponen campos de credenciales", () => {
    for (const schema of [payeeSchema, prepareOrderSchema, confirmOrderPaymentSchema, cancelOrderSchema]) {
      const malos = Object.keys(schema.shape).filter((k) => PATRON_CREDENCIAL.test(k));
      expect(malos).toEqual([]);
    }
  });

  it("el módulo payments no trae verbos de ejecución de pagos", () => {
    const fuentes = ["src/modules/payments/ordenes.ts", "src/modules/payments/beneficiarios.ts"].map(leerFuente);
    for (const fuente of fuentes) {
      expect(fuente).not.toMatch(/\b(debitar|ejecutar\s*pago|iniciar\s*pago|transferir|sdk)\b/i);
    }
  });

  it("mi clave del banco es 1234 se detecta y preparar la rechaza sin eco", () => {
    expect(contiene_secreto("mi clave del banco es 1234")).toBe(true);
    const payee: Payee = {
      id: "pay-1",
      nombre: "Distribuidora X SRL",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      activo: true,
    };
    const r = preparar_orden({
      id: "ord-1",
      idempotencyKey: "op1-key-1",
      numero: "OP-0001",
      payeeId: payee.id,
      payees: new Map([[payee.id, payee]]),
      concepto: "mi clave del banco es 1234",
      montoCentavos: 100000n,
      venceElMs: Date.UTC(2026, 9, 31),
      medioSugerido: "Transferencia",
      instruccion: "transferencia",
      creadoPor: "dueno-1",
      origen: "bot",
      ahoraMs: Date.UTC(2026, 9, 28),
      vistos: new Map<string, PaymentOrder>(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    if (r.status === 422) expect(r.error).not.toContain("1234");
  });
});
