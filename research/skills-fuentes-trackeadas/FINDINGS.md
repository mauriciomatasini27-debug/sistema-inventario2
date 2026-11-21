---
id: RES-280
tipo: research
estado: propuesto
fecha: 2026-11-21
ticket: 280
mapa: 279
resumen: |
  Cambios 2026 en las cuatro fuentes de skills ya trackeadas en skills-lock.json.
  Hallazgo principal: drift real en emilkowalski (2026-11-13), jakubkrehel (2026-11-17)
  y vercel-labs (web-design-guidelines v1.1.0, 2026-10-29); sin drift en mattpocock.
  Seis decisiones candidatas para el mapa, con filtro de stack Astro 7 + React 19 + Tailwind 4.
---

# Research #280 — Qué cambió en 2026 en las fuentes de skills ya trackeadas

> Subagente de research del mapa [#279](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/279). Branch desechable `research/skills-fuentes-trackeadas`, sin PR. Todas las URL se consultaron el **2026-11-21**; las fechas de commit son **UTC según GitHub API / git log**.

## 0. Alcance y método

- **Fuentes primarias**: `skills-lock.json` y su historial git en este repo; README, `CHANGELOG.md`, historial de commits y archivos `SKILL.md` de los cuatro repos upstream (clonados desde GitHub y contrastados con `gh api repos/<repo>/commits/<sha>`).
- **Baseline de "trackeado"**: el lock se creó como v1 el **2026-10-13** (`53cbfcc`, "Local baseline: pstack skills + OpenCode config") y se elevó a v2 el **2026-11-18** (`260855b`, "skills de flujo Matt Pocock…"). `git log --follow -- skills-lock.json` en el worktree. Esto coincide con la fecha de extracción **2026-10-12** declarada en `docs/diseno/PRD-UX-01-uso-skills-diseno-dashboard.md:16`. Por tanto, "nuevo/cambiado desde que se trackeó" se mide desde **2026-10-13**, con el mattpocock pinificado en `5863806d` (2026-11-12).
- **No se ejecutaron las skills**; se evaluó su contenido declarado y su compatibilidad con el stack real (`package.json`: Astro 7.4, React 19.3, Tailwind 4.3, `@astrojs/react` 7, `sonner`, sin `motion`/`framer-motion`/`vaul`), `AGENTS.md` y las reglas standing del mapa: sin `--mo-*`, sin Google Fonts, light/dark por dispositivo, glass solo en panel/POS, `check:ui`/`check:contrast` como gates.
- Vocabulario del mapa #279: **craft** = tipografía/color/espaciado/microinteracciones/estados/accesibilidad; **componentes visuales** = piezas reutilizables del design system.

## 1. Estado 2026 de las cuatro fuentes

| Fuente | Repo creado (GitHub) | Push más reciente | HEAD consultado | Skills en `skills-lock.json` | Drift upstream detectado |
|---|---|---|---|---|---|
| `emilkowalski/skills` | 2026-03-16 | 2026-11-15 | `64eb3de` | 10 (+`prototype` en v1, hoy ya no) | **Sí**: 10 skills cambiadas el 2026-11-13 + 5 skills nuevas post-tracking |
| `jakubkrehel/skills` | 2026-07-10 | 2026-11-19 | `672ae44` | 13 | **Sí**: 13 skills con "clarity pass" el 2026-11-17 + 3 skills nuevas |
| `vercel-labs/agent-skills` | 2025-12-08 | 2026-11-20 | `5a37a63` | 2 | **Sí**: `web-design-guidelines` v1.0.0 → v1.1.0 el 2026-10-29; 7 skills nunca trackeadas |
| `mattpocock/skills` | 2026-02-03 | 2026-11-19 | `abeeaf9` | 3 (pin `5863806d`, 2026-11-12) | **No**: 0 commits en las 3 skills desde el pin; solo CI/frontmatter |

Fuentes: metadatos de repos vía `gh api repos/<repo>` (2026-11-21); `skills-lock.json:1-182`; historial del lock en el repo; [`mattpocock/skills` CHANGELOG](https://github.com/mattpocock/skills/blob/abeeaf9/CHANGELOG.md) (sección 1.3.2).

## 2. Skills nuevas (existen upstream, NO están en `skills-lock.json`)

### 2.1 `emilkowalski/skills` — 10 skills upstream vs 10 trackeadas

Cinco son **genuinamente nuevas después del baseline 2026-10-13**:

| Skill | Primera aparición (fuente) | Categoría | ¿Compatible con el stack? | Veredicto |
|---|---|---|---|---|
| `remove-animations` | 2026-10-28, [`a81dbca`](https://github.com/emilkowalski/skills/commit/a81dbca) | craft (restraint de motion) | Sí. Solo sustrae motion; sin dependencias | Adoptable; complementa `improve-animations`/`find-animation-opportunities` |
| `choreograph` | 2026-11-04, [`c8a7962`](https://github.com/emilkowalski/skills/commit/c8a7962) | craft (secuenciación) | Parcial: sus recetas usan `AnimatePresence`/`useAnimate` de Motion, **no instalado** | Solo con ADR de librería de animación |
| `gestures` | 2026-11-08, [`5206a950`](https://github.com/emilkowalski/skills/commit/5206a950) | craft + UI/UX (drawer/sheet) | Parcial: recomienda **Vaul** para bottom sheets (`skills/gestures/SKILL.md:12`), deps nueva; FALSE "veredicto de librería" pendiente | No adoptar tal cual; ver decisión D6 |
| `learn-taste` | 2026-11-12, [`f7ce8c0`](https://github.com/emilkowalski/skills/commit/f7ce8c0) | gobernanza de craft | Sí. Escribe reglas en `DESIGN.md`/`AGENTS.md` o checks, solo tras aprobación; "a check beats a sentence" (`skills/learn-taste/SKILL.md`, Hard Rules 3-4) | Adoptable como mecanismo de captura de decisiones |
| `ask-emil` | 2026-11-15, [`64eb3de`](https://github.com/emilkowalski/skills/commit/64eb3de) | router (meta) | Sí, pero `disable-model-invocation: true` | Útil para navegar skills, no aporta craft por sí sola |

Cinco **ya existían antes del tracking y nunca se trackearon** (brecha de cobertura, no cambio 2026): `apple-design` (2026-07-09, [`df49b5d`](https://github.com/emilkowalski/skills/commit/df49b5d)), `mobile-native` (2026-09-15, [`0b85d4b`](https://github.com/emilkowalski/skills/commit/0b85d4b)), `animate-expo` (2026-08-18), `write-swift` (2026-08-21), `prototype` de Emil (2026-07-27). `prototype` estuvo en el lock v1 pero fue **sustituido** por `mattpocock/skills::prototype` en v2 (`git show 260855b -- skills-lock.json`).

- `apple-design` y `mobile-native` ya eran citados por `PRD-UX-01:38,71` (UX-S6, drawer a 360 px) pero **nunca entraron al lock**: riesgo de que la evidencia de esa historia use una skill no versionada.
- `animate-expo` (Reanimated/Expo) y `write-swift` (Swift 6) son **incompatibles** con una PWA web; descartados.
- `apple-design` recomienda explícitamente nav/toolbars/sheets translúcidos con `backdrop-filter` (`skills/apple-design/SKILL.md:177-192`): choca con "glass solo en panel/POS, sin glass en landing". Adopción solo parcial.

### 2.2 `jakubkrehel/skills` — 16 skills upstream vs 13 trackeadas

| Skill | Primera aparición (fuente) | Categoría | ¿Compatible? | Veredicto |
|---|---|---|---|---|
| `better-motion` | 2026-11-18, [`8d4b209c`](https://github.com/jakubkrehel/skills/commit/8d4b209c) (merge `672ae44`, 2026-11-18) | craft (microinteracciones) | **Sí**: incluye recetas CSS, Tailwind y Motion en `transitions.md`; fallback `cubic-bezier(0.2,0,0,1)` sin librería (`SKILL.md:48,79,186`); Tailwind utilities estándar, válidas en v4 | Mejor candidata nueva; requiere decidir convivencia con las 4 skills de motion ya trackeadas |
| `upskill` | 2026-11-17, [`18e7ff52`](https://github.com/jakubkrehel/skills/commit/18e7ff52) | meta (propone skills/hooks) | Sí, `disable-model-invocation: true` | Baja prioridad para este mapa |
| `afk` | 2026-11-07, [`e37e34e`](https://github.com/jakubkrehel/skills/commit/e37e34e) | meta (trabaja en rama local) | Parcial: crea cambios en branch local; compatible con "rama propia" de `AGENTS.md:22`, pero exige no mergear | Baja prioridad |

Upstream **eliminó** `teardown` el 2026-11-12 ([`37744ed`](https://github.com/jakubkrehel/skills/commit/37744ed)); nunca estuvo en nuestro lock, así que no hay acción.

### 2.3 `vercel-labs/agent-skills` — 9 skills upstream vs 2 trackeadas

Las 7 no trackeadas son (fechas de creación según `git log --reverse`, URL al HEAD `5a37a63`):

| Skill | Creada | Categoría | ¿Compatible? | Veredicto |
|---|---|---|---|---|
| `composition-patterns` | 2026-01-25, [`355a9f2`](https://github.com/vercel-labs/agent-skills/commit/355a9f2) | **componentes visuales** (compound components, explicit variants, sin boolean props, `react19-no-forwardref`) | **Sí**: 0 referencias a Next.js en sus reglas; React 19 genérico ([`SKILL.md`](https://github.com/vercel-labs/agent-skills/blob/5a37a63/skills/composition-patterns/SKILL.md)) | Candidata fuerte para el catálogo de componentes |
| `react-view-transitions` | 2026-03-29 | craft (transiciones) | Parcial: mezcla API genérica de React 19 con `next/link`, `next/navigation` y Next 16.2 (`references/nextjs.md`); Astro ya tiene su propio router de view transitions | No adoptar tal cual; solo reutilizar recipes CSS |
| `react-best-practices` | 2026-01-13 | performance React/Next | Parcial | Fuera del foco craft del mapa |
| `vercel-optimize` | 2026-05-15 | costos/performance | Parcial (Astro limitado) | Fuera de foco |
| `deploy-to-vercel`, `vercel-cli-with-tokens`, `react-native-skills` | 2026-03 | deploy / RN | RN incompatible; deploy fuera de foco | Descartadas para este mapa |

### 2.4 `mattpocock/skills`

No hay skills nuevas relevantes: desde el pin `5863806d` (2026-11-12) hasta HEAD `abeeaf9` (2026-11-19) solo entran `software-factory` (en `in-progress`, 2026-10-31) y cambios de CI/frontmatter (`git diff --stat 5863806d..abeeaf9`). El [CHANGELOG 1.3.2](https://github.com/mattpocock/skills/blob/abeeaf9/CHANGELOG.md) recomienda re-ejecutar `/setup-matt-pocock-skills` para refrescar `docs/agents/` (tracker, labels, cierre de issues); nuestro `docs/agents/*.md` fue generado el 2026-11-18 con el pin correcto.

## 3. Skills TRACKEADAS que cambiaron upstream

| Fuente | Commit (fecha UTC) | Alcance | Efecto en nuestra copia |
|---|---|---|---|
| `emilkowalski/skills` | [`0f2e23b3`](https://github.com/emilkowalski/skills/commit/0f2e23b3) — 2026-11-13, "Fix wrong APIs and cross-skill contradictions in the skills (#51)" | **Las 10 skills trackeadas** + otras 8: 28 archivos, +219/−200 | Nuestra copia local es de 2026-10-13; quedó desactualizada en reglas de motion y APIs |
| `jakubkrehel/skills` | [`19ab1fa1`](https://github.com/jakubkrehel/skills/commit/19ab1fa1) — 2026-11-17, "Resolve contradictions and ambiguity found by cold reads and trials"; [`92a79f31`](https://github.com/jakubkrehel/skills/commit/92a79f31) — 2026-11-17, "Trim restated rules and glossary content" | **Las 13 skills trackeadas**: se añadió `reporting.md` por skill y se recortaron glosarios/redundancias | Nuestro lock v2 puso `computedHash: ""` a las 13; hoy no hay forma de verificar la copia local |
| `vercel-labs/agent-skills` | [`f766b64a`](https://github.com/vercel-labs/agent-skills/commit/f766b64a) — 2026-10-29, "bundle pinned guidelines instead of fetching from main"; [`53b6e3d`](https://github.com/vercel-labs/agent-skills/commit/53b6e3d) — 2026-10-29, documentación de actualización | `web-design-guidelines` v1.0.0 → **v1.1.0** | **Cambio funcional relevante**, detalle abajo |
| `mattpocock/skills` | — | — | Sin cambios en `prototype`, `setup-matt-pocock-skills` ni `triage` desde `5863806d` |

### 3.1 `web-design-guidelines`: de "fetch en vivo" a snapshot pineado (P0)

- Nuestra copia local (`.agents/skills/web-design-guidelines/SKILL.md:1-30`) declara `version: "1.0.0"` e instruye: *"Fetch the latest guidelines from the source URL below"* → `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` (mutable, sin pin).
- Upstream desde 2026-10-29 declara `version: "1.1.0"`, incluye `references/command.md` con el snapshot, fija `Source: .../blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md` y `SHA-256: d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`, y dice explícitamente **"Do not fetch rules from the network"** ([`SKILL.md@5a37a63`](https://github.com/vercel-labs/agent-skills/blob/5a37a63/skills/web-design-guidelines/SKILL.md), [commit `f766b64a`](https://github.com/vercel-labs/agent-skills/commit/f766b64a)).
- Impacto: `PRD-UX-01:45,53` y UX-S12 usan esta skill como evidencia de revisión junto a `check:ui`/`check:contrast`. Con v1.0.0 el resultado de una revisión depende de lo que esté en `main` ese día: **no es reproducible ni apto para gate**. `writing-guidelines` no cambió desde 2026-05-25.

### 3.2 Observación de gobernanza del lock (sin conclusión sobre el algoritmo)

`skills-lock.json` no documenta cómo se calcula `computedHash`. Hechos verificables en el repo: en v2 se vaciaron los hashes de **15 skills** (13 de jakubkrehel + `web-design-guidelines` y `writing-guidelines`), y los hashes v2 de emilkowalski/mattpocock no coinciden con SHA-256 de `SKILL.md` ni de la copia local (`sha256sum` sobre `.agents/skills/*/SKILL.md` y sobre el blob del commit pineado). En cambio los hashes v1 sí coincidían con la copia local de emilkowalski. Conclusión conservadora: **el lock hoy no sirve como señal de drift sin la herramienta instaladora**, y conviene fijar también `commit` por fuente (como ya hace mattpocock) en una decisión de gobernanza.

## 4. Evaluación de adoptabilidad (filtro de stack y reglas)

Stack/reglas aplicadas: Astro 7 + React 19 + Tailwind 4 + system-fonts; sin `--mo-*` (SPEC-UI-00); sin Google Fonts; light/dark por dispositivo; glass solo panel/POS; `check:ui` y `check:contrast` como gates; `AGENTS.md:22,26,29` (rama propia, `verify` como lint, declarar desviaciones).

| Skill (estado) | Craft | Componentes visuales | UI/UX | Deps nuevas | Conflicto con reglas | Veredicto |
|---|---|---|---|---|---|---|
| `web-design-guidelines` v1.1.0 (trackeada, cambiada) | ✓ revisión | — | ✓ | No | Ninguno; mejora reproducibilidad | **Actualizar ya** |
| `mobile-native` (no trackeada) | ✓ estados/tap/100dvh | — | ✓ PWA/POS | No | Ninguno; refuerza UX-S6 y DS-S23 | **Adoptar** |
| `better-motion` (nueva) | ✓✓ motion | — | ✓ | No (recetas CSS/Tailwind) | Solapamiento con `animate`/`animate-performance` de Emil | **Adoptar con decisión de política** |
| `remove-animations` (nueva) | ✓✓ restraint | — | ✓ | No | Ninguno | **Adoptar dentro de la política de motion** |
| `learn-taste` (nueva) | ✓ gobernanza | — | ✓ | No | Escribe en `AGENTS.md`/checks: requiere aprobación explícita | **Adoptar como mecanismo** |
| `composition-patterns` (no trackeada) | — | ✓✓ API de componentes | ✓ | No | Ninguno (React 19, sin Next) | **Adoptar para catálogo** |
| `gestures` (nueva) | ✓✓ | — | ✓ drawer | **Vaul** | "sin librería nueva sin veredicto" (PRD-UX-01 UX-S3) | **Requiere ADR** |
| `apple-design` (no trackeada) | ✓ tipografía/motion | — | ✓ | Motion/Framer (opcional) | Glass/translucidez global vs "glass solo panel/POS" | **Solo extracción parcial** |
| `choreograph` (nueva) | ✓ | — | ✓ | Motion | Igual que `gestures` | **Requiere ADR** |
| `react-view-transitions` (no trackeada) | ✓ | — | ✓ | No, pero Next-oriented | Astro ClientRouter | **No adoptar tal cual** |
| `ask-emil`, `ask-matt` (routers) | — | — | — | No | `disable-model-invocation` | Opcional, no aporta craft |
| `afk`, `upskill` (meta) | — | — | — | No | `afk` crea branches | Baja prioridad |
| `animate-expo`, `write-swift`, `react-native-skills` | — | — | — | Sí / plataforma incorrecta | Incompatibles | **Descartar** |

## 5. Recomendación: qué merece decisión en el mapa #279

Ordenadas por prioridad; ninguna implica implementación visual (fuera de scope del mapa).

1. **D1 — Pin y refresh de fuentes (P0, decisión de gobernanza, ADR corto).** Actualizar `web-design-guidelines` a v1.1.0 con `references/command.md` y su SHA-256, y exigir `commit` + hash verificable para **todas** las fuentes del lock (hoy 15 hashes vacíos). Sin esto, las decisiones del mapa no son reproducibles y UX-S12 no puede usar la skill como gate. Evidencia: §3.1 y §3.2.
2. **D2 — Verificación visual a 360 px claro/oscuro (DS-S23) con `mobile-native` (P1, PRD/spec pequeño).** Responde directamente al ítem "Not yet specified" del mapa sobre cómo verificar visualmente una adopción. Skill CSS-only, sin deps, ya esperada por `PRD-UX-01` UX-S6. Evidencia: §2.1, commit `0b85d4b` (2026-09-15); `package.json` sin libs de gestos.
3. **D3 — Política de motion del repo (P1, ADR).** `better-motion` (2026-11-18) y `remove-animations` (2026-10-28) son nuevas y compatibles, pero se solapan con `animate`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `choreograph` y `gestures`. La decisión no es "instalar todo" sino **qué skill decide qué y con qué librería** (CSS/Tailwind por defecto; Motion/Vaul solo si se aprueba su dependencia). Evidencia: §2.1-2.2, §4.
4. **D4 — Captura de reglas de diseño con `learn-taste` (P2, decisión de proceso).** Cierra el loop entre correcciones del usuario y `AGENTS.md` / `check:ui` / `check:contrast`; su regla "a check beats a sentence" encaja con el gate de `verify`. Requiere explicitar que solo escribe tras aprobación. Evidencia: `skills/learn-taste/SKILL.md` en [`64eb3de`](https://github.com/emilkowalski/skills/commit/64eb3de).
5. **D5 — Formato del catálogo de componentes con Tema Papel (P2, PRD).** `composition-patterns` (Vercel, 2026-01-25) es la única fuente nueva/trackeable centrada en **componentes visuales** y APIs reutilizables sin Next.js; combinar con `build-design`/`variant` de jakub (ya trackeadas) para decidir si el catálogo es Storybook, docs site o página interna. Evidencia: §2.3, §4.
6. **D6 — Librería de animación/gestos (P2, ADR condicionado).** `gestures` y `apple-design` recomiendan Vaul / Motion/Framer Motion y translucidez global. No adoptar hasta que exista un veredicto de librería (PRD-UX-01 UX-S3) y se acote el glass a panel/POS. Si no se quiere la dependencia, quedan fuera. Evidencia: `skills/gestures/SKILL.md:12,76-87`; `skills/apple-design/SKILL.md:177-192`.

**No merecen decisión en este mapa**: `animate-expo`, `write-swift`, `react-native-skills` (plataforma), routers (`ask-emil`, `ask-matt`), `afk`/`upskill` (meta), `react-view-transitions` (Next/Astro), `vercel-optimize`/deploy skills, y `react-best-practices` (foco performance).

## 6. Limitaciones

- Las fechas de "primera aparición" son la del **primer commit en ese repo** (todos creados en 2025-2026), no necesariamente la primera publicación mundial de la idea.
- No se ejecutaron las skills; la compatibilidad se evalúa sobre su contenido declarado y las dependencias del repo. Algunas recetas de Motion/Vaul pueden tener matices no verificados en ejecución.
- La semántica de `computedHash` del lock no está documentada en el repo, por lo que el drift se establece por **historial git upstream + diff de contenido**, no por comparación de hashes.
- Este archivo vive en una rama desechable; el coordinador debe añadir los context pointers a #279, no este research.

## 7. Fuentes primarias citadas

- Repos y metadata: `https://github.com/emilkowalski/skills`, `https://github.com/jakubkrehel/skills`, `https://github.com/vercel-labs/agent-skills`, `https://github.com/mattpocock/skills` (GitHub API, 2026-11-21).
- README de referencia de Emil: https://github.com/emilkowalski/skills#reference (2026-11-21).
- README de Jakub: https://github.com/jakubkrehel/skills#skills-that-help-build-great-interfaces (2026-11-21).
- CHANGELOG de Matt Pocock: https://github.com/mattpocock/skills/blob/abeeaf9/CHANGELOG.md (2026-11-21).
- Commits citados: `a81dbca`, `c8a7962`, `5206a950`, `f7ce8c0`, `64eb3de`, `0b85d4b`, `df49b5d` (emilkowalski); `19ab1fa1`, `92a79f31`, `8d4b209c`, `18e7ff52`, `e37e34e`, `37744ed` (jakubkrehel); `f766b64a`, `53b6e3d`, `355a9f2`, `5a37a63` (vercel-labs); `5863806d`, `abeeaf9` (mattpocock).
- Repo local: `skills-lock.json`, `git log --follow -- skills-lock.json`, `AGENTS.md`, `package.json`, `docs/diseno/PRD-UX-01-uso-skills-diseno-dashboard.md` (branch `research/skills-fuentes-trackeadas` @ `9559363`).
