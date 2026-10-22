---
id: ADR-0032
tipo: adr
estado: aceptado
modulos: [offline]
depende_de: [PRD-DS-02, PRD-UI-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Adoptar agrupación por espacio, props lógicas y base instalada 360px según PRD-UI-01. PRD:
  diseno/PRD-UI-01-layout-pwa-360.md.
---
# ADR-0032 - Layout y base PWA 360px

Estado: propuesto. Fecha: 2026-10-12. Fuentes: `.agents/skills/better-layout/SKILL.md`, `.agents/skills/mobile-native/SKILL.md`, PRD-DS-02.

## Decisión

Adoptar agrupación por espacio, props lógicas y base instalada 360px según PRD-UI-01. PRD: `diseno/PRD-UI-01-layout-pwa-360.md`.

## Por qué

Sin regla de layout el resize y la traducción rompen vistas; sin base PWA el celular gama baja pierde viewport y touch.

## Qué cambia

Reglas `gap`, `inline-start/end`, `100dvh`, `safe-area`, `theme-color`; gate 360px más 200% más RTL.

## Alternativa descartada

Dejar layout por componente: se descarta porque repite la misma rotura en cada vista.

## Pendientes

UI-S1→S4 + tests viewport 360px sin scroll horizontal.
