---
id: PRD-DS-02
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0002, ADR-0008, ADR-0009, PRD-DS-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: consultoria/modoopscore/static/src/scss/ launcher 414, rail 397, hub 294, pos 737, login 195, list 65,
  onboarding 234. Fecha: 2026-10-10. Restringido por ADR-0009, ADR-0008, ADR-0002.
---
# PRD-DS-02 - Componentes Tema Papel (R2)

Fuente: `consultoria/modoops_core/static/src/scss/` launcher 414, rail 397, hub 294, pos 737, login 195, list 65, onboarding 234. Fecha: 2026-10-10. Restringido por ADR-0009, ADR-0008, ADR-0002.

## Epica DS-E4. App shell launcher, rail y hub

Requisito DS10, DS11 y DS12: base visual papel con navegacion fija y contenido centrado.

- Historia DS-S10. Launcher papel. AC: Given abro `.mo-launcher-shell` When verifico flex columna `100%`, fondo `var(--mo-paper)`, `overflow hidden` mas `::before` con 2 radiales llama, variantes `root` (oculta toolbar, `padding-top 3.25rem`), `hub` (sin header, mismo padding), `compact` (header `padding-bottom .5rem`), clases `toolbar/body/grid/tile/flame-yellow/accent/metric/nav-btn/scroll/title/subtitle`, tiles ember solo en secundarias, shimmer en metricas y `safe-area area-inset-bottom` Then cada clase y variante existe y renderiza. ADR: 0009, 0008. Talla M. Depende de: DS-S7.
- Historia DS-S11. Rail fijo. AC: Given cargo la app con rail When confirmo fijo `top/left 0`, `z 1000`, `100vh/100dvh`, gradiente `deep a charcoal a mid`, `border-right 2px deep`, colapsado a iconos `3.5rem`, expandido a etiquetas `17.5rem`, transicion `220ms`, compensacion `body.mo-rail-enabled .o_action_manager` con `margin-left`, home `pill` con hover `rgba(245,124,0,0.18)`, logo `2rem`, toggle `min-height 1.75rem`, y visibilidad permanente en tablet Then colapsar y expandir conserva layout sin saltos. ADR: 0009, 0008. Talla M. Depende de: DS-S7.
- Historia DS-S12. Hub papel. AC: Given abro `.mo-app-shell` When verifico flex `100%` en papel, rail con `shrink 0 z 2`, main `flex 1 min-width 0`, header `1.25rem 1.5rem .5rem max 80rem auto`, title `1.5/700 on-light`, scroll solo en `__scroll/__nav`, section-rail en columna con gradiente y brand `uppercase .75rem orange`, KPI `entry-grid/card/value/loading` con shimmer y stagger `view-enter/fade-in`, y vacio `hub-empty` Then el hub carga metricas sin saltos y el vacio tiene vista dedicada. ADR: 0009, 0008. Talla M. Depende de: DS-S7, DS-S11.

## Epica DS-E5. Venta y acceso POS, login y listas

Requisito DS13, DS14 y DS15: mostrador oscuro con ticket claro fiel a impresion, login previo a sesion y listas rapidas de alto volumen.

- Historia DS-S13. POS oscuro mas ticket papel. AC: Given vendo en `.pos` When confirmo chrome dark ambiente mas `color on-dark`, topheader glass elevado `blur 20px rgba(26,26,26,0.85)`, leftpane glass `8% radius-card margin .5rem`, rightpane transparente, switchpane `rgba(26,26,26,0.9)`, ticket claro `--mo-pos-receipt-paper` sobre canvas oscuro, vars de pago `due/line/validate`, `orderline-selected`, `product-fallback`, `ticket-empty`, `acciones-destructive`, `btn-bg/hover/active/disabled`, y grilla `5-cols` con `card-image` dedo-grande Then el ticket en pantalla coincide con impresion y los controles de pago responden. ADR: 0009, 0008, 0002. Talla L. Depende de: DS-S4, DS-S5, DS-S7.
- Historia DS-S14. Login. AC: Given abro `.mo-login-page 100vh` en ambiente dark When verifico panel `sg-glass-surface elevated on-dark`, marca en columna `gap .65rem`, mark `72px`, nombre `1.65/600`, logo `max 120px`, inputs `rgba(255,255,255,0.06)` con borde glass y `radius-card`, label `.875/500 on-dark`, CTA llama mas secundaria mas links db/superuser mas footer, y carga en `assets_frontend` previo a sesion Then el login opera a 360px sin scroll horizontal. ADR: 0009, 0008, 0002. Talla M. Depende de: DS-S7.
- Historia DS-S15. Listas alto volumen. AC: Given abro una lista con miles de filas When verifico `.o_list_table .875rem`, header sticky `canvas 600 muted borde 2px rgba(deep,0.15)`, filas transparentes sin glass, hover `rgba(orange,0.06)`, selected `rgba(deep,0.1)`, celdas `.45rem middle`, enfasis `default_code/barcode/qty_available/product_id 500 deep`, y sin transiciones con reduced-motion Then el scroll se mantiene fluido. ADR: 0009, 0008. Talla S. Depende de: DS-S7.

## Epica DS-E6. Onboarding y tactil

Requisito DS16 y constraints tactiles: ayuda anclada que no bloquea cobro y mostrador operable al tacto.

- Historia DS-S16. Onboarding smoke. AC: Given abro `.mo-onboarding-smoke fixed inset 0 z 2000 pointer-events none` When verifico panel `absolute right 24 bottom 24 width 440 padding 20/20/14 radius 20 bg rgba(18,22,28,0.96) blur 18px`, pill `999px 13px/600`, collapse `22px top 12 right 14`, eyebrow `11px uppercase`, badge `bg rgba(245,124,0,0.2) color #ffb74d`, grid `1.15fr/.85fr gap 14` con chapters/hints/link/footer Then el panel es colapsable, esta anclado fuera del flujo de cobro y no bloquea POS. ADR: 0009, 0002. Talla S. Depende de: DS-S7.
- Historia DS-S17. Constraints tactiles. AC: Given opero a 360px con tacto When mido touch minimo 44px en mostrador, toggle rail minimo 28px, grilla productos dedo-grande, safe-area movil, skeleton sin saltos y shimmer en metricas y KPI Then la venta es operable a una mano. ADR: 0009, 0002. Talla S. Depende de: DS-S10, DS-S13, DS-S15.

## Dependencias externas

Todas esperan tokens DS-S7 de PRD-DS-01. DS-S12 espera a DS-S11. DS-S17 espera a DS-S10, DS-S13 y DS-S15.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | POS con ticket fiel | Venta en `.pos` | Ticket en pantalla coincide con impresión y el pago responde |
| Fallo | Scroll horizontal a 360px | Vista a 360px | Falla si hay scroll horizontal en login o venta |
| Regresión | Listas sin glass por fila | Lista con miles de filas | Scroll fluido, filas transparentes sin glass |

Arch-tests: AT1 listas no usan glass por fila (lint de estilos: falla si una fila usa `sg-glass-surface`). AT2 touch mínimo 44px en mostrador (test de estilos o revisión con evidencia).
