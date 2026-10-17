import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { documento_papel } from "../src/modules/email/papel.js";
import { layout } from "../src/modules/email/plantillas.js";
import { armar_cierre } from "../src/modules/email/plantilla-cierre.js";
import { calcular_ventas, armar_email_ventas } from "../src/modules/email/ventas-diarias.js";
import { calcular_semanal, armar_semanal } from "../src/modules/email/resumen-semanal.js";
import { calcular_matutino, armar_matutino } from "../src/modules/email/stock-matutino.js";
import { describir_vencimientos } from "../src/modules/email/vencimientos.js";
import {
  describir_stock_negativo,
  describir_cierre_fallido,
  describir_conexion_vencida,
  describir_sync_pendiente,
} from "../src/modules/email/eventos-operacion.js";
import { describir_dispositivo_nuevo, describir_cuenta } from "../src/modules/email/eventos-seguridad.js";
import {
  describir_diferencia_turno,
  describir_disputa,
  describir_ajuste_conteo,
  describir_fiado,
  describir_promo,
} from "../src/modules/email/eventos-v1.js";

const RAIZ = process.cwd();

const ventas = calcular_ventas(
  [{ sku: "a", nombre: "Coca 500 con un nombre larguísimo que no entra en 360px", cantidad: 2, importeCentavos: 2000n }],
  { tickets: 2 },
);
const semanal = calcular_semanal({
  ventas: [{ sku: "a", nombre: "Coca", unidades: 10, importeCentavos: 10000n }],
  faltantes: [{ sku: "b", nombre: "Sprite", stock: 0, umbral: 12, proveedor: "Distri X" }],
});
const matutino = calcular_matutino(
  [{ sku: "a", nombre: "Coca 500", stock: 0, umbral: 12, proveedor: "Distri X" }],
  new Set(),
);

const vencimientos = [
  {
    id: "v1",
    concepto: "Alquiler",
    beneficiario: "Inmobiliaria del Centro",
    montoCentavos: 250000n,
    vence: "2026-10-20",
    estado: "pendiente" as const,
  },
];

const PLANTILLAS: ReadonlyArray<{ nombre: string; html: string }> = [
  { nombre: "layout", html: layout("Cierre", "<p>Hola</p>") },
  {
    nombre: "cierre",
    html: armar_cierre({
      nombreComercio: "Kiosco",
      fechaJornada: "2026-10-16",
      totalCentavos: 12345n,
      porMedio: { Efectivo: 10000n, Tarjeta: 2345n },
      tipo: "manual",
    }).html,
  },
  { nombre: "ventas diarias", html: armar_email_ventas({ nombreComercio: "Kiosco", fecha: "2026-10-16", calculo: ventas }).html },
  { nombre: "resumen semanal", html: armar_semanal({ nombreComercio: "Kiosco", semana: "06-10/10", calculo: semanal }).html },
  { nombre: "stock matutino", html: armar_matutino({ nombreComercio: "Kiosco", fecha: "2026-10-17", alertas: matutino.alertas }).html },
  { nombre: "vencimientos", html: describir_vencimientos({ items: vencimientos, fecha: "2026-10-17", modo: "diaria" })?.html ?? "" },
  {
    nombre: "stock negativo",
    html: describir_stock_negativo({ syncId: "s1", items: [{ sku: "a", nombre: "Coca", stock: -1 }], dispositivo: "D1", usuario: "ana" }).html,
  },
  { nombre: "cierre fallido", html: describir_cierre_fallido({ jornada: "2026-10-16" }).html },
  { nombre: "conexion vencida", html: describir_conexion_vencida({ servicio: "gmail", fecha: "2026-10-16" }).html },
  { nombre: "sync pendiente", html: describir_sync_pendiente({ dispositivo: "D1", fecha: "2026-10-16" }).html },
  {
    nombre: "dispositivo nuevo",
    html: describir_dispositivo_nuevo({ comercio: "Kiosco", navegador: "Chrome", so: "Android", lugar: "CABA", fecha: "2026-10-16" }).html,
  },
  { nombre: "evento seguridad", html: describir_cuenta({ kind: "pago_rechazado", limiteSoloLectura: "2026-10-20" }).html },
  {
    nombre: "diferencia turno",
    html:
      describir_diferencia_turno({
        entregaId: "e1",
        diferenciaCentavos: 90000n,
        esperadoCentavos: 100000n,
        contadoCentavos: 190000n,
        quienEntrega: "ana",
        quienRecibe: "beto",
        motivo: "error de cambio",
      })?.html ?? "",
  },
  { nombre: "disputa", html: describir_disputa({ entregaId: "e1", conteoA: 100n, conteoB: 200n }).html },
  {
    nombre: "ajuste conteo",
    html: describir_ajuste_conteo({ sector: "Almacén", quien: "ana", netoCostoCentavos: 3000000n, pctUnidades: 40 })?.html ?? "",
  },
  { nombre: "fiado", html: describir_fiado({ cliente: "beto", fecha: "2026-10-16", motivo: "vencido", saldoCentavos: 5000n }).html },
  { nombre: "promo", html: describir_promo({ producto: "Coca", lote: "L1", unidades: 5, dias: 3, promo: "2x1" }).html },
];

const CON_PIE = PLANTILLAS.filter((p) => p.html.length > 0);

function etiquetas(html: string, tag: string): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))].map((m) => m[0]);
}

function estilo(etiqueta: string): string {
  return /style="([^"]*)"/.exec(etiqueta)?.[1] ?? "";
}

function px(etiqueta: string, prop: string): number {
  const m = new RegExp(`(?:^|;)${prop}:(\\d+(?:\\.\\d+)?)px`).exec(estilo(etiqueta));
  return m?.[1] === undefined ? 0 : Number(m[1]);
}

describe("Papel del email: documento único con color-scheme (DS-S21)", () => {
  it("declara color-scheme light dark en el head y en el root", () => {
    const html = layout("Cierre", "<p>Hola</p>");
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark">');
    expect(html).toMatch(/<html[^>]*style="[^"]*color-scheme:\s*light dark/);
  });

  it("trae la media query oscura con fondo, texto, bordes y CTA", () => {
    const html = layout("Cierre", "<p>Hola</p>");
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain(".ne-papel{background:#1a1a1a !important;color:#f7f5f2 !important");
    expect(html).toContain("border-color:#3a3a3a !important");
    expect(html).toContain(".ne-cta{background:#bf360c !important;color:#ffffff !important");
  });

  it("deja el papel claro en inline para los clientes que ignoran el style", () => {
    const html = layout("Cierre", "<p>Hola</p>");
    expect(html).toContain("background:#f7f5f2");
    expect(html).toContain("color:#1a1a1a");
    expect(html).toContain("max-width:600px");
    expect(documento_papel("Cierre", "<p>Hola</p>")).toContain("<html");
  });

  it("el CTA tiene 44px de alto, llama con blanco y bloque a lo ancho", () => {
    const conCta = CON_PIE.find((p) => etiquetas(p.html, "a").some((t) => t.includes("ne-cta")));
    const cta = etiquetas(conCta?.html ?? "", "a").find((t) => t.includes("ne-cta"));
    expect(cta).toBeDefined();
    expect(estilo(cta ?? "")).toContain("display:block");
    expect(estilo(cta ?? "")).toContain("background:#bf360c");
    expect(estilo(cta ?? "")).toContain("color:#fff");
    const alto = px(cta ?? "", "padding") * 2 + px(cta ?? "", "line-height");
    expect(alto).toBeGreaterThanOrEqual(44);
  });
});

describe("Papel del email: toda plantilla pasa por el contenedor (DS-S21)", () => {
  for (const p of CON_PIE) {
    it(`${p.nombre}: color-scheme, dark, 600px y cuerpo legible`, () => {
      expect(p.html, p.nombre).toContain('<meta name="color-scheme" content="light dark">');
      expect(p.html, p.nombre).toContain("<meta name=\"supported-color-schemes\"");
      expect(p.html, p.nombre).toContain("@media (prefers-color-scheme: dark)");
      expect(p.html, p.nombre).toContain("max-width:600px");
      const papel = etiquetas(p.html, "div").find((t) => t.includes("ne-papel"));
      expect(papel, p.nombre).toBeDefined();
      expect(px(papel ?? "", "font-size"), p.nombre).toBeGreaterThanOrEqual(14);
    });

    it(`${p.nombre}: sin imagenes salvo logo`, () => {
      for (const img of etiquetas(p.html, "img")) expect(img.toLowerCase(), p.nombre).toContain("logo");
    });

    it(`${p.nombre}: tablas que entran a 360px`, () => {
      for (const t of etiquetas(p.html, "table")) {
        expect(t, p.nombre).toContain("width:100%");
        expect(t, p.nombre).toContain("table-layout:fixed");
        expect(t, p.nombre).toContain('cellpadding="0"');
      }
    });
  }

  it("los CTA de cada plantilla son llama con blanco y 44px de alto", () => {
    for (const p of CON_PIE) {
      for (const a of etiquetas(p.html, "a").filter((t) => t.includes("ne-cta"))) {
        expect(estilo(a), p.nombre).toContain("background:#bf360c");
        expect(estilo(a), p.nombre).toMatch(/color:#fff\b/);
        expect(px(a, "padding") * 2 + px(a, "line-height"), p.nombre).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("el contenedor papel vive en un solo archivo", () => {
    const conContenedor = readdirSync(join(RAIZ, "src/modules/email"))
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => readFileSync(join(RAIZ, "src/modules/email", f), "utf8").includes("max-width:600px"))
      .filter((f) => f !== "papel.ts");
    expect(conContenedor).toEqual([]);
  });
});