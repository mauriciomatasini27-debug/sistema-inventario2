---
id: PEDIDO-FE-02
tipo: spec
estado: propuesto
modulos: [fiscal]
depende_de: [PRD-FE-02, PRD-FE-01, ADR-0090]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Cuestionario para contador, abogado y homologación que cierra P9-2. Cada pregunta trae la respuesta
  esperada, el efecto en el código y la historia de PRD-FE-02 que desbloquea.
---
# Pedido a contador, abogado y homologación ARCA

Objetivo: cerrar las preguntas [a verificar] de `PRD-FE-01` antes del 2026-12-01, fecha en que la RG 5616 exige informar `CondicionIVAReceptorId`. Mientras no haya respuestas escritas no se escribe código fiscal nuevo (FE2-1 de `PRD-FE-02`).

Instrucciones de uso: enviar cada bloque a quien corresponde, pedir respuesta escrita y firmada, y pegar la respuesta debajo de cada pregunta. Una respuesta puede ser "no aplica" si viene fundada.

## Bloque 1. Contador

### C1. Modo de facturación por condición

¿El modo "a pedido" es admisible para Monotributo, IVA Exento y Responsable Inscripto? Si no lo es para alguna condición, ¿corresponde facturar todas las ventas de forma automática?

Respuesta:

Impacto: `FE1.5`, selección del modo en el wizard. Desbloquea FE2-S1.

### C2. Venta offline vieja

Cuando una venta offline se sincroniza después de 5 días, del mes anterior o antes del último comprobante emitido, ¿se factura con la fecha del día y una aclaración de la fecha real, o corresponde CAEA?

Respuesta:

Impacto: `FE10.3.c` y contingencia `FE14`. Define si el modo diferido alcanza o si hace falta CAEA.

### C3. Punto de venta diferido

¿Conviene un punto de venta separado para las ventas offline, para que no se mezclen con las online en la regla de fechas?

Respuesta:

Impacto: `FE10.5`. Define la configuración de puntos de venta por comercio.

### C4. Nota de crédito cuando cambió la condición del emisor

Si el comercio pasa de Monotributo a Responsable Inscripto, ¿la NC de una factura anterior se emite con la misma clase de la factura original?

Respuesta:

Impacto: `FE1.7` y `FE8`. Define la letra y la clase del comprobante de referencia.

### C5. Representación impresa y leyendas

¿Cuál es la lista completa de datos obligatorios de la representación de la RG 1415 y de la RG 4892/2020? ¿La leyenda "DOCUMENTO NO VÁLIDO COMO REMITO" es la correcta para la constancia interna?

Respuesta:

Impacto: `FE7.2` y `FE15.1`. Define el HTML del comprobante y la constancia interna.

### C6. Conservación de comprobantes

¿Cuál es el plazo exacto de conservación? ¿Alcanza con el resguardo del comercio o el proveedor debe conservar una copia?

Respuesta:

Impacto: `FE13.5` y ADR-0090. Define la retención de `fiscal_documents` y el export.

### C7. Condición de venta en fiado

En una venta a cuenta corriente, ¿la condición de venta "Cuenta corriente" es un dato obligatorio de la representación?

Respuesta:

Impacto: `FE4.8`. Define el campo de condición de venta en el comprobante.

### C8. Bonificaciones en Factura A

¿Cómo se tratan las bonificaciones y los combos con alícuotas distintas en la base imponible de una Factura A?

Respuesta:

Impacto: `FE4.7.3`. Define el prorrateo por alícuota y la suma de bases.

### C9. Primera factura del comercio

Para la primera emisión, ¿conviene facturar la próxima venta real o una venta de prueba de importe mínimo con su NC de anulación?

Respuesta:

Impacto: `FE2.7`. Define el paso final del wizard de alta fiscal.

## Bloque 2. Abogado

### A1. Responsabilidad ante ARCA

¿Quién responde ante ARCA por los comprobantes emitidos: el comercio como emisor, el proveedor como delegado, o ambos por contrato? ¿Cómo se reparte la responsabilidad si el comercio no informa un cambio de condición?

Respuesta:

Impacto: ADR-0090 y el contrato de delegación. Desbloquea FE2-S2.

### A2. Contenido del contrato de delegación

¿Qué cláusulas mínimas debe tener el contrato de delegación y qué evidencia hay que conservar de la aceptación del comercio?

Respuesta:

Impacto: circuito de delegación de ADR-0018 y tarea de Control Plane.

### A3. Conservación y acceso

¿El proveedor puede conservar los comprobantes 10 años o debe limitarse a custodiarlos por cuenta del comercio? ¿Qué pasa con el acceso cuando el comercio da de baja el servicio?

Respuesta:

Impacto: retención, export y borrado por tenant.

## Bloque 3. Homologación y ARCA

Estas preguntas se responden contra el ambiente de homologación o con el manual del WSAA, y las confirma el contador de sistemas o quien opere el certificado.

### H1. Delegación nueva con TA vigente

Si un comercio se delega con un TA vigente, ¿el TA incluye la delegación nueva o hay que renovarlo? ¿El alta puede demorar hasta 12 horas?

Respuesta:

Impacto: `FE2.5` y `ACA` de tokens. Define si el wizard espera o fuerza renovación.

### H2. Aceptación de la delegación

¿La aceptación de la delegación se puede automatizar o es manual por comercio? Si es manual, ¿qué SLA se compromete?

Respuesta:

Impacto: estado `delegacion_pendiente_proveedor` y tarea de Control Plane.

### H3. Padrón

Para la Etapa 3, ¿el padrón `ws_sr_constancia_inscripcion` o `ws_sr_padron_a13` alcanza con el certificado del proveedor sin delegación por comercio?

Respuesta:

Impacto: `FE5.6` y `padron.ts`, hoy stub.

### H4. QR

¿El lector de ARCA valida las dos URLs base del QR, `https://www.afip.gob.ar/fe/qr/` y `https://www.arca.gob.ar/fe/qr/`?

Respuesta:

Impacto: `FE7.3`. Define el parámetro de configuración del QR.

### H5. Límites de tasa

¿ARCA publica límites de tasa por CUIT o por certificado? ¿Cuál es el máximo de emisiones concurrentes recomendado?

Respuesta:

Impacto: límite global de concurrencia hacia ARCA.

### H6. Certificado propio por comercio

¿Existe una alternativa práctica al certificado único del proveedor, con un certificado por comercio? ¿Qué costo operativo tiene?

Respuesta:

Impacto: alcance de Etapas 2 y 3. Hoy el certificado propio está fuera de alcance.

## Cierre

Cuando cada bloque tenga respuesta, se actualiza `ADR-0090` a aceptado y arranca `PRD-FE-02`. El certificado de homologación se genera con el CSR del computador fiscal y se sube a WSASS. El de producción se emite después de FE2-S4.
