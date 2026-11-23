---
id: PRD-NAV-03
tipo: prd
estado: propuesto
modulos: [design-system, admin]
depende_de: [ADR-0132]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Pintado y motion dentro de un presupuesto: limitar backdrop-filter en superficies masivas, respetar prefers-reduced-motion en reveal y NumberFlow, y medir INP/CLS por pantalla.
---
# PRD-NAV-03 - Pintado y motion sin jank

Fuente: bug "freeze al cambiar de ruta". Restringido por ADR-0132.

## Problema

Parte del "tildado" es trabajo de paint/composición: `PanelShell.astro` aplica `backdrop-filter: blur(16px)` a cada `.card`, `BaseLayout.astro` anima la aparición por scroll con un `IntersectionObserver` (`reveal`), y `TablaCatalogo` anima los precios con `NumberFlow`. En hardware humilde, la suma se percibe como jank durante y después de la navegación.

## Épica NAV-E3. Pintado y motion acotado

Requisito NAV-R3: el pintado y la animación deben respetar `prefers-reduced-motion` y un presupuesto, sin jank medible en la navegación.

- Historia NAV-S5. Auditar y reducir el CSS/paint costoso (backdrop-filter en tarjetas masivas, selectores compuestos del `<style>` de PanelShell) y medir INP/CLS por pantalla. AC: Given una pantalla con muchas tarjetas When mido INP/CLS Then el costo de paint baja sin romper el layout. ADR: 0132. Talla M. Depende de: nada.
- Historia NAV-S6. Aplicar `prefers-reduced-motion` de forma consistente al `reveal` de BaseLayout y a `NumberFlow`, y limitar las animaciones a un presupuesto. AC: Given un usuario con reduced-motion When navega Then no corre animación de entrada ni precios animados. ADR: 0132. Talla S. Depende de: NAV-S5.

## Dependencias externas

Ninguna. Refactor de estilos y animaciones existentes.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pantalla con tarjetas | panel/caja | INP estable, sin blur masivo |
| Fallo | prefers-reduced-motion | sistema en reduce | sin reveal ni NumberFlow animado |
| Fallo | Regresión visual | quitar blur | layout intacto, contraste correcto |
