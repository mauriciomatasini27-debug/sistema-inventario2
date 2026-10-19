import { describe, expect, it } from "vitest";
import {
  MAX_ACCIONES,
  acciones_a_botones,
  calcular_acciones_propuestas,
  id_accion,
  parsear_boton_accion,
  texto_acciones_sugeridas,
  type ProductoAccion,
} from "../src/modules/bot/acciones-propuestas.js";
import type { ClientePyme } from "../src/jobs/bot-pyme.js";

function producto(sku: string, nombre: string, stock: number, umbral: number, over: Partial<ProductoAccion> = {}): ProductoAccion {
  return { sku, nombre, stock, umbral, ...over };
}

function cliente(id: string, nombre: string, saldo: bigint, over: Partial<ClientePyme> = {}): ClientePyme {
  return { id, nombre, telefono: null, saldoCentavos: saldo, topeCentavos: 0n, diasMax: 0, ...over };
}

describe("BOT-S8 acciones propuestas: tope, orden y gating", () => {
  it("toma como máximo 3 acciones", () => {
    const productos = [1, 2, 3, 4, 5].map((n) => producto(`s${n}`, `Producto ${n}`, 0, 10));
    const acciones = calcular_acciones_propuestas({ modulos: ["rotacion"], productos, clientes: [] });
    expect(acciones).toHaveLength(MAX_ACCIONES);
    expect(MAX_ACCIONES).toBe(3);
  });

  it("ordena por urgencia con desempate estable por sku, sin depender del orden de entrada", () => {
    const productos = [
      producto("b", "Banana", 2, 10),
      producto("a", "Alfajor", 0, 10),
      producto("c", "Cafe", 10, 10),
      producto("d", "Dulce", 20, 5),
    ];
    const esperado = calcular_acciones_propuestas({ modulos: ["rotacion"], productos, clientes: [] }).map((a) => a.ref);
    expect(esperado).toEqual(["a", "b", "c"]);

    const revuelto = [productos[3]!, productos[1]!, productos[0]!, productos[2]!];
    const otra = calcular_acciones_propuestas({ modulos: ["rotacion"], productos: revuelto, clientes: [] }).map((a) => a.ref);
    expect(otra).toEqual(esperado);
  });

  it("módulo apagado no propone acciones de ese módulo", () => {
    const productos = [producto("a", "Alfajor", 0, 10)];
    const clientes = [cliente("cl-1", "Ana", 1_000_000n, { diasMax: 20 })];

    expect(calcular_acciones_propuestas({ modulos: [], productos, clientes })).toEqual([]);
    expect(calcular_acciones_propuestas({ modulos: ["cobranza"], productos, clientes }).map((a) => a.tipo)).toEqual(["cobrar"]);
    expect(calcular_acciones_propuestas({ modulos: ["rotacion"], productos, clientes }).map((a) => a.tipo)).toEqual(["reponer"]);
  });

  it("cobrar usa el deudor de mayor saldo y no propone a quien no debe", () => {
    const clientes = [
      cliente("chico", "Beto", 300_000n, { topeCentavos: 100_000n }),
      cliente("grande", "Ana", 1_200_000n, { diasMax: 20 }),
      cliente("al-dia", "Caro", 0n),
    ];
    const acciones = calcular_acciones_propuestas({ modulos: ["cobranza"], productos: [], clientes });
    expect(acciones.map((a) => a.ref)).toEqual(["grande"]);
    expect(acciones[0]?.tipo).toBe("cobrar");
  });

  it("cada acción tiene id parseable con prefijo propio y título de 20 o menos", () => {
    const productos = [producto("demo-sku-1", "Alfajor Jorgito de Chocolate", 0, 10)];
    const clientes = [cliente("cl-1", "Ana María de la Cruz", 1_000_000n, { diasMax: 20 })];
    const acciones = calcular_acciones_propuestas({ modulos: ["rotacion", "cobranza"], productos, clientes });

    expect(acciones).toHaveLength(2);
    for (const a of acciones) {
      expect(a.titulo.length).toBeLessThanOrEqual(20);
      expect(a.id.startsWith("acc:")).toBe(true);
      expect(parsear_boton_accion(a.id)).toEqual({ tipo: a.tipo, ref: a.ref });
    }
    expect(acciones[0]?.id).toBe("acc:reponer:demo-sku-1");
    expect(acciones[1]?.id).toBe("acc:cobrar:cl-1");
    expect(parsear_boton_accion("ocr:confirmar:abc")).toBeNull();
    expect(parsear_boton_accion("acc:reponer:")).toBeNull();
  });

  it("botones de WhatsApp con el id de acción y el título corto", () => {
    const acciones = calcular_acciones_propuestas({
      modulos: ["rotacion"],
      productos: [producto("a", "Alfajor Jorgito de Chocolate", 0, 10)],
      clientes: [],
    });
    expect(acciones_a_botones(acciones)).toEqual([{ id: "acc:reponer:a", titulo: acciones[0]?.titulo }]);
    expect(acciones_a_botones(acciones)[0]?.titulo.length).toBeLessThanOrEqual(20);
  });

  it("id_accion arma el id y texto_acciones_sugeridas no dice nada sin acciones", () => {
    expect(id_accion("reponer", "a")).toBe("acc:reponer:a");
    expect(texto_acciones_sugeridas([])).toBe("");
    expect(texto_acciones_sugeridas([{ tipo: "reponer", ref: "a", id: "acc:reponer:a", titulo: "Reponer A", texto: "Reponer A: quedan 0 (umbral 10)." }])).toBe(
      "Acciones sugeridas:\n- Reponer A: quedan 0 (umbral 10).",
    );
  });
});
