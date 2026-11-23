import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { ctx } from "./helpers/ctx.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../src/modules/auth/modelo.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conModoTenant, conTenant } from "../src/lib/tenant.js";
import { gateTenantDatos } from "../src/lib/tenant-context.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as previewImportar } from "../src/pages/api/stock/importar/preview.js";
import { POST as confirmarImportar } from "../src/pages/api/stock/importar/confirmar.js";
import { GET as plantillaImportar } from "../src/pages/api/stock/importar/plantilla.csv.js";
import { altaProducto } from "../src/lib/repos/catalogo.js";
import { crearLote, invarianteStockLotesMovs, listarLotesDetalle } from "../src/lib/repos/lotes.js";
import { listarMovimientos, nivelStock } from "../src/lib/repos/stock.js";

function modoSingleSinDb(): void {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

function conCookie(plano: string): string {
  return `__Host-sesion=${plano}`;
}

function tenantConMiembro(
  tenantId: string,
  sub: string,
  rol: "dueno" | "empleado",
  permisos: string[] = [],
): void {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco Import",
    slug: "kiosco-import",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-import",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos, estado: "activo" });
}

function sesionDe(sub: string, tenantId: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

type PreviewJson = {
  archivo: { nombre: string; sha256: string; bytes: number; formato: string };
  resumen: { total: number; validas: number; nuevas: number; existentes: number; con_error: number };
  filas: Array<{
    estado: string;
    fila: number;
    sku?: string;
    nombre?: string;
    precio_centavos?: number;
    cantidad?: number;
    stock_actual?: number;
    stock_resultante?: number;
    errores: Array<{ campo: string; codigo: string; mensaje: string }>;
  }>;
  columnas_ignoradas: string[];
  advertencia_codificacion: boolean;
};

type ConfirmJson = {
  importacion_id: string;
  filas_importadas: number;
  filas_nuevas: number;
  filas_existentes: number;
  filas_error: number;
  movimientos: number;
  reintento: boolean;
};

type ErrorJson = { error?: string; codigo?: string; columnas?: string[] };

async function crearProducto(sku: string, nombre = `Prod ${sku}`, precioCentavos = 100): Promise<void> {
  const r = await altaProducto({ sku, nombre, precioCentavos, sector: "general", controlaVencimiento: false });
  if (!r.ok) throw new Error(`no se pudo sembrar ${sku}: ${r.codigo}`);
}

async function sembrarStock(sku: string, cantidad: number): Promise<void> {
  await crearLote({
    sku,
    cantidad,
    venceEl: null,
    costoCentavos: 0,
    controlaVencimiento: false,
    idemKey: `seed:${sku}`,
  });
}

function sha256Texto(texto: string): string {
  return createHash("sha256").update(Buffer.from(texto, "utf8")).digest("hex");
}

function formCsv(texto: string, nombre = "stock.csv"): FormData {
  const fd = new FormData();
  fd.append("archivo", new Blob([texto], { type: "text/csv" }), nombre);
  return fd;
}

function formConSha(texto: string, sha: string, nombre = "stock.csv"): FormData {
  const fd = formCsv(texto, nombre);
  fd.append("archivo_sha256", sha);
  return fd;
}

async function previsualizar(fd: FormData): Promise<Response> {
  return (await previewImportar(ctx("http://x/api/stock/importar/preview", { method: "POST", form: fd }))) as Response;
}

async function confirmarArchivo(
  fd: FormData,
  idemKey: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return (await confirmarImportar(
    ctx("http://x/api/stock/importar/confirmar", {
      method: "POST",
      form: fd,
      headers: { "Idempotency-Key": idemKey, ...headers },
    }),
  )) as Response;
}

const CSV_HAPPY = [
  "sku,nombre,precio,cantidad,sector",
  "NUEVO-1,Arroz,1950.00,3,almacen",
  "NUEVO-2,Harina,1000,2,",
  "EXIST-1,Prod EXIST-1,999.00,4,",
  "",
].join("\n");

describe("STOCK-S10/S11/S12/S13 importación de stock CSV", () => {
  it("plantilla: BOM, encabezados y ejemplo", async () => {
    const r = (await plantillaImportar(
      ctx("http://x/api/stock/importar/plantilla.csv", { method: "GET" }),
    )) as Response;
    expect(r.status).toBe(200);
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(texto.startsWith("\uFEFF")).toBe(true);
    expect(texto.startsWith("\uFEFF\uFEFF")).toBe(false);
    expect(texto).toContain("sku,nombre,precio,cantidad,sector");
    expect(texto).toContain("ARROZ-1,Arroz gallo 1 kg,1950.00,24,");
  });

  it("preview no escribe y confirm aplica 2 nuevas + 1 existente con invariante", async () => {
    await crearProducto("EXIST-1");
    await sembrarStock("EXIST-1", 5);

    const respPreview = await previsualizar(formCsv(CSV_HAPPY));
    expect(respPreview.status).toBe(200);
    const preview = (await respPreview.json()) as PreviewJson;
    expect(preview.resumen).toEqual({ total: 3, validas: 3, nuevas: 2, existentes: 1, con_error: 0 });
    const existente = preview.filas.find((f) => f.sku === "EXIST-1");
    expect(existente?.stock_actual).toBe(5);
    expect(existente?.stock_resultante).toBe(9);
    expect(store.importaciones.size).toBe(0);
    expect(nivelStock("EXIST-1")).toBe(5);

    const respConfirm = await confirmarArchivo(
      formConSha(CSV_HAPPY, preview.archivo.sha256),
      "imp-happy-1",
    );
    expect(respConfirm.status).toBe(201);
    const confirm = (await respConfirm.json()) as ConfirmJson;
    expect(confirm.filas_importadas).toBe(3);
    expect(confirm.filas_nuevas).toBe(2);
    expect(confirm.filas_existentes).toBe(1);
    expect(confirm.filas_error).toBe(0);
    expect(confirm.movimientos).toBe(3);
    expect(confirm.reintento).toBe(false);
    expect(store.importaciones.size).toBe(1);

    expect(nivelStock("NUEVO-1")).toBe(3);
    expect(nivelStock("NUEVO-2")).toBe(2);
    expect(nivelStock("EXIST-1")).toBe(9);
    const existenteFicha = store.productos.get("EXIST-1");
    expect(existenteFicha?.nombre).toBe("Prod EXIST-1");
    expect(existenteFicha?.precioCentavos).toBe(100);

    const lotesExistente = await listarLotesDetalle("EXIST-1");
    const lotesImport = lotesExistente.filter((l) => l.venceEl === null && l.costoCentavos === "0");
    expect(lotesImport).toHaveLength(2);
    const sumaRestante = lotesExistente.reduce((a, l) => a + l.cantidadRestante, 0);
    const sumaMovs = (await listarMovimientos())
      .filter((m) => m.sku === "EXIST-1" && m.tipo === "ALTA")
      .reduce((a, m) => a + m.delta, 0);
    expect(
      invarianteStockLotesMovs({ stockActual: nivelStock("EXIST-1"), lotesCantidadRestante: sumaRestante, movsDeltaSum: sumaMovs }),
    ).toBe(true);
  });

  it("COLUMNAS_FALTANTES 422 cuando falta cantidad", async () => {
    const csv = ["sku,nombre,precio,sector", "A,B,10,x", ""].join("\n");
    const r = await previsualizar(formCsv(csv));
    expect(r.status).toBe(422);
    const j = (await r.json()) as ErrorJson;
    expect(j.codigo).toBe("COLUMNAS_FALTANTES");
    expect(j.columnas).toContain("cantidad");
  });

  it("precio con coma decimal 1500,50 da 150050 centavos", async () => {
    const csv = ["sku;nombre;precio;cantidad", "P1;Producto;1500,50;2", ""].join("\n");
    const r = await previsualizar(formCsv(csv));
    expect(r.status).toBe(200);
    const j = (await r.json()) as PreviewJson;
    expect(j.resumen.validas).toBe(1);
    expect(j.filas[0]?.precio_centavos).toBe(150050);
  });

  it("SKU_DUPLICADO_EN_ARCHIVO en las dos filas y SIN_FILAS_VALIDAS al confirmar", async () => {
    const csv = ["sku,nombre,precio,cantidad", "DUP-1,Uno,10,1", "DUP-1,Dos,20,2", ""].join("\n");
    const r = await previsualizar(formCsv(csv));
    expect(r.status).toBe(200);
    const j = (await r.json()) as PreviewJson;
    expect(j.resumen.validas).toBe(0);
    expect(j.resumen.con_error).toBe(2);
    for (const fila of j.filas) {
      expect(fila.errores.some((e) => e.codigo === "SKU_DUPLICADO_EN_ARCHIVO")).toBe(true);
    }
    const rc = await confirmarArchivo(formConSha(csv, j.archivo.sha256), "imp-dup-1");
    expect(rc.status).toBe(422);
    expect(((await rc.json()) as ErrorJson).codigo).toBe("SIN_FILAS_VALIDAS");
    expect(store.importaciones.size).toBe(0);
    expect(nivelStock("DUP-1")).toBe(0);
  });

  it(".pdf da 415 y un archivo de más de 2 MB da 413", async () => {
    const pdf = await previsualizar(formCsv("hola", "stock.pdf"));
    expect(pdf.status).toBe(415);
    expect(((await pdf.json()) as ErrorJson).codigo).toBe("FORMATO_NO_SOPORTADO");

    const grande = new FormData();
    grande.append("archivo", new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]), "grande.csv");
    const r = await previsualizar(grande);
    expect(r.status).toBe(413);
    expect(((await r.json()) as ErrorJson).codigo).toBe("ARCHIVO_GRANDE");
  });

  it("reintento con la misma key y archivo da 200 y no duplica movimientos", async () => {
    const csv = ["sku,nombre,precio,cantidad", "RET-1,Producto,100,2", ""].join("\n");
    const sha = sha256Texto(csv);
    const r1 = await confirmarArchivo(formConSha(csv, sha), "imp-retry-1");
    expect(r1.status).toBe(201);
    expect(((await r1.json()) as ConfirmJson).movimientos).toBe(1);

    const movsAntes = (await listarMovimientos()).filter((m) => m.sku === "RET-1" && m.idemKey.startsWith("import:"));
    const r2 = await confirmarArchivo(formConSha(csv, sha), "imp-retry-1");
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as ConfirmJson;
    expect(j2.reintento).toBe(true);
    expect(j2.movimientos).toBe(1);
    const movsDespues = (await listarMovimientos()).filter((m) => m.sku === "RET-1" && m.idemKey.startsWith("import:"));
    expect(movsDespues).toHaveLength(movsAntes.length);
    expect(movsDespues).toHaveLength(1);
    expect(nivelStock("RET-1")).toBe(2);
  });

  it("misma key con otro archivo da 409 ARCHIVO_CAMBIADO", async () => {
    const csvA = ["sku,nombre,precio,cantidad", "CONF-1,A,100,1", ""].join("\n");
    const csvB = ["sku,nombre,precio,cantidad", "CONF-2,B,200,2", ""].join("\n");
    const r1 = await confirmarArchivo(formConSha(csvA, sha256Texto(csvA)), "imp-conf-1");
    expect(r1.status).toBe(201);
    const r2 = await confirmarArchivo(formConSha(csvB, sha256Texto(csvB)), "imp-conf-1");
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as ErrorJson).codigo).toBe("ARCHIVO_CAMBIADO");
    expect(nivelStock("CONF-2")).toBe(0);
  });

  it("spec 433 T2: empleado con permisos por defecto confirma CSV y crea productos en su comercio", async () => {
    tenantConMiembro("t-import", "emp-import", "empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    const plano = sesionDe("emp-import", "t-import");
    const csv = ["sku,nombre,precio,cantidad", "PERM-1,Arroz,150.50,2", "PERM-2,Harina,100,3", ""].join("\n");
    const r = await confirmarArchivo(formConSha(csv, sha256Texto(csv)), "imp-perm-1", {
      cookie: conCookie(plano),
    });
    expect(r.status).toBe(201);
    const j = (await r.json()) as ConfirmJson;
    expect(j).toMatchObject({ filas_importadas: 2, filas_nuevas: 2, filas_error: 0, reintento: false });
    expect(store.productos.get("PERM-1")).toMatchObject({ nombre: "Arroz", precioCentavos: 15050, estado: "activo" });
    expect(store.productos.get("PERM-2")).toMatchObject({ nombre: "Harina", estado: "activo" });
    expect(nivelStock("PERM-1")).toBe(2);
    expect(nivelStock("PERM-2")).toBe(3);
    expect(store.importaciones.size).toBe(1);
  });

  it("spec 433 T2: importación rechazada del empleado no deja filas parciales ni borradores", async () => {
    tenantConMiembro("t-import-atom", "emp-atom", "empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    const plano = sesionDe("emp-atom", "t-import-atom");
    const csv = ["sku,nombre,precio,cantidad", "ATOM-1,Uno,10,1", "ATOM-1,Dos,20,2", ""].join("\n");
    const r = await confirmarArchivo(formConSha(csv, sha256Texto(csv)), "imp-atom-1", {
      cookie: conCookie(plano),
    });
    expect(r.status).toBe(422);
    expect(((await r.json()) as ErrorJson).codigo).toBe("SIN_FILAS_VALIDAS");
    expect(store.productos.size).toBe(0);
    expect(store.importaciones.size).toBe(0);
    expect(nivelStock("ATOM-1")).toBe(0);
    expect((await listarMovimientos()).filter((m) => m.sku === "ATOM-1")).toEqual([]);
  });

  it("spec 433 T2: sesión de otro comercio sigue rechazada", async () => {
    tenantConMiembro("t-import", "emp-import", "empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    tenantConMiembro("t-import-otro", "emp-otro", "empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    const plano = sesionDe("emp-otro", "t-import-otro");
    const csv = ["sku,nombre,precio,cantidad", "AJENO-1,Ajeno,100,1", ""].join("\n");
    const r = await conTenant("t-import", () =>
      confirmarArchivo(formConSha(csv, sha256Texto(csv)), "imp-ajeno-1", { cookie: conCookie(plano) }),
    );
    expect(r.status).toBe(403);
    expect(store.productos.size).toBe(0);
    expect(store.importaciones.size).toBe(0);
  });

  it("spec 433 T2: sin sesión en modo multi el gate de datos corta la importación", () => {
    const gate = conModoTenant({ multi: true, shared: false, tenantPorDefecto: "slice0" }, () =>
      gateTenantDatos(new Request("http://x/api/stock/importar/confirmar", { method: "POST" }), "/api/stock/importar/confirmar"),
    );
    expect(gate).not.toBeNull();
    expect(gate?.ok).toBe(false);
    if (gate && !gate.ok) expect(gate.respuesta.status).toBe(403);
    expect(store.productos.size).toBe(0);
  });

  it("spec 433 T2: el dueño conserva el flujo de importación", async () => {
    tenantConMiembro("t-import-dueno", "dueno-import", "dueno");
    const plano = sesionDe("dueno-import", "t-import-dueno");
    const csv = ["sku,nombre,precio,cantidad", "DUENO-1,Producto,100,2", ""].join("\n");
    const r = await confirmarArchivo(formConSha(csv, sha256Texto(csv)), "imp-dueno-1", {
      cookie: conCookie(plano),
    });
    expect(r.status).toBe(201);
    expect(((await r.json()) as ConfirmJson).filas_nuevas).toBe(1);
    expect(nivelStock("DUENO-1")).toBe(2);
  });

  it("confirmar sin conexión da 403 sensible_solo_online", async () => {
    tenantConMiembro("t-offline", "dueno-offline", "dueno");
    const plano = sesionDe("dueno-offline", "t-offline");
    const csv = ["sku,nombre,precio,cantidad", "OFF-1,A,100,1", ""].join("\n");
    const r = await confirmarArchivo(formConSha(csv, sha256Texto(csv)), "imp-off-1", {
      cookie: conCookie(plano),
      "x-offline-grant": "pres",
    });
    expect(r.status).toBe(403);
    expect(((await r.json()) as ErrorJson).codigo).toBe("sensible_solo_online");
    expect(store.importaciones.size).toBe(0);
  });

  it("hash del campo distinto al recalculado da 422 y no escribe", async () => {
    const csv = ["sku,nombre,precio,cantidad", "HASH-1,A,100,1", ""].join("\n");
    const r = await confirmarArchivo(formConSha(csv, "0".repeat(64)), "imp-hash-1");
    expect(r.status).toBe(422);
    expect(((await r.json()) as ErrorJson).codigo).toBe("ARCHIVO_CAMBIADO");
    expect(store.importaciones.size).toBe(0);
    expect(nivelStock("HASH-1")).toBe(0);
  });

  it("CSV Windows-1252 se lee y avisa advertencia de codificación", async () => {
    const bytes = Buffer.from("sku,nombre,precio,cantidad\nW-1,Café,100,1\n", "latin1");
    const fd = new FormData();
    fd.append("archivo", new Blob([new Uint8Array(bytes)], { type: "text/csv" }), "stock.csv");
    const r = await previsualizar(fd);
    expect(r.status).toBe(200);
    const j = (await r.json()) as PreviewJson;
    expect(j.advertencia_codificacion).toBe(true);
    expect(j.resumen.validas).toBe(1);
    expect(j.filas[0]?.nombre).toBe("Café");
  });

  it("alias de encabezado producto, precio_venta y stock", async () => {
    const csv = ["sku,producto,precio_venta,stock", "ALIAS-1,Producto,250,3", ""].join("\n");
    const r = await previsualizar(formCsv(csv));
    expect(r.status).toBe(200);
    const j = (await r.json()) as PreviewJson;
    expect(j.resumen.validas).toBe(1);
    expect(j.filas[0]?.precio_centavos).toBe(25000);
    expect(j.filas[0]?.cantidad).toBe(3);
  });

  it("demasiadas columnas y demasiadas filas", async () => {
    const encabezado = Array.from({ length: 21 }, (_, i) => `c${i}`).join(",");
    const rCols = await previsualizar(formCsv(`${encabezado}\n`));
    expect(rCols.status).toBe(422);
    expect(((await rCols.json()) as ErrorJson).codigo).toBe("DEMASIADAS_COLUMNAS");

    const filas = ["sku,nombre,precio,cantidad"];
    for (let i = 0; i < 1001; i += 1) filas.push(`S${i},N,1,1`);
    filas.push("");
    const rFilas = await previsualizar(formCsv(filas.join("\n")));
    expect(rFilas.status).toBe(422);
    expect(((await rFilas.json()) as ErrorJson).codigo).toBe("DEMASIADAS_FILAS");
  });

  it("round-trip XLSX: 1 nueva y 1 existente", async () => {
    await crearProducto("XLSX-EXIST");
    await sembrarStock("XLSX-EXIST", 1);
    const datos = [
      [{ value: "sku" }, { value: "nombre" }, { value: "precio" }, { value: "cantidad" }, { value: "sector" }],
      [{ value: "XLSX-1" }, { value: "Producto X" }, { value: 10.5 }, { value: 4 }, { value: "general" }],
      [{ value: "XLSX-EXIST" }, { value: "Existente" }, { value: 1 }, { value: 2 }, { value: "" }],
    ];
    const buffer = await writeXlsxFile(datos).toBuffer();
    const fd = new FormData();
    fd.append("archivo", new Blob([new Uint8Array(buffer)]), "stock.xlsx");

    const respPreview = await previsualizar(fd);
    expect(respPreview.status).toBe(200);
    const preview = (await respPreview.json()) as PreviewJson;
    expect(preview.resumen.nuevas).toBe(1);
    expect(preview.resumen.existentes).toBe(1);

    const fdConfirm = new FormData();
    fdConfirm.append("archivo", new Blob([new Uint8Array(buffer)]), "stock.xlsx");
    fdConfirm.append("archivo_sha256", preview.archivo.sha256);
    const respConfirm = await confirmarArchivo(fdConfirm, "imp-xlsx-1");
    expect(respConfirm.status).toBe(201);
    const confirm = (await respConfirm.json()) as ConfirmJson;
    expect(confirm.filas_nuevas).toBe(1);
    expect(confirm.filas_existentes).toBe(1);
    expect(nivelStock("XLSX-1")).toBe(4);
    expect(nivelStock("XLSX-EXIST")).toBe(3);
  });

  it("spec 433 T2: empleado con permisos por defecto confirma XLSX", async () => {
    tenantConMiembro("t-import-xlsx", "emp-xlsx", "empleado", [...PERMISOS_EMPLEADO_DEFAULT]);
    const plano = sesionDe("emp-xlsx", "t-import-xlsx");
    const datos = [
      [{ value: "sku" }, { value: "nombre" }, { value: "precio" }, { value: "cantidad" }],
      [{ value: "EMPX-1" }, { value: "Producto XLSX" }, { value: 12.5 }, { value: 4 }],
    ];
    const buffer = await writeXlsxFile(datos).toBuffer();
    const fd = new FormData();
    fd.append("archivo", new Blob([new Uint8Array(buffer)]), "stock.xlsx");
    const respPreview = await previsualizar(fd);
    expect(respPreview.status).toBe(200);
    const preview = (await respPreview.json()) as PreviewJson;
    expect(preview.resumen.nuevas).toBe(1);

    const fdConfirm = new FormData();
    fdConfirm.append("archivo", new Blob([new Uint8Array(buffer)]), "stock.xlsx");
    fdConfirm.append("archivo_sha256", preview.archivo.sha256);
    const respConfirm = await confirmarArchivo(fdConfirm, "imp-xlsx-emp-1", { cookie: conCookie(plano) });
    expect(respConfirm.status).toBe(201);
    expect(((await respConfirm.json()) as ConfirmJson).filas_nuevas).toBe(1);
    expect(store.productos.get("EMPX-1")).toMatchObject({ nombre: "Producto XLSX", estado: "activo" });
    expect(nivelStock("EMPX-1")).toBe(4);
  });
});
