---
id: PRD-VP-02
tipo: prd
estado: aceptado
modulos: [catalogo, ventas, inventario, tickets]
depende_de: [ADR-0121]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Venta por peso con carga manual de kilogramos, precio por kilogramo, stock en gramos y ticket en kilogramos.
---
# PRD-VP-02 - Venta por peso

Fuente: `docs/traspaso/pendientes-2026-11-21.md` y `GLOSSARY.md`. Restringido por ADR-0121.

> Estado al 2026-11-21: VP2-S1 a S3 cerrados en T1 (#385, flag `por_peso` en catálogo, migración `0055`), VP2-S4 a S8 y S11 (ticket de pantalla) cerrados en T2 (#386, `docs/roadmap/avances/P10-94.md`), VP2-S9 (FEFO multi-lote), VP2-S10 (sin stock) y los umbrales en gramos cerrados en T3 (#387, `docs/roadmap/avances/P10-95.md`), y VP2-S2 verificado de punta a punta en T4 (#388): rechazo 422 con mensaje de dominio, flag intacto tras el rechazo, producto sin ventas cambia libremente y aislamiento por comercio en multi y shared. VP2-S11 (ticket en todos los canales) quedó cerrado en T5 (#389, `docs/roadmap/avances/P10-96.md`): HTML, térmica 58/80 y WhatsApp muestran la línea por peso con el mismo formato del ticket de pantalla. Tras el code review (#384) el servidor resuelve la unidad desde el catálogo por SKU/id, tanto en `POST /api/sales` como en la cola offline, y las ventas a cuenta con líneas por peso se rechazan con 422 y mensaje de dominio (el soporte de fiado por peso sigue fuera de alcance). Deuda registrada: el servidor no persiste `porPeso` por línea en el historial; los tickets reconstruyen el formato desde el snapshot de la UI. El ejemplo de "1 gramo a 1 centavo por kilogramo = 1 centavo" de VP2-S5 contradice la fórmula de ADR-0121: con redondeo mitad arriba, 0,001 centavo da 0; la implementación sigue la fórmula del ADR y el borde de 1 gramo se prueba a 500 centavos/kg (exactamente medio centavo → 1 centavo).

## Problema

El dueño de una verdulería, fiambrería o panadería no puede cobrar productos que se pesan al momento: el sistema solo acepta cantidades enteras de 1 a 999 y un único precio por unidad. Hoy cargaría "1" para un kilo y perdería los decimales, o no podría registrar el peso real de lo que se lleva el cliente.

## Épica VP2-E1. Producto por peso

Requisito VP2-R1: el Dueño puede marcar un producto como vendido por peso.

- Historia VP2-S1. Flag por producto. AC: Given un producto activo When el Dueño activa "Se vende por peso" en el alta o la edición Then el producto queda marcado y su precio existente se interpreta como centavos por kilogramo, con un aviso visible en el formulario. ADR: 0121. Talla S. Depende de: nada.
- Historia VP2-S2. Irreversibilidad. AC: Given un producto con al menos una venta When el Dueño intenta desactivar el flag Then la edición se rechaza con un mensaje que explica que los tickets históricos quedarían sin sentido. ADR: 0121. Talla S. Depende de: VP2-S1.
- Historia VP2-S3. Catálogo coherente. AC: Given el flag activo When se consulta el producto por API, en el panel o en el snapshot offline Then se expone el mismo estado y el precio se muestra como centavos por kilogramo. ADR: 0121. Talla S. Depende de: VP2-S1.

## Épica VP2-E2. Cobro por peso

Requisito VP2-R2: el vendedor carga el peso real y se cobra el importe correcto.

- Historia VP2-S4. Carga en kilogramos. AC: Given un producto por peso When el vendedor ingresa `1,250` kg en `/venta` Then se convierte a 1250 gramos y se agrega una línea válida sin error de entero. ADR: 0121. Talla S. Depende de: VP2-S1.
- Historia VP2-S5. Subtotal redondeado. AC: Given 1250 gramos y 5000 centavos por kilogramo When se arma el cobro Then el subtotal es 6250 centavos; given 1 gramo y 1 centavo por kilogramo Then el subtotal es 1 centavo por redondeo mitad arriba. ADR: 0121. Talla S. Depende de: VP2-S4.
- Historia VP2-S6. Línea de venta. AC: Given una línea por peso When se confirma la venta Then `POST /api/sales` la acepta, el total incluye su subtotal y no se rechaza por `LINEA_INVALIDA`. ADR: 0121. Talla S. Depende de: VP2-S5.
- Historia VP2-S7. Límites. AC: Given un peso vacío, cero, negativo, con más de tres decimales o mayor al máximo configurable When se agrega Then el campo muestra el error y la venta no se arma. ADR: 0121. Talla S. Depende de: VP2-S4.

## Épica VP2-E3. Stock y ticket

Requisito VP2-R3: el peso vendido se descuenta del stock y se muestra en el comprobante.

- Historia VP2-S8. Descuento en gramos. AC: Given un producto por peso con 5000 gramos en stock When se venden 1250 gramos Then el stock queda en 3750 gramos y el movimiento registra -1250. ADR: 0121. Talla S. Depende de: VP2-S6.
- Historia VP2-S9. FEFO por gramos. AC: Given dos lotes del mismo producto con vencimientos distintos When se vende un peso que supera el primer lote Then se consume el primero completo y el resto del segundo sin deriva decimal. ADR: 0121. Talla M. Depende de: VP2-S8.
- Historia VP2-S10. Sin stock suficiente. AC: Given 1000 gramos disponibles When se intentan vender 1250 Then la venta se rechaza con `SIN_STOCK` y no se escribe ningún movimiento. ADR: 0121. Talla S. Depende de: VP2-S8.
- Historia VP2-S11. Ticket. AC: Given una venta por peso When se mira el ticket en pantalla, HTML, térmica o WhatsApp Then la línea muestra `1,250 kg × $5.000/kg = $6.250` y el total coincide. ADR: 0121. Talla S. Depende de: VP2-S6.

## Dependencias externas

- Autorización de Mauricio para el tag de migración que agrega `products.por_peso` (ya otorgada en el grilling de esta feature).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Venta por peso | producto `por_peso`, 1250 g, $5000/kg | subtotal 6250 centavos, stock -1250 g, ticket en kg |
| Borde | Redondeo mitad arriba | 1 g, $0,01/kg | 1 centavo |
| Borde | FEFO parcial | lotes 1000 g y 500 g, venta 1250 g | consumo completo del primero y 250 g del segundo |
| Fallo | Peso inválido | `1,2500` o `0` | error de campo, venta no armada |
| Fallo | Stock insuficiente | 1000 g disponibles, venta 1250 g | `SIN_STOCK`, sin movimientos |
| Fallo | Flag irreversible | producto con ventas, desactivar `por_peso` | rechazo con mensaje |
| Tenant | Aislamiento | otro comercio con producto distinto | cada uno ve su flag y su precio |

## Fuera de alcance

- Devoluciones de ventas por peso (queda como deuda conocida; la unidad de esas líneas ya es gramos).
- Facturación fiscal con detalle por línea y `fiscal_fes12Schema.cantidad`.
- Cálculo de precios sugeridos por kilogramo en el módulo de precios.
- Integración con balanza digital: el peso lo carga el vendedor.
- Verificación de extremo a extremo de la cola offline con productos por peso.
