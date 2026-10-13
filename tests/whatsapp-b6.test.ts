import { describe, expect, it } from "vitest";
import {
  agregar_al_viernes,
  armar_texto_viernes,
  crear_item_viernes,
  decidir_grupo,
  guardar_en_semanal,
  listar_para_web,
  pedir_ahora,
  promover_a_urgente,
  parsear_comando_viernes,
  quitar_repuestos,
  type BorradorPedido,
  type ListaViernes,
} from "../src/modules/whatsapp/lista-viernes.js";

const JORGITO = crear_item_viernes({
  sku: "j1",
  nombre: "Alfajor Jorgito",
  stock: 3,
  umbral: 10,
  proveedor: "Golosinas Sur",
});

const MILKA = crear_item_viernes({
  sku: "m1",
  nombre: "Milka leche 100 g",
  stock: 2,
  umbral: 8,
  proveedor: "Distribuidora X",
});

const OREO = crear_item_viernes({
  sku: "m2",
  nombre: "Milka oreo 100 g",
  stock: 1,
  umbral: 8,
  proveedor: "Distribuidora X",
});

function lista_base(): ListaViernes {
  let l: ListaViernes = new Map();
  l = agregar_al_viernes(l, JORGITO);
  l = agregar_al_viernes(l, MILKA);
  return l;
}

describe("bot wa B6 lista del viernes", () => {
  it("guardar dos veces no duplica", () => {
    let l = lista_base();
    l = agregar_al_viernes(l, JORGITO);
    l = agregar_al_viernes(l, { ...JORGITO, stock: 3 });
    const todos = [...l.values()].flat();
    expect(todos.filter((i) => i.sku === "j1").length).toBe(1);
    expect(todos.length).toBe(2);
  });

  it("repuesto antes del viernes sale y urgente bajo sigue pendiente", () => {
    const l = lista_base();
    const vivo = new Map([
      ["j1", 20],
      ["m1", 1],
    ]);
    const { lista, salieron } = quitar_repuestos(l, vivo);
    expect(salieron.map((i) => i.sku)).toEqual(["j1"]);
    const quedan = [...lista.values()].flat().map((i) => i.sku);
    expect(quedan).toEqual(["m1"]);
  });

  it("guardado que llega a 0 se promueve a urgente y avisa", () => {
    const tranqui = crear_item_viernes({
      sku: "t1",
      nombre: "Tita",
      stock: 5,
      umbral: 6,
      proveedor: "Golosinas Sur",
    });
    expect(tranqui.urgente).toBe(false);
    let l: ListaViernes = agregar_al_viernes(new Map(), tranqui);
    const r = promover_a_urgente(l, "t1", 0);
    l = r.lista;
    const item = [...l.values()].flat().find((i) => i.sku === "t1");
    expect(item?.urgente).toBe(true);
    expect(r.aviso).toContain("sin stock");
    expect(r.aviso).toContain("Tita");
  });

  it("texto del viernes agrupa por proveedor", () => {
    let l = lista_base();
    l = agregar_al_viernes(l, OREO);
    const texto = armar_texto_viernes(l, "Kiosco Pepe");
    expect(texto).toContain("Golosinas Sur (1)");
    expect(texto).toContain("Distribuidora X (2)");
    expect(texto).toContain("Jorgito");
    expect(texto).toContain("Kiosco Pepe");
    const vacio = armar_texto_viernes(new Map(), "Kiosco Pepe");
    expect(vacio).toContain("Todavía no guardaste nada");
  });

  it("comandos en texto libre: lista, qué guardé, guardar y pedir ya", () => {
    expect(parsear_comando_viernes("lista del viernes")).toEqual({ kind: "ver_lista" });
    expect(parsear_comando_viernes("mostrame el viernes")).toEqual({ kind: "ver_lista" });
    expect(parsear_comando_viernes("qué guardé?")).toEqual({ kind: "que_guarde" });
    expect(parsear_comando_viernes("que tengo guardado")).toEqual({ kind: "que_guarde" });
    expect(parsear_comando_viernes("guardalo para el viernes")).toMatchObject({ kind: "guardar_viernes" });
    expect(parsear_comando_viernes("guardar para el viernes los jorgitos")).toMatchObject({
      kind: "guardar_viernes",
    });
    expect(parsear_comando_viernes("pedir ahora los jorgitos")).toMatchObject({ kind: "pedir_ahora" });
    expect(parsear_comando_viernes("pedilo ya")).toMatchObject({ kind: "pedir_ahora" });
    expect(parsear_comando_viernes("cuántos milka tengo")).toEqual({ kind: "ninguno" });
  });

  it("decide por producto o por grupo", () => {
    const cands = [
      { sku: "m1", nombre: "Milka leche 100 g" },
      { sku: "m2", nombre: "Milka oreo 100 g" },
    ];
    expect(decidir_grupo("los dos", cands)).toEqual({ kind: "grupo" });
    expect(decidir_grupo("guardame todo", cands)).toEqual({ kind: "grupo" });
    const uno = decidir_grupo("guardame el milka oreo", cands);
    expect(uno).toEqual({ kind: "producto", sku: "m2" });
    expect(decidir_grupo("hola", cands)).toEqual({ kind: "nada" });
  });

  it("pedir ahora crea/reutiliza borrador urgente por proveedor", () => {
    let b: ReadonlyArray<BorradorPedido> = [];
    b = pedir_ahora(b, "Golosinas Sur", { sku: "j1", nombre: "Jorgito", qty: 6, costoCentavos: 60000n });
    b = pedir_ahora(b, "Golosinas Sur", { sku: "j1", nombre: "Jorgito", qty: 2, costoCentavos: 60000n });
    b = pedir_ahora(b, "Distribuidora X", { sku: "m1", nombre: "Milka", qty: 4, costoCentavos: 150000n });
    expect(b.length).toBe(2);
    const sur = b.find((x) => x.proveedor === "Golosinas Sur");
    expect(sur?.marcaSemanal).toBe(false);
    expect(sur?.estado).toBe("Borrador");
    expect(sur?.lineas[0]?.qty).toBe(8);
    expect(sur?.totalCentavos).toBe(8n * 60000n);
  });

  it("borrador semanal no duplica y web ve la lista plana", () => {
    const r1 = guardar_en_semanal([], JORGITO, 6, 60000n);
    expect(r1.agregado).toBe(true);
    const r2 = guardar_en_semanal(r1.borradores, JORGITO, 6, 60000n);
    expect(r2.agregado).toBe(false);
    expect(r2.borradores[0]?.lineas.length).toBe(1);
    expect(r2.borradores[0]?.marcaSemanal).toBe(true);

    const l = lista_base();
    const planilla = listar_para_web(l);
    expect(planilla.length).toBe(2);
    expect(planilla[0]?.proveedorGrupo).toBe("Distribuidora X");
  });
});
