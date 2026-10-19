---
id: ADR-0094
tipo: adr
estado: aceptado
modulos: [ocr, compras, bot]
depende_de: [ADR-0005, ADR-0093]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El borrador OCR guarda los ítems que lee el motor. Cuando la suma no cierra con el total, el bot propone
  corregir el total y solo el Dueño lo aprueba con un toque. CUIT y fecha solo se avisan. El bot nunca
  persiste la corrección sin ese OK.
---
# ADR-0094 - Correcciones del borrador OCR propuestas por el bot y aprobadas por el Dueño

Estado: aceptado. Fecha: 2026-10-18. Aprobado por Mauri el 2026-10-19. Fuentes: ADR-0005 (pipeline OCR y botones), ADR-0093 (media y botones del borrador), `docs/02-identidad-onboarding/autenticacion-gestion-usuarios.md` (AU10.4), `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP3.3, FP3.5), PRD-OCR-01 (OCR1-S5).

## Decisión

El borrador OCR ahora guarda los ítems de línea que lee el motor (`extraer_items`). Cuando la suma de esos ítems no cierra con el total (tolerancia 1%, `verificarSumaItems`), el bot manda un `interactive` con [Sí, corregir] [No, dejarlo]. "Sí, corregir" lo aprueba solo el Dueño: reescribe el total a la suma de ítems con `editarBorradorOcrRepo` y vuelve a ofrecer el borrador con [Confirmar] [Editar] [Descartar]. El Empleado que toca "Sí, corregir" recibe un aviso y el borrador queda intacto. Un total no positivo, una fecha fuera de rango y un CUIT inválido se avisan como texto, sin corrección.

La edición por texto libre del usuario (FP3.3) sigue pendiente y `Editar` continúa derivando a la web.

## Por qué

AU10.4 y ADR-0093 reservan al Dueño las acciones que cambian montos de un comprobante. Ese límite prohíbe que el bot aplique una corrección sin autorización, no que la proponga. La propuesta con OK deja el criterio en el Dueño y mantiene el bot fuera de la escritura silenciosa. La validación ítems vs total es determinista y ya vive en el núcleo (`verificarSumaItems`), así que no inventa datos. El rol se lee de la membership en cada mensaje, como el resto del bot.

## Qué cambia

- `src/modules/ocr/motor.ts`: `Extraccion` suma `items` (de `extraer_items` sobre la fuente de mayor prioridad); el regex de `extraer_items` deja de cruzar saltos de línea.
- `src/lib/repos/facturas-proveedor.ts`: `IngestaOcrInput` acepta `items`.
- `src/lib/ocr-ingesta.ts`: convierte `ItemLinea` a `ItemBorrador` (`subtotalCentavos` = importe capturado; todo o nada).
- `src/modules/whatsapp/ocr-borrador.ts`: acciones `corregir` y `omitir`, `propuesta_correccion_total`, `avisos_borrador_ocr`, `payload_correccion_ocr` y `ahoraIso` en las firmas de armado.
- `src/pages/api/whatsapp/webhook.ts`: `atenderBotonOcr` recibe el rol, atiende las dos acciones y ofrece la propuesta en el 201.
- Tests: `tests/ocr-correccion-validacion.test.ts`.

## Alternativa descartada

Aplicar la corrección automáticamente choca con AU10.4. Habilitar la edición por texto libre en el bot reabre ese choque y no estaba pedido. Proponer una fecha o un CUIT "corregidos" inventaría datos, porque no hay fuente determinista.

## Consecuencias

El borrador puede quedar con un total corregido por el Dueño sin pasar por la web. La suma de ítems es heurística: el OCR no separa precio unitario de subtotal, así que la propuesta puede errar y el OK del Dueño es la barrera. Los ítems ahora viajan en `supplier_drafts.items`, que es mutable. El reofrecimiento calcula `revisa` desde la confianza del borrador y pierde el factor de fallback local, que no se persiste.

## Pendientes

Edición por texto libre (FP3.3/CS4.4). Endurecer el parser de ítems y su denylist de etiquetas. Aviso al Dueño cuando el borrador es de otro vinculado.

## Evidencia de aceptación (2026-10-18)

- `npm run verify` exit 0 (9 pasos, 2027 tests).
- `tests/ocr-correccion-validacion.test.ts` cubre: propuesta con ítems que no cuadran, corregir como Dueño, corregir como Empleado, omitir, corregir sin propuesta y OCR sin ítems.
