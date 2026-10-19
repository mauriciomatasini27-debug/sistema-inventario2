---
id: ADR-0095
tipo: adr
estado: aceptado
modulos: [ocr, compras, bot]
depende_de: [ADR-0005, ADR-0093, ADR-0094]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0093]
modificado_por: []
resumen: |
  El Dueño corrige por texto el borrador OCR desde el bot. Toca Editar, escribe "campo valor", el bot valida
  con el núcleo y muestra la propuesta con [OK] [Cancelar]; solo el OK persiste. El Empleado sigue derivado a
  la web. Esto modifica la parte de ADR-0093 que dejaba Editar en la web.
---
# ADR-0095 - Edición por texto del borrador OCR desde el bot, solo Dueño

Estado: aceptado. Fecha: 2026-10-19. Aprobado por Mauri el 2026-10-19. Fuentes: ADR-0005 (pipeline OCR y botones), ADR-0093 (media y botones del borrador), ADR-0094 (correcciones por validación), `docs/02-identidad-onboarding/autenticacion-gestion-usuarios.md` (AU10.4), `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP3.3), PRD-OCR-01 (OCR1-S5).

## Decisión

El Dueño corrige por texto el borrador OCR desde el bot. Toca `Editar`, el bot lista los campos corregibles (`monto`, `fecha`, `proveedor`, `cuit`) y abre una sesión. El Dueño escribe `campo valor` (`monto 164800`, `fecha 10/10/2026`). El bot valida con el núcleo (`editarBorrador`) y muestra la propuesta con [OK] [Cancelar]. Solo el OK persiste (`editarBorradorOcrRepo`) y registra `ocr_editado`. El Empleado sigue recibiendo la derivación a la web. `Editar` deja de derivar a la web para el Dueño.

## Por qué

FP3.3 pide la corrección por texto. AU10.4 la restringe al Dueño, y el OK explícito saca al bot de la escritura silenciosa. El borrador no tiene efecto contable hasta confirmarlo (FP3.6), así que la edición es reversible. Separar el paso de texto del OK evita que un valor mal tipeado mute el borrador antes de que el Dueño lo vea.

## Qué cambia

- `src/modules/whatsapp/ocr-borrador.ts`: `parsear_edicion_ocr`, `parche_de_edicion`, `cuerpo_pedir_edicion_ocr`, `payload_propuesta_edicion_ocr`, acciones `aprobar` y `cancelar`.
- `src/pages/api/whatsapp/webhook.ts`: `Editar` abre la sesión para el Dueño, el texto con sesión `ocr_editar` se intercepta, y las ramas `aprobar` y `cancelar` persisten o limpian.
- Sesión corta por número con pasos `ocr_editar` y `ocr_editar_ok` (TTL 30 min, `guardarSesion`).
- ADR-0093 pasa a `modificado_por: [ADR-0095]`.

## Alternativa descartada

Aplicar la edición al toque sin OK reintroduce la escritura silenciosa. Permitir al Empleado escribir choca con AU10.4. Persistir en el paso de texto y no en el OK expone el borrador a un cambio sin aprobar.

## Consecuencias

`Editar` cambia de comportamiento para el Dueño. Mientras la sesión está en `ocr_editar_ok`, un texto nuevo no se re-intercepta hasta que el Dueño toque OK o Cancelar, o venza la sesión. El borrador no guarda N° de factura, así que ese campo no se puede corregir. La sesión abierta por un Dueño que después cambia de rol queda hasta el TTL.

## Pendientes

CS4.4 (servicios por bot, sin camino: falta el pull real de Gmail). Aviso al Dueño cuando el borrador es de otro vinculado. Corregir N° de factura cuando el borrador lo guarde.

## Evidencia de aceptación (2026-10-19)

- `npm run verify` exit 0 (9 pasos, 2050 tests).
- `tests/ocr-edicion-texto.test.ts`: Dueño abre la lista, propone, aprueba, cancela; Empleado derivado a la web; texto sin sesión no se intercepta; valor inválido deja la sesión intacta.
