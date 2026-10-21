---
name: control-app
description: "Recorré la app local como Dueño o empleado con la CLI control-app, verificá features reales y dejá capturas PNG más JSON. Usala para probar /panel, /venta, stock, plan, reportes, alertas, asistente y wipe remoto sin Google ni servicios reales."
---

# Control App

CLI para manejar el Sistema de Inventario local como un usuario real. Levanta Postgres y Astro, siembra un tenant, inicia sesión como Dueño o empleado, navega con Playwright y guarda evidencia.

## Seguridad

- Solo local. El CLI limpia `TENANT_MODE`, `CONTROL_DATABASE_URL`, `TENANT_DATABASE_URL*`, `ARCA_*`, `ASSISTANT_LLM_*` y `SUPABASE_*` antes de arrancar Astro.
- El endpoint `POST /api/dev/control-app` existe solo con `CONTROL_APP_DEV=1` y `NODE_ENV!=="production"`. Responde 404 fuera de ese modo.
- Nunca leas ni imprimas `.env`, claves, tokens ni URLs de base. No uses Supabase real.
- El asistente usa `ProveedorLLMFake` bajo control-app. No hay llamadas a modelos externos.
- `seed` resetea la memoria del Astro local. No lo corras contra una app que no levantaste vos.

## Flujo corto

```sh
node scripts/control-app/control-app.mjs levantar
node scripts/control-app/control-app.mjs seed
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel
node scripts/control-app/control-app.mjs captura --nombre panel-duenio
node scripts/control-app/control-app.mjs login --rol empleado
node scripts/control-app/control-app.mjs ir /venta
node scripts/control-app/control-app.mjs captura --nombre venta-empleado
node scripts/control-app/control-app.mjs errores
node scripts/control-app/control-app.mjs apagar
```

Todos los comandos imprimen JSON. Los que fallan devuelven `ok:false`, `error` y `hint` con el próximo paso. `--salida <archivo>` copia el JSON a disco.

## Comandos

| Comando | Uso | Qué hace |
|---|---|---|
| `levantar` | `levantar [--puerto 4321]` | Arranca Postgres local y Astro dev, espera salud. |
| `seed` | `seed [--dry-run]` | Crea tenant `control-app`, usuarios, 3 productos, plan Plus y device. |
| `login` | `login --rol duenio\|empleado` | Crea sesión local y guarda `storageState`. |
| `ir` | `ir <ruta>` | Abre una ruta con la sesión activa. |
| `escribir` | `escribir <selector> <texto>` | Escribe en un campo de la página actual. |
| `clic` | `clic <selector>` | Hace clic y espera la red. |
| `captura` | `captura [--nombre n] [--dir d]` | Guarda PNG full page y un JSON al lado. |
| `api` | `api <METODO> <ruta> [json]` | Llama la API con la cookie de la sesión. |
| `errores` | `errores [--limpiar]` | Lista errores de consola, página, request y HTTP. |
| `estado` | `estado` | Muestra app, base, navegador, sesión y evidencia. |
| `apagar` | `apagar [--dry-run]` | Baja el navegador, el Astro propio y el Postgres propio. |

Opciones globales: `--base-url`, `--home`, `--salida`, `--help`. Alias `l`, `s`, `e`, `off`.

## Verificar un cambio

1. `levantar`. Si ya está levantada con el mismo puerto, no duplica.
2. `seed` después de tocar código. El HMR de Astro borra el store en memoria.
3. `login` con el rol que corresponde a la feature.
4. Navegá y accioná con `ir`, `escribir`, `clic`.
5. Confirmá el efecto con `api` y con `errores`. No alcanza con que la pantalla se vea bien.
6. `captura` y adjuntá el PNG más el JSON.
7. `apagar` al terminar. Si el navegador queda raro, `apagar` lo mata.

## Evidencia

Cada captura deja dos archivos en `.agents/skills/control-app/artifacts/<AAAA-MM-DD>/`.

- `<nombre>.png` es la página completa.
- `<nombre>.json` trae `url`, `titulo`, `h1`, `estado`, `tomada_en`, cantidad de errores y hasta 50 errores.

En el reporte pegá la ruta de ambos archivos y el resultado de `api` que prueba el efecto. Si `errores` devuelve algo, explicalo o arreglalo. No lo omitas.

## Mapa de features

Leé solo el archivo que necesitás en `references/features/`.

| Feature | Ruta | Rol | Archivo |
|---|---|---|---|
| Venta y cola offline | `/venta` | empleado | `venta.md` |
| Panel e índice | `/panel` | duenio o empleado | `panel.md` |
| Stock, lotes e importación | `/panel/stock`, `/panel/stock/importar` | duenio | `stock.md` |
| Umbrales y alertas | `/panel/alertas/umbrales` | duenio | `alertas.md` |
| Plan y cambio de plan | `/panel/plan` | duenio | `plan.md` |
| Reportes y exportación | `/panel/reportes` | duenio | `reportes.md` |
| Asistente del negocio | drawer en `/panel` | duenio | `asistente-ia.md` |
| PWA y wipe remoto | `/venta`, APIs de sync | duenio y empleado | `pwa.md` |

## Datos sembrados

- Tenant `control-app`, nombre `Almacén Control App`, plan `plus`.
- Dueña `Mora Dueña`, `duenio@control-app.local`.
- Empleado `Tomi Empleado`, `empleado@control-app.local`, permiso `registrar_devoluciones`.
- Device `CONTROL-APP-01` con grant offline `control-app-grant`.
- `CAFE-001` con 12 unidades, mínimo 4, precio 850000 centavos.
- `YERBA-002` con 3 unidades, mínimo 5. Dispara alerta.
- `GASEOSA-003` con 0 unidades, mínimo 2. Dispara alerta.
- Ubicaciones `Mostrador` y `Depósito`.

## Fallas comunes

- `No hay tenant sembrado`. Corré `seed`.
- `La app no responde`. Corré `levantar` y mirá `estado`.
- La pantalla quedó vieja después de un clic. Corré `captura` de nuevo, el daemon conserva el DOM.
- `No hay sesión guardada`. Corré `login --rol ...`.
- El puerto está ocupado por otro Astro. Corré `levantar --puerto 4322` y seguí con `--base-url http://localhost:4322`.
- Una captura muestra la toolbar de Astro. Bajo `CONTROL_APP_DEV=1` la toolbar queda apagada. Si aparece, reiniciá Astro con `apagar` y `levantar`.
- `api` devuelve 403. La sesión no tiene el rol necesario. Volvé a `login` con el rol correcto.

## Mantenimiento

Cuando cambien rutas, selectores o contratos, actualizá el archivo de `references/features/` que corresponda. Después corré `/maintain-verification-skill` para auditar que el mapa siga describiendo la app. Si una feature nueva no entra en el mapa, agregala antes de confiar en la skill.

## Límites

- No sube archivos. La importación CSV/XLSX necesita Playwright directo o `setInputFiles`.
- No prueba Google OAuth real. Usa el endpoint dev y una cookie local.
- No prueba pagos, WhatsApp ni ARCA reales.
- El estado vive en memoria. Cualquier edición de código obliga a `seed` de nuevo.
