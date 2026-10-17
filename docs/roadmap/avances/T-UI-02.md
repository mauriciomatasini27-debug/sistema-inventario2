---
item: T-UI-02
estado: hecho
adr: ADR-0038
prd: PRD-UX-01
fecha: 2026-10-17
---
T-UI-02: diálogos de confirmación para acciones destructivas con `src/lib/confirmar.ts` (comparación insensible a mayúsculas/acentos/espacios), `src/lib/confirmar-dom.ts` (`confirmar({ titulo, mensaje, accion, nombreRequerido? }) => Promise<boolean>`) y `src/components/ui/ConfirmDialog.astro`, un `<dialog>` nativo con `showModal()`, aria-labelledby/aria-describedby, foco inicial en Cancelar (o en el nombre si es crítico), trampa de Tab, foco devuelto al elemento previo, Confirmar deshabilitado hasta `puedeConfirmar` y tokens de Tema Papel; las críticas piden el nombre (edición masiva por sector en `alertas/umbrales.astro`, apagar módulo en `BotModulosCard.astro`) y el resto confirma sin tipear (egreso de `caja.astro`, pagar factura en `consumos.astro`, registrar cobro en `fiado.astro`), con Cancelar que no dispara request.
