---
id: ADR-0008
tipo: adr
estado: aceptado
modulos: []
depende_de: [PRD-DS-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0008 - Tokens Tema Papel

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-DS-01 (extraído de `consultoria/modoops_core` tokens, primary variables, backend).

## Decisión

Portar tokens con nombres `--mo-*` intactos a marca nueva Inventario. Conservar papel, radios y blur aunque cambie la llama.

## Tokens

Llama `yellow #ffd600`, `hover #ffe033`, `orange #f57c00`, `deep #e64a19`, `rust #bf360c`. Gradiente `135deg yellow/orange/deep`, hover con rust. CTA blanco 600 `0.02em`, sombra `0 4px 14px rgba(230,74,25,0.35)`, active `scale(0.98)`.

Ember solo secundarias: `amber #ffb300`, `coral #ff7043`, `scarlet #ef5350`, `wine #c62828`. Nunca CTA primario.

Papel `#f7f5f2`, canvas `#efecea`, texto claro `#1a1a1a`. Reemplaza morado Odoo `#71639e` por deep.

Dark POS: `deep #1a1a1a`, `charcoal #2b2b2b`, `mid #333333`, blanco y muted `72%`. Ambiente radial naranja/deep más linear `165deg`.

Glass `radius-card 12px`, `pill 999px`, `blur 16px` (POS 20px, onboarding 18px). Dark `8%/14% borde 12%`, claro `55%/72% borde rgba(230,74,25,0.12)`. Sin glass por fila en listas.

Montserrat + Segoe UI + system-ui. `:root` expone todo más `accent orange`, `primary deep`, rail `3.5/17.5rem 220ms`. `.pos` redefine glass oscuro, `accent yellow` y `--mo-pos-*`.

Reduced-motion desactiva transiciones en listas, login, launcher, hub y rail.

## Alternativa descartada

Crear tokens nuevos desde cero. Se descarta porque rompe el porte directo de componentes DS10-DS16 y duplica trabajo visual ya validado en mostrador.

## Consecuencias

Rebrand cambia llama, conserva papel/radios/blur. Alto contraste obligatorio. Email NE12 hereda papel a 600px con logo único.
