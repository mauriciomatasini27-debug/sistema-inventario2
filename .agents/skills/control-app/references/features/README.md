# Mapa de features

Cada archivo describe una feature que se puede recorrer con la CLI `control-app`. Trae ruta, rol, selectores reales, APIs y una receta corta.

| Feature | Ruta principal | Rol | Archivo |
|---|---|---|---|
| Venta y cola offline | `/venta` | empleado | `venta.md` |
| Panel e índice | `/panel` | duenio o empleado | `panel.md` |
| Stock, lotes e importación | `/panel/stock` | duenio | `stock.md` |
| Umbrales y alertas | `/panel/alertas/umbrales` | duenio | `alertas.md` |
| Plan y cambio de plan | `/panel/plan` | duenio | `plan.md` |
| Reportes y exportación | `/panel/reportes` | duenio | `reportes.md` |
| Asistente del negocio | drawer de `/panel` | duenio | `asistente-ia.md` |
| PWA y wipe remoto | `/venta` y sync | duenio y empleado | `pwa.md` |

Reglas para mantenerlo.

- Los selectores salen del código, no de una corrida vieja.
- Si un flujo necesita subir archivos o permisos del navegador, decilo como límite.
- Si una feature cambia de rol, actualizá la tabla y el archivo.
- Probá la receta antes de darla por buena.
