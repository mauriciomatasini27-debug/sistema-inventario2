> Origen: `PRD - Landing Page - Gaps vs ModoOps.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/pages/index.astro`, `src/components/sections/`, `docs/adr/0022-landing-gaps.md`

---

### PRD — Landing Page: Gaps vs ModoOps
Sistema de Inventario

Auditoría pstack (3 workers en paralelo) · 2026-10-11 · v1.0

Fuente referencia (canónica): C:\Users\mauri\ProyectosOpencode\ModoOps\web\src\pages\index.astro (18 secciones), data\business.ts (295 líneas), layouts\BaseLayout.astro, components\sections\, data\landing.test.ts.

Fuente auditada (nueva): C:\Users\mauri\OneDrive\Desktop\proyectos\Sistema de Inventario\src\pages\index.astro (8 secciones), src\data\business.ts (200 líneas), src\layouts\BaseLayout.astro, src\components\sections\ (8 archivos), src\components\ui\.

# 1. Resumen ejecutivo

La landing nueva cubre 8 de 18 secciones del arco canónico ModoOps. Orden nuevo: Hero / Problema / Solucion / Camino / Planes / Publico / ComoTrabajamos / Contacto. Orden canónico: Hero / Problem / Ejemplo / Contraste / Circuito / Solution / PuenteOficina / Descubrimiento / Migracion / Fiscal / Path / Audience / HowWeWork / Despues / Crecer / Garantia / Faq / Contact.

Veredicto: no hay gaps cosméticos; todo lo faltante es estructural de conversión, medición y confianza. Se proponen 12 épicas (P0=6, P1=4, P2=2).

- P0 conversión (6): Ejemplo ficticio, Contraste Hoy-vs-Con, Circuito 5 pasos, Descubrimiento pago con agenda, Garantía/riesgo-reversión, Puente borrador (/oficina).

- P0/P1 técnica (3): SEO head canónico + OG PNG + canonical; UTM WhatsApp + eventos; nav sin /panel-/venta + brand href=/ + FloatingWhatsApp con source.

- P1 comercial (3): Migración acotada + ambiente prueba; Fiscal con contador + validez factura; Alcance/hitos/validez + capacitación cuantificada + datos/salida.

# 2. Metodología pstack

Panel read-only con 3 workers nativos (inherit-parent, equivalente pstack swarm workers en OpenCode):

- Worker A — conversión/copy: storytelling, contraste, circuito, descubrimiento, garantía, después/crecer, puente borrador.

- Worker B — técnica/SEO/tracking: head, canonical, OG/Twitter, UTM, header/nav, FloatingWhatsApp, reveal, formulario/newsletter, guardias.

- Worker C — confianza comercial: migración, prueba separada, fiscal, datos, salida, capacitación, alcance/hitos, path/audience, jerga y placeholders.

# 3. Bloque A — Conversión (6 altas + 2 medias)

## E1 [P0] Ejemplo ficticio espejo (ALTA)

Ref: business.ts:159-170 — 'Un negocio como el tuyo / Pinturería Centro / Ejemplo ficticio / Dos cajas, Excel desactualizado, compras por WhatsApp' + 3 señales + closing 'Si te suena parecido…'. Comp: Ejemplo.astro:37-48. Nueva: sin equivalente; Problema.astro solo pains genéricos.

Requisitos:

- E1-R1: crear objeto ejemplo (eyebrow, title, fictitious con la palabra 'ficticio', body, signs>=3, closing) en src/data/business.ts.

- E1-R2: nueva sección Ejemplo.astro entre Problema y Solucion con mock visual (2 cajas / Excel / WhatsApp).

- E1-R3: test que exige fictitious~/ficticio/i y signs>=3 (réplica landing.test.ts:56-59).

## E2 [P0] Contraste Hoy vs Con, 4 pares (ALTA)

Ref: business.ts:172-181 — 4 pares (cuaderno→precio del sistema; memoria→caja descuenta sola; cierre a mano→canta solo; compra WhatsApp→entra con orden). Comp: Contraste.astro. Nueva: inexistente; Solucion solo lista features sin contraparte 'Hoy'.

Requisitos:

- E2-R1: objeto contraste con rows>=4 {hoy, con} no vacíos.

- E2-R2: sección Contraste.astro con 4 visuales + pane 'Con'.

- E2-R3: test rows>=3 con hoy/con no vacíos.

## E3 [P0] Circuito operativo 5 pasos (ALTA)

Ref: business.ts:183-193 — 'Tu local en 5 pasos / Del camión a la factura' + 5 steps. Nueva Camino.astro es onboarding (Alta/Puesta/Uso), no operación diaria; sin léxico 'por color o código / anotás al pintor'.

Requisitos:

- E3-R1: objeto circuito con steps==5 (compra→salón→venta→cobro→factura).

- E3-R2: sección Circuito.astro con SHORT=['Depósito','Salón','Venta','Cobro','Factura'].

- E3-R3: test steps==5; Camino queda como onboarding, no lo reemplaza.

## E4 [P0] Descubrimiento pago + agenda 3 días (ALTA)

Ref: business.ts:195-204 — 'Qué te llevás por $155 / Tres días, informe + propuesta / Día1 proceso, Día2 fiscal+contador, Día3 alcance / Día extra se cotiza'. Nueva: Planes SaaS (Básico Consultar / Plus $29.000 destacado / Pro A medida) + CTA 'Pedir demo'; sin entrada de bajo riesgo.

Requisitos:

- E4-R1: definir oferta de entrada (precio, agenda 3 días, entregable informe+propuesta, día extra, validez) en business.ts. Si el modelo es SaaS y no proyecto, reescribir E4 como 'Demo con agenda y entregable' pero con el mismo compromiso progresivo.

- E4-R2: sección Descubrimiento.astro con agenda visible.

- E4-R3: test agenda==3.

## E5 [P0] Garantía / reversión de riesgo (ALTA)

Ref: business.ts:254-258 — 'Si no encaja, te lo decimos / te llevás el diagnóstico igual / Propuesta válida 20 días' + Garantia.astro variant=dark. Nueva: cero; FAQ sin '¿Y si no sigo?'.

Requisitos:

- E5-R1: objeto garantia (title, lead, detail con validez en días).

- E5-R2: sección Garantia.astro antes de FAQ.

- E5-R3: FAQ suma '¿Y si no sigo? → Te llevás informe/propuesta, sin ataduras'.

## E6 [P0] Puente borrador /oficina — micro-compromiso (ALTA)

Ref: business.ts:260-266 — 'Armá tu borrador antes de comprar nada / chat no vende, lo valida el consultor / href /oficina' + PuenteOficina.astro preview chat→borrador. Nueva: sin ruta /oficina; Hero solo Pedir demo/WhatsApp/Email; salto directo a formulario frío.

Requisitos:

- E6-R1: crear ruta /oficina o equivalente (chat/borrador no vinculante) o, si se descarta, sustituir por lead-magnet de igual valor (checklist/cotizador) — decisión explícita, no omisión.

- E6-R2: CTA intermedio en Hero + tras Solution ('Armar mi borrador' → /oficina).

- E6-R3: nav suma 'Armá tu borrador' como primer ítem (réplica nav ModoOps).

## E7 [P1] Después del go-live + Crecer después (MEDIA)

Ref: despues ('acompañamos al salir + 10 días de fallas / WhatsApp comercial no es soporte') y crecer ('mayorista, tienda online, integraciones — se anota y se cotiza'). Nueva: 'Uso diario con soporte' genérico; Publico 'No, si…' expulsa en vez de aparcar (sin 'se deja anotado').

Requisitos:

- E7-R1: sección Despues.astro con ventana concreta + límite anti-soporte-informal.

- E7-R2: sección Crecer.astro + audience.lead 'Si después crecés, no te quedás afuera' y no-items con 'Se deja anotado'.

- E7-R3: Publico.astro debe renderizar audience.lead (hoy ni lo muestra).

# 4. Bloque B — Técnica / SEO / tracking (3 épicas)

## E8 [P0] Head SEO canónico + OG PNG + canonical (ALTA)

Ref: BaseLayout con canonical absoluto (fallback https://modoops.com.ar), og:image PNG (<300KB, WhatsApp no renderiza SVG), twitter summary_large_image, theme-color, skip-link, Plausible + scroll_camino, seo/seoOficina con tests de largo (title≤70, desc 50-200). Nueva: solo og:title/description/type/locale; sin canonical/og:image/og:url/twitter; site='http://localhost:4321' en astro.config.mjs.

Requisitos:

- E8-R1: BaseLayout acepta canonical + ogImage; emite link canonical, og:url, og:image absoluta + alt, og:site_name, twitter:card/title/description/image.

- E8-R2: crear objeto seo/seoOficina en business.ts + PNG real <300KB en public/images (provisorio, reemplazar con foto local).

- E8-R3: cambiar site localhost por dominio canónico antes de activar canonical/og:url.

- E8-R4: test SEO (largos, site https://, ogImage /….(png|jpg)).

## E9 [P0] UTM WhatsApp + eventos (ALTA)

Ref: business.ts:14-61 parseUtm (allowlist utm_*/gclid/fbclid, filtra PII) + whatsappWithUtm(source) con sessionStorage + texto 'Hola ModoOps — vengo de {source} ({utm}) — rubro/ciudad/cajas' + data-cta + plausible cta_whatsapp en Hero/Contact/Floating. Nueva: 0 hits a utm/sessionStorage/plausible; wa crudo https://wa.me/541100000000 en 3 lugares.

Requisitos:

- E9-R1: portar parseUtm + whatsappWithUtm + tests (filtra PII, persiste sesión).

- E9-R2: cablear en Hero, Contacto y FloatingWhatsApp con source ('hero'/'contact'/'floating') + script que reescribe href.

- E9-R3: data-cta/data-source + evento plausible (o quitar plausible explícitamente si no se usa).

## E10 [P1] Nav + FloatingWhatsApp + accesibilidad (ALTA/MEDIA)

Ref nav: [/oficina 'Armá tu borrador', #camino, #contacto] + CTA 'Pedir propuesta' + brand href=/ + min-height 44px táctil. Nueva nav: [#camino,#planes,#contacto,/panel,/vender], sin CTA, brand href='#' roto; /panel y /venta (app operativa) en nav pública compiten con conversión e invitan a indexar app. Floating nueva: visual OK pero href estático sin data/script. Reveal nueva: inline OK con reduced-motion pero diverge del sistema (sin delays, selector frágil).

Requisitos:

- E10-R1: sacar /panel y /venta del nav landing; darles head propio con noindex (son app, no landing).

- E10-R2: brand href='/' + CTA primario en header + 'Armá tu borrador' primero (cuando exista E6).

- E10-R3: FloatingWhatsApp con data-cta/source + script UTM (ver E9) + aria-label; mantener safe-area y reduced-motion.

- E10-R4: skip-link #contenido + theme-color; label explícito en form contacto (hoy solo newsletter lo tiene).

# 5. Bloque C — Confianza comercial (3 épicas)

## E11 [P0] Migración + ambiente prueba + fiscal/contador (CRÍTICA)

Ref: migracion 'Un finde pasamos lista+depósito; lunes vendés / Hasta 500 ítems, se valida en prueba, se cotiza aparte' + FAQ 'nunca en tu caja real' + fiscal 'Probamos en ambiente prueba / Sin firma del contador nada sale en vivo' + FAQ '¿La factura es válida?'. Nueva: 'Se carga como stock inicial sin frenar la venta' (sin mecánica/límite/cotización); 'probamos una venta real en el mostrador' (invierte el mensaje: probar en real); cero menciones fiscal/factura/contador/AFIP.

Requisitos:

- E11-R1: sección Migracion.astro con límite (ítems), ventana (finde/lunes), responsable, validación en prueba y 'se cotiza aparte' — o negar migración explícitamente.

- E11-R2: promesa 'ambiente aparte, nunca en tu caja real' en FAQ + Camino.

- E11-R3: sección Fiscal.astro o aclaración explícita: ¿factura válida? ¿con contador? ¿ARCA? Sin ambigüedad legal. Si no factura, decirlo ('la facturación se coordina con tu contador por fuera').

- E11-R4: howWeWork suma 'Tu parte: datos, contador y accesos a tiempo'.

## E12 [P1] Alcance/hitos/validez + capacitación + datos/salida (ALTA)

Ref: howWeWork 4 reglas ('qué entra y qué queda fuera / se paga cuando funciona en prueba y en vivo / 8h ajustes + 6h capacitación, lo demás se cotiza') + path Propuesta→Implementación→Soporte + validez 20 días + FAQ datos ('Tuyos: quedan ahí') y salida ('Sin ataduras'). Nueva: 3 reglas vagas, sin horas/fuera/pago contra aceptación; Camino sin validez/precio/plazo; FAQ sin datos/salida; Pro promete 'Capacitación' sin horas/lugar.

Requisitos:

- E12-R1: reescribir howWeWork con 4 reglas cuantificadas (incluye/excluye, pago contra aceptación, tu parte, horas incluidas + 'lo demás se cotiza').

- E12-R2: Camino/path con momento propuesta (alcance/precio/plazos) + footnote validez N días.

- E12-R3: FAQ suma '¿Mis datos?' (tuyos, quedan ahí, portabilidad) y '¿Y si no sigo?' (qué te llevás).

- E12-R4: cuantificar capacitación (horas, lugar, con tus datos) en Planes/FAQ; si varía por plan, tabla por plan.

## E13 [P1] Higiene comercial: placeholders, precio, jerga + FAQ propio (ALTA/MEDIA)

Hallazgos: J1 — contactos placeholder a la vista (541100000000, contacto@inventario.example, instagram inventariokiosco) en business.ts:34-38,80-86 y Contacto.astro. J2 — precio suelto 'Plus $29.000/mes destacado' vs 'Básico Consultar / Pro A medida' + planesPage 'Un solo precio de lista' (contradice publicPricing USD canónico; ARS sin IVA/vigencia/validez). J3 — jerga 'Planes SaaS / Pedir demo / desarrollo sin tope / puesta asistida' vs léxico comerciante (Descubrimiento/propuesta/informe). J4 — FAQ diluido dentro de Contacto (dl) en vez de sección propia details/summary.

Requisitos:

- E13-R1: bloquear ship con placeholders (test que falla si aparecen 000000/example.com) + datos reales o fallback 'en configuración' sin mostrar falsos.

- E13-R2: política de precios publicables (moneda, IVA, vigencia, validez N días, qué planes muestran precio) + corregir contradicción 'un solo precio' o mostrar los 3.

- E13-R3: glosario comerciante: prohibir SaaS/demo/stock(go-live/etc.) en copy público o justificar cada término; test réplica FORBIDDEN adaptado.

- E13-R4: extraer FAQ a Faq.astro propio (details/summary) con las 5 objeciones de confianza + 5 operativas; Contacto queda solo contacto+newsletter.

- E13-R5: alinear doc formspreeIdEnv (business.ts:7-8 declara 1 var, Contacto.astro lee 2) + hacer visible data-form-error (hoy nunca se muestra con POST nativo).

# 6. Orden de implementación sugerido

1. E13 higiene (no shipear placeholders/precios contradictorios) + E8 SEO base (canonical/OG/site) — 0.5 día.

1. E9 UTM + E10 nav/app-noindex — 0.5 día.

1. E1→E2→E3 (Ejemplo→Contraste→Circuito, arco espejo) — 1 día.

1. E11 (Migración/Fiscal/prueba) + E12 (alcance/hitos/datos) — 1 día.

1. E4 (Descubrimiento) + E5 (Garantía) + E7 (Después/Crecer) — 1 día.

1. E6 (puente /oficina o sustituto) + E13-R4 (FAQ propio) — 1-2 días.

DoD por épica: sección renderiza + copy en business.ts + test vitest en verde + sin placeholders + Lighthouse/OG verificado donde aplique.

# 7. Riesgos si no se hace

- Sin E1-E3: dolor abstracto, sin espejo ni prueba operativa → baja identificación y conversión.

- Sin E4-E6: salto directo a 'Pedir demo' sin entrada de bajo riesgo ni captura progresiva → fricción alta.

- Sin E11: objeción '¿freno ventas? ¿factura válida?' sin respuesta → bloqueo legal/operativo.

- Sin E8-E9: previews rotos en WhatsApp + atribución ciega → se pierde medición de campaña.

- Sin E13: datos falsos/precios contradictorios visibles → pérdida de confianza inmediata.

# 8. Anexo — mapa sección a sección

ModoOps → Sistema Inventario:

- Hero → Hero (OK, falta UTM/source).

- Problem → Problema (OK parcial, falta espejo).

- Ejemplo → (FALTA E1). Contraste → (FALTA E2). Circuito → (FALTA E3).

- Solution → Solucion (OK parcial, falta Fiscal AR/Contactos).

- PuenteOficina → (FALTA E6). Descubrimiento → (FALTA E4, sustituido por Planes SaaS).

- Migracion → (FALTA E11). Fiscal → (FALTA E11).

- Path (Propuesta→Implementación→Soporte+validez) → Camino (Alta→Puesta→Uso, sin validez) (E12).

- Audience (Arranque/Después + lead crecimiento) → Publico (Sí/No seco, sin lead) (E7/E12).

- HowWeWork (4 reglas cuantificadas) → ComoTrabajamos (3 vagas) (E12).

- Despues → (FALTA E7). Crecer → (FALTA E7). Garantia → (FALTA E5).

- Faq (5 confianza, propio) → FAQ diluido en Contacto (E13-R4).

- Contact (WhatsApp UTM + mailto con subject, sin form) → Contacto (superset Formspree doble + newsletter, bien; pulir error visible) (E10/E13).
