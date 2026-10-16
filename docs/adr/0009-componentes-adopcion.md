---
id: ADR-0009
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-DS-02, PRD-DS-03]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0009 - Componentes y adopción Tema Papel

Estado: aceptado. Fecha: 2026-10-10. Fuentes: PRD-DS-02 y PRD-DS-03.

## Decisión

Adoptar launcher, rail, hub, POS oscuro con ticket papel, login, listas y onboarding smoke como base visual en Astro. Sin backend Odoo.

## Componentes

Launcher papel flex con 2 radiales llama, variantes root/hub/compact, tiles ember, shimmer y safe-area.

Rail fijo `z 1000 100dvh` gradiente deep, colapsado iconos `3.5rem`, expandido etiquetas `17.5rem`, toggle ≥28px.

Hub papel con header centrado `80rem`, scroll solo en `__scroll/__nav`, KPI con shimmer y stagger, vacío dedicado.

POS dark ambiente con topheader `blur 20px`, leftpane glass `8%`, ticket claro `--mo-pos-receipt-paper` para impresión, grilla `5-cols` dedo-grande, vars pago y destructive.

Login dark centrado con panel glass, marca `72px`, CTA llama, previo a sesión.

Listas `.875rem` header sticky canvas, filas sin glass, hover naranja `6%`, selected deep `10%`, celdas `.45rem`, códigos en deep 500.

Onboarding `z 2000 pointer-events none`, panel `440px blur 18px` abajo derecha, pill colapsable, fuera del flujo de cobro.

Táctil ≥44px, skeleton sin saltos, reduced-motion verificado.

## Qué no se trae

Backend Odoo, `modoops_core/admin`, tenants ModoOps, morado community, máscaras fullscreen, glass por fila, `odoo-bin -d tenant -i módulo`.

## Adopción

Astro + islas, SSR, PWA 360px, bottom-sheets. Fase 0 tokens + login + listas. Fase 1 launcher, hub, POS, rail. Fase 2 onboarding + email papel 600px dark-compatible. Cada fase con captura 360px y dark/light.

## Criterios

Papel legible a 2m. Ticket impreso igual a vista. CTA siempre llama. 360px sin scroll horizontal. Login y venta a una mano.
