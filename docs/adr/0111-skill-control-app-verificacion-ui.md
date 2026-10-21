---
id: ADR-0111
tipo: adr
estado: propuesto
modulos: [verificacion, dev]
depende_de: [ADR-0097, ADR-0109]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La verificación de UI pasa a tener una skill propia, `control-app`, con una CLI que levanta el entorno local,
  siembra un tenant, inicia sesión como Dueño o empleado, navega con Playwright y deja PNG más JSON.
  El seed y el login viven en un endpoint dev gateado por `CONTROL_APP_DEV=1` y nunca tocan servicios reales.
---
# ADR-0111 - Skill control-app para verificar la UI de punta a punta

Estado: propuesto. Fecha: 2026-10-21. Fuentes: `.agents/skills/control-app/SKILL.md`, `.agents/skills/control-app/references/features/`, `scripts/control-app/`, `src/pages/api/dev/control-app.ts`, `.agents/skills/verify-inventario/SKILL.md`, `playwright.config.ts`, `docs/adr/0097-verificacion-formal.md`.

## Decisión

Se agrega una skill de proyecto, `control-app`, y una CLI en `scripts/control-app/` para recorrer la app como usuario. La skill no reemplaza a Playwright. Lo envuelve para que una persona o un agente pueda probar una feature sin escribir un spec nuevo cada vez.

La CLI tiene comandos chicos y una salida JSON estable: `levantar`, `apagar`, `seed`, `login`, `ir`, `escribir`, `clic`, `captura`, `api`, `errores` y `estado`. `--help` documenta cada comando y `--dry-run` protege los comandos que cambian estado. Un fallo devuelve `ok:false`, `error` y un `hint` con el próximo paso.

El entorno es local. `levantar` arranca Postgres con `scripts/pg-local.sh` y Astro dev en un puerto libre, y limpia las variables que podrían apuntar a servicios reales (`TENANT_MODE`, `CONTROL_DATABASE_URL`, `TENANT_DATABASE_URL*`, `ARCA_*`, `ASSISTANT_LLM_*`, `SUPABASE_*`). El asistente usa `ProveedorLLMFake` cuando `CONTROL_APP_DEV=1`.

El login no usa Google. `POST /api/dev/control-app` siembra el tenant `control-app` y crea una sesión local para `duenio` o `empleado`. El endpoint responde 404 salvo que `CONTROL_APP_DEV=1` y `NODE_ENV` no sea `production`. La cookie es la misma `__Host-sesion` que usa la app, así que los permisos y el middleware se ejercitan de verdad.

El navegador vive en un daemon Playwright con un servidor HTTP en `127.0.0.1`. La primera navegación lo arranca y los comandos siguientes le hablan por HTTP. Esto conserva el DOM y la sesión entre `ir`, `clic`, `escribir` y `captura`. Sin el daemon, cada captura recargaba la página y se perdía el estado posterior al clic.

Cada captura deja un PNG full page y un JSON al lado con URL, título, `h1`, `#estado`, errores acumulados y timestamp. La evidencia va a `.agents/skills/control-app/artifacts/<AAAA-MM-DD>/`. El mapa de features vive en `references/features/` y se actualiza cuando cambian rutas, selectores o contratos.

El modelo de la skill se resuelve con el perfil `rapido` de `.opencode/modelos-por-skill.json`, sujeto a la política de privacidad de ADR-0109.

## Por qué

La skill `verify-inventario` existente describía el flujo con Playwright, pero no tenía un login local ni un seed reproducible. Su propia sección de gotchas decía que el login multi-tenant no se podía manejar sin Google. Eso dejaba `/panel` y casi todas las features de Dueño fuera del alcance real.

Escribir un spec nuevo por cada verificación tampoco escala. La mayoría de las pruebas de UI son la misma secuencia, levantar, sembrar, entrar, navegar, accionar y capturar. La CLI concentra esa secuencia, la deja en JSON y permite que un agente la use sin inventar selectores ni credenciales.

Las alternativas se descartaron por estas razones. Usar Playwright puro obliga a repetir setup y no deja una evidencia uniforme. Usar un navegador nuevo por comando pierde el estado después del clic. Usar Google real mete credenciales y red en el camino crítico. Sembrar en la base compartida ensucia datos y no es repetible. El endpoint dev gateado y el daemon resuelven esos problemas sin tocar producción.

## Qué cambia

- `scripts/control-app/` (nuevo): CLI, parser, estado, procesos, Postgres, Astro, sesión, navegador, daemon y cliente.
- `src/pages/api/dev/control-app.ts` (nuevo): seed y login local, gateados por `CONTROL_APP_DEV=1`.
- `src/modules/ia/proveedor.ts`: usa `ProveedorLLMFake` bajo control-app.
- `astro.config.mjs`: apaga la toolbar de Astro cuando `CONTROL_APP_DEV=1`.
- `.agents/skills/control-app/SKILL.md` y `references/features/` (nuevos): flujo, comandos, mapa y límites.
- `.opencode/modelos-por-skill.json`: `control-app` usa el perfil `rapido`.
- `tests/control-app-cli.test.ts` y `tests/control-app-dev.test.ts`: parser, ayuda, estado, seed, login, guardas y errores.
- `AGENTS.md`: una línea para que la verificación de UI use esta skill.

## Pendientes

- La CLI no sube archivos. La importación CSV/XLSX queda para Playwright directo hasta que exista un comando `subir`.
- La CLI no corta la red ni inspecciona `localStorage`. La cola offline sigue cubierta por `verify-venta-sync` y `tests/e2e/venta.spec.ts`.
- El seed vive en memoria. Cualquier edición de código obliga a volver a sembrar.
- Falta un comando para adjuntar la evidencia al PR de forma automática.
