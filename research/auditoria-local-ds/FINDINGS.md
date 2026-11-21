---
id: INV-DS-LOCAL-01
tipo: spec
estado: propuesto
modulos: []
depende_de: [PRD-DS-01, PRD-DS-02, PRD-DS-03, SPEC-UI-00, AUDITORIA-DS-01, PRD-UX-01, PRD-UI-01, PRD-UI-07]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Research del ticket #282 (hijo del mapa #279). Inventario local del sistema de diseño sobre el árbol
  en 9559363: 23 slices DS-S1..S23 con estado y evidencia, tokens documentados vs implementados, cobertura
  de las skills instaladas, y recomendación de qué brechas son decision-worthy para la spec del mapa.
---

# Research #282 — Inventario local del sistema de diseño y sus brechas

Rama desechable: `research/auditoria-local-ds` (desde `origin/main` en `9559363`). **No se abre PR**; este
documento es entrada para la spec del mapa #279, no código para mergear. El coordinador añadirá los
context pointers al mapa cuando cierren los tres research.

## 0. Método y fuentes

- Ejecutado como background agent propio con la disciplina de la skill `research`: solo fuentes primarias
  (archivos del repo leídos desde el worktree) y cada afirmación citada con `ruta:línea`. El enunciado del
  ticket #282 y el mapa #279 se leyeron con `gh issue view ... --json` (el render por defecto falla con el
  aviso de deprecación de Projects classic: `GraphQL: Projects (classic) is being deprecated ...`).
- Convención de notas: no existía `research/` en el árbol; el precedente es
  `research/comentarios-no-cubiertos/inventario.md` (commit `31c5f81`), también con frontmatter. Se replica
  esa convención en `research/auditoria-local-ds/FINDINGS.md`.
- Afirmaciones negativas (ausencia de catálogo, de skills, de capturas) se sostienen con el comando de
  búsqueda literal indicado en cada caso, no con una cita de línea.
- `node_modules` está ausente, así que no corrí `npm test`/Vitest. Sí corrí los dos gates read-only:
  `node scripts/check-ui.mjs` → **10/10**, y `node scripts/check-contrast.mjs` → **70/70**.

## 1. Inventario con estados y evidencia

### 1.1 Estados declarados de los documentos base

| Documento | Estado (frontmatter) | Evidencia |
|---|---|---|
| `PRD-DS-01` (tokens) | hecho | `docs/diseno/PRD-DS-01-tokens-tema-papel.md:4` |
| `PRD-DS-02` (componentes) | en curso | `docs/diseno/PRD-DS-02-componentes.md:4`; el propio doc precisa "Estado al 2026-10-21: en curso. Hechos DS-S12, S15 y S17" en `:19` |
| `PRD-DS-03` (adopción) | en curso | `docs/diseno/PRD-DS-03-adopcion-inventario.md:4` |
| `SPEC-UI-00` | hecho | `docs/diseno/SPEC-UI-00-implementacion.md:4` — **discrepancia menor**: `docs/INDEX.md:235` lo lista como `propuesto` |
| `AUDITORIA-DS-01` | hecho | `docs/diseno/AUDITORIA-DS-tema-papel.md:4` |
| `PRD-UX-01` | en curso | `docs/diseno/PRD-UX-01-uso-skills-diseno-dashboard.md:4`; UX-S0 (Sonner) está hecho según `:20` |
| `PRD-UI-01` … `PRD-UI-07` | todos en curso | `docs/diseno/PRD-UI-01-layout-pwa-360.md:4`, `PRD-UI-02-tipografia-escala.md:4`, `PRD-UI-03-color-contraste.md:4`, `PRD-UI-04-copy-voz.md:4`, `PRD-UI-05-accesibilidad.md:4`, `PRD-UI-06-polish-motion.md:4`, `PRD-UI-07-revision-stress.md:4` |

Los siete PRD-UI están "en curso" también en el índice: `docs/INDEX.md:178-185`.

### 1.2 Los 23 slices DS-S1…S23 (tabla de la auditoría)

La auditoría define cinco estados —hecho, parcial, falta, decisión, no aplica— en
`docs/diseno/AUDITORIA-DS-tema-papel.md:18`, con fecha 2026-10-17 sobre `6aace67` (`:14`). Conteo
resultante: **14 hecho, 3 parcial, 1 falta, 5 no aplica**.

| Slice | Estado | Evidencia / nota |
|---|---|---|
| DS-S1 Paleta llama y CTA | hecho | `AUDITORIA-DS-tema-papel.md:24`; tokens en `src/styles/global.css:21-26` y `src/styles/tokens-papel.css:19-24` |
| DS-S2 Ember en secundarias | hecho | `AUDITORIA-DS-tema-papel.md:25`; `global.css:55-58`, `src/styles/tema.css:65-93` |
| DS-S3 Papel y canvas claros | hecho | `AUDITORIA-DS-tema-papel.md:26`; `global.css:6-8` |
| DS-S4 Dark ambiente POS | hecho | `AUDITORIA-DS-tema-papel.md:27`; `tema.css:1-4,32-57`; `/venta` monta tema + `TemaInicial` en `src/pages/venta.astro:6-7,40`. Sin ambiente radial (decisión, `:83`) |
| DS-S5 Glass, radios, blur | hecho (panel/POS) | `AUDITORIA-DS-tema-papel.md:28`; `tema.css:95-130` (blur 16px en `:109-115`) |
| DS-S6 Tipografía | hecho | `AUDITORIA-DS-tema-papel.md:29`; pila del sistema en `global.css:66` |
| DS-S7 Variables `:root`/`.pos` | no aplica (decidido) | `AUDITORIA-DS-tema-papel.md:30`; `SPEC-UI-00-implementacion.md:19`; sin `--mo-` en `tests/panel-tokens.test.ts:77-78` |
| DS-S8 Motion reducido | hecho | `AUDITORIA-DS-tema-papel.md:31`; `global.css:181-200,244-251` |
| DS-S9 Adaptación a Inventario | hecho | `AUDITORIA-DS-tema-papel.md:32` |
| DS-S10 Launcher | no aplica | `AUDITORIA-DS-tema-papel.md:33` |
| DS-S11 Rail fijo | no aplica | `AUDITORIA-DS-tema-papel.md:34` |
| DS-S12 Hub papel | hecho | `AUDITORIA-DS-tema-papel.md:35` |
| DS-S13 POS oscuro + ticket papel | **parcial** | `AUDITORIA-DS-tema-papel.md:36`: solo ticket claro en `/t/[token]` y `@media print` 58mm; AC completa del POS oscuro en `PRD-DS-02-componentes.md:31` (topheader glass `blur 20px`, leftpane glass 8%, switchpane, vars de pago, grilla 5-cols) sin evidencia en la auditoría |
| DS-S14 Login | no aplica | `AUDITORIA-DS-tema-papel.md:37` |
| DS-S15 Listas alto volumen | hecho | `AUDITORIA-DS-tema-papel.md:38` |
| DS-S16 Onboarding smoke | no aplica | `AUDITORIA-DS-tema-papel.md:39` |
| DS-S17 Constraints táctiles | hecho | `AUDITORIA-DS-tema-papel.md:40` |
| DS-S18 Qué se reutiliza | **parcial** | `AUDITORIA-DS-tema-papel.md:41`: tokens y contratos de papel sí; `--mo-*` no |
| DS-S19 Qué no se trae | hecho | `AUDITORIA-DS-tema-papel.md:42` |
| DS-S20 Stack Inventario | hecho | `AUDITORIA-DS-tema-papel.md:43`; radio 20px coherente con `PRD-DS-03-adopcion-inventario.md:28` |
| DS-S21 Email papel NE12 | hecho | `AUDITORIA-DS-tema-papel.md:44` |
| DS-S22 Criterios de aceptación | **parcial** | `AUDITORIA-DS-tema-papel.md:45`: falta ticket impreso idéntico y "legible a 2 m" |
| DS-S23 Fases 0 a 2 | **falta** | `AUDITORIA-DS-tema-papel.md:46`: sin capturas 360px dark/light lado a lado; AC en `PRD-DS-03-adopcion-inventario.md:36,46` |

Las seis decisiones pendientes que la auditoría dejaba para Mauri están todas tachadas como resueltas
en `AUDITORIA-DS-tema-papel.md:80-85`; los bloques "Resuelto" de `:48-62` registran el cierre.

### 1.3 Tokens documentados vs implementados

| Concepto | Documentado | Implementado | Veredicto |
|---|---|---|---|
| Paleta llama/ember/canvas | `PRD-DS-01:21-28` (`flame #ffd600`, `hover #ffe033`, `orange #f57c00`, `deep #e64a19`, `rust #bf360c`, papel `#f7f5f2`) | `global.css:21-26`, `global.css:6-8`, `tokens-papel.css:19-24` | OK, con renombrado `--mo-*` → `--color-*` decidido en `SPEC-UI-00:19` |
| Gradiente y sombras CTA | `PRD-DS-01:21` | `global.css:62-64` | OK |
| Dark POS `mid #333333` | `PRD-DS-01:29` | `--color-mid: #3a3a3a` en `global.css:60` y `tokens-papel.css:56` | Deriva menor (no decidida explícitamente) |
| Radio de tarjeta 12px | `PRD-DS-01:30` | `--radius-card: 1.25rem` (20px) en `global.css:79`; 12px en venta y 16px en panel según `AUDITORIA-DS:28` | Adopción decidida en `PRD-DS-03:28` |
| Blur 16px | `PRD-DS-01:30` | `tema.css:109-115` | OK |
| Tipografía Montserrat | `PRD-DS-01:36` | `system-ui, …` en `global.css:66` | Descartado por decisión (`AUDITORIA-DS:29,54`) |
| Ambiente radial en POS | `PRD-DS-01:29` | ausente; `AUDITORIA-DS:27,83` | Descartado por decisión |
| Nombres `--mo-*` | `PRD-DS-01:37` | ausentes; `SPEC-UI-00:19`, `tests/panel-tokens.test.ts:77-78` | Descartado por decisión |

Espejo y trinquetes: `tests/panel-tokens.test.ts:46-50` exige que `tokens-papel.css` sea espejo exacto del
`@theme`; `:26-31` prohíbe hex/rgb hardcodeados en panel; `:34-38` exige 44px táctiles. Los gates viven en
`scripts/check-ui.mjs:15-39` (10 invariantes) y `scripts/check-contrast.mjs:4-18` (70 pares declarados en
`scripts/check-contrast-lib.mjs`). **Deriva documental**: `SPEC-UI-00:30` dice "9 invariantes" pero el
script tiene 10 checks y reporta 10/10.

## 2. Qué brechas cubren ya las skills instaladas

Instaladas en `.agents/skills/` y trackeadas en `skills-lock.json:3-181` (29 entradas, fuentes
`emilkowalski/skills`, `jakubkrehel/skills`, `vercel-labs/agent-skills`, `mattpocock/skills` y una local).
Hay tres directorios locales **no trackeados** en el lockfile: `control-app`, `verify-plan-cambio`,
`verify-venta-sync` (comparación literal de `ls .agents/skills/` contra `Object.keys(skills-lock.skills)`).

Cobertía según la matriz del propio PRD-UX-01 (`:63-76`) y las fuentes de la serie PRD-UI:

- **Craft (tipografía, color, layout, accesibilidad, UI, copy)**: `better-accessibility`, `better-colors`,
  `better-layout`, `better-typography`, `better-ui`, `better-writing` ya cubren UX-S4 (`PRD-UX-01:36,69`) y
  son fuente declarada de `PRD-UI-02:10`, `PRD-UI-03:10`, `PRD-UI-04:10`, `PRD-UI-05:10`.
- **Revisión/estrés**: `better-interface`, `interface-review`, `web-design-guidelines`, `writing-guidelines`
  cubren UX-S8 (`:45,73`); `break`, `break-ui` cubren UX-S9 (`:46,74`).
- **Motion**: `emil-design-eng`, `find-animation-opportunities`, `animate`, `animation-performance`,
  `review-animations`, `improve-animations` cubren UX-S1/S5/S10 (`:28,37,47,66,70,75`) y `PRD-UI-06:16`.
- **Decisiones de estado/variantes/librería/toasts**: `state-machine`, `variant`, `build-design`,
  `explain-interface`, `pick-ui-library`, `ask-sonner` cubren UX-S0/S3/S7 (`:22,30,39,65,67-68,72`) y
  `PRD-UI-07:16`.
- **Dirección visual / prototipado**: `prototype` de `mattpocock/skills` está instalado
  (`skills-lock.json:124-130`) y el mapa #279 lo designa para "dirección visual".

**Conclusión**: la brecha de *craft* y de revisión ya está cubierta por skills instaladas; lo que falta no
es una skill nueva para decidir, sino evidencia visual, un catálogo y dos skills citadas pero no instaladas:
`apple-design` y `mobile-native` aparecen en `PRD-UI-01:10,16`, `PRD-UI-06:16`, `PRD-UX-01:16,38,71`,
`PRD-DASH-01:15` y `docs/adr/0032-layout-pwa.md:15`, pero no están en `.agents/skills/` ni en
`skills-lock.json` → UX-S6 queda sin ejecutar tal como está escrita.

## 3. Tabla de brechas

| Brecha | Estado local | ¿Cubierta por skill instalada? | Decision-worthy para #279 | Evidencia |
|---|---|---|---|---|
| DS-S23 capturas 360px claro/oscuro por fase | falta, sin evidencia | Parcial: `prototype` ayuda a explorar, no a certificar | **SÍ** — define formato/patrón de verificación visual | `AUDITORIA-DS:46`; `PRD-DS-03:36,46`; #279 "Not yet specified" |
| DS-S13 POS oscuro | parcial: ticket sí, chrome POS oscuro sin AC verificada | No (es implementación + verificación, no craft) | **SÍ, acotada** — ¿alcanzan los roles globales de `tema.css` o se exige el chrome POS específico? | `AUDITORIA-DS:36`; `PRD-DS-02:31`; `venta.astro:6-7,40`; `AUDITORIA-DS:83` |
| Ausencia de catálogo de componentes | no existe ningún artefacto | No | **SÍ** — forma (Storybook / docs site / página interna) y contenido | búsqueda sin resultados: `grep -r -n -i -E 'storybook|catálogo de componentes|component catalog|design system catalog|styleguide' docs scripts src package.json`; #279 "Not yet specified" |
| PRD-DS-02 / PRD-UX-01 "en curso" | backlog de ejecución, no una decisión | Sí, la mayoría de sus historias usan skills instaladas | **NO** como decisión; sí como línea base/contexto | `PRD-DS-02:4,19`; `PRD-UX-01:4,20` |
| Skills citadas y no instaladas (`apple-design`, `mobile-native`) | bloquea UX-S6 / UI-S1 | No | **SÍ, pero en el hilo de skills** (no en el de dirección visual) | `PRD-UX-01:38,71`; `PRD-UI-01:10,16`; `skills-lock.json:3-181` |
| Deriva `mid #333333` vs `#3a3a3a`; radio 12 vs 20px | menor; radio ya decidido | No | No | `PRD-DS-01:29-30`; `global.css:60,79` |
| Auditoría internamente desactualizada | DS-S23 dice depender de DS-S4/S5/S6, ya resueltos | No | No (corrección documental) | `AUDITORIA-DS:46` vs `:52-54,80-85` |
| `check:ui` 9 vs 10 invariantes | documental | No | No | `SPEC-UI-00:30` vs `scripts/check-ui.mjs:15-39` |

## 4. Recomendación para la spec del mapa #279

1. **DS-S23 — decisión sí.** La audit la marca `falta` (`AUDITORIA-DS:46`) y el mapa ya pregunta qué patrón
   de la comunidad conviene para verificar adopción visual. Punto clave para la spec: la dependencia que la
   auditoría declara ("cerrar DS-S4/S5/S6") **ya está cerrada** (`AUDITORIA-DS:52-54,83-85`; `tema.css:32-57`;
   `global.css:66`), así que es una decisión pura de formato de evidencia, no un bloqueo de implementación.
2. **DS-S13 — decisión sí, acotada.** No reabrir "dark global" (resuelto en `AUDITORIA-DS:83` y montado en
   `/venta` según `venta.astro:6-7,40`). Lo que falta es decidir si el AC completo del POS oscuro de
   `PRD-DS-02:31` entra en la spec o se acepta la piel oscura global como equivalente, y cómo se verifica.
3. **Catálogo — decisión sí.** No hay ningún artefacto de catálogo en el repo (búsqueda del §3). El mapa ya
   lista "qué forma toma y qué muestra" como no especificado: conviene que la spec fije forma y contenido
   mínimo, y que lo separé del hilo de skills.
4. **PRD-DS-02 y PRD-UX-01 "en curso" — no merecen una decisión nueva.** Son estado de ejecución
   (`PRD-DS-02:4,19`; `PRD-UX-01:4,20`); la spec debe registrarlos como línea base, no reabrirlos. La única
   excepción accionable es el punto 5 (skills no instaladas), que pertenece al hilo de política de skills.
5. **Cobertura de skills: no hace falta una skill nueva para craft.** Las instaladas cubren la matriz
   `PRD-UX-01:63-76`. Solo señalar al coordinador del hilo de skills que `apple-design`/`mobile-native` se
   citan en docs pero no existen localmente, por si la research de comunidad propone sustitutos —el mapa ya
   contempla el cambio de política de modelos por skill como notable.

## 5. Limitaciones

- Sin `node_modules`, no se ejecutaron los tests Vitest; la evidencia de tests es estática (lectura de
  `tests/panel-tokens.test.ts`) más las corridas read-only de `check:ui` (10/10) y `check:contrast` (70/70).
- La auditoría es de 2026-10-17 sobre `6aace67` (`AUDITORIA-DS:14`) y varios bloques "Resuelto" (`:48-62`)
  son posteriores; su tabla de estados no fue recalculada. Este documento la reporta tal cual y marca las
  inconsistencias, sin reescribirla.
- No se tocó el cuerpo del mapa #279; el coordinador añadirá los context pointers tras cerrar los tres research.
