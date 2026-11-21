# Pendientes para seguir en la PC

Fecha: 21 de noviembre de 2026 (hora de Argentina, America/Cordoba).
Repo: [sistema-inventario2](https://github.com/mauriciomatasini27-debug/sistema-inventario2).
Ninguno de estos PRs está mergeado. Estado revisado con `gh` en esa fecha: GitHub los marca a todos como mergeables, salvo el #372, que el chequeo local `node scripts/cadena/puede-mergear.mjs` bloquea hasta que 0052 y 0053 figuren aplicadas en la base real.

Reglas que siguen vigentes: rama por ítem, nunca `main`; no editar `docs/ROADMAP.md`, `docs/ESTADO.md`, `docs/INDEX.md`, `docs/graph.json` ni `docs/roadmap/migraciones-aplicadas.md`; no agregar `drizzle/*.sql` ni GitHub Actions; no force-push; no mergear ni aplicar migraciones en la base real sin el ok de Mauricio; `npm run verify` verde antes del PR.

Después de cada merge, corré `npm run verify` sobre el siguiente PR: varios tocan los mismos archivos y puede haber conflictos.

## 1. Orden de merge de los PRs abiertos

1. [#374](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/374) (`mauri/ds-lock-v3-skills`): lock de skills v3 y web-design-guidelines v1.1.0. Es chico y no afecta la app.
2. [#366](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/366) (`mauri/poda-comentarios-src`): poda de comentarios (ola 1) y el chequeo endurecido. Después [#367](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/367) (`mauri/comentarios-reglas-ids`): reglas mecánicas de comentarios con IDs. El #367 va después del #366.
3. [#370](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/370) (`mauri/aud-vta-01-stock-tenant`): en modo shared, la venta solo toca el stock del comercio que vende.
4. [#371](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/371) (`mauri/aud-vta-02-venta-503`): si cae la base en shared/multi, la venta responde 503 `base_no_disponible` en vez de confirmar en memoria.
5. [#373](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/373) (`mauri/aud-vta-03-devolucion-cantidades`): la devolución no puede superar las unidades vendidas por SKU (422 `CANTIDAD_EXCEDIDA`). Después [#377](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/377) (`mauri/aud-vta-04-devolucion-concurrente`): `FOR UPDATE` sobre la venta, y stock/caja se escriben en la misma transacción. El #377 va después del #373.
6. [#375](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/375) (`mauri/suspension-gate-escrituras`): un comercio suspendido recibe 403 en las escrituras.
7. [#379](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/379) (`mauri/p10-91-cierre-cuenta`): el dueño cierra la cuenta desde `/panel/plan`. Soporte puede reabrirla por API (`POST /api/admin/tenants`, `accion: "reabrir"`) dentro de los 90 días, pero en `/admin` todavía no hay botón para reabrir.
8. [#380](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/380) (`mauri/p10-92-envio-mails`): job `POST /api/jobs/enviar-emails` que manda la cola `email_outbox` con Resend, reintentos e idempotencia. No está agendado. Mauricio decidió que los avisos salgan por WhatsApp; meta api está armando un PR apilado encima de este (al 21 de noviembre de 2026 todavía no estaba abierto). Ese PR de WhatsApp se mergea después del #380.
9. [#372](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/372) (`mauri/retencion-90-dias`): retención a los 90 días del cierre. Trae las migraciones `0052` y `0053`, que hay que aplicar en la base real con el ok de Mauricio; `puede-mergear` lo bloquea hasta entonces. El job no está agendado. Las facturas y cuentas de servicios se borran; las órdenes de pago a proveedores, su historial y los beneficiarios se conservan como registro fiscal.
10. [#369](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/369) (`meta/paginas-legales`): páginas `/privacidad`, `/terminos` y `/eliminar-datos`. Esperar el texto final de `/privacidad` (meta check lo actualiza con lo del #372) antes de mergear.
11. [#378](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/378) (`landing/arreglos-chicos`): CTAs de plan, features reales, canonical a modoops2791.vercel.app y arreglos mobile. Va después del #369 para que anden los links legales del pie. Todavía falta decidir la marca (Inventario, Modo o ModoOps) y cargar el ID de Formspree en Vercel, o sacar el formulario de contacto.
12. [#376](https://github.com/mauriciomatasini27-debug/sistema-inventario2/pull/376) (`mauri/mp-cobro-webhook-real`): webhook de Mercado Pago con tópicos reales y alta de suscripción. No va a producción hasta que haya precios en pesos (ARS) y `MP_ACCESS_TOKEN`.

### Trabajo de control-app, todavía sin push

En el box, clon `/workspace/bots/control-app/sistema-inventario2`, rama local `control-app/seguridad` (no está en origin):

- Commits locales, sin push: P1-91 (allowlist de un sub, suspensión real y panel simplificado), P1-92 (alta de comercio con invitación del dueño por email; el dueño se confirma en el primer login con Google) y P1-93 (aprovisionar el comercio al darlo de alta).
- Encima hay cambios sin commitear de P1-94 (plan desde el panel de admin).

Ese trabajo vive solo en el box. Para seguirlo en la PC hay que pushearlo o copiarlo antes; no está en GitHub.

## 2. Pendientes de desarrollo

- Venta por peso (papas, fiambres, quesos, verduras). No empezó.
- Los números de devolución `D-00000N` son únicos en toda la base y deberían ser por comercio. Hace falta una migración, y esa migración necesita autorización explícita de Mauricio.
- Desincronización entre lotes y stock (bug 5 de la auditoría de ventas). Es una decisión de diseño, no un parche suelto.
- Siguen únicos en toda la base y no por comercio: `utility_bills.message_id`, `payment_orders.numero` e `idempotency_key`.
- `email_ingestion_filters` y `email_ingestion_log` no tienen `tenant_id`.
- El job de mails (`#380`) solo recorre comercios activos o suspendidos, no los cerrados, así que no salen el aviso de retención ni el de cierre. También falta el webhook de rebotes (Resend u otro proveedor) hacia `email_suppressions`.
- Agendar los jobs de retención (`#372`) y de mails (`#380`), sin GitHub Actions: con el cron de Vercel o un cron externo que pegue a los endpoints con `X-Job-Secret`.
- Hook de pre-commit, y la ola 2 de poda de comentarios.
- Quedaron en espera: `define:vars` / issue [#94](https://github.com/mauriciomatasini27-debug/sistema-inventario2/issues/94) (diálogo de bienvenida en `/panel`, sigue abierto y etiquetado `bloqueado`; hay una rama local `fix/bienvenida-define-vars` sin PR); `fabrica-prueba`. Sobre la lista vieja: los PRs #72 a #79 ya están mergeados; el Dependabot #186 está mergeado y el #170 está cerrado.

Migraciones `0052` y `0053`: autorizadas, no aplicadas en la base real. No aplicarlas sin el ok de Mauricio. Después de un verify local del #372, en el box se usa `/workspace/bots/grok-bot/revertir-0052-local.sh` (se estaba extendiendo para revertir también 0053) para no dejar esas migraciones en la PG de verify.

## 3. Cómo correr verify

### En la PC

```bash
npm ci
npm run verify
```

Ojo: `scripts/pg-local.sh` con drizzle-kit falla en una base nueva, porque `0043_shared_tenant_nucleo.sql` (línea 9) hace ALTER de `inventory_counts` y esa tabla se crea recién en `0044`. Hay que migrar con `npm run db:migrate` (el migrador custom), que saltea ese ALTER.

`/workspace/.pgdata` en el box está roto (le faltan directorios vacíos). No lo uses de referencia.

### Cómo funciona `/workspace/run-verify-box.sh` (para replicarlo)

Uso, desde un clon que ya tenga `node_modules`:

```bash
/workspace/run-verify-box.sh
# o:
/workspace/run-verify-box.sh /ruta/al/clon
```

Qué hace, para poder copiarlo fuera del box:

1. Exige `scripts/verify.mjs` y `node_modules` en el clon.
2. Levanta un Postgres propio en `/workspace/.pgdata-verify`, puerto **54349**, usuario `postgres` con auth trust, `listen_addresses=127.0.0.1`. Si el data dir no existe, corre `initdb`.
3. Crea o reutiliza las bases `pers_tenant_a` y `pers_tenant_b`.
4. Migra cada una con `npm run db:migrate` (no con drizzle-kit), solo si `npm run db:migrate:check` dice que hay pendientes. No imprime `TENANT_DATABASE_URL`.
5. En el box, el DNS resuelve hosts inventados a `198.18.0.1` y el TCP entra, pero no habla el protocolo de Postgres, así que los tests con URLs fake se cuelgan. El script arma una tabla nft `verify_pg_sinkhole` que rechaza `198.18.0.1` en los puertos 5432 y 6543. HTTP/HTTPS y la PG local siguen.
6. Corre `npm run verify` sacando `TENANT_DATABASE_URL`, `PG_LOCAL_PORT` y `PGDATA_LOCAL` del entorno (si quedan, los tests apuntan al pooler real o al puerto default 54329). En su lugar exporta:
   - `PG_TEST_URL_A=postgres://postgres@127.0.0.1:54349/pers_tenant_a`
   - `PG_TEST_URL_B=postgres://postgres@127.0.0.1:54349/pers_tenant_b`
   - `VITEST_MAX_WORKERS=4`

En la PC no hace falta nft ni ese puerto exacto, siempre que `npm run verify` use una PG local migrada con `npm run db:migrate` y no quede una `TENANT_DATABASE_URL` de producción en el entorno.
