---
id: PRD-SEC-04
tipo: prd
estado: propuesto
modulos: [tenant]
depende_de: [ADR-0050, ADR-0051, ADR-0052, ADR-0077, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-SEC-04 - Fan-out de jobs por tenant

Fuente: pendientes de ADR-0052 ("Fan-out de jobs por tenant") y de PRD-PERS-02 ("Jobs que recorren todos los comercios necesitan un fan-out por tenant desde control"); `docs/ROADMAP.md`, Pendientes priorizados P0.4. Uso en este sistema: jobs de cualquier comercio, sin reglas por rubro. Restringido por ADR-0077, ADR-0052, ADR-0051 y ADR-0050. Tipo seguridad.

## Problema

Los jobs con `X-Job-Secret` (`src/pages/api/jobs/*`) en `TENANT_MODE=multi` exigen `X-Tenant-Id` y corren para un solo comercio (PERS2-S3). Sin ese encabezado `gateJob` responde 403. El cron externo tendría que conocer la lista de comercios y disparar una llamada por cada uno: la lista vive en control (`control.tenants`), no en el cron, y un comercio nuevo quedaría sin cierre de medianoche ni avisos hasta que alguien toque el cron.

## Épica SEC4-E1. Un disparo de job recorre todos los comercios elegibles

Requisito SEC4-R1: un job con secreto válido y sin `X-Tenant-Id` en multi corre una vez por cada comercio `activo` o `suspendido` de control, cada vez dentro de su propio `conTenant`.

- Historia SEC4-S1. `gateJob` devuelve la lista de tenants elegibles cuando el secreto es válido, el modo es multi, la ruta es `/api/jobs/*` y no hay `X-Tenant-Id`. AC: Given multi con tenants `activo`, `suspendido` y uno en otro estado When pido sin `X-Tenant-Id` Then recibo solo los dos primeros, ordenados por id; Given `X-Tenant-Id` de un tenant inexistente o no elegible Then 403 E5 como hoy; Given secreto inválido o ausente Then `null` como hoy; Given single Then el tenant por defecto como hoy. ADR: 0077. Talla S. Depende de: nada.
- Historia SEC4-S2. Helper compartido `correrJob(request, cuerpo)` que usan las seis rutas de jobs con tenant (cierre-medianoche, vencimientos-lotes, vencimientos-servicios, whatsapp-aviso, whatsapp-cierre, whatsapp-semanal). Con un tenant devuelve la respuesta de la ruta tal cual; con fan-out corre el cuerpo en secuencia por tenant y responde 200 con un resumen JSON por tenant. AC: Given dos tenants y el cuerpo del primero lanza When corro el job Then el segundo corre igual y el resumen marca al primero con `status` 500 y al segundo con su respuesta; Given `BaseNoDisponible` en un tenant Then ese tenant figura con `status` 503 `base_no_disponible` y el resto sigue; Given cero tenants elegibles Then 200 con `resultados` vacío. Given multi sin `X-Tenant-Id` en `whatsapp-cierre` (cierre puntual, no barrido) Then 403 E5 como hoy. ADR: 0077. Talla S. Depende de: SEC4-S1.
- Historia SEC4-S3. El middleware no envuelve en un solo `conTenant` cuando corresponde fan-out: deja pasar a la ruta, que envuelve por tenant. Fuera de `/api/jobs/*`, secreto válido sin `X-Tenant-Id` en multi sigue en 403. AC: Given multi y `POST /api/jobs/cierre-medianoche` sin `X-Tenant-Id` When pasa por el middleware Then llega a la ruta sin contexto de tenant; Given `/api/sales` con secreto y sin tenant Then 403. ADR: 0077. Talla S. Depende de: SEC4-S1.

## Formato del resumen

```json
{
  "fan_out": true,
  "total": 2,
  "fallidos": 1,
  "resultados": [
    { "tenant_id": "tenant-a", "status": 201, "cuerpo": { "close_type": "automatica" } },
    { "tenant_id": "tenant-b", "status": 503, "cuerpo": { "error": "base_no_disponible" } }
  ]
}
```

`fallidos` cuenta los tenants con `status` 500 o mayor. Un 409 (ya corrido hoy) o 422 (turno en disputa) no es fallo del fan-out: es la respuesta de negocio de ese comercio. Un error inesperado se informa como `{ "error": "error_interno" }` sin mensaje ni stack.

## Fuera de alcance

`aviso-sync` y `vencer-ocr` leen la memoria del comercio y pasan también por `correrJob`. Los jobs de control (mora-diaria, purgar-demos, whatsapp-lunes, enqueue) solo leen `control` y corren una vez sin contexto de tenant. Paralelismo, reintentos y colas por tenant (pg-boss) quedan para más adelante.

## Dependencias externas

Ninguna. Sin servicios nuevos ni migraciones; no se toca Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Fan-out en multi | Secreto válido, sin `X-Tenant-Id`, tenants activo + suspendido + otro estado | Corre en los dos elegibles, cada uno en su contexto |
| Feliz | Un tenant | Secreto válido + `X-Tenant-Id` activo | Respuesta de la ruta como hoy |
| Fallo | Tenant fantasma | `X-Tenant-Id` inexistente | 403 E5 |
| Fallo | Secreto inválido | `X-Job-Secret` distinto o ausente | `null` en gate, 403 en ruta |
| Fallo | Un tenant falla | Cuerpo lanza en el primero | El segundo corre; resumen con 500 y `fallidos` 1 |
| Regresión | Single | `TENANT_MODE` sin definir | Tenant por defecto como hoy |
| Feliz | PG local | Fan-out de vencimientos-servicios sobre bases A y B | Cada base marca solo sus órdenes vencidas |
