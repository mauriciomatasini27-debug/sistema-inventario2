import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const admin = leer("src/pages/admin.astro");
const caja = leer("src/pages/panel/caja.astro");
const stock = leer("src/pages/panel/stock.astro");
const venta = leer("src/pages/venta.astro");
const adminDb = leer("src/lib/admin-db.ts");

describe("NAV-S3: carga inicial en paralelo", () => {
  it("caja dispara sus cinco fuentes en un Promise.all", () => {
    expect(caja).toContain("void Promise.all([");
    for (const loader of ["cargarBalance()", "cargarMovimientos()", "cargarVencimientos()", "cargarCierre()", "cargarQr()"]) {
      expect(caja).toContain(loader);
    }
  });

  it("stock dispara catálogo, sugerido, stock inicial y precios en un Promise.all", () => {
    expect(stock).toContain("void Promise.all([");
    for (const loader of ["cargarCatalogo()", "cargarCatalogoSugerido()", "cargarStockInicialPanel()", "cargarPreciosPendientes()"]) {
      expect(stock).toContain(loader);
    }
  });

  it("admin dispara lista y badge, y detalle y auditoría, en paralelo", () => {
    expect(admin.match(/void Promise\.all\(\[/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const loader of ["cargarTenants()", "cargarReportesBadge()", "cargarFlags()", "cargarAudit()"]) {
      expect(admin).toContain(loader);
    }
  });

  it("venta dispara catálogo y balance en paralelo", () => {
    expect(venta).toContain("void Promise.all([refrescarCatalogo(), balance()])");
  });

  it("el sync de uso del admin lee bot y asistente en paralelo por tenant", () => {
    const inicio = adminDb.indexOf("export async function sincronizarUsoDiarioDesdeContadores");
    const cuerpo = adminDb.slice(inicio);
    expect(cuerpo).toContain("await Promise.all(");
    expect(cuerpo).toContain("leerContadorPlanes(t.id, mes, FEATURE_BOT)");
    expect(cuerpo).toContain("leerContadorPlanes(t.id, mes, FEATURE_ASISTENTE)");
  });
});

describe("NAV-S3: skeleton inmediato y aria-busy", () => {
  it("caja renderiza skeleton en saldo, movimientos, vencimientos y QR", () => {
    expect(caja).toContain('id="saldo-caja"');
    expect(caja).toContain('id="caja-total"><i class="skel skel-monto"');
    expect(caja).toContain('id="mov-body"');
    expect(caja).toContain('id="venc-lista"');
    expect(caja).toContain('id="qr-body"');
    expect(caja.match(/skel-linea/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(caja).toContain('aria-busy="true"');
  });

  it("stock renderiza skeleton en KPIs y catálogo", () => {
    expect(stock).toContain('id="card-catalogo" aria-busy="true"');
    expect(stock).toContain('id="stock-productos"><i class="skel skel-monto"');
    expect(stock).toContain('id="stock-umbral"><i class="skel skel-monto"');
    expect(stock).toContain('id="catalogo-skel"');
  });

  it("admin renderiza skeleton en contadores, tabla y badge de reportes", () => {
    expect(admin).toContain('id="kpis" aria-busy="true"');
    expect(admin).toContain('id="n-activos"><i class="skel skel-monto"');
    expect(admin).toContain('id="tenants-body"');
    expect(admin).toContain('id="n-reportes"><i class="skel"');
    expect(admin).toContain('id="card-comercios"');
  });

  it("venta renderiza skeleton en balance hasta que responde la API", () => {
    expect(venta).toContain('id="balance-card"');
    expect(venta).toContain("<i class=\"skel skel-linea\" aria-hidden=\"true\"></i>");
    expect(venta).toContain('marcarCargaLista("balance-card")');
  });
});

describe("NAV-S3: el skeleton no queda pegado cuando falla la API", () => {
  it("caja limpia las filas skeleton y apaga aria-busy en cada error", () => {
    for (const contenedor of ["mov-body", "venc-lista", "qr-body"]) {
      expect(caja).toContain(`limpiar("${contenedor}")`);
    }
    for (const seccion of ["saldo-caja", "card-movimientos", "card-venc", "card-qr", "card-cierre"]) {
      expect(caja).toContain(`marcarCargaLista("${seccion}")`);
    }
  });

  it("stock quita el skeleton del catálogo y apaga aria-busy en error", () => {
    expect(stock).toContain("limpiarCatalogoSkel();");
    expect(stock).toContain('marcarCargaLista("card-catalogo")');
  });

  it("admin apaga aria-busy de contadores y tabla en éxito y error", () => {
    expect(admin).toContain('marcarCargaLista("kpis")');
    expect(admin).toContain('marcarCargaLista("card-comercios")');
    expect(admin).toContain('marcarCargaLista("flags-lista")');
    expect(admin).toContain('marcarCargaLista("detalle-audit")');
  });

  it("venta reemplaza el skeleton por un texto de error", () => {
    expect(venta).toContain('$("balance").textContent = "Balance: no disponible";');
    expect(venta).toContain('marcarCargaLista("balance-card")');
  });
});
