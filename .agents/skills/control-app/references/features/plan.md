# Plan y cambio de plan

Ruta `/panel/plan`. Rol duenio.

## Selectores

- `#plan-nombre` nombre del plan activo. El seed deja `plus`.
- `#plan-renovacion` fecha de renovación.
- `#plan-estado` estado de carga.
- `#plan-cambio` aviso de cambio programado.
- `#plan-botones` botones de cambio.
- `#plan-accion-estado` resultado de la acción.
- `#plan-features` features incluidas.
- `#whatsapp-medidor`, `#whatsapp-texto` uso de WhatsApp.
- `#asistente`, `#asistente-texto` uso del asistente.

## Receta

```sh
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel/plan
node scripts/control-app/control-app.mjs api GET /api/plan/resumen
node scripts/control-app/control-app.mjs captura --nombre plan-plus
```

Para probar un cambio usá `clic` sobre un botón de `#plan-botones` y confirmá con `api GET /api/plan/resumen`. El POST directo es `POST /api/plan/cambiar`.

## Límites

El cambio de plan puede quedar programado. Leé `#plan-cambio` y `plan_programado` en el resumen antes de afirmar que el plan cambió. Para la baja programada corré `/verify-plan-cambio`.
