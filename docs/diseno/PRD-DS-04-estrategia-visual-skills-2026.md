---
id: PRD-DS-04
tipo: prd
estado: aceptado
modulos: [design-system, panel]
depende_de: [PRD-DS-01, PRD-DS-02, PRD-DS-03, PRD-UX-01, SPEC-UI-00, AUDITORIA-DS-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Estrategia visual, skills y componentes para la app web (2026): criterio de adopción, catálogo, verificación 360px, pinneo de skills, brechas/derivas y política de motion, sin implementar cambios visuales.
---

# PRD-DS-04 - Estrategia visual, skills y componentes para la app web (2026)

Fuente: mapa wayfinder GitHub [#279](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/279), investigación #280/#281/#282 y decisiones #283–#289, #293. Restringido por ADR-0008, ADR-0009, ADR-0010, ADR-0037, ADR-0044, ADR-0113 y por `AGENTS.md` (sin migración de UI/lib fuera de alcance, sin tipografía/landing fuera de alcance, sin implementación visual en este mapa).

> Estado al 2026-11-21: aceptado y con el pinneo de #287 implementado (lock v3 y `web-design-guidelines` v1.1.0). Decisiones vinculantes #283–#289 y #293 (detalle en "Decisiones previas vinculantes"); veredictos en la tabla "Veredictos".

## Propósito y alcance

Este PRD fija, para la **app web** de `sistema-inventario2` (PWA Astro 7 + React 19 + Tailwind 4, Tema Papel, system fonts, multi-tenant, offline-first), una estrategia 2026 de:

- qué **enfoque** adoptar (craft ejecutable, veredicto reproducible, documentación),
- qué **skills** y **componentes visuales** adoptar/adaptar/descartar/diferir,
- cómo se **verifica** visualmente (360px, dark, estados) y cómo se **pinean** las fuentes de skills.

**Alcance:** app web (panel/POS y superficies web de la app).  
**Fuera de alcance:** sitio de documentación del proyecto, migración a otra librería de UI o a otro framework CSS, cambios de tipografía (decidido: system font stack), directriz visual del landing (decidido: sin neon/glass), y **la implementación de cambios visuales** (este documento decide y registra; no ejecuta).

## Decisiones previas vinculantes

Índice de decisiones del mapa (detalle en los issues enlazados):

- [#283 forma del artefacto](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/283): este PRD es el rector (`estado: aceptado`, módulos `[design-system, panel]`). ADRs opcionales; `PRD-DS-02`/`PRD-UX-01` siguen como línea base.
- [#284 criterio de adopción](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/284): vetoes duros + severidades de adopción `P0→descartar`, `P1→diferir`, `P2→adaptar`, `P3→adoptar`; categorías adoptar/adaptar/descartar/diferir; veredictos previos vinculantes salvo ADR que los reemplace; Mauri decide en grilling.
- [#285 catálogo de componentes](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/285): índice + entradas Markdown en `docs/diseno/componentes/` (`id: COMP-<NN>`, `tipo: spec`, `depende_de: [PRD-DS-02, PRD-DS-04]`); “entrada de catálogo” canónico; alcance ui+panel/POS; `tests/panel-tokens.test.ts` fuente de verdad; sin Storybook/shadcn/Base UI; `composition-patterns` se trata en veredictos.
- [#287 pinneo y refresh de skills](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/287): lock v3 (commit obligatorio en fuentes GitHub, `computedHash` no vacío en todas, `version` opcional, sin timestamps); 16 hashes vacíos son deuda; drift local = P0 / upstream informativo; chequeo determinista solo-local documentado aquí, sin gate en `verify`; refresh bajo demanda autorizado por Mauri; `web-design-guidelines` migra a v1.1.0 snapshot+SHA-256 (supera T-UI-07).
- [#288 verificación visual 360px](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/288): escala existente `HIGH/MEDIUM/LOW` + `Block/Approve` (reutiliza `review:gate`; `P0–P3` exclusivo para adopción); Playwright e2e como base (360×800, dark/RTL/zoom ya cubiertos), `/control-app` solo con sesión sembrada; evidencia en `.agents/skills/control-app/artifacts/<fecha>/`; DS-S23 reinterpretada (F0 tokens+listas+panel, F1 venta/POS oscuro+ticket, F2 onboarding/email); DS-S13 suficiente con piel oscura global + ticket claro (chrome `.pos` fuera de alcance/deuda).
- [#286 brechas del Tema Papel](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/286): entran DS-S13 (Fase 1) y DS-S23 (Fases 0–2 reinterpretadas); fog: DS-S22 falta “ticket legible a 2m”, DS-S18, DS-S14/DS-S16, chrome `.pos`; deriva: `SPEC-UI-00:30` dice 9 invariantes vs 10 reales en `check-ui.mjs`.
- [#289 motion y skills de dirección visual](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/289): veredictos de skills (tabla abajo); UX-S6 abierta parcial (pendiente ADR por gestures/choreograph); añadir `baseline` a `GLOSSARY.md`.
- [#293 veredicto pick-ui-library](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/293): cerrada por premisa falsa (ya instalada/trackeada); su veredicto queda en esta tabla.

## Veredictos

Tabla vinculante (categorías/adopción según #284). El presente documento es la fuente de verdad de estos veredictos hasta que un ADR los reemplace.

| Elemento | Fuente/skill | Categoría | Etiqueta | Sev. adopción | Fecha | Veredicto (resumen) | Notas/enlace |
|---|---|---|---|---|---|---|---|
| `pick-ui-library` | skill instalada (emilkowalski) | evaluar caso a caso | (ninguno) | P3 | 2026-11-21 | Mantener como referencia para decisiones puntuales; sin librería nueva sin veredicto explícito (alineado a PRD-UX-01). | #293; `skills-lock.json:137` |
| `web-design-guidelines` | vercel-labs/agent-skills | adoptar (migración) | (ninguno) | P0 | 2026-11-21 | Migrada a v1.1.0 con snapshot pineado + SHA-256 (commit `5a37a63`, snapshot `d246b026…`); reemplaza el fetch en vivo de `main`. Supera T-UI-07 (avance `docs/roadmap/avances/T-UI-07.md`, ADR-0038; aceptado en `SPEC-UI-00:38`). | #287, #280, T-UI-07 |
| `mobile-native` | skill (ausente hoy) | adoptar | (ninguno) | P3 | 2026-11-21 | Adoptar como guía CSS-only (safe areas, touch, `100dvh`, drawer/sheet) para app web; apoya UX-S6 parcial. | #289 |
| `apple-design` | skill (ausente hoy) | descartar | (ninguno) | P0 | 2026-11-21 | Conflicto con AT1/glass solo panel/POS y decisiones vigentes; cualquier propuesta global requiere ADR. | #289 |
| `gestures` / `choreograph` | skills (ausentes hoy) | diferir | **requiere ADR** | P1 | 2026-11-21 | Requieren ADR (librería/gestos, alcance, no glass global). | #289 |
| `better-motion` | skill (ausente hoy) | adaptar | (ninguno) | P2 | 2026-11-21 | Recetas aditivas CSS/Tailwind compatibles con ADR-0037/DS-S8 (`transform/opacity`, <300 ms, `prefers-reduced-motion`). | #289 |
| `remove-animations` | skill (ausente hoy) | adoptar | (ninguno) | P3 | 2026-11-21 | Receta para habilitar/reducir motion de forma consistente con políticas existentes. | #289 |
| `learn-taste` | skill (ausente hoy) | adoptar | (ninguno) | P3 | 2026-11-21 | Convertir correcciones recurrentes en reglas/checks (`check:ui`, checklist de revisión, `AGENTS.md`/guías según aplique). | #289 |
| `composition-patterns` | vercel-labs/agent-skills | diferir (tratar en catálogo) | (ninguno) | P2 | 2026-11-21 | Útil para entradas de catálogo/componentes React; aplicar junto a #285 sin introducir Next.js ni cambiar stack. | #280, #285 |

## Política de skills (lock v3 y refresh)

- **Pin canónico:** commit de la fuente + SHA-256 del archivo instalado (lock v3). `commit` obligatorio para `sourceType: github`; `computedHash` obligatorio y no vacío en todas; `version` opcional del frontmatter; sin timestamps (la fecha la da el commit del lock en git).
- **Deuda (saldada 2026-11-21):** los **16** `computedHash` vacíos (13 de `jakubkrehel` + `verify-inventario`, `web-design-guidelines` y `writing-guidelines`) se completaron con el hash del folder instalado. Una skill sin hash **no se considera reproducible** y debe completarse en el siguiente refresh.
- **Drift:** local (hash del folder instalado no coincide con `computedHash`) = **P0**, skill no se usa hasta reconciliar (restaurar o registrar fork local explícito); upstream (commit de la fuente movido) = informativo, dispara refresh bajo demanda y no bloquea.
- **Chequeo determinista:** `scripts/check-skills-lock.mjs` (propuesto), solo local y sin red: (a) `computedHash` no vacío en todas, (b) hash del folder instalado coincide con `computedHash`, (c) fuentes GitHub tienen `commit`. Comparar upstream no es parte del chequeo rutinario. **No entra en `verify`**: se documenta aquí y se implementa aparte si se decide.
- **Refresh:** bajo demanda (cuando una decisión lo requiere o el chequeo detecta drift), autorizado por Mauri; el agente ejecuta y registra veredicto en esta tabla con fuente/fecha/commit.
- **`web-design-guidelines` (migrada 2026-11-21):** **v1.1.0** con snapshot pineado en `references/command.md` (fuente `434b7f9`, SHA-256 `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`) y entrada de lock en el commit `5a37a63`; reemplaza el fetch en vivo de `main` y corrige la inconsistencia de repo de origen. Queda **superado T-UI-07** en ese punto (según #287).
- **Implementación (2026-11-21):** `skills-lock.json` v3 con `commit` en las 28 fuentes GitHub y `computedHash` en las 29 entradas; `version` solo donde el frontmatter lo trae (`web-design-guidelines` 1.1.0, `writing-guidelines` 1.0.0); sin timestamps. Las copias locales adaptadas de `emilkowalski/skills` quedan pineadas al HEAD upstream del baseline (`2d22863`); el `computedHash` registra la copia instalada (adaptada), no el árbol upstream.

## Catálogo de componentes visuales

- **Adopción:** sí. Forma: **índice + entradas Markdown** en `docs/diseno/componentes/` con `id: COMP-<NN>`, `tipo: spec`, `depende_de: [PRD-DS-02, PRD-DS-04]`. Término canónico: **“entrada de catálogo”**.
- **Alcance:** `ui` + panel/POS (app web). Sin landing.
- **Naturaleza:** documentación con capturas/estados; **no** Storybook. `tests/panel-tokens.test.ts` sigue siendo fuente de verdad de tokens/estilos; no se añade gate nuevo en este mapa.
- **Descartado:** Storybook y adopción de shadcn/Base UI como base ahora. `composition-patterns` se evalúa como insumo de escritura de entradas (ver tabla de veredictos), sin cambiar stack.

## Verificación visual 360px y severidades

- **Severidades:** **P0–P3 estilo `critique`/`audit`** (P0 = bloqueante, P1 = mejorable, P2 = parcial, P3 = observadora), con veredicto de gate **Block / Approve** (`better-interface`, `review:gate`). La escala HIGH/MEDIUM/LOW queda exclusiva de aprobación; no se usa `V0–V3`.
- **Herramienta base:** Playwright e2e (ya cubre 360×800, dark, RTL y zoom 200% en flujos existentes). `/control-app` solo cuando haga falta sesión sembrada/tenant.
- **Evidencia:** cuando sea evidencia de PR, PNG+JSON en `.agents/skills/control-app/artifacts/<AAAA-MM-DD>/`. `test-results/` solo para exploraciones (gitignored).
- **Gate:** reutiliza `review:gate`; sin gate nuevo.
- **DS-S23 (reinterpretada a superficies reales):** Fase 0 = tokens + listas + panel; Fase 1 = venta/POS oscuro + ticket; Fase 2 = onboarding/email. Evidencia: **una captura 360px claro/oscuro lado a lado por fase** (artefactos en la ruta indicada). No se inventan pantallas (launcher/hub/rail no aplican en Inventario).
- **DS-S13:** suficiente con **piel oscura global** + **ticket claro** (`/t/[token]`, render de ticket). El chrome `.pos` específico del AC (glass topheader, panes, switchpane, grilla 5 columnas) queda como **deuda documentada** y fuera de alcance de esta verificación (`.pos` no existe hoy).

## Brechas, Derivas y Deuda aceptada

### Brechas (entran a la spec, sin ejecución en este mapa)

- **DS-S13 (Fase 1):** venta/POS oscuro + ticket claro como objetivo de evidencia/verificación en Fase 1 de DS-S23 (chrome `.pos` queda en Deuda aceptada).
- **DS-S23 (Fases 0–2):** plan de evidencia por fase reinterpretada (F0/F1/F2) con capturas 360px claro/oscuro lado a lado por fase.

### Derivas (doc vs código) — acción documental

- **`SPEC-UI-00:30`** indica “9 invariantes” mientras `scripts/check-ui.mjs` aplica **10** (`spec, css-motion, css-smooth, css-focus, css-dvh, css-input, css-tnum, layout-viewport, layout-theme, no-internal`). Corregir la documentación en `SPEC-UI-00` (y referencias) en el mismo PR del PRD o en follow-up; **sin tocar código de `check-ui.mjs`** en este mapa.

### Deuda aceptada / Fog

- Chrome `.pos` específico de DS-S13 (glass topheader, panes, switchpane, grilla 5 columnas): no existe en Inventario; no se exige en esta verificación.
- DS-S22: 'ticket impreso identico y legible a 2m' sin evidencia — ver `docs/diseno/AUDITORIA-DS-tema-papel.md:45` (falta evidencia manual o automatizada).
- DS-S14 / DS-S16: no aplican en Inventario según auditoría vigente.
- DS-S18: papel conservado y `--mo-*` descartado (`SPEC-UI-00`), registrado como decisión de investigación; no se reabre como brecha de implementación aquí.

## Política de motion y skills de dirección visual

- **Default vigente (confirmado):** ADR-0037 + DS-S8 y toolkit actual (`animate`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `emil-design-eng`). No se crea ADR nuevo en este mapa.
- **Veredictos de skills (ver tabla):** `mobile-native` adoptar P3; `apple-design` descartar; `gestures/choreograph` diferir hasta ADR; `better-motion` adaptar (recetas aditivas, `transform/opacity`, <300 ms, `prefers-reduced-motion`); `remove-animations` adoptar P3; `learn-taste` adoptar P3.
- **UX-S6:** abierta parcial: `mobile-native` apoya guía de momentum/safe areas/drawer; el resto queda pendiente del ADR que defina alcance de gestures/choreograph. No se cierran historias de implementación en este documento.
- **Glosario:** añadir término **`baseline`** a `GLOSSARY.md` (crearlo si no existe), con definición breve de “estado de referencia mínimo aceptado” en el contexto de DS/motion/políticas (sin detalles de implementación). Acción a ejecutar en el PR de este PRD o en follow-up documentado.

## Cierre y uso

- Este PRD es el **índice de decisiones** del mapa #279; el detalle operativo vive en los issues enlazados y en los documentos referenciados.
- **No ejecuta implementación visual**. Cualquier avance de roadmap que derive de aquí debe declararse en el PR con `prd: PRD-DS-04` (y sin `adr:` salvo que se cree un ADR explícito).
- Siguiente paso sugerido (fuera de este PR): crear `docs/diseno/componentes/` y la primera entrada `COMP-01` según #285; el refresh de `web-design-guidelines` según #287 ya se ejecutó (v1.1.0).

## Dependencias externas

- Acceso y trazabilidad en GitHub para el mapa #279 y sus issues hijos (comandos `gh` según `docs/agents/issue-tracker.md`).
- Herramientas locales: Playwright para evidencia visual, `/control-app` solo cuando requiera sesión sembrada.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | PRD consistente con decisiones | Lectura cruzada con #283–#289,#293 | No hay contradicciones con los veredictos y alcance declarados |
| Feliz | Verificación visual documentada | Revisar sección Verificación visual | Define escala, rutas de artefactos y fases DS-S23 sin implementar |
| Fallo | Adoptar skill con veto | Propuesta que requiere Node 24 / rompe gates / viola ADR-0010,0037,SPEC-UI-00 sin fuente+veredicto | Rechazada o marcada P0 según #284 |
| Regresión | Deriva de invariantes | Cambios en `check-ui.mjs` sin actualizar `SPEC-UI-00` | Se detecta y se corrige como deriva documentada |

Arch-tests: no aplica (documento). Validación: `npm run docs:check` después de añadir este archivo.