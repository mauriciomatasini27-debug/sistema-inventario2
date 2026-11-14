import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accesos, audience, business, checklist, circuito, contraste, contactConfigured, crecer, despues, ejemplo, faq, fiscal, garantia, howWeWork, migracion, nav, parseUtm, planesPage, seo, whatsappWithUtm, path as camino } from "../src/data/business.js";

const src = (...p: string[]) => readFileSync(join(process.cwd(), "src", ...p), "utf8");

// PRD-LP-01 + ADR-0010: landing Inventario, 8 secciones, fuente única, Formspree.
describe("landing LP-S1/S7 (ADR-0010)", () => {
  it("LP-S2: business.ts respeta el contrato (marca, hero, contacto, planes)", () => {
    expect(business.marca).toBe("Inventario");
    expect(business.heroTitulo).toBe("Stock en tiempo real");
    expect(business.heroSubtitulo).toContain("1 almacén");
    expect(business.heroSubtitulo).toContain("2 cajas");
    expect(business.contacto.formspreeIdEnv).toBe("PUBLIC_FORMSPREE_FORM_ID");
    expect(business.contacto.wa).toMatch(/^https:\/\/wa\.me\//);
    expect(business.contacto.email).toContain("@");
    for (const plan of business.planes) {
      expect(plan.nombre.length).toBeGreaterThan(0);
      expect(plan.precioUnico.length).toBeGreaterThan(0);
    }
  });

  it("LP-S5: cero $ con Plus en Precio a confirmar y features sin $", () => {
    const conPesos = business.planes.filter((p) => p.precioUnico.includes("$"));
    expect(conPesos).toHaveLength(0);
    const plus = business.planes.find((p) => p.nombre === "Plus");
    expect(plus?.precioUnico).toBe("Precio a confirmar");
    for (const plan of business.planes) {
      for (const f of plan.features) {
        expect(f, plan.nombre).not.toContain("$");
      }
    }
    expect(src("data/business.ts")).not.toContain("$29.000");
  });

  it("AD-S3/AD-S10: sin GalaxyGroup, Odoo ni fiscal AR en la landing", () => {
    const archivos = [
      "data/business.ts",
      "pages/index.astro",
      "components/sections/Hero.astro",
      "components/sections/Problema.astro",
      "components/sections/Solucion.astro",
      "components/sections/Camino.astro",
      "components/sections/Planes.astro",
      "components/sections/Publico.astro",
      "components/sections/ComoTrabajamos.astro",
      "components/sections/Contacto.astro",
    ];
    for (const a of archivos) {
      const c = src(a);
      expect(c, a).not.toMatch(/GalaxyGroup/i);
      expect(c, a).not.toMatch(/Odoo/i);
      expect(c, a).not.toMatch(/fiscal AR/i);
      expect(c, a).not.toMatch(/155\.000/);
    }
  });

  it("LP-S1: index.astro ensambla las 8 secciones en orden", () => {
    const index = src("pages/index.astro");
    const orden = [
      "<Hero",
      "<Problema",
      "<Solucion",
      "<Camino",
      "<Planes",
      "<Publico",
      "<ComoTrabajamos",
      "<Contacto",
    ];
    let pos = -1;
    for (const tag of orden) {
      const i = index.indexOf(tag);
      expect(i, tag).toBeGreaterThan(pos);
      pos = i;
    }
  });

  it("AT2: Button siempre renderiza <a> (nunca <button>)", () => {
    const btn = src("components/ui/Button.astro");
    expect(btn).toContain("<a ");
    expect(btn).not.toContain("<button");
  });

  it("Section solo acepta SectionVariant definido en business.ts", () => {
    const section = src("components/ui/Section.astro");
    expect(section).toContain("import type { SectionVariant } from '../../data/business'");
    expect(section).toContain("variant?: SectionVariant");
    expect(src("data/business.ts")).toContain(
      'export type SectionVariant = "dark" | "linen" | "white"',
    );
  });

  it("LP-S6: Contacto usa Formspree con redirect /?enviado=1#contacto y fallback mailto", () => {
    const contacto = src("components/sections/Contacto.astro");
    expect(contacto).toContain("PUBLIC_FORMSPREE_FORM_ID");
    expect(contacto).toContain("https://formspree.io/f/${formId}");
    expect(contacto).toContain("/?enviado=1#contacto");
    expect(contacto).toContain("mailto:");
    expect(contacto).toContain("_gotcha");
  });
});

// PRD-LP-02 + ADR-0021: iteración contenido, 8 secciones intactas.
describe("landing LP2 (ADR-0021)", () => {
  it("LP2-S1: cada plan lista 3-4 features sin $ nuevos", () => {
    for (const plan of business.planes) {
      expect(plan.features.length).toBeGreaterThanOrEqual(3);
      expect(plan.features.length).toBeLessThanOrEqual(4);
      for (const f of plan.features) {
        expect(f, plan.nombre).not.toContain("$");
      }
    }
    const planes = src("components/sections/Planes.astro");
    expect(planes).toContain("plan.features");
  });

  it("LP2-S3/S4: Público con No y FAQ kiosco desde business.ts", () => {
    expect(audience.no.length).toBeGreaterThanOrEqual(3);
    // ADR-0022 E12-R3: FAQ suma datos y salida (7).
    expect(faq.items.length).toBeGreaterThanOrEqual(4);
    expect(faq.items.length).toBeLessThanOrEqual(8);
    for (const item of faq.items) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
    }
    const faqComp = src("components/sections/Faq.astro");
    expect(faqComp).toContain("faq.items");
    expect(faqComp).not.toMatch(/Odoo/i);
    // E13-R4: FAQ propio; Contacto queda solo contacto+newsletter.
    expect(src("components/sections/Contacto.astro")).not.toContain("faq.items");
  });

  it("LP2-S5: newsletter como segundo form con redirect propio", () => {
    const contacto = src("components/sections/Contacto.astro");
    expect(contacto).toContain("PUBLIC_NEWSLETTER_FORM_ID");
    expect(contacto).toContain("/?newsletter=1#contacto");
    expect(contacto).toContain("newsletter-email");
  });

  it("LP2-S6: reveal on scroll con respeto a reduced-motion", () => {
    expect(src("styles/global.css")).toContain(".reveal");
    expect(src("styles/global.css")).toContain("prefers-reduced-motion");
    expect(src("layouts/BaseLayout.astro")).toContain("IntersectionObserver");
  });
});

// PRD Gaps B0 + ADR-0022 (E8 SEO base, E13 higiene).
describe("landing Gaps B0 (ADR-0022)", () => {
  it("E8-R2: seo canónico con largos aptos para WhatsApp", () => {
    expect(seo.site.startsWith("https://")).toBe(true);
    expect(seo.title.length).toBeGreaterThan(0);
    expect(seo.title.length).toBeLessThanOrEqual(70);
    expect(seo.description.length).toBeGreaterThanOrEqual(50);
    expect(seo.description.length).toBeLessThanOrEqual(200);
    expect(seo.ogImage.startsWith("/")).toBe(true);
    expect(seo.ogImage).toMatch(/\.(png|jpg|jpeg)$/);
    expect(seo.locale).toBe("es_AR");
  });

  it("E8-R1: BaseLayout emite canonical, OG image, twitter, skip-link y noindex", () => {
    const layout = src("layouts/BaseLayout.astro");
    expect(layout).toContain("canonical");
    expect(layout).toContain("og:image");
    expect(layout).toContain("og:url");
    expect(layout).toContain("twitter:card");
    expect(layout).toContain("skip-link");
    expect(layout).toContain("noindex");
  });

  it("E8-R3: site no apunta a localhost", () => {
    expect(readFileSync(join(process.cwd(), "astro.config.mjs"), "utf8")).not.toContain(
      "localhost:4321",
    );
    const index = src("pages/index.astro");
    expect(index).toContain("seo");
    expect(index).toContain("canonical");
  });

  it("E13-R1: placeholders no se muestran como contacto real", () => {
    expect(typeof contactConfigured).toBe("boolean");
    const contacto = src("components/sections/Contacto.astro");
    expect(contacto).toContain("contactConfigured");
    expect(contacto).toContain("en configuración");
  });

  it("E13-R2/R3: precios con moneda y validez, sin jerga SaaS", () => {
    expect(planesPage.title).not.toContain("SaaS");
    expect(planesPage.nota).toContain("ARS");
    expect(planesPage.nota).toContain("20 días");
  });

  it("E13-R5: error de formulario visible + doble env var documentada", () => {
    const contacto = src("components/sections/Contacto.astro");
    expect(contacto).toContain("err.removeAttribute('hidden')");
    expect(business.contacto.newsletterFormIdEnv).toBe("PUBLIC_NEWSLETTER_FORM_ID");
  });
});

// PRD Gaps B1 + ADR-0022 (E9 UTM, E10 nav/app-noindex).
describe("landing Gaps B1 (ADR-0022)", () => {
  it("E9: parseUtm filtra solo claves permitidas y whatsappWithUtm firma source", () => {
    expect(parseUtm("?utm_source=ig&utm_medium=x&foo=1&email=a@b.c")).toBe(
      "utm_source=ig&utm_medium=x",
    );
    expect(parseUtm("")).toBe("");
    const href = whatsappWithUtm("hero");
    expect(href.startsWith("https://wa.me/")).toBe(true);
    expect(href).toContain(encodeURIComponent("vengo de hero"));
  });

  it("E9: Hero, Contacto y Floating reescriben href con UTM y data-cta", () => {
    for (const [a, cta] of [
      ["components/sections/Hero.astro", 'data-cta="hero-whatsapp"'],
      ["components/sections/Contacto.astro", 'data-cta="contacto-whatsapp"'],
      ["components/ui/ChatLanding.astro", 'data-cta="chat-whatsapp"'],
    ] as const) {
      const c = src(a);
      expect(c, a).toContain("whatsappWithUtm");
      expect(c, a).toContain(cta);
    }
  });

  it("E10: nav solo anclas, brand a / y CTA en header", () => {
    // ADR-0030: accesos Mi comercio/Admin como CTAs a login?next= fuera del nav.
    expect(nav.map((n) => n.href)).toEqual(["#checklist", "#camino", "#planes", "#contacto"]);
    const header = src("components/ui/SiteHeader.astro");
    expect(header).toContain('href="/"');
    expect(header).not.toContain('href="#"');
    expect(header).toContain("#contacto");
  });

  it("E10: panel y venta con noindex", () => {
    expect(src("components/panel/PanelShell.astro")).toContain('name="robots" content="noindex, nofollow"');
    expect(src("pages/panel.astro")).toContain("PanelShell");
    expect(src("pages/venta.astro")).toContain('name="robots" content="noindex, nofollow"');
  });
});

// PRD Gaps E1-E3 + ADR-0022 (arco espejo kiosco).
describe("landing Gaps E1-E3 (ADR-0022)", () => {
  it("E1: ejemplo ficticio con 3 señales", () => {
    expect(ejemplo.fictitious).toMatch(/ficticio/i);
    expect(ejemplo.signs.length).toBeGreaterThanOrEqual(3);
    const comp = src("components/sections/Ejemplo.astro");
    expect(comp).toContain("ejemplo.signs");
    expect(comp).toContain("ejemplo.closing");
  });

  it("E2: contraste con 4 pares hoy/con", () => {
    expect(contraste.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of contraste.rows) {
      expect(row.hoy.length).toBeGreaterThan(0);
      expect(row.con.length).toBeGreaterThan(0);
    }
  });

  it("E3: circuito con 5 pasos", () => {
    expect(circuito.steps.length).toBe(5);
  });

  it("E1-E3: index ensambla Problema < Ejemplo < Contraste < Circuito < Solucion", () => {
    const index = src("pages/index.astro");
    const orden = ["<Problema", "<Ejemplo", "<Contraste", "<Circuito", "<Solucion"];
    let pos = -1;
    for (const tag of orden) {
      const i = index.indexOf(tag);
      expect(i, tag).toBeGreaterThan(pos);
      pos = i;
    }
  });
});

// PRD Gaps E11-E12 + ADR-0022 (confianza comercial).
describe("landing Gaps E11-E12 (ADR-0022)", () => {
  it("E11: migración acotada con prueba y cotización", () => {
    expect(migracion.detail).toContain("prueba");
    expect(migracion.detail).toContain("cotiza");
    expect(src("components/sections/Migracion.astro")).toContain("migracion.detail");
  });

  it("E11: fiscal con contador y ambiente de prueba", () => {
    expect(`${fiscal.lead} ${fiscal.detail}`).toContain("contador");
    expect(`${fiscal.lead} ${fiscal.detail}`).toContain("prueba");
    expect(src("components/sections/Fiscal.astro")).toContain("fiscal.detail");
  });

  it("E12: alcance cerrado, hitos, tu parte y horas", () => {
    expect(howWeWork.rules.length).toBe(4);
    expect(howWeWork.rules.join(" ")).toContain("queda fuera");
    expect(howWeWork.rules.join(" ")).toContain("cotiza");
    expect(camino.footnote).toContain("20 días");
  });

  it("E12: FAQ cubre datos y salida; Público muestra lead de crecimiento", () => {
    expect(faq.items.some((i) => i.q.includes("datos"))).toBe(true);
    expect(faq.items.some((i) => i.q.includes("no sigo"))).toBe(true);
    expect(audience.lead).toContain("anota");
    expect(src("components/sections/Publico.astro")).toContain("audience.lead");
  });

  it("E11: index ensambla Planes < Migracion < Fiscal < Publico", () => {
    const index = src("pages/index.astro");
    const orden = ["<Planes", "<Migracion", "<Fiscal", "<Publico"];
    let pos = -1;
    for (const tag of orden) {
      const i = index.indexOf(tag);
      expect(i, tag).toBeGreaterThan(pos);
      pos = i;
    }
  });
});

// PRD Gaps E4+E5+E7 + ADR-0022 (demo con agenda, garantía, después/crecer).
describe("landing Gaps E4+E5+E7 (ADR-0022)", () => {
  it("E4: ausencia de descubrimiento con alta por plan", () => {
    expect(src("data/business.ts")).not.toContain("descubrimiento");
    expect(src("data/business.ts")).not.toContain("Descubrimiento");
    const index = src("pages/index.astro");
    expect(index).not.toContain("Descubrimiento");
    expect(index).not.toContain("descubrimiento");
    const planes = src("components/sections/Planes.astro");
    expect(planes).toContain("/alta?plan");
    expect(planes).toContain("Probar 14 días");
    expect(planes).toContain("plan.precioUnico");
    expect(planes).not.toContain("#contacto");
  });

  it("E5: garantía con validez", () => {
    expect(garantia.detail).toContain("20 días");
    expect(src("components/sections/Garantia.astro")).toContain("garantia.detail");
  });

  it("E7: después y crecer con encuadre", () => {
    expect(despues.detail).toContain("no es soporte");
    expect(crecer.detail).toContain("cotiza");
  });

  it("E4+E5+E7: index ensambla Solucion < Checklist < Camino y ComoTrabajamos < Despues < Crecer < Garantia < Contacto", () => {
    const index = src("pages/index.astro");
    for (const orden of [
      ["<Solucion", "<Checklist", "<Camino"],
      ["<ComoTrabajamos", "<Despues", "<Crecer", "<Garantia", "<Contacto"],
    ]) {
      let pos = -1;
      for (const tag of orden) {
        const i = index.indexOf(tag);
        expect(i, tag).toBeGreaterThan(pos);
        pos = i;
      }
    }
  });
});

// PRD Gaps E6 + ADR-0022 (lead-magnet checklist + FAQ propio).
describe("landing Gaps E6 (ADR-0022)", () => {
  it("E6: checklist con 5 tildes y CTA a contacto", () => {
    expect(checklist.items.length).toBe(5);
    expect(checklist.cta.length).toBeGreaterThan(0);
    const comp = src("components/sections/Checklist.astro");
    expect(comp).toContain("checklist.items");
    expect(comp).toContain('href="#contacto"');
  });

  it("E6: Hero y nav enlazan al checklist", () => {
    expect(src("components/sections/Hero.astro")).toContain('href="#checklist"');
    expect(nav[0]?.href).toBe("#checklist");
  });

  it("E13-R4: FAQ propio con details/summary entre Garantia y Contacto", () => {
    const comp = src("components/sections/Faq.astro");
    expect(comp).toContain("<details");
    expect(comp).toContain("faq.items");
    const index = src("pages/index.astro");
    const orden = ["<Solucion", "<Checklist", "<Garantia", "<Faq", "<Contacto"];
    let pos = -1;
    for (const tag of orden) {
      const i = index.indexOf(tag);
      expect(i, tag).toBeGreaterThan(pos);
      pos = i;
    }
  });

  it("AT2: ningún $ en sections fuera de Planes.astro", () => {
    const dir = join(process.cwd(), "src", "components", "sections");
    const files = readdirSync(dir).filter((f) => f.endsWith(".astro") && f !== "Planes.astro");
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const c = readFileSync(join(dir, f), "utf8");
      // Precio visible: $ seguido de dígito. Excluye ${...} y anclas regex /$/.
      expect(c, f).not.toMatch(/\$\s*\d/);
    }
    expect(src("components/sections/Planes.astro")).toContain("plan.precioUnico");
  });
});

// PRD-LP-03 + ADR-0030: accesos a la app desde la landing (R3).
describe("landing LP3 (ADR-0030)", () => {
  it("LP3-S3: accesos con labels y hrefs de login con destino", () => {
    expect(accesos.comercio).toEqual({ label: "Mi comercio", href: "/api/auth/login?next=/panel" });
    expect(accesos.admin).toEqual({ label: "Admin", href: "/api/auth/login?next=/admin" });
  });

  it("AT1: business.ts única fuente de accesos (ningún .astro hardcodea labels ni hrefs)", () => {
    for (const a of ["components/ui/SiteHeader.astro", "components/sections/Hero.astro"] as const) {
      const c = src(a);
      expect(c, a).toContain("accesos.");
      expect(c, a).not.toContain("/api/auth/login");
      expect(c, a).not.toContain("Mi comercio");
    }
  });

  it("AT2: accesos vía Button (<a>) sin <button> en header ni hero", () => {
    for (const a of ["components/ui/SiteHeader.astro", "components/sections/Hero.astro"] as const) {
      expect(src(a), a).not.toContain("<button");
    }
    expect(src("components/sections/Hero.astro")).toContain('variant="ghost-light"');
  });

  it("AT3: ningún href a /panel, /admin o login dentro del nav de anclas", () => {
    for (const n of nav) {
      expect(n.href.startsWith("#"), n.href).toBe(true);
    }
    const header = src("components/ui/SiteHeader.astro");
    const navBlock = header.slice(header.indexOf("<nav"), header.indexOf("</nav>"));
    expect(navBlock).toContain("nav.map");
    expect(navBlock).not.toContain('href="');
    expect(navBlock).not.toContain("/api/auth/login");
    expect(navBlock).not.toContain("/panel");
    expect(navBlock).not.toContain("/admin");
  });

  it("LP3-S1/S2: header con Pedir demo, Mi comercio y Admin fuera del nav", () => {
    const header = src("components/ui/SiteHeader.astro");
    expect(header).toContain("Pedir demo");
    expect(header).toContain("accesos.comercio");
    expect(header).toContain("accesos.admin");
    const afterNav = header.slice(header.indexOf("</nav>"));
    expect(afterNav).toContain("accesos.comercio");
    expect(afterNav).toContain("accesos.admin");
  });

  it("LP3-S4: hero con fila secundaria de accesos ghost-light", () => {
    const heroC = src("components/sections/Hero.astro");
    expect(heroC).toContain("accesos.comercio");
    expect(heroC).toContain("accesos.admin");
    expect(heroC).toContain('variant="ghost-light"');
  });

  it("LP3-S5: alta/estado Entrar apunta a /panel", () => {
    const estado = src("pages/alta/estado.astro");
    expect(estado).toContain("Entrar a mi comercio");
    expect(estado).toContain('href="/panel"');
  });

  it("ON1.5: Verificar después entra al comercio (/panel), no a la landing", () => {
    const estado = src("pages/alta/estado.astro");
    expect(estado).toContain("Verificar después");
    expect(estado).toMatch(/\$\("despues"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*location\.href\s*=\s*"\/panel"/);
    expect(estado).not.toMatch(/\$\("despues"\)\.onclick\s*=\s*\(\)\s*=>\s*\{\s*location\.href\s*=\s*"\/"/);
  });
});
