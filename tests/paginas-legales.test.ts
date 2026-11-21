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
    placeholders: [
      "[COMPLETAR: plazo de conservación]",
      "[COMPLETAR: fecha de vigencia]",
    ],
  },
  {
    archivo: "src/pages/terminos.astro",
    ruta: "/terminos",
    titulo: "Términos de servicio",
    placeholders: ["[COMPLETAR: fecha de vigencia]"],
  },
  {
    archivo: "src/pages/eliminar-datos.astro",
    ruta: "/eliminar-datos",
    titulo: "Eliminar datos",
    placeholders: ["[COMPLETAR: plazo de respuesta]"],
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

  it("deja placeholders visibles para los datos que no están confirmados", () => {
    for (const pagina of PAGINAS) {
      const src = leer(pagina.archivo);
      for (const placeholder of pagina.placeholders) {
        expect(src, `${pagina.archivo}: ${placeholder}`).toContain(placeholder);
      }
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
