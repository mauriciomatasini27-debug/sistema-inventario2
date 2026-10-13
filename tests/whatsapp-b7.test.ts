import { describe, expect, it } from "vitest";
import {
  agregar_linea,
  aplicar_cambio,
  aplicar_paso,
  armar_resumen_borrador,
  borrador_a_lineas_compra,
  borrador_sigue_vigente,
  botones_borrador,
  botones_stepper,
  buscar_para_agregar,
  filas_lineas_borrador,
  paginar_lineas,
  parsear_cambio_cantidad,
  parsear_pedido_libre,
  resolver_conflicto_version,
  sugerir_cantidad,
  total_borrador,
  type Borrador,
  type LineaPedido,
} from "../src/modules/whatsapp/pedido.js";

const aguila: LineaPedido = {
  sku: "ag-1",
  nombre: "Águila 100 g",
  stock: 5,
  unidad: "caja",
  cantidad: 3,
  unidadesPorCaja: 24,
  costoCentavos: 50000n,
};

const jorgito: LineaPedido = {
  sku: "j1",
  nombre: "Jorgito",
  stock: 14,
  unidad: "unidad",
  cantidad: 10,
  unidadesPorCaja: 1,
  costoCentavos: 90000n,
};

const base: Borrador = {
  proveedor: "Golosinas Sur",
  lineas: [aguila, jorgito],
  version: 1,
  origen: "semanal",
};

describe("bot wa B7.1 borrador con líneas y total", () => {
  it("la caja muestra cajas y unidades entre paréntesis", () => {
    const texto = armar_resumen_borrador(base, { puedeVerCostos: true });
    expect(texto).toContain("3 cajas (72u)");
    expect(texto).toContain("Águila");
    expect(texto).toContain("Pedido a Golosinas Sur");
  });

  it("con permiso muestra el total estimado", () => {
    // 72u x $500 + 10u x $900 = $36.000 + $9.000 = $45.000
    expect(total_borrador(base)).toBe(4500000n);
    expect(armar_resumen_borrador(base, { puedeVerCostos: true })).toContain("Total estimado: $45.000");
  });

  it("sin permiso oculta el total y cualquier plata", () => {
    const texto = armar_resumen_borrador(base, { puedeVerCostos: false });
    expect(texto).not.toContain("Total");
    expect(texto).not.toContain("$");
    expect(texto).toContain("3 cajas (72u)");
  });

  it("cantidad 0 no aparece en el mensaje", () => {
    const b: Borrador = { ...base, lineas: [...base.lineas, { ...jorgito, sku: "x", nombre: "Tita", cantidad: 0 }] };
    const texto = armar_resumen_borrador(b, { puedeVerCostos: true });
    expect(texto).not.toContain("Tita");
  });

  it("sugiere cantidad hasta el stock objetivo", () => {
    expect(sugerir_cantidad({ stock: 5, objetivo: 77, unidad: "caja", unidadesPorCaja: 24 })).toBe(3);
    expect(sugerir_cantidad({ stock: 5, objetivo: 77, unidad: "unidad", unidadesPorCaja: 24 })).toBe(72);
    expect(sugerir_cantidad({ stock: 80, objetivo: 77, unidad: "caja", unidadesPorCaja: 24 })).toBe(0);
    expect(sugerir_cantidad({ stock: 5, objetivo: 77, unidad: "monto", unidadesPorCaja: 24 })).toBe(0);
  });
});

describe("bot wa B7.3 cambios de cantidad", () => {
  it("+1 caja recalcula unidades y total", () => {
    const b = aplicar_cambio(base, "ag-1", { kind: "cantidad", cantidad: 4, unidad: "caja" });
    expect(b.version).toBe(2);
    const texto = armar_resumen_borrador(b, { puedeVerCostos: true });
    expect(texto).toContain("4 cajas (96u)");
    // 96u x $500 + $9.000 = $57.000
    expect(texto).toContain("Total estimado: $57.000");
  });

  it("sacar elimina la línea", () => {
    const b = aplicar_cambio(base, "j1", { kind: "sacar" });
    expect(b.version).toBe(2);
    expect(b.lineas.some((l) => l.sku === "j1")).toBe(false);
    expect(armar_resumen_borrador(b, { puedeVerCostos: true })).not.toContain("Jorgito");
  });

  it("fijar 0 también saca la línea", () => {
    const b = aplicar_cambio(base, "j1", { kind: "cantidad", cantidad: 0, unidad: null });
    expect(b.lineas.some((l) => l.sku === "j1")).toBe(false);
  });

  it("parsea cantidades, cajas y montos", () => {
    expect(parsear_cambio_cantidad("4")).toEqual({ kind: "cantidad", cantidad: 4, unidad: null });
    expect(parsear_cambio_cantidad("4 cajas")).toEqual({ kind: "cantidad", cantidad: 4, unidad: "caja" });
    expect(parsear_cambio_cantidad("1 caja")).toEqual({ kind: "cantidad", cantidad: 1, unidad: "caja" });
    expect(parsear_cambio_cantidad("$20.000")).toEqual({ kind: "monto", montoCentavos: 2000000n });
    expect(parsear_cambio_cantidad("$20.000,50")).toEqual({ kind: "monto", montoCentavos: 2000050n });
    expect(parsear_cambio_cantidad("0")).toEqual({ kind: "sacar" });
    expect(parsear_cambio_cantidad("sacar")).toEqual({ kind: "sacar" });
    expect(parsear_cambio_cantidad("sacalo")).toEqual({ kind: "sacar" });
    expect(parsear_cambio_cantidad("chamuyo total")).toEqual({ kind: "invalido" });
  });

  it("el stepper suma y resta según la unidad", () => {
    expect(botones_stepper(aguila).map((b) => b.titulo)).toEqual(["-1", "+1", "Otra"]);
    expect(botones_stepper(jorgito).map((b) => b.titulo)).toEqual(["-5", "+5", "Otra"]);
    expect(botones_stepper({ ...jorgito, unidad: "monto" }).map((b) => b.titulo)).toEqual(["Otro monto"]);
    const mas = aplicar_paso(base, "ag-1", "mas");
    expect(mas.lineas.find((l) => l.sku === "ag-1")?.cantidad).toBe(4);
    const menos = aplicar_paso(base, "j1", "menos");
    expect(menos.lineas.find((l) => l.sku === "j1")?.cantidad).toBe(5);
  });
});

describe("bot wa B7.2 botones y listas", () => {
  it("tres botones cortos para Meta", () => {
    const botones = botones_borrador();
    expect(botones.length).toBe(3);
    for (const b of botones) expect([...b.titulo].length).toBeLessThanOrEqual(20);
    expect(botones.map((b) => b.titulo)).toEqual(["Confirmar", "Cambiar", "Cancelar"]);
  });

  it("la lista pagina de a 10", () => {
    const lineas: LineaPedido[] = Array.from({ length: 11 }, (_, i) => ({
      ...jorgito,
      sku: `s${i}`,
      nombre: `Prod ${i}`,
    }));
    const b: Borrador = { ...base, lineas };
    expect(filas_lineas_borrador(b, 1).length).toBe(10);
    const pag = paginar_lineas(lineas, 1);
    expect(pag.totalPaginas).toBe(2);
    expect(armar_resumen_borrador(b, { puedeVerCostos: false })).toContain("Página 1/2");
  });
});

describe("bot wa B7.4 texto libre", () => {
  it("poné 3 cajas de Águila fija cantidad con término", () => {
    const r = parsear_pedido_libre("poné 3 cajas de Águila");
    expect(r).toEqual({ accion: "fijar", cantidad: 3, unidad: "caja", termino: "aguila" });
  });

  it("sacá el Jorgito saca con término", () => {
    const r = parsear_pedido_libre("sacá el Jorgito");
    expect(r).toEqual({ accion: "sacar", termino: "jorgito" });
  });

  it("agregá 2 cajas agrega sin producto puntual", () => {
    const r = parsear_pedido_libre("agregá 2 cajas");
    expect(r.accion).toBe("agregar");
    if (r.accion === "agregar") {
      expect(r.cantidad).toBe(2);
      expect(r.unidad).toBe("caja");
    }
  });
});

describe("bot wa B7.5 agregar con búsqueda difusa", () => {
  const catalogo = [
    { sku: "ag-1", nombre: "Águila 100 g" },
    { sku: "j1", nombre: "Alfajor Jorgito", alias: ["jorjito"] },
  ];

  it("encuentra por nombre y por alias", () => {
    expect(buscar_para_agregar(catalogo, "aguila")[0]?.sku).toBe("ag-1");
    expect(buscar_para_agregar(catalogo, "jorjito")[0]?.sku).toBe("j1");
  });

  it("agregar suma si ya existe en la misma unidad", () => {
    const b = agregar_linea(base, { ...jorgito, cantidad: 2 });
    expect(b.lineas.find((l) => l.sku === "j1")?.cantidad).toBe(12);
  });
});

describe("bot wa B7.6/B7.7/B7.9 backend y conflictos", () => {
  it("convierte al formato del backend en unidades", () => {
    const lineas = borrador_a_lineas_compra(base);
    expect(lineas.find((l) => l.sku === "ag-1")).toEqual({ sku: "ag-1", qty: 72, costoCentavos: 50000n });
    expect(lineas.find((l) => l.sku === "j1")).toEqual({ sku: "j1", qty: 10, costoCentavos: 90000n });
  });

  it("el conflicto lo gana la última escritura por línea", () => {
    const local: Borrador = { ...base, version: 2 };
    const remoto: Borrador = {
      ...base,
      version: 3,
      origen: "urgente",
      lineas: [{ ...jorgito, cantidad: 2 }, { ...aguila, sku: "t1", nombre: "Tita", cantidad: 1, unidad: "unidad" }],
    };
    const merged = resolver_conflicto_version(local, remoto);
    expect(merged.version).toBe(4);
    expect(merged.lineas.find((l) => l.sku === "j1")?.cantidad).toBe(2);
    expect(merged.lineas.some((l) => l.sku === "t1")).toBe(true);
    expect(merged.lineas.some((l) => l.sku === "ag-1")).toBe(true);
  });

  it("no mezcla proveedores distintos", () => {
    const otro: Borrador = { ...base, proveedor: "Otro", version: 9 };
    expect(resolver_conflicto_version(base, otro)).toBe(base);
  });

  it("el borrador persiste 24h aunque se cierre la ventana", () => {
    expect(borrador_sigue_vigente(0, 86_400_000)).toBe(true);
    expect(borrador_sigue_vigente(0, 86_400_001)).toBe(false);
  });
});
