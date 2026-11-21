import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { business, contact } from "../src/data/business.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

const PAGINAS = [
  {
    archivo: "src/pages/privacidad.astro",
    ruta: "/privacidad",
    titulo: "Política de privacidad",
    textos: ["A los 90 días del cierre", "Revocamos en Google", "7 días antes del borrado", "anonimizados", "los pagos y las órdenes de pago a proveedores, con su historial y los datos del beneficiario", "Proveedor eliminado", "no se borran automáticamente", "desde el 21 de noviembre de 2026", "10 días corridos", "5 días hábiles"],
  },
  {
    archivo: "src/pages/terminos.astro",
    ruta: "/terminos",
    titulo: "Términos de servicio",
    textos: ["desde el 21 de noviembre de 2026"],
  },
  {
    archivo: "src/pages/eliminar-datos.astro",
    ruta: "/eliminar-datos",
    titulo: "Eliminar datos",
    textos: ["dentro de las 48 horas de verificado", "5 días hábiles", "sección Plan"],
  },
] as const;

describe("páginas legales (privacidad, términos y eliminación de datos)", () => {
  it("las tres páginas existen, son estáticas y usan BaseLayout", () => {
    for (const pagina of PAGINAS) {
      expect(existsSync(join(RAIZ, pagina.archivo)), pagina.archivo).toBe(true);
      const src = leer(pagina.archivo);
      expect(src, pagina.archivo).toContain("export const prerender = true");
      expect(src, pagina.archivo).toContain("BaseLayout");
      expect(src, pagina.archivo).toContain("canonical={");
      expect(src, pagina.archivo).toContain("seo.site");
    }
  });

  it("cada página define su título y lo pasa al layout y al h1", () => {
    for (const pagina of PAGINAS) {
      const src = leer(pagina.archivo);
      expect(src, pagina.archivo).toContain(`const titulo = '${pagina.titulo}'`);
      expect(src, pagina.archivo).toContain("<BaseLayout {title}");
      expect(src, pagina.archivo).toMatch(/<h1[^>]*>\{titulo\}<\/h1>/);
    }
  });

  it("publica plazos y vigencia confirmados, sin placeholders en el texto", () => {
    for (const pagina of PAGINAS) {
      const src = leer(pagina.archivo);
      for (const texto of pagina.textos) {
        expect(src, `${pagina.archivo}: ${texto}`).toContain(texto);
      }
      expect(src, pagina.archivo).not.toMatch(/\[COMPLETAR: (plazo|fecha)/);
    }
  });

  it("toma nombre y contacto de business.ts, sin hardcodearlos", () => {
    for (const pagina of PAGINAS) {
      const src = leer(pagina.archivo);
      expect(src, pagina.archivo).toContain("business.marca");
      expect(src, pagina.archivo).toContain("contact.email");
      expect(src, pagina.archivo).toContain("business.contacto.telefono");
      expect(src, pagina.archivo).toContain("contact.whatsapp");
      expect(src, pagina.archivo).not.toContain(contact.email);
      expect(src.toLowerCase(), pagina.archivo).not.toContain("razón social");
    }
    expect(business.marca.length).toBeGreaterThan(0);
  });

  it("el footer de la landing enlaza las tres páginas", () => {
    const footer = leer("src/components/sections/Contacto.astro");
    for (const pagina of PAGINAS) {
      expect(footer, pagina.ruta).toContain(`href="${pagina.ruta}"`);
    }
    expect(footer).toContain('aria-label="Información legal"');
  });
});
