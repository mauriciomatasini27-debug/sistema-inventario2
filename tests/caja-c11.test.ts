import { beforeEach, describe, expect, it } from "vitest";
import { GET as GETHistory } from "../src/pages/api/cash/history.js";
import { GET as GETExport } from "../src/pages/api/cash/export.js";
import { resetStore, store, type StoredMovement } from "../src/lib/store.js";

function mov(over: Partial<StoredMovement> & { id: string }): StoredMovement {
  return {
    tipo: "ingreso",
    metodo: "Efectivo",
    monto_centavos: "10000",
    origen: "venta",
    idempotency_key: `k-${over.id}`,
    ...over,
  };
}

beforeEach(() => {
  resetStore();
  store.movements.push(
    mov({ id: "m1", tipo: "ingreso", metodo: "Efectivo", origen: "venta", sale_id: "s1" }),
    mov({ id: "m2", tipo: "egreso", metodo: "Transferencia", origen: "retiro" }),
    mov({ id: "m3", tipo: "egreso", metodo: "Efectivo", origen: "sueldo" }),
  );
});

async function getHistory(qs: string) {
  const res = (await GETHistory({ url: new URL(`http://localhost/api/cash/history${qs}`) } as never)) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("C11 historial de caja", () => {
  it("sin filtros devuelve todo, mas reciente primero", async () => {
    const { status, json } = await getHistory("");
    expect(status).toBe(200);
    expect(json["total"]).toBe(3);
    expect((json["items"] as Array<{ id: string }>).map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
    expect(json["next_cursor"]).toBeNull();
  });

  it("filtra por medio, origen y tipo", async () => {
    const ef = await getHistory("?medio=Efectivo");
    expect((ef.json["items"] as unknown[])).toHaveLength(2);
    const ret = await getHistory("?origen=retiro");
    expect((ret.json["items"] as Array<{ id: string }>).map((m) => m.id)).toEqual(["m2"]);
    const egr = await getHistory("?tipo=egreso");
    expect((egr.json["items"] as unknown[])).toHaveLength(2);
  });

  it("pagina con limit y cursor", async () => {
    const p1 = await getHistory("?limit=2");
    expect((p1.json["items"] as unknown[])).toHaveLength(2);
    expect(p1.json["next_cursor"]).toBe(2);
    const p2 = await getHistory("?limit=2&cursor=2");
    expect((p2.json["items"] as Array<{ id: string }>).map((m) => m.id)).toEqual(["m1"]);
    expect(p2.json["next_cursor"]).toBeNull();
  });

  it("422 con filtros o paginacion invalidos", async () => {
    for (const qs of ["?medio=Oro", "?tipo=mixto", "?origen=fiesta", "?limit=0", "?limit=500", "?cursor=-1"]) {
      const r = await getHistory(qs);
      expect(r.status).toBe(422);
    }
  });
});

describe("C11 export CSV de caja", () => {
  async function getExport(qs: string) {
    const res = (await GETExport({ url: new URL(`http://localhost/api/cash/export${qs}`) } as never)) as Response;
    const copia = res.clone();
    return { status: res.status, text: await res.text(), bytes: new Uint8Array(await copia.arrayBuffer()), headers: res.headers };
  }

  it("descarga CSV con BOM, header y filas mas recientes primero", async () => {
    const r = await getExport("");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain("caja-historial.csv");
    // text() puede pelar el BOM segun el runtime; los bytes mandan.
    expect(Array.from(r.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const lineas = r.text.replace(String.fromCharCode(0xfeff), "").trim().split("\n");
    expect(lineas[0]).toBe("id,tipo,metodo,monto_centavos,origen,sale_id,idempotency_key");
    expect(lineas).toHaveLength(4);
    expect(lineas[1]).toContain("m3,egreso,Efectivo");
  });

  it("respeta los mismos filtros que history y 422 igual", async () => {
    const r = await getExport("?origen=retiro");
    const lineas = r.text.replace(/^﻿/, "").trim().split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toContain("m2");
    const malo = await getExport("?medio=Oro");
    expect(malo.status).toBe(422);
  });
});
