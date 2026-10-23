---
id: PRD-STOCK-03
tipo: prd
estado: propuesto
modulos: [inventario]
depende_de: [ADR-0114, ADR-0002, PRD-STOCK-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Tanda 3 de carga de stock. El lector USB o Bluetooth es el camino principal.
  La cámara es respaldo y zxing-wasm entra solo si no hay BarcodeDetector.
---
# PRD-STOCK-03 - Escáner de código de barras

Fuente: [ADR-0114](../adr/0114-escaner-codigo-barras.md), [ADR-0002](../adr/0002-stack-desarrollo.md), [PRD-STOCK-02](PRD-STOCK-02-carga-stock-tanda2.md). Restringido por ADR-0114.

## Problema

El alta y la venta identifican el producto por nombre o SKU. En el mostrador el código de barras ya está impreso en el envase. Tipearlo a mano es lento y se presta a errores. PRD-STOCK-02 deja los códigos de barras fuera de la importación. Esta tanda cubre la lectura en el puesto, no la carga masiva.

## Épica STOCK-E4. Leer un código de barras

Requisito STOCK-R4. El dueño o el empleado lee un código y el sistema busca el producto. El lector USB o Bluetooth es el camino principal. La cámara es el respaldo.

- Historia STOCK-S16. Lector USB o Bluetooth. AC: Given un lector que escribe como teclado When el foco está en la búsqueda y el lector manda el código más Enter Then la pantalla busca ese código y no abre la cámara. ADR: 0114. Talla M. Depende de: nada.
- Historia STOCK-S17. Cámara de respaldo. AC: Given que no hay lector When la persona elige leer con la cámara y el navegador tiene BarcodeDetector Then la cámara decodifica el código y la búsqueda usa ese valor. ADR: 0114. Talla M. Depende de: STOCK-S16.
- Historia STOCK-S18. Fallback sin BarcodeDetector. AC: Given un navegador sin BarcodeDetector When la persona elige la cámara Then la página decodifica con zxing-wasm y no llama a un servicio externo. ADR: 0114. Talla M. Depende de: STOCK-S17.

## Dependencias externas

`zxing-wasm` en el cliente. `BarcodeDetector` cuando el navegador lo trae. Ningún cambio de base en esta tanda.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Lector de teclado | código más Enter en la búsqueda | busca el producto y no abre la cámara |
| Feliz | Cámara con BarcodeDetector | cuadro con un código | la búsqueda recibe el código decodificado |
| Fallo | Sin BarcodeDetector | la persona abre la cámara | decodifica con zxing-wasm |
| Fallo | Código desconocido | un código que no está en el catálogo | la pantalla lo dice y no crea un producto sola |

## Fuera de esta entrega

No se escribe código del lector en el PR que propone este texto. La implementación arranca cuando Mauri acepta ADR-0114. No se cambia ADR-0110. No hay migración.
