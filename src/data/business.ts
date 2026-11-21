export type SectionVariant = "dark" | "linen" | "white";

export interface Contacto {
  telefono: string;
  email: string;
  wa: string;
  formspreeIdEnv: "PUBLIC_FORMSPREE_FORM_ID";
  newsletterFormIdEnv: "PUBLIC_NEWSLETTER_FORM_ID";
}

export interface Plan {
  id: "basico" | "plus" | "pro";
  nombre: string;
  precioUnico: string;
  destacado?: boolean;
  features: string[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface Business {
  marca: string;
  heroTitulo: string;
  heroSubtitulo: string;
  contacto: Contacto;
  planes: Plan[];
}

export const business: Business = {
  marca: "Inventario",
  heroTitulo: "Stock en tiempo real",
  heroSubtitulo: "1 almacén, 2 cajas y venta celular",
  contacto: {
    // E13-R1: teléfono y email reales 2026-10-12. wa de ejemplo con formato
    // móvil AR (549 + número). Confirmar que recibe WhatsApp antes del ship.
    telefono: "+54 3547 53-2008",
    email: "mauriciomatasini27@gmail.com",
    wa: "https://wa.me/5493547532008",
    formspreeIdEnv: "PUBLIC_FORMSPREE_FORM_ID",
    newsletterFormIdEnv: "PUBLIC_NEWSLETTER_FORM_ID",
  },
  planes: [
    {
      id: "basico",
      nombre: "Básico",
      precioUnico: "Consultar",
      features: [
        "Inventario, caja y venta desde el celular.",
        "Alertas de stock por email.",
        "Consultas de stock por WhatsApp, hasta 100 al mes.",
      ],
    },
    {
      id: "plus",
      nombre: "Plus",
      precioUnico: "Precio a confirmar",
      destacado: true,
      features: [
        "Todo lo de Básico, sin tope en las consultas de WhatsApp.",
        "Alertas de stock por WhatsApp.",
        "Bot adaptado a tu rubro.",
        "Asistente IA.",
      ],
    },
    {
      id: "pro",
      nombre: "Pro",
      precioUnico: "A medida",
      features: [
        "Todo lo de Plus.",
        "Armado a medida de tu negocio.",
        "Se cotiza aparte, según lo que necesites.",
      ],
    },
  ],
};

export const brand = {
  name: business.marca,
  tagline: "Sistema de inventario para kioscos y mostrador",
} as const;

export const contact = {
  email: business.contacto.email,
  whatsapp: business.contacto.wa,
  whatsappLabel: business.contacto.telefono,
  instagram: "https://instagram.com/inventario.kiosco",
  instagramLabel: "@inventario.kiosco",
} as const;

export const ctaPrueba = { label: "Probar 14 días", href: "#planes" } as const;
export const ctaDemo = { label: "Pedir demo", href: "#contacto" } as const;
export const ctaAltaLabel = "Probar 14 días" as const;

export type NavLabel = "Cómo funciona" | "Planes" | "Preguntas" | "Contacto";

const GARANTIA_BAJA = "Sin permanencia, cancelás cuando quieras, tus datos quedan." as const;

export type LandingBeat =
  | {
      tipo: "hero";
      id: "inicio";
      firma: string;
      titulo: string;
      subtitulo: string;
      ctas: readonly [typeof ctaPrueba, typeof ctaDemo];
    }
  | {
      tipo: "problema";
      id: "problema";
      variant: "linen";
      title: string;
      lead: string;
      pains: readonly string[];
      closing: string;
    }
  | {
      tipo: "ejemplo";
      id: "ejemplo";
      variant: "white";
      eyebrow: string;
      title: string;
      fictitious: string;
      body: string;
      signs: readonly string[];
      closing: string;
    }
  | {
      tipo: "contraste";
      id: "contraste";
      variant: "dark";
      title: string;
      lead: string;
      rows: readonly { hoy: string; con: string }[];
      highlights: readonly { title: string; detail: string }[];
    }
  | {
      tipo: "circuito";
      id: "circuito";
      variant: "linen";
      nav: "Cómo funciona";
      title: string;
      lead: string;
      steps: readonly string[];
    }
  | {
      tipo: "oferta";
      id: "planes";
      variant: "white";
      nav: "Planes";
      title: string;
      lead: string;
      nota: string;
      garantia: typeof GARANTIA_BAJA;
      empezar: {
        title: "Cómo empezar";
        lead: string;
        steps: readonly { step: string; title: string; detail: string }[];
      };
    }
  | {
      tipo: "checklist";
      id: "checklist";
      variant: "linen";
      title: string;
      lead: string;
      items: readonly string[];
      closing: string;
      cta: string;
    }
  | {
      tipo: "nota";
      id: "migracion";
      variant: "white";
      title: string;
      lead: string;
      detail: string;
      reglas: readonly string[];
    }
  | {
      tipo: "nota";
      id: "fiscal";
      variant: "linen";
      title: string;
      lead: string;
      detail: string;
    }
  | {
      tipo: "nota";
      id: "despues";
      variant: "linen";
      title: string;
      lead: string;
      detail: string;
    }
  | {
      tipo: "publico";
      id: "publico";
      variant: "white";
      title: string;
      lead: string;
      yesTitle: string;
      yes: readonly string[];
      noTitle: string;
      no: readonly string[];
    }
  | {
      tipo: "faq";
      id: "faq";
      variant: "white";
      nav: "Preguntas";
      title: string;
      lead: string;
      items: readonly FaqItem[];
    }
  | {
      tipo: "contacto";
      id: "contacto";
      variant: "dark";
      nav: "Contacto";
    };

export const landingBeats: readonly LandingBeat[] = [
  {
    tipo: "hero",
    id: "inicio",
    firma: `${business.marca} — sistema para kioscos y mostrador`,
    titulo: business.heroTitulo,
    subtitulo: business.heroSubtitulo,
    ctas: [ctaPrueba, ctaDemo],
  },
  {
    tipo: "problema",
    id: "problema",
    variant: "linen",
    title: "Cuando el kiosco se controla a ojo",
    lead: "Cuaderno, caja y stock desconectados hacen perder tiempo y plata en el mostrador.",
    pains: [
      "Stock desactualizado en el turno pico.",
      "Carga doble en caja y en planilla.",
      "Errores de precio en mostrador y reposición.",
      "Sin dato claro para reponer lo que más rota.",
    ],
    closing: "Con un local y equipo chico alcanza con una sola pantalla clara para caja y depósito.",
  },
  {
    tipo: "ejemplo",
    id: "ejemplo",
    variant: "white",
    eyebrow: "Un negocio como el tuyo",
    title: "Kiosco Lo de Marta",
    fictitious: "Ejemplo ficticio",
    body: "Una caja, el fiado en cuaderno y los precios en la memoria.",
    signs: ["1 caja en el mostrador", "Fiado anotado en cuaderno", "Precios de memoria"],
    closing: "Si te suena parecido, lo tuyo también se ordena.",
  },
  {
    tipo: "contraste",
    id: "contraste",
    variant: "dark",
    title: "Hoy vs con Inventario",
    lead: "Lo mismo que hacés hoy, sin el doble trabajo.",
    rows: [
      { hoy: "La lista, en el cuaderno", con: "El precio sale del sistema" },
      { hoy: "El precio, de memoria", con: "La caja descuenta del depósito sola" },
      { hoy: "El cierre, a mano", con: "El cierre de turno canta solo" },
      { hoy: "El fiado, en papelitos", con: "La cuenta de cada cliente queda anotada" },
    ],
    highlights: [
      { title: "Punto de venta", detail: "2 cajas en el mismo local." },
      { title: "Depósito único", detail: "1 almacén atado a cada venta." },
      { title: "Compras y contactos", detail: "Proveedores y reposición por mínimo." },
      { title: "Venta celular", detail: "Cobro desde el celular en vereda o reparto corto." },
    ],
  },
  {
    tipo: "circuito",
    id: "circuito",
    variant: "linen",
    nav: "Cómo funciona",
    title: "Tu mostrador en 5 pasos",
    lead: "Del reparto a la venta, sin papeles sueltos.",
    steps: [
      "Entra la mercadería al depósito.",
      "Pasás los precios al mostrador.",
      "Vendés en caja o con el celular.",
      "Cobrás o anotás el fiado.",
      "Cerrás el turno tranquilo.",
    ],
  },
  {
    tipo: "oferta",
    id: "planes",
    variant: "white",
    nav: "Planes",
    title: "Planes",
    lead: "Elegí según cuánto querés usar WhatsApp, el bot y el asistente.",
    nota: "Básico Consultar, Plus Precio a confirmar, Pro A medida.",
    garantia: GARANTIA_BAJA,
    empezar: {
      title: "Cómo empezar",
      lead: "Te das de alta, probás 14 días en el mostrador y después elegís el plan.",
      steps: [
        {
          step: "Paso 1",
          title: "Alta",
          detail: "Abrís el comercio con tu lista, tus precios y tus cajas.",
        },
        {
          step: "Paso 2",
          title: "Prueba 14 días",
          detail: "Vendés en ambiente de prueba, nunca en tu caja real.",
        },
        {
          step: "Paso 3",
          title: "Elegir plan",
          detail: "Te quedás con Básico, Plus o Pro según lo que necesites.",
        },
      ],
    },
  },
  {
    tipo: "checklist",
    id: "checklist",
    variant: "linen",
    title: "Tu mostrador en orden",
    lead: "Tildá lo que ya tenés hoy. Lo que falta es tu plan de demo.",
    items: [
      "Sé cuánto stock tengo ahora mismo.",
      "Mis precios salen del sistema, no de memoria.",
      "El cierre de turno me lleva minutos.",
      "El fiado de cada cliente está anotado.",
      "Repongo por mínimo, no a ojo.",
    ],
    closing: "Cada tilde que falta es una fuga. Traé tu checklist a la demo.",
    cta: "Pedir demo con mi checklist",
  },
  {
    tipo: "nota",
    id: "migracion",
    variant: "white",
    title: "Traé tu lista sin frenar la venta",
    lead: "Un finde pasamos tu lista y tu depósito; al día siguiente vendés.",
    detail: "Hasta 300 ítems, se valida en ambiente de prueba. Se cotiza aparte.",
    reglas: [
      "Alcance cerrado por escrito: qué entra y qué queda fuera.",
      "Hitos contra aceptación: se paga cuando funciona en prueba y en vivo.",
      "Tu parte: lista, precios y accesos a tiempo.",
      "8 h de ajustes y 6 h de capacitación incluidas; lo demás se cotiza aparte.",
    ],
  },
  {
    tipo: "nota",
    id: "fiscal",
    variant: "linen",
    title: "Facturar tranquilo, con tu contador",
    lead: "Probamos todo en ambiente de prueba, nunca en tu caja real.",
    detail:
      "Sin la firma de tu contador, nada sale en vivo. La facturación se coordina con tu contador por fuera.",
  },
  {
    tipo: "publico",
    id: "publico",
    variant: "white",
    title: "Para quién es",
    lead: "Arrancamos con un local de mostrador. Si después crecés, no te quedás afuera: se anota y se cotiza.",
    yesTitle: "Sí, si…",
    yes: [
      "Kiosco o almacén con mostrador y un solo local.",
      "Equipo chico con 2 cajas como máximo.",
      "Querés caja, stock y compras en un solo sistema.",
      "Vendés en local y con celular en vereda o reparto corto.",
    ],
    noTitle: "No, si…",
    no: [
      "Operás varios locales desde el día uno (se deja anotado para cuando llegue).",
      "Vendés online o querés conectar otro sistema (se cotiza aparte).",
      "No podés dedicar tiempo a cargar lista y stock inicial.",
    ],
  },
  {
    tipo: "nota",
    id: "despues",
    variant: "linen",
    title: "Después de salir en vivo",
    lead: "Te acompañamos al salir + 10 días de fallas.",
    detail: "El WhatsApp comercial no es soporte: después rigen las reglas de tu plan.",
  },
  {
    tipo: "faq",
    id: "faq",
    variant: "white",
    nav: "Preguntas",
    title: "Preguntas frecuentes",
    lead: "Puesta en marcha, cajas, celular y soporte — en claro.",
    items: [
      {
        q: "¿Cuánto tarda la puesta en marcha?",
        a: "Cargamos tu lista base, precios y usuarios de caja, y probamos una venta real en el mostrador antes de entregar.",
      },
      {
        q: "¿Puedo usar 2 cajas?",
        a: "Sí, en el mismo local, con un solo depósito atado a cada venta.",
      },
      {
        q: "¿Vendo con el celular?",
        a: "Sí, cobrás desde el celular en vereda o reparto corto, con la misma caja del local.",
      },
      {
        q: "¿Qué pasa con mi stock actual?",
        a: "Se carga como stock inicial junto con tu lista, sin frenar la venta del día.",
      },
      {
        q: "¿Qué incluye el soporte?",
        a: "Ayuda por mensaje en horario comercial según tu plan; la puesta en marcha incluye acompañamiento.",
      },
      {
        q: "¿Mis datos?",
        a: "Tuyos: tu lista, depósito y clientes quedan en tu sistema. Si te vas, te llevás tu información.",
      },
      {
        q: "¿Y si no sigo?",
        a: "Te llevás lo avanzado igual, sin ataduras ni letra chica.",
      },
    ],
  },
  {
    tipo: "contacto",
    id: "contacto",
    variant: "dark",
    nav: "Contacto",
  },
];

export function beatPorId<T extends LandingBeat["id"]>(id: T): Extract<LandingBeat, { id: T }> {
  const beat = landingBeats.find((b) => b.id === id);
  if (!beat || beat.id !== id) throw new Error(`beat ausente: ${id}`);
  return beat as Extract<LandingBeat, { id: T }>;
}

export const nav = landingBeats.flatMap((b) =>
  "nav" in b && b.nav ? [{ href: `#${b.id}` as const, label: b.nav }] : [],
);

export interface Acceso {
  label: string;
  href: string;
}

export interface Accesos {
  comercio: Acceso;
  admin: Acceso;
}

export const accesos: Accesos = {
  comercio: { label: "Mi comercio", href: "/api/auth/login?next=/panel" },
  admin: { label: "Admin", href: "/api/auth/login?next=/admin" },
};

export const footer = {
  contactLead: "Escribinos por formulario, email o WhatsApp.",
  newsletterLead: "Novedades de caja, stock y reposición — sin spam.",
  copyright: `© ${new Date().getFullYear()} Inventario. Sistema de inventario para kioscos.`,
} as const;

/** E13-R1: verdadero solo cuando el contacto real reemplaza los placeholders. */
export const contactConfigured = !(
  business.contacto.wa.includes("000000") || business.contacto.email.includes("example")
);

/**
 * SEO/OG canónico (E8-R2, ADR-0022).
 * site provisorio hasta dominio real (E8-R3). ogImage PNG porque
 * WhatsApp no renderiza SVG; reemplazar por foto real del local.
 */
export const seo = {
  site: "https://modoops2791.vercel.app",
  title: "Inventario — Stock en tiempo real",
  description:
    "Sistema de inventario para kioscos y mostrador: caja, depósito y venta celular en un solo lugar.",
  ogImage: "/images/og-inventario.png",
  ogImageAlt: "Inventario — Stock en tiempo real",
  locale: "es_AR",
  twitterCard: "summary_large_image",
} as const;

/** E9: tracking UTM en WhatsApp (modelo canónico, key propia). */
const ALLOWED_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
] as const;

const UTM_STORAGE_KEY = "inventario_utm";

export function parseUtm(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return "";
  const params = new URLSearchParams(raw);
  const filtered = new URLSearchParams();
  for (const key of ALLOWED_UTM_KEYS) {
    const v = params.get(key);
    if (v !== null) filtered.set(key, v);
  }
  return filtered.toString();
}

export function whatsappWithUtm(source: string): string {
  let utm = "";
  if (typeof window !== "undefined") {
    try {
      const raw = window.location.search;
      const parsed = parseUtm(raw);
      if (parsed) {
        window.sessionStorage.setItem(UTM_STORAGE_KEY, parsed);
        utm = parsed;
      } else {
        utm = window.sessionStorage.getItem(UTM_STORAGE_KEY) || "";
      }
    } catch {
      try {
        utm = parseUtm(window.location.search);
      } catch {
        utm = "";
      }
    }
  }
  const text = encodeURIComponent(
    `Hola Inventario — vengo de ${source}${utm ? ` (${utm})` : ""} — rubro: __, cajas: __`,
  );
  return `${contact.whatsapp}?text=${text}`;
}
