---
id: PRD-FE-02
tipo: prd
estado: propuesto
modulos: [fiscal]
depende_de: [ADR-0018, ADR-0090, PRD-FE-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Plan que desbloquea P9-2. Cierra el encuadre legal-fiscal y obtiene los certificados ARCA para pasar de la
  homologación con fake a la emisión real. Historias FE2-S1 a FE2-S5.
---
# PRD-FE-02 - Cumplimiento legal-fiscal y certificados ARCA

Fuente: PRD-FE-01 (FE1-FE16), ADR-0018, ADR-0090, RG 5616, `docs/06-fiscal-arca/facturacion-electronica-arca.md`, P9-2. Restringido por ADR-0018 y ADR-0090. Fecha extracción: 2026-10-18.

## Problema

El núcleo fiscal está escrito contra el fake de homologación, pero faltan el encuadre legal, los certificados ARCA y la homologación real. La RG 5616 exige informar `CondicionIVAReceptorId` siempre y vence el 2026-12-01. Sin certificados ni homologación no se factura de verdad.

## Épica FE2-E1. Cierre del encuadre legal y fiscal

Requisito FE2-1: no se escribe código fiscal nuevo hasta tener las respuestas del contador y del abogado.

- Historia FE2-S1. Sesión con el contador sobre las preguntas de PRD-FE-01. AC: Given la lista [a verificar] When cierro la sesión Then cada pregunta tiene respuesta escrita y firmada por el contador. ADR: 0090. Talla S. Depende de: nada.
- Historia FE2-S2. Encuadre de responsabilidad con el abogado. AC: Given el circuito de delegación When el abogado lo revisa Then queda escrito quién responde ante ARCA y qué se conserva. ADR: 0090. Talla S. Depende de: FE2-S1.

## Épica FE2-E2. Certificados y homologación

Requisito FE2-2: el servicio firma contra homologación y después contra producción con el computador del proveedor.

- Historia FE2-S3. Emitir el certificado de homologación. AC: Given el computador WSASS When genero el CSR y lo subo Then el servicio obtiene un TA válido. ADR: 0018. Talla M. Depende de: FE2-S2.
- Historia FE2-S4. Correr la homologación de FE-S24. AC: Given el certificado When el CI despliega Then se emite una Factura C y una NC con CAE en homologación. ADR: 0018. Talla M. Depende de: FE2-S3.
- Historia FE2-S5. Condición IVA receptor con fecha límite. AC: Given la RG 5616 When facturo Then `CondicionIVAReceptorId` va siempre informado y el sistema acepta los 11 IDs vigentes. ADR: 0018, 0090. Talla S. Depende de: FE2-S3.

## Dependencias externas

Contador y abogado designados por Mauri. Certificado de homologación y luego de producción emitidos por Mauri. Acceso al portal de ARCA con clave fiscal.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Factura homo | Venta C en homologación | CAE y QR válidos, marcada PRUEBA |
| Fallo | Sin delegación | `Auth.Cuit` sin delegar | 601, estado `delegacion_pendiente`, sin error crudo |
| Fallo | Condición IVA faltante | Factura sin `CondicionIVAReceptorId` | rechazo antes de ARCA |
| Regresión | Producción desde homo | Config de homologación | imposible mandar a producción |

Arch-tests: AT1 solo el servicio fiscal importa clave y TA. AT2 `CondicionIVAReceptorId` nunca vacío en el armado del comprobante.
