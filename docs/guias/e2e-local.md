---
id: GUIA-E2E-01
tipo: spec
estado: aceptado
modulos: [admin, inventario]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Cómo correr Playwright y control-app en el box local: librerías del navegador, puerto 4321, seed y login, harness de catálogo y fallos de entorno conocidos.
---
# E2E en el box local

Guía de referencia. Fecha: 2026-11-23. Fuente: sesiones NAV-S5/NAV-S6. Los comandos generales de desarrollo están en `desarrollo-windows-opencode.md`; acá solo lo que no se deduce del `package.json`.

## Secuencia

```bash
export LD_LIBRARY_PATH=/tmp/opencode/nspr/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
cd <worktree>

bash scripts/pg-local.sh start          # Postgres local: puerto 54329
node scripts/control-app/control-app.mjs levantar --puerto 4321
node scripts/control-app/control-app.mjs seed
node scripts/control-app/control-app.mjs login --rol duenio
npx playwright test tests/e2e/<spec>.ts
node scripts/control-app/control-app.mjs apagar
```

- Sin el `LD_LIBRARY_PATH` de `/tmp/opencode/nspr`, los browsers no arrancan en esta caja. Tiene que estar en la **misma shell** que corre Playwright.
- `control-app` levanta la app en `http://localhost:4321`, siembra el tenant y guarda la sesión del rol; no hace falta tocar `.env` ni imprimir cookies.
- `playwright.config.ts` usa ese puerto como `baseURL`, trae un único project `mobile-360` y **`webServer: undefined`**: la app la levanta `control-app`, no Playwright. Los specs que necesitan 1280×800 lo fijan con `test.use({ viewport: ... })`.
- `npm run verify` no corre Playwright: los e2e se corren a mano, después del gate.

## Fallos de entorno conocidos

- `control-app` no sirve `/admin` (404): los specs de tema en esa ruta fallan por entorno, no por código.
- El harness `?data=mil` exige `import.meta.env.DEV`. En `/panel/precios` hidruta y da `aria-rowcount=1000`; en `/panel/stock` a 360 px la isla `client:visible` queda fuera del viewport y el número queda en 0 (explicación en `gotchas-navegacion.md`).
- `@number-flow/react` 0.6.2 renderiza el custom element `number-flow-react` (no `number-flow`): ese es el selector para esperar precios reales en el DOM.
- Bajo `prefers-reduced-motion: reduce`, `getComputedStyle(...).transitionDuration` da `1e-05s` (el kill switch de 0,01 ms de `global.css`), no `0s`: compará contra un milisegundo, no contra cero literal.
