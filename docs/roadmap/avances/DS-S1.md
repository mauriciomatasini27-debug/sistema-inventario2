---
item: DS-S1
estado: hecho
adr: ADR-0008
prd: PRD-DS-01
fecha: 2026-10-17
---
DS-S1: paleta llama completa en `global.css` (`@theme`) y `tokens-papel.css` con los mismos nombres (`--color-llama-hover #ffe033`, `--gradiente-llama` 135deg llama/naranja/deep, `--sombra-cta 0 4px 14px rgba(230,74,25,0.35)` y `--sombra-cta-hover 0 6px 18px`), más la clase única `sg-flame-cta` (fondo `star-glow`, blanco 600 con `0.02em`, sombra del CTA, hover con `color-mix(star-glow 85%, #000)` y `--sombra-cta-hover`, active `scale(0.98)`, foco bitono y sin transición ni scale bajo `reduce`) que reemplaza a las clases sueltas del `primary` de `Button.astro`, del CTA de `SiteHeader.astro` y de los dos botones de `Contacto.astro` (WhatsApp verde y ember sin tocar); `#ffe033` salió de los alias locales de `panel.astro`/`admin.astro` al token, par nuevo de contraste en `check:contrast` (70/70) y trinquete en `tests/ds-s1-cta-llama.test.ts`; decisión: el CTA primario con texto blanco vive en `star-glow #bf360c` (5.60:1) y su hover en `#a22e0a` vía `color-mix` (7.16:1), no en el gradiente amarillo→naranja ni en deep `#e64a19` (~3.9:1 con blanco), porque esos tonos no llegan a 4.5:1 con blanco y el gradiente queda solo como token decorativo sin texto.
