---
id: PRD-SEC-02
tipo: prd
estado: propuesto
modulos: [fiscal, persistencia, tenant]
depende_de: [ADR-0024, ADR-0050, ADR-0051, ADR-0066, ADR-0074]
reemplaza: []
reemplazado_por: ""
resumen: |
  PREFIJOSDATOS (src/lib/tenant-context.ts) lista las rutas que el middleware envuelve en conTenant y corta con
  403 en TENANTMODE=multi sin tenant.
---
# PRD-SEC-02 - Rutas de datos completas en el middleware y configuración fiscal por tenant

Fuente: pendientes de ADR-0066 y relevamiento de `src/pages/api` del 2026-10-14 (`docs/ROADMAP.md`, Pendientes priorizados P0.1 y P0.2). Uso en este sistema: rutas de cualquier comercio, sin reglas por rubro. Restringido por ADR-0074, ADR-0066, ADR-0051, ADR-0050 y ADR-0024. Tipo seguridad.

## Problema

`PREFIJOS_DATOS` (`src/lib/tenant-context.ts`) lista las rutas que el middleware envuelve en `conTenant` y corta con 403 en `TENANT_MODE=multi` sin tenant. Siete prefijos que leen o escriben repositorios por tenant no están: `/api/payment-orders`, `/api/payees`, `/api/counts`, `/api/stock`, `/api/service-accounts`, `/api/utility-bills` y `/api/ocr`. En multi esas rutas corren sin contexto de tenant y el repositorio cae a la memoria o a la base por defecto. Además, `fiscal_settings` no guarda el comercio dueño de la fila: `resolverCuitFiscal` toma la primera fila sin filtrar y `GET /api/fiscal/settings` lee un mapa en memoria del módulo que se pierde al reiniciar.

## Épica SEC2-E1. Todas las rutas de datos pasan por el middleware

Requisito SEC2-R1: toda ruta que usa un repositorio por tenant está en `PREFIJOS_DATOS`.

- Historia SEC2-S1. Sumar los siete prefijos a `PREFIJOS_DATOS`. AC: Given `TENANT_MODE=multi` sin sesión When llamo cualquiera de los siete prefijos Then 403 sin tocar datos; Given single Then el comportamiento no cambia. ADR: 0074. Talla S. Depende de: nada.
- Historia SEC2-S2. Arch-test: cada archivo de `src/pages/api` que importa `src/lib/repos` o `tenantDeRequest` vive bajo un prefijo de `PREFIJOS_DATOS` (o en una lista explícita de excepciones de control). AC: Given agrego una ruta de datos nueva sin prefijo When corro `npm run check:arch` Then falla con el archivo. ADR: 0074. Talla S. Depende de: SEC2-S1.

## Épica SEC2-E2. Configuración fiscal por tenant y durable

Requisito SEC2-R2: la configuración fiscal se guarda y se lee por tenant.

- Historia SEC2-S3. Migración Drizzle nueva que agrega `tenant_id text` a `fiscal_settings` con índice único por `tenant_id`; `POST /api/fiscal/settings` hace upsert por tenant; `GET` lee de la base del tenant (memoria solo sin base); `resolverCuitFiscal` filtra por el tenant del contexto. AC: Given el tenant A guardó CUIT X When el tenant B emite sin CUIT en el body Then no usa X; Given guardé settings When reinicio el proceso (memoria vacía) Then `GET` con base devuelve lo guardado. ADR: 0074. Talla S. Depende de: nada.

## Dependencias externas

Ninguna. La migración va solo como archivo en `drizzle/`; no se aplica a Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Multi sin tenant en `/api/payment-orders/prepare` | `TENANT_MODE=multi`, sin cookie | 403 |
| Fallo | Ruta de datos nueva sin prefijo | Archivo en `src/pages/api` que importa `repos` | arch-test falla |
| Fallo | CUIT de otro tenant | A guarda settings, B pide CUIT | B no recibe el de A |
| Feliz | Settings durables | POST y GET en PG local | GET devuelve lo guardado con memoria vacía |
| Regresión | Single | `TENANT_MODE` sin definir | rutas responden como hoy |
