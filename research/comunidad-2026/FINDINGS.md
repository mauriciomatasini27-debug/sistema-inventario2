---
id: RESEARCH-COMUNIDAD-2026
tipo: research
estado: cerrado
fecha: 2026-11-21
ticket: "#281 (hijo del wayfinder #279)"
resumen: |
  Qué publicó la comunidad frontend/design-engineering en 2026 (fuentes primarias) y qué de eso es adoptable
  para la app web de sistema-inventario2 (Astro 7 + React 19 + Tailwind 4 + Tema Papel).
  Artículo de branch desechable: no se mergea a main, no entra en docs/INDEX.md ni en el grafo de docs.
---

# Research: comunidad 2026 — craft, componentes y UI/UX

> Alcance: material de enero–noviembre 2026 (con dos hitos de octubre/diciembre 2025 que explican el estado de 2026).
> Disciplina: solo fuentes primarias (docs oficiales, changelogs, repos y releases). No se usan posts que repiten otros posts.
> Fecha de consulta de todas las URLs: **2026-11-21**. Las fechas entre paréntesis son las de publicación/commit de la fuente.
> Fuentes ya trackeadas en `skills-lock.json` (`emilkowalski/skills`, `jakubkrehel/skills`, `vercel-labs/agent-skills`,
> `mattpocock/skills`) **no** se re-examinan: este documento cubre lo que apareció fuera de ese conjunto.

## 1. Panorama 2026: qué es genuinamente nuevo

### 1.1 El "criterio de craft" dejó de ser prosa y pasó a ser un gate determinista

La novedad más relevante para este repo no es un componente nuevo, sino una forma nueva de *hacer cumplir* el gusto:
un skill (`pbakaus/impeccable`) que acompaña la edición del agente, un detector sin LLM con reglas deterministas,
y un `DESIGN.md`/`PRODUCT.md` como contexto proyectual.

- El README oficial define 24 comandos (`bolder`, `quieter`, `typeset`, `layout`, `animate`, `polish`, `harden`,
  `critique`, `audit`, `live`, `extract`, …), **`critique` con puntaje** y **`audit` con hallazgos P0 (bloqueante) a P3 (pulido)**,
  además de un *slop detector* de **62 reglas deterministas, sin LLM y sin API key** ([pbakaus/impeccable, README](https://github.com/pbakaus/impeccable/blob/main/README.md), repo creado 2025-11-16, último push 2026-11-20; verificado vía GitHub API el 2026-11-21).
- El detector se puede correr en CI/terminal (`npx impeccable detect --sarif src/`) y como GitHub code scanning;
  la misma fuente explica que las reglas que requieren página renderizada (contraste, texto pequeño) se ejecutan
  apuntando el CLI a un dev server. Instala hooks de diseño que "escanean cada archivo UI que el agente edita"
  ([README](https://github.com/pbakaus/impeccable/blob/main/README.md), 2026).
- El changelog muestra la evolución en 2026: v1.x (2026-02-28–03-18, `/audit` con P0–P3), v3.0.0 (2026-04-10,
  Live Mode Alpha sobre Vite/Next/SvelteKit/**Astro**/Nuxt), v3.0.2 (2026-06-16: "`detect` entiende tu sistema de diseño:
  con `DESIGN.md`, carga tipografía/paleta/radius y marca deriva"), **v3.0.0 CLI (2026-06-14: breaking, Node >= 24)**,
  v4.8.0 (2026-10-26: anotaciones en PR), **v4.10.0 (2026-11-17: "`DESIGN.md` como mapa y movimiento que se puede chequear")**
  ([impeccable.style/changelog](https://impeccable.style/changelog), consultado 2026-11-21).
- Matiz importante para este repo: el skill **nació de `anthropics/skills/frontend-design`** ([README, licencia](https://github.com/pbakaus/impeccable/blob/main/README.md), 2026)
  y el CLI actual exige Node 24, mientras `AGENTS.md` fija Node 22. La idea es adoptable; el binario, no.

**Lectura:** en 2026 la comunidad empaquetó el "ojo de diseñador" como (a) vocabulario para dirigir al agente,
(b) detector determinista para CI y (c) archivo de contexto de diseño. Es el análogo exacto de lo que este repo
ya hace con `check:ui` y `check:contrast`, pero llevado más lejos.

### 1.2 Agent Skills se volvió estándar inter-herramientas y aparecieron skillsets de diseño nuevos

- La especificación pública (`agentskills.io/specification`) define `SKILL.md` con frontmatter `name`/`description`,
  divulgación progresiva (metadatos ~100 tokens, cuerpo < 5000 tokens recomendado, recursos bajo demanda),
  `name` igual al directorio, `description` con *qué hace y cuándo usarlo*, y validación con `skills-ref validate`
  ([agentskills.io/specification](https://agentskills.io/specification), consultado 2026-11-21; repo
  [`agentskills/agentskills`](https://github.com/agentskills/agentskills), creado 2025-12-16, push 2026-11-04 vía GitHub API).
- **shadcn/ui lanzó sus propios skills de primera parte** con `shadcn/cli v4` (2026-03): cubren Radix y Base UI,
  APIs, composición y flujos de registry; el skill lee `components.json` y ejecuta `shadcn info --json` para inyectar
  framework, versión de Tailwind, alias, librería base, iconos y componentes instalados; incluye theming con OKLCH
  y autoría de registries ([changelog 2026-03-cli-v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), marzo 2026;
  [docs/skills](https://ui.shadcn.com/docs/skills), consultado 2026-11-21).
- Colecciones nuevas, **ninguna presente en `skills-lock.json`** (fechas de creación y último push verificadas vía GitHub API el 2026-11-21):

  | Repo | Creado | Último push | Aporte concreto (fuente primaria) |
  |---|---|---|---|
  | [`Owl-Listener/designer-skills`](https://github.com/Owl-Listener/designer-skills) | 2026-03-07 | 2026-11-19 | **111 skills, 34 comandos, 9 plugins**. [INDEX.md](https://github.com/Owl-Listener/designer-skills/blob/main/INDEX.md) organiza por *situación* ("tengo una pantalla mal y no sé por qué", "tengo que defender esto"), incluye un skill-router `/designer-toolkit:start-here` y una tabla de **"frequently confused"** con límites explícitos entre skills parecidos. |
  | [`dembrandt/dembrandt-skills`](https://github.com/dembrandt/dembrandt-skills) | 2026-04-19 | 2026-11-19 | 45 skills en formato Open Agent Skills. [README](https://github.com/dembrandt/dembrandt-skills/blob/main/README.md): `button-states` (6 estados: rest/hover/active/focus/disabled/loading), `wcag-accessibility` (WCAG 2.2 AA / EN 301 549), `app-shell` (con "*tenant and environment cue*"), `operational-expert-tool-ui` (UI densa para B2B de uso diario), `repeated-component-alignment` (modelo de slots), `scroll-areas` (un solo eje, evita scroll interno), `coordinated-data-views` (tabla + vista visual sincronizadas). |
  | [`superdesigndev/superdesign-skill`](https://github.com/superdesigndev/superdesign-skill) | 2026-01-21 | 2026-08-21 | Skill orientado a "convertir UI slop en frontend shippable", instalable con `npx skills add` ([README del repo](https://github.com/superdesigndev/superdesign-skill)). |
  | [`zanwei/design-dna`](https://github.com/zanwei/design-dna) | 2026-03-23 | 2026-08-28 | Convierte referencias visuales (imágenes/screenshots/URLs) en **Design DNA JSON** — tokens, estilo cualitativo, efectos — y genera UI a partir de eso ([descripción del repo](https://github.com/zanwei/design-dna)). |
  | [`nexu-io/open-design`](https://github.com/nexu-io/open-design) | 2026-04-28 | 2026-11-21 | Workspace de diseño colaborativo, **local-first** y open source ([descripción del repo](https://github.com/nexu-io/open-design)). |

- Patrón de diseño de skills que aparece en varias fuentes a la vez: **nombres con "use-when" explícito y límites
  entre skills vecinos** (Owl-Listener, 2026-08-08 "sharpen skill descriptions with use-when triggers and boundaries",
  visible en el historial del repo) y **divulgación progresiva** (agentskills.io, 2026). Es compatible con la
  disciplina de `AGENTS.md` de leer solo el contexto citado.

### 1.3 Catálogos de componentes: de librería a registro legible por agentes

- `shadcn/cli v4` (2026-03) introduce: **presets** (colors/theme/iconos/fuentes/radius en un código corto que se
  puede pegar en un prompt), `--dry-run/--diff/--view`, `init --template` **con Astro en la lista**, `shadcn info`,
  `shadcn docs`, y los tipos de registry **`registry:base`** (un payload entrega sistema de diseño completo:
  componentes, dependencias, CSS vars, fuentes y config) y **`registry:font`**
  ([changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), marzo 2026).
- En 2026 se sumaron **GitHub Registries** (junio), **Private GitHub Registries** (agosto), **Human in the Loop** y
  **Questionnaire** (agosto) y **Dynamic Search** (julio), según el índice del
  [changelog oficial](https://ui.shadcn.com/docs/changelog) (consultado 2026-11-21).
- Septiembre 2026: **todos los componentes importan `cn` desde el paquete `cn`** en lugar de `@/lib/utils`
  ([changelog 2026-09-cn](https://ui.shadcn.com/docs/changelog/2026-09-cn), septiembre 2026; repo
  [`shadcn-ui/cn`](https://github.com/shadcn-ui/cn), creado 2026-08-31, descripción oficial: reemplaza
  `tailwind-merge` + `clsx`, mismas APIs, "30× faster").
- Febrero 2026: el estilo `new-york` pasa al **paquete unificado `radix-ui`** en vez de muchos `@radix-ui/react-*`
  ([changelog 2026-02-radix-ui](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui), febrero 2026).
- Julio 2026: **Base UI pasa a ser el default de shadcn/ui**; el anuncio cita "1.6.0, 6M+ descargas semanales",
  que los proyectos creados con `shadcn/create` elegían Base UI 2 a 1, y que **Radix no se depreca**. La migración
  se ofrece como *skill* (no codemod) y deja un reporte por componente en `.migration/`, un commit por componente y
  cambios de comportamiento *marcados, nunca parcheados en silencio*
  ([changelog 2026-07-base-ui-default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), julio 2026).
  Base UI 1.0.0 se publicó el 2025-12-11 con el rename a `@base-ui/react`
  ([release v1.0.0](https://github.com/mui/base-ui/releases/tag/v1.0.0), 2025-12-11).
- Un detalle de catalogación adoptado por shadcn en octubre 2026: **cada página de documentación, incluidos los 21
  patrones de AI Elements, está disponible también en Markdown** para que un agente la consuma directamente
  (`https://ui.shadcn.com/docs/ai-elements/base/reasoning.md`)
  ([changelog 2026-10-ai-elements](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements), octubre 2026).

### 1.4 Criterios concretos de tipografía, color, estado y accesibilidad

- **shadcn/typeset** (julio 2026): un único archivo CSS que el usuario posee; una clase `.typeset` estiliza
  headings/párrafos/listas/tablas/código, sigue el tamaño del contenedor y expone tres controles
  `--typeset-size`, `--typeset-leading` y `--typeset-flow`; está diseñado para streaming (los bloques nuevos no
  re-estilizan los anteriores) ([changelog 2026-07-typeset](https://ui.shadcn.com/docs/changelog/2026-07-typeset), julio 2026).
- **Interfaz para agentes** (octubre 2026): `Trace` (líneas con icono/título/estados `running`/`error`/`pending`,
  anidables y con soporte de teclado y lector de pantalla), `Code Block`, y 21 patrones (`Message Scroller`,
  `Message`, `Bubble`, `Marker`, `Attachment`, `Questionnaire`, `Reasoning`, `Tool`, `Plan`, `Subagent`, …).
  `Message Scroller` ancla cada turno y sigue el stream sin saltos al cargar historial
  ([changelog 2026-10-ai-elements](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements), octubre 2026).
- **Accesibilidad a nivel de decisión de patrón**: el post oficial de Base UI *Building a filterable menu that works
  for everyone* (2026-10-14) explica por qué rechazaron `combobox` y `aria-autocomplete` ("un rol es una promesa"),
  por qué eligieron `dialog` + `searchbox` + `aria-activedescendant`, cómo el loop de flechas vuelve al input,
  por qué `Menu.Clear` no debe estar en el orden de Tab y cómo `data-highlighted` hace visible el estado
  ([base-ui.com/blog/building-a-filterable-menu](https://base-ui.com/blog/building-a-filterable-menu), 2026-10-14).
- **Movimiento**: en 2026 el fono está en hacerlo *chequeable* (v4.10.0 de impeccable, 2026-11-17) y en la
  semántica de estados, no en librerías nuevas. Tailwind v4.0 ya traía `@starting-style` para entradas/salidas sin JS
  ([blog Tailwind v4.0](https://tailwindcss.com/blog/tailwindcss-v4), 2025-01).
- **Design tokens**: la especificación DTCG alcanzó su **primera versión estable 2025.10** el 2025-10-28, con
  theming multi-marca sin duplicar archivos, soporte completo de Display P3/Oklch/CSS Color 4, aliases y herencia
  ([W3C DTCG, anuncio oficial](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/), 2025-10-28;
  [especificación 2025.10](https://www.designtokens.org/tr/2025.10/)). Es un hito de 2025, pero explica por qué en 2026
  los catálogos y registries tratan los tokens como un payload portable.

### 1.5 Tailwind 4.2/4.3 (el repo ya está en 4.3.x)

El blog oficial de Tailwind publicó v4.3 el **2026-05-08** y en el mismo post documenta v4.2
([tailwindcss.com/blog/tailwindcss-v4-3](https://tailwindcss.com/blog/tailwindcss-v4-3), 2026-05-08):

- v4.2: paletas `mauve`/`olive`/`mist`/`taupe`, utilidades lógicas `pbs-*`, `mbs-*`, `inline-*`, `block-*`,
  `inset-s-*`/`inset-e-*`, y `font-features-*` para OpenType de bajo nivel (collaboraciones con Netflix y Vercel).
- v4.3: `scrollbar-*`, `scrollbar-gutter-stable` (evita layout shift), `@container-size`, `zoom-*`, `tab-*`,
  `@variant` apilados/compuestos y `--default(...)` para utilidades funcionales.

`package.json` del repo ya declara `tailwindcss ^4.3.3` y `@tailwindcss/vite ^4.3.5`, así que todo esto está
disponible hoy sin actualizar dependencias.

## 2. Prácticas / componentes / skills concretos (inventario accionable)

| Hallazgo | Fuente primaria y fecha | Qué resuelve |
|---|---|---|
| Gate de estilo determinista + `DESIGN.md` + severity P0–P3 | [impeccable README](https://github.com/pbakaus/impeccable/blob/main/README.md) y [changelog](https://impeccable.style/changelog), 2026-02 a 2026-11-17 | Criterio de craft ejecutable en CI, sin LLM |
| Skill-router con tabla "frequently confused" | [Owl-Listener/designer-skills INDEX.md](https://github.com/Owl-Listener/designer-skills/blob/main/INDEX.md), agosto–septiembre 2026 | Evita que skills de diseño se pisen entre sí |
| `SKILL.md` con `description` = disparador "use-when" + divulgación progresiva | [agentskills.io/specification](https://agentskills.io/specification), consultado 2026-11-21 | Format Compatible con `AGENTS.md` ("leer solo lo citado") |
| Checklist de 6 estados de botón y `wcag-accessibility` WCAG 2.2 AA | [dembrandt-skills README](https://github.com/dembrandt/dembrandt-skills/blob/main/README.md), repo 2026-04-19 | Estados y a11y explícitos para POS/caja |
| `app-shell` con "tenant and environment cue" | [dembrandt-skills README](https://github.com/dembrandt/dembrandt-skills/blob/main/README.md), 2026 | Multi-tenant visible sin romper el Tema Papel |
| `operational-expert-tool-ui`, `repeated-component-alignment`, `scroll-areas`, `coordinated-data-views` | [dembrandt-skills README](https://github.com/dembrandt/dembrandt-skills/blob/main/README.md), 2026 | Patrones para tablas densas, listas y scroll interno |
| `.typeset` con `--typeset-size/leading/flow` | [shadcn/typeset](https://ui.shadcn.com/docs/changelog/2026-07-typeset), 2026-07 | Ritmo tipográfico por contexto con system-fonts |
| `registry:base` / presets / `shadcn info --json` / docs en Markdown | [shadcn/cli v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4), 2026-03; [AI Elements](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements), 2026-10 | Catálogo portable y legible por agentes |
| `Questionnaire` / `Confirmation` / `Trace` (estados y confirmación antes de actuar) | [AI Elements](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements), 2026-10; [Questionnaire (ago 2026)](https://ui.shadcn.com/docs/changelog/2026-08-questionnaire) | Patrón conceptual para asistente y confirmaciones |
| "Un rol es una promesa": menú filtrable = dialog + searchbox, no combobox | [Base UI blog](https://base-ui.com/blog/building-a-filterable-menu), 2026-10-14 | Criterio de accesibilidad para menús/buscadores |
| `scrollbar-gutter-stable`, `@container-size`, `font-features-*`, `@variant` | [Tailwind v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3), 2026-05-08 | Micro-arreglos de layout sin JS |
| DTCG 2025.10: theming multi-marca, Oklch/P3, aliases | [W3C DTCG](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/), 2025-10-28 | Norte de portabilidad de tokens (no adopción inmediata) |

## 3. Evaluación de adopción para este stack

Stack real verificado en el branch: `astro ^7.4.10`, `@astrojs/react ^7.1.7`, `react ^19.3.1`,
`tailwindcss ^4.3.3`, `sonner ^2.0.8`, `@number-flow/react 0.6.2`
([package.json](../package.json)); `system-ui` en `src/styles/global.css` y `src/styles/tokens-papel.css`;
gates `check:ui` y `check:contrast` ([scripts/check-ui.mjs](../scripts/check-ui.mjs),
[scripts/check-contrast.mjs](../scripts/check-contrast.mjs)); Node 22 y reglas de rama en `AGENTS.md`.

### 3.1 Adoptable de forma realista (sin cambiar stack ni violar `AGENTS.md`)

1. **Extender `check:ui` con reglas deterministas inspiradas en impeccable.** Hoy el gate verifica 9 condiciones
   (SPEC-UI-00, `prefers-reduced-motion`, `:focus-visible`, `100dvh`, 16px en coarse pointers, `.tnum`,
   `viewport-fit=cover`, theme-color, sin harness). El patrón de 2026 agrega: detección de gradientes de dos ejes,
   *kickers* sobre headings, saltos de nivel de heading, texto demasiado pequeño, más de una familia de fuente,
   deriva de radius/color contra un archivo de contexto. Se implementa como Node puro (Node 22), con `PASS/FAIL`
   y `process.exit(failed ? 1 : 0)`, exactamente como el script actual. **No instalar el CLI de impeccable**: su
   versión actual exige Node >= 24 (changelog v3.0.0, 2026-06-14) y descarga un engine externo.
2. **Un `DESIGN.md` compacto y legible por agente como fuente de verdad del Tema Papel.** No reemplaza los PRDs:
   sería un índice corto (paleta de `tokens-papel.css`, escala tipográfica system-font, radius, estados, anti-referencias
   "sin neon/glass", `--mo-*` prohibido) que `check:ui`/`check:contrast` puedan leer. Es el patrón documentado por
   impeccable v3.0.2 (2026-06-16) y v4.10.0 (2026-11-17), y encaja con `npm run docs:context` de `AGENTS.md`.
3. **`typeset` como patrón CSS local, no como paquete.** Una clase `.typeset` con `--typeset-size/leading/flow`
   para texto largo (notas de inventario, descripciones, mensajes del asistente) dentro del Tema Papel; respeta
   system-fonts y no agrega dependencia. Conviene mantenerlo fuera de pantallas densas de POS.
4. **Utilidades ya disponibles de Tailwind 4.3 para tablas y listas.** `scrollbar-gutter-stable` evita el salto de
   layout al aparecer scroll en tablas de stock; `scrollbar-thin`/`scrollbar-thumb-*` para paneles con scroll;
   `@container-size` para tarjetas cuyo contenido depende de altura; `font-features-["tnum"]` como alternativa
   utility a `.tnum` (que ya existe). Todo con fecha 2026-05-08 y ya en `package.json`.
5. **Checklist de 6 estados (`dembrandt-skills`, 2026) para botones del POS y de caja.** El repo ya cubre
   `:focus-visible` y `prefers-reduced-motion`; la brecha realista es `disabled`/`loading` consistentes y el
   anuncio de resultado (sonner ya está instalado, así que no hace falta librería de toast nueva).
6. **Catálogo ligero en Markdown + capturas, no Storybook.** El patrón de AI Elements (2026-10) de publicar cada
   página también como `.md` resuelve el "Not yet specified" del mapa #279: una página interna del repo con una
   ficha por componente (token usado, 6 estados, `data-*` de acceso, captura 360px claro/oscuro y DS-S13 POS oscuro)
   es suficiente y es legible tanto por personas como por agentes.
7. **Verificación visual con severidades P0–P3.** En vez de importar el skill, usar la idea de `critique`/`audit`
   para estructurar el checklist de capturas (DS-S23 360px claro/oscuro, DS-S13 POS oscuro): hallazgo bloqueante,
   hallazgo de pulido y checklist "abrir, clickear, tabular".

### 3.2 Inspiración — no adopción realista en este mapa

- **Migrar a shadcn/ui o Base UI**: explícitamente fuera del scope del wayfinder #279 ("migración a otra librería de
  UI"); además el repo no tiene `components.json` y su DS es propia (ADR-0008/0009, PRD-DS-01/02/03).
  Vale rescatar la *decisión de patrón* de Base UI (roles, foco, `data-highlighted`) como criterio de auditoría.
- **AI Elements / Trace / Code Block / Questionnaire como componentes**: el asistente actual es de catálogo cerrado
  (ADR-0044) y el chat es de landing (ADR-0046). El patrón "pedir aclaración/confirmación antes de continuar" es
  inspiración para flujos de venta/fiado, pero no corresponde portar los componentes de agente.
- **DTCG / Style Dictionary como formato de tokens**: cambiaría `tokens-papel.css`, el `@theme` de `global.css` y
  el test que falla si divergen; rompería `check:contrast`. Útil como norte de interoperabilidad, no como cambio inmediato.
- **Colecciones nuevas de skills instaladas vía `npx skills add` o con hooks/binarios**: entran en conflicto con
  `AGENTS.md` (Node 22, reverse de `skills-lock.json`, política de modelos por skill). Si se evalúan, que sea en
  una rama desechable y sin instalar global. `shadcn/skills` solo tendría sentido *después* de adoptar shadcn.
- **Design DNA / open-design / generación de comps con imágenes**: la directriz visual del landing ya está decidida
  (sin neon/glass, system fonts, sin Google Fonts) y el mapa excluye cambios de tipografía.

## 4. Recomendaciones para el mapa #279

1. **Reencuadrar el entregable**: el hallazgo más accionable de 2026 es que el *criterio* se volvió verificable.
   Conviene que el ADR/PRD resultante decida primero la spec del gate de craft (extendiendo `check:ui` + un
   `DESIGN.md` corto) y recién después el catálogo visual.
2. **Formato del catálogo (pendiente en el mapa)**: recomendación = **página interna + fichas Markdown por
   componente**, no Storybook. Sustento: `registry:base`/docs `.md` de shadcn (2026-03 y 2026-10), `component-spec`
   y `design-qa-checklist` de Owl-Listener (2026), `DESIGN.md` de impeccable (2026-06/11). Cada ficha debería mostrar
   los 6 estados y el token usado.
3. **Verificación visual (pendiente en el mapa)**: adoptar el patrón `critique`/`audit` con severidades P0–P3 y
   capturas 360px claro/oscuro + POS oscuro, implementado con el tooling actual (Playwright), sin binarios nuevos.
4. **Skills**: **no** agregar colecciones nuevas a `skills-lock.json` en este mapa. Si se decide incorporar criterio
   de craft como skill, que sea **local, en Node 22, sin engine descargado**, con `description` tipo "use-when" y
   límites explícitos (formato agentskills.io); tomar vocabulario de impeccable y dembrandt como inspiración, no como dependencia.
5. **Decisiones sugeridas para el índice del mapa**: (a) PRD/ADR "gate de craft determinista" sobre `check:ui`;
   (b) ADR "catálogo ligero en Markdown vs Storybook"; (c) confirmar **no migrar** de librería de UI;
   (d) confirmar **no adoptar DTCG** ahora; (e) cualquier skill de diseño de terceros con hooks o binarios
   queda fuera de scope mientras el repo esté en Node 22.

## 5. Fuentes primarias consultadas (URL + fecha)

| Fuente | Fecha | Tipo |
|---|---|---|
| [shadcn/ui Changelog (índice)](https://ui.shadcn.com/docs/changelog) | ene–oct 2026, consultado 2026-11-21 | Docs oficiales |
| [Base UI as the Default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default) | 2026-07 | Changelog oficial |
| [shadcn/cli v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4) | 2026-03 | Changelog oficial |
| [shadcn Skills](https://ui.shadcn.com/docs/skills) | consultado 2026-11-21 | Docs oficiales |
| [shadcn/typeset](https://ui.shadcn.com/docs/changelog/2026-07-typeset) | 2026-07 | Changelog oficial |
| [Trace, Code Block y AI Elements](https://ui.shadcn.com/docs/changelog/2026-10-ai-elements) | 2026-10 | Changelog oficial |
| [Unified Radix UI Package](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui) | 2026-02 | Changelog oficial |
| [cn](https://ui.shadcn.com/docs/changelog/2026-09-cn) · [repo](https://github.com/shadcn-ui/cn) | 2026-09 · repo 2026-08-31 | Changelog + repo oficial |
| [Base UI v1.0.0 release](https://github.com/mui/base-ui/releases/tag/v1.0.0) | 2025-12-11 | Release oficial |
| [Building a filterable menu that works for everyone](https://base-ui.com/blog/building-a-filterable-menu) | 2026-10-14 | Blog oficial |
| [Tailwind CSS v4.3](https://tailwindcss.com/blog/tailwindcss-v4-3) | 2026-05-08 | Blog oficial |
| [Agent Skills Specification](https://agentskills.io/specification) | consultado 2026-11-21 | Spec pública |
| [pbakaus/impeccable README](https://github.com/pbakaus/impeccable/blob/main/README.md) · [changelog](https://impeccable.style/changelog) | repo 2025-11-16 · releases 2026-02 a 2026-11-17 | Repo + sitio oficiales |
| [Owl-Listener/designer-skills INDEX.md](https://github.com/Owl-Listener/designer-skills/blob/main/INDEX.md) | repo 2026-03-07 · pushes a 2026-11-19 | Repo oficial |
| [dembrandt/dembrandt-skills README](https://github.com/dembrandt/dembrandt-skills/blob/main/README.md) | repo 2026-04-19 · push 2026-11-19 | Repo oficial |
| [superdesigndev/superdesign-skill](https://github.com/superdesigndev/superdesign-skill) | repo 2026-01-21 · push 2026-08-21 | Repo oficial |
| [zanwei/design-dna](https://github.com/zanwei/design-dna) | repo 2026-03-23 · push 2026-08-28 | Repo oficial |
| [nexu-io/open-design](https://github.com/nexu-io/open-design) | repo 2026-04-28 · push 2026-11-21 | Repo oficial |
| [W3C DTCG: first stable version](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) · [spec 2025.10](https://www.designtokens.org/tr/2025.10/) | 2025-10-28 | Spec oficial (contexto de 2026) |
| Repo local: `package.json`, `src/styles/global.css`, `src/styles/tokens-papel.css`, `scripts/check-ui.mjs`, `scripts/check-contrast.mjs`, `AGENTS.md` | rama `research/comunidad-2026` @ `origin/main` 9559363, 2026-11-21 | Fuente primaria local |

> State of findings: 2026-11-21. Branch desechable `research/comunidad-2026`; sin PR, sin merge a `main`.
