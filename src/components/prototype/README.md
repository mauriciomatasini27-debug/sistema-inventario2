# Prototipo — Mapa de precios (issue #536)

Prototipo **desechable** de UI para resolver la pregunta del issue #536:

> ¿Cómo se ven y se comportan en pantalla (en 390px y en escritorio) los tres
> puntos de contacto del cálculo de precio del producto?

Tres rutas, cada una con **3 variantes estructurales** que se alternan con la
barra violeta flotante, `?variant=A|B|C` o las flechas ← / →.

| Ruta | Punto de contacto | Variantes |
| --- | --- | --- |
| `/panel/configuracion` | % de recargo por defecto + paso de redondeo (solo Dueño) | A "Formulario clásico" · B "Lista + probalo en vivo" · C "Panel unificado + recálculo" |
| `/panel/prototipo-precios-stock` | Calculadora Costo+%→Precio en «Agregar producto» + aviso/check en «Registrar ingreso» | A "Flujo Costo → Precio" · B "Chips + ganancia" · C "Modo recargo / manual" |
| `/prototipo-precios-venta` | Edición por %/monto en el ticket + cálculo rápido en «Alta al vuelo» | A "Edición en fila + chips" · B "Hoja inferior" · C "Panel de ajuste" |

## Cómo correrlo

```bash
npm run dev
# y abrir las rutas de arriba
```

## Notas

- **Rama desechable** `prototype/precios-costo-recargo`, sin PR. No es código de producción.
- `calculo-precios.js` es el único módulo "levantable": espejo en números (no bigint) de `src/modules/pricing/precios.ts` (`precioDesdeMarkup`) + `redondeo.ts`. La UI es descartable; ese módulo es lo que podría sobrevivir.
- La spec de la que parte: contratos cerrados #533 (config), #534 (stock) y #535 (venta), en el mapa #532.
- Estado se vive en memoria: nada persiste (regla del prototipo).
