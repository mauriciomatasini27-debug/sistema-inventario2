---
id: PRD-DS-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0002, ADR-0008]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: consultoria/modoopscore/static/src/scss/modoopstokens.scss (166 lineas), modoopsprimaryvariables.scss
  (41), modoopsbackend.scss (167). Fecha extraccion: 2026-10-10. Restringido por ADR-0008, ADR-0002.
---
# PRD-DS-01 - Tokens Tema Papel (R2)

Fuente: `consultoria/modoops_core/static/src/scss/modoops_tokens.scss` (166 lineas), `modoops_primary_variables.scss` (41), `modoops_backend.scss` (167). Fecha extraccion: 2026-10-10. Restringido por ADR-0008, ADR-0002.

## Epica DS-E1. Color llama y ember

Requisito DS1 y DS2: CTA primario siempre en llama con gradiente y sombra definidos, ember solo en superficies secundarias.

- Historia DS-S1. Paleta llama con CTA `sg-flame-cta`. AC: Given inspecciono variables y estilos When verifico `flame-yellow #ffd600`, `hover #ffe033`, `orange #f57c00`, `deep #e64a19`, `rust #bf360c`, gradiente `135deg yellow 0%, orange 45%, deep 100%` con hover en rust, y CTA con blanco 600 mas `0.02em`, sombra `0 4px 14px rgba(230,74,25,0.35)`, hover `0 6px 18px` y active `scale(0.98)` Then todos los valores coinciden sin faltantes. ADR: 0008. Talla S. Depende de: nada.
- Historia DS-S2. Ember solo para secundarias. AC: Given listo tiles y botones When reviso `amber #ffb300`, `coral #ff7043`, `scarlet #ef5350`, `wine #c62828` en tiles secundarias del launcher Then ningun CTA primario usa ember y la llama sigue en el primario. ADR: 0008. Talla S. Depende de: DS-S1.

## Epica DS-E2. Superficies papel, dark y glass

Requisito DS3, DS4 y DS5: lectura a distancia sobre papel claro, POS sobre dark ambiente y glass solo donde aporta jerarquia.

- Historia DS-S3. Papel y canvas claros. AC: Given abro una vista hub When mido fondo `paper #f7f5f2`, `canvas #efecea` y texto `text-on-light #1a1a1a` Then el fondo es claro legible y el morado backend `#71639e` esta reemplazado por `deep`. ADR: 0008. Talla S. Depende de: DS-S1.
- Historia DS-S4. Dark ambiente para POS. AC: Given abro POS en dark When verifico `bg-deep #1a1a1a`, `charcoal #2b2b2b`, `mid #333333`, `text-on-dark #ffffff`, `muted rgba(255,255,255,0.72)` y ambiente `radial orange 18% + radial deep 12% + linear 165deg mid/deep/#111111` Then el chrome POS usa este dark. ADR: 0008. Talla S. Depende de: DS-S1.
- Historia DS-S5. Glass con radios y blur. AC: Given inspecciono superficies When confirmo `radius-card 12px`, `pill 999px`, `blur 16px` (POS topheader 20px, onboarding 18px), `sg-glass-surface(elevated, on-dark)` con dark `8%/14% + borde 12% + rim` y claro `55%/72% + borde rgba(230,74,25,0.12)` Then las listas de alto volumen no usan glass por fila por rendimiento. ADR: 0008. Talla M. Depende de: DS-S3, DS-S4.

## Epica DS-E3. Sistema tipografia, variables y motion

Requisito DS6, DS7, DS8 y DS9: mismos nombres `--mo-*` para portar sin reescribir, motion respetuoso y adaptacion a marca Inventario.

- Historia DS-S6. Tipografia. AC: Given reviso textos When comparo pila `Montserrat, Segoe UI, system-ui, sans-serif` con titulos hub `1.5rem/700`, subtitulo `.875rem`, login brand `1.65rem/600`, listas `.875rem`, onboarding title `20px/700` y body `14px` Then cada nivel coincide. ADR: 0008. Talla S. Depende de: nada.
- Historia DS-S7. Variables CSS en `:root` y `.pos`. AC: Given inspecciono `:root` When verifico llama, ember, papel, canvas, fuente, radios, blur, `glass-fill/fill-strong/border/rim`, `accent orange`, `accent-alt deep`, `primary deep`, `rail-width collapsed 3.5rem / expanded 17.5rem`, `transition 220ms ease`, y que `.pos` redefine glass a `8%/14%`, `accent yellow`, `primary deep`, mas `--mo-pos-*` y `--navbar-logo` Then todo esta expuesto sin renombres. ADR: 0008. Talla M. Depende de: DS-S1, DS-S3, DS-S4, DS-S5.
- Historia DS-S8. Motion reducido. AC: Given activo `prefers-reduced-motion: reduce` When navego listas, login, launcher, hub y rail Then no hay transiciones ni animacion de `width/margin` en rail y hub. ADR: 0008, 0002. Talla S. Depende de: DS-S7.
- Historia DS-S9. Adaptacion a Inventario. AC: Given creo tokens propios con mismos nombres `--mo-*` When cambio la llama por identidad nueva Then papel, radios y blur se conservan, hay alto contraste en mostrador, botones grandes a 360px, y el email NE12.2 hereda papel a una columna 600px con logo como unico recurso. ADR: 0008, 0002. Talla M. Depende de: DS-S7.

## Dependencias externas

Ninguna historia de superficie arranca sin DS-S1. DS-S7 espera a DS-S3, DS-S4 y DS-S5. DS-S9 espera a DS-S7.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Port de tokens | `:root` con `--mo-*` | Llama, papel, radios y blur disponibles sin reescribir componentes |
| Fallo | CTA fuera de llama | CTA primario con ember | Rechazo en revisión visual |
| Regresión | Movimiento reducido | `prefers-reduced-motion: reduce` | Sin transiciones en listas, login, launcher, hub ni rail |

Arch-tests: AT1 CTA primario siempre usa llama, ember nunca como primario (lint de estilos o snapshot). AT2 `:root` expone llama, papel, radios, blur y `accent` (test de variables requeridas).
