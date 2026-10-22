---
id: PRD-DS-03
tipo: prd
estado: en curso
modulos: [inventario]
depende_de: [ADR-0002, ADR-0008, ADR-0009, PRD-DS-01, PRD-DS-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: Parte 3 sec 6.1/6.2 (reutilizar Tema papel sin backend Odoo), NE12.2 (email basado en Tema papel),
  PRD-DS-01 y PRD-DS-02. Restringido por ADR-0009, ADR-0008, ADR-0002.
---
# PRD-DS-03 - Adopcion Tema Papel en Sistema de Inventario (R2)

Fuente: Parte 3 sec 6.1/6.2 (reutilizar Tema papel sin backend Odoo), NE12.2 (email basado en Tema papel), PRD-DS-01 y PRD-DS-02. Restringido por ADR-0009, ADR-0008, ADR-0002.

## Epica DS-E7. Alcance que se reutiliza y que no

Requisito DS17 y DS18: portar lo visual y de UX sin arrastrar backend Odoo ni tenants ModoOps.

- Historia DS-S18. Que se reutiliza. AC: Given comparo Inventario con ModoOps When verifico tokens DS1 a DS9 con los nombres `--color-*`, `--tema-*` y `--estado-*` (SPEC-UI-00 descartó `--mo-*`), componentes DS10 a DS16 como base visual, patrones Control Plane y suspension por mora solo como UX sin codigo Odoo, y contratos test papel con `receipt-pane glass-panel`, ticket claro sobre canvas oscuro y `paper container` Then todo lo listado existe en Inventario. ADR: 0009, 0008. Talla S. Depende de: DS-S1 a DS-S17.
- Historia DS-S19. Que no se trae. AC: Given audito dependencias When busco backend Odoo, infra tenants ModoOps, `modoops_core/admin`, morado community, mascaras fullscreen de onboarding, glass por fila en listas y comandos `odoo-bin -d tenant -i modulo` Then no hay rastro en codigo ni en docs de implementacion. ADR: 0009. Talla S. Depende de: DS-S18.

## Epica DS-E8. Stack, email y aceptacion

Requisito DS19, DS20 y DS21: Astro con PWA 360px, email papel compatible y criterios de mostrador verificables.

- Historia DS-S20. Stack Inventario. AC: Given reviso repo When confirmo Astro más TS con islas React (no se adoptaron Preact ni Svelte), SSR Node/Cloudflare, PWA a 360px, tokens propios adaptados a marca nueva, `radius` 1.25rem (20px), `blur 16px`, papel `#f7f5f2` salvo rebrand explicito, alto contraste, botones grandes en mostrador y bottom-sheets Then el stack coincide con ADR-0002. ADR: 0002, 0008. Talla M. Depende de: DS-S18, DS-S19.
- Historia DS-S21. Email papel NE12. AC: Given abro un email generado When verifico una columna 600px maximo, tipografia legible en celular, botones grandes, tablas a 360px, modo oscuro compatible, sin imagenes pesadas salvo logo, y herencia de papel claro más CTA `star-glow` Then el email pasa revision en claro y oscuro. ADR: 0002, 0008. Talla S. Depende de: DS-S20.
- Historia DS-S22. Criterios de aceptacion. AC: Given verifico mostrador When compruebo papel legible a 2m, ticket impreso identico a vista clara, CTA primario en `star-glow`, secundarios ember nunca como primario, reduced-motion verificado, 360px sin scroll horizontal, y login y venta operables a una mano Then cada criterio tiene evidencia manual o automatizada. ADR: 0009, 0008, 0002. Talla M. Depende de: DS-S20, DS-S21.

## Epica DS-E9. Fases

Requisito DS22: entrega por fases con evidencia visual lado a lado.

- Historia DS-S23. Fases 0 a 2. AC: Given reviso plan When confirmo Fase 0 con port de tokens mas login mas listas, Fase 1 MVP con launcher, hub, POS oscuro con ticket papel y rail, y Fase 2 con onboarding smoke anclado mas email papel, cada fase con captura 360px y comparativa dark/light lado a lado Then puedo marcar cada fase como hecha solo con su evidencia. ADR: 0009, 0002. Talla M. Depende de: DS-S18, DS-S20, DS-S22.

## Dependencias externas

DS-S18 espera a DS-S1 a DS-S17 de PRD-DS-01 y PRD-DS-02. DS-S20 espera a DS-S18 y DS-S19. DS-S23 espera a DS-S18, DS-S20 y DS-S22.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Fase 0 con evidencia | Port de tokens más login más listas | Captura 360px más comparativa dark y light lado a lado |
| Fallo | Traer backend Odoo | Dependencia a `odoo-bin` o `modoops_core` | Bloqueo en revisión de dependencias |
| Regresión | Ticket idéntico | Vista clara contra impresión | Ticket impreso idéntico a vista clara |

Arch-tests: AT1 sin dependencias a backend Odoo (lint: falla si aparece `odoo-bin` o `modoops_core/admin`). AT2 email de una columna 600px máximo con CTA `star-glow` (snapshot de plantilla).
