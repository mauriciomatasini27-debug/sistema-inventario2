import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accesos, beatPorId, business, contactConfigured, ctaAltaLabel, ctaPrueba, landingBeats, nav, parseUtm, seo, whatsappWithUtm } from "../src/data/business.js";

const BEAT_IDS = [
  "inicio",
  "problema",
  "ejemplo",
  "contraste",
  "circuito",
  "planes",
  "checklist",
  "migracion",
  "fiscal",
  "publico",
  "despues",
  "faq",
  "contacto",
] as const;

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
      "components/sections/Contraste.astro",
      "components/sections/Planes.astro",
      "components/sections/Publico.astro",
      "components/sections/Nota.astro",
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

  it("LP-S1: index.astro ensambla los 13 beats en orden", () => {
    expect(landingBeats.map((b) => b.id)).toEqual([...BEAT_IDS]);
    const index = src("pages/index.astro");
    expect(index).toContain("landingBeats.map");
    expect(index).not.toContain("Solucion");
    expect(index).not.toContain("Camino");
    expect(index).not.toContain("ComoTrabajamos");
    expect(index).not.toContain("Crecer");
    expect(index).not.toContain("Garantia");
  });

  it("LAND-S11: skip-link y chat usan los tokens de color", () => {
    for (const a of ["layouts/BaseLayout.astro", "components/ui/ChatLanding.astro"] as const) {
      const c = src(a);
      expect(c, a).not.toContain("#1a1a1a");
      expect(c, a).not.toContain("#fff");
      expect(c, a).toContain("var(--color-void)");
      expect(c, a).toContain("var(--color-star-white)");
    }
    expect(src("components/ui/ChatLanding.astro")).toContain("var(--color-galaxy-deep)");
  });

  it("LAND-TYPE: roles tipográficos display > sección > tarjeta > overline", () => {
    const css = src("styles/global.css");
    for (const rol of [
      "landing-display",
      "landing-section-title",
      "landing-card-title",
      "landing-overline",
      "landing-lead",
    ]) {
      expect(css, rol).toContain(`.${rol}`);
    }
    expect(css).toMatch(/--text-heading:\s*1\.75rem/);
    expect(css).toMatch(/--text-subheading:\s*1\.25rem/);
    expect(src("components/ui/SectionHeading.astro")).toContain("landing-section-title");
    expect(src("components/ui/SectionHeading.astro")).toContain("landing-card-title");
    expect(src("components/sections/Hero.astro")).toContain("landing-display");
    expect(src("components/sections/Hero.astro")).toContain("landing-overline");
    expect(src("components/sections/Planes.astro")).toContain("landing-card-title");
    expect(src("components/sections/Planes.astro")).not.toMatch(
      /plan\.precioUnico[\s\S]*text-heading/,
    );
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
    const publico = beatPorId("publico");
    const faq = beatPorId("faq");
    expect(publico.no.length).toBeGreaterThanOrEqual(3);
    // ADR-0022 E12-R3: FAQ suma datos y salida (7).
    expect(faq.items.length).toBeGreaterThanOrEqual(4);
    expect(faq.items.length).toBeLessThanOrEqual(8);
    for (const item of faq.items) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(0);
    }
    const faqComp = src("components/sections/Faq.astro");
    expect(faqComp).toContain("beat.items");
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
    const oferta = beatPorId("planes");
    expect(oferta.title).not.toContain("SaaS");
    expect(oferta.nota).toContain("ARS");
    expect(oferta.nota).toContain("20 días");
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

  it("E9: Contacto y el chat reescriben href con UTM y data-cta", () => {
    for (const [a, cta] of [
      ["components/sections/Contacto.astro", 'data-cta="contacto-whatsapp"'],
      ["components/ui/ChatLanding.astro", 'data-cta="chat-whatsapp"'],
    ] as const) {
      const c = src(a);
      expect(c, a).toContain("whatsappWithUtm");
      expect(c, a).toContain(cta);
    }
    const hero = src("components/sections/Hero.astro");
    expect(hero).not.toContain("whatsappWithUtm");
    expect(hero).not.toContain("mailto:");
    expect(hero).not.toContain('data-cta="hero-whatsapp"');
  });

  it("E10: nav solo anclas, brand a / y CTA en header", () => {
    // ADR-0030: accesos Mi comercio/Admin como CTAs a login?next= fuera del nav.
    expect(nav.map((n) => n.href)).toEqual(["#circuito", "#planes", "#faq", "#contacto"]);
    const header = src("components/ui/SiteHeader.astro");
    expect(header).toContain('href="/"');
    expect(header).not.toContain('href="#"');
    expect(header).toContain("ctaPrueba.href");
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
    const ejemplo = beatPorId("ejemplo");
    expect(ejemplo.fictitious).toMatch(/ficticio/i);
    expect(ejemplo.signs.length).toBeGreaterThanOrEqual(3);
    const comp = src("components/sections/Ejemplo.astro");
    expect(comp).toContain("beat.signs");
    expect(comp).toContain("beat.closing");
  });

  it("E2: contraste con 4 pares hoy/con y los highlights", () => {
    const contraste = beatPorId("contraste");
    expect(contraste.rows.length).toBeGreaterThanOrEqual(4);
    for (const row of contraste.rows) {
      expect(row.hoy.length).toBeGreaterThan(0);
      expect(row.con.length).toBeGreaterThan(0);
    }
    expect(contraste.highlights).toHaveLength(4);
    expect(src("components/sections/Contraste.astro")).toContain("beat.highlights");
  });

  it("E3: circuito con 5 pasos", () => {
    expect(beatPorId("circuito").steps.length).toBe(5);
  });

  it("E1-E3: el orden queda problema, ejemplo, contraste, circuito, planes", () => {
    const ids = landingBeats.map((b) => b.id);
    const orden = ["problema", "ejemplo", "contraste", "circuito", "planes"] as const;
    let pos = -1;
    for (const id of orden) {
      const i = ids.indexOf(id);
      expect(i, id).toBeGreaterThan(pos);
      pos = i;
    }
  });
});

// PRD Gaps E11-E12 + ADR-0022 (confianza comercial).
describe("landing Gaps E11-E12 (ADR-0022)", () => {
  it("E11: migración acotada con prueba y cotización", () => {
    const migracion = beatPorId("migracion");
    expect(migracion.detail).toContain("prueba");
    expect(migracion.detail).toContain("cotiza");
    expect(src("components/sections/Nota.astro")).toContain("beat.detail");
  });

  it("E11: fiscal con contador y ambiente de prueba", () => {
    const fiscal = beatPorId("fiscal");
    expect(`${fiscal.lead} ${fiscal.detail}`).toContain("contador");
    expect(`${fiscal.lead} ${fiscal.detail}`).toContain("prueba");
    expect(src("components/sections/Nota.astro")).toContain("beat.detail");
  });

  it("E12: alcance cerrado, hitos, tu parte y horas", () => {
    const reglas = beatPorId("migracion").reglas;
    expect(reglas.length).toBe(4);
    expect(reglas.join(" ")).toContain("queda fuera");
    expect(reglas.join(" ")).toContain("cotiza");
    const empezar = beatPorId("planes").empezar;
    expect(empezar.steps.map((s) => s.title)).toEqual(["Alta", "Prueba 14 días", "Elegir plan"]);
    expect(src("data/business.ts")).not.toContain("Propuesta válida");
  });

  it("E12: FAQ cubre datos y salida; Público muestra lead de crecimiento", () => {
    const faq = beatPorId("faq");
    expect(faq.items.some((i) => i.q.includes("datos"))).toBe(true);
    expect(faq.items.some((i) => i.q.includes("no sigo"))).toBe(true);
    expect(beatPorId("publico").lead).toContain("anota");
    expect(src("components/sections/Publico.astro")).toContain("beat.lead");
  });

  it("E11: planes queda antes de migración, fiscal y público", () => {
    const ids = landingBeats.map((b) => b.id);
    const orden = ["planes", "migracion", "fiscal", "publico"] as const;
    let pos = -1;
    for (const id of orden) {
      const i = ids.indexOf(id);
      expect(i, id).toBeGreaterThan(pos);
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
    expect(planes).toContain("ctaAltaLabel");
    expect(ctaAltaLabel).toBe("Probar 14 días");
    expect(planes).toContain("plan.precioUnico");
    expect(planes).not.toContain("#contacto");
  });

  it("E5: la oferta muestra la baja libre", () => {
    expect(beatPorId("planes").garantia).toBe(
      "Sin permanencia, cancelás cuando quieras, tus datos quedan.",
    );
    expect(src("components/sections/Planes.astro")).toContain("beat.garantia");
    expect(beatPorId("planes").empezar.title).toBe("Cómo empezar");
    expect(src("components/sections/Planes.astro")).toContain("beat.empezar");
  });

  it("E7: después acompaña la salida y crecer no es una sección", () => {
    expect(beatPorId("despues").detail).toContain("no es soporte");
    expect(src("data/business.ts")).not.toContain("Para crecer después");
  });

  it("E4+E5+E7: planes, checklist, después, faq y contacto siguen en ese orden", () => {
    const ids = landingBeats.map((b) => b.id);
    const orden = ["planes", "checklist", "despues", "faq", "contacto"] as const;
    let pos = -1;
    for (const id of orden) {
      const i = ids.indexOf(id);
      expect(i, id).toBeGreaterThan(pos);
      pos = i;
    }
  });
});

// PRD Gaps E6 + ADR-0022 (lead-magnet checklist + FAQ propio).
describe("landing Gaps E6 (ADR-0022)", () => {
  it("E6: checklist con 5 tildes y CTA a contacto", () => {
    const checklist = beatPorId("checklist");
    expect(checklist.items.length).toBe(5);
    expect(checklist.cta.length).toBeGreaterThan(0);
    const comp = src("components/sections/Checklist.astro");
    expect(comp).toContain("beat.items");
    expect(comp).toContain('href="#contacto"');
  });

  it("E6: el hero no enlaza al checklist y el nav abre en el circuito", () => {
    expect(src("components/sections/Hero.astro")).not.toContain('href="#checklist"');
    expect(nav[0]?.href).toBe("#circuito");
    expect(nav.map((n) => n.href)).not.toContain("#checklist");
  });

  it("E13-R4: FAQ propio con details/summary entre después y contacto", () => {
    const comp = src("components/sections/Faq.astro");
    expect(comp).toContain("<details");
    expect(comp).toContain("beat.items");
    const ids = landingBeats.map((b) => b.id);
    const orden = ["despues", "faq", "contacto"] as const;
    let pos = -1;
    for (const id of orden) {
      const i = ids.indexOf(id);
      expect(i, id).toBeGreaterThan(pos);
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

  it("AT1: business.ts única fuente de accesos (el hero no los repite)", () => {
    const header = src("components/ui/SiteHeader.astro");
    expect(header).toContain("accesos.");
    expect(header).not.toContain("/api/auth/login");
    expect(header).not.toContain("Mi comercio");
    const hero = src("components/sections/Hero.astro");
    expect(hero).not.toContain("accesos.");
    expect(hero).not.toContain("/api/auth/login");
    expect(hero).not.toContain("Mi comercio");
  });

  it("AT2: accesos vía Button (<a>) sin <button> en header ni hero", () => {
    for (const a of ["components/ui/SiteHeader.astro", "components/sections/Hero.astro"] as const) {
      expect(src(a), a).not.toContain("<button");
    }
    expect(src("components/sections/Hero.astro")).toContain("ghost-light");
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

  it("LP3-S1/S2: header con la prueba, Mi comercio y Admin fuera del nav", () => {
    const header = src("components/ui/SiteHeader.astro");
    expect(header).toContain("ctaPrueba.label");
    expect(header).toContain("ctaPrueba.href");
    expect(ctaPrueba).toEqual({ label: "Probar 14 días", href: "#planes" });
    const llama = header.match(/<a\s+href=\{ctaPrueba\.href\}[\s\S]*?>/)?.[0] ?? "";
    expect(llama).toContain("sg-flame-cta");
    expect(header).toContain("accesos.comercio");
    expect(header).toContain("accesos.admin");
    const afterNav = header.slice(header.indexOf("</nav>"));
    expect(afterNav).toContain("accesos.comercio");
    expect(afterNav).toContain("accesos.admin");
    expect(afterNav).toContain("ctaPrueba");
  });

  it("LP3-S4: el hero no repite Mi comercio ni Admin", () => {
    const heroC = src("components/sections/Hero.astro");
    expect(heroC).not.toContain("accesos.comercio");
    expect(heroC).not.toContain("accesos.admin");
    expect(heroC).toContain("ghost-light");
    expect(heroC).toContain("beat.ctas");
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
