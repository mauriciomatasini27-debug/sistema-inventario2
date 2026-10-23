---
id: ADR-0114
tipo: adr
estado: propuesto
modulos: [inventario]
depende_de: [ADR-0002]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El código de barras se lee primero con un lector USB o Bluetooth.
  La cámara queda como respaldo, y zxing-wasm cubre el navegador sin BarcodeDetector.
---
# ADR-0114 - Escáner de código de barras

Estado: propuesto. Fecha: 2026-10-23. Fuentes: [ADR-0002](0002-stack-desarrollo.md), `docs/roadmap/avances/STOCK-E4.md`, [PRD-STOCK-02](../diseno/PRD-STOCK-02-carga-stock-tanda2.md).

## Decisión

El mostrador usa primero un lector USB o Bluetooth. Ese lector se comporta como teclado. Escribe el código en el campo de búsqueda y cierra con Enter.

La cámara del dispositivo es el respaldo. Se usa cuando no hay lector.

Si el navegador no tiene `BarcodeDetector`, el respaldo decodifica con `zxing-wasm`.

[ADR-0002](0002-stack-desarrollo.md) ya nombra `BarcodeDetector` y un fallback entre `zxing-wasm` y `html5-qrcode`. Este ADR se queda con `zxing-wasm` para el respaldo de cámara. Deja `html5-qrcode` afuera.

No hay código de lector en este ADR. La implementación espera que Mauri acepte este texto.

## Por qué

Un lector de mostrador es más rápido que abrir la cámara en cada producto. La cámara cubre el celular y el puesto que no tiene lector. `BarcodeDetector` no está en todos los navegadores. `zxing-wasm` corre en el cliente y no manda la imagen a un servidor.

## Qué cambia

Nada en `src/` ni en `drizzle/` hasta que este ADR pase de propuesto a aceptado.

El PRD de la tanda 3 es [PRD-STOCK-03](../diseno/PRD-STOCK-03-escaner.md).

## Pendientes

Aceptación de Mauri sobre este texto.

Implementar el lector, la cámara y el fallback recién después de esa aceptación.
