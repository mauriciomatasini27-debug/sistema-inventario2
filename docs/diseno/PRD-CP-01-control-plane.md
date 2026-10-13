# PRD-CP-01 - Control Plane ModoOps reutilizable (R2)

Fuente: `consultoria/docs/modoops-control-plane-spec.md`, `modoops_admin/` (manifest, tenant model, views), ADR 0006/0007. Restringido por ADR-0011, ADR-0006.

## Épica CP-E1. Modelo Tenant

Requisito CP1: un tenant es una DB aislada por cliente en Postgres central.

- Historia CP-S1. Definir `modoops.tenant` con `name`, `db_name modoops_<slug>`, `slug`, `vertical retail/servicios/distribucion`, `state activo/suspendido/baja`, `abono_due_date`, `modules_installed`, `last_backup` y `notes`. AC: Given creo un tenant con slug `demo` When leo su ficha Then `db_name` es `modoops_demo` y todos los campos listados existen. ADR: 0011. Talla S. Depende de: nada.
- Historia CP-S2. Provisionar una DB aislada por cliente con script en unos 2 minutos. AC: Given lanzo `provision_tenant.py` para un slug nuevo When termina Then la DB responde y el tiempo queda registrado cerca de 2 minutos. ADR: 0011. Talla M. Depende de: CP-S1.

## Épica CP-E2. Historias MVP

Requisito CP2: operar tenants solo desde el catálogo y con trazabilidad total.

- Historia CP-S3. Listar tenants con nombre, DB, vertical, módulos, estado, vencimiento y backup. AC: Given hay tres tenants cargados When abro el listado Then veo las siete columnas sin abrir fichas. ADR: 0011. Talla S. Depende de: CP-S1.
- Historia CP-S4. Instalar o quitar módulo solo del Catálogo con validación de dependencias y log. AC: Given pido un módulo fuera del catálogo When confirmo Then la acción se rechaza y queda el intento en el log. ADR: 0011. Talla M. Depende de: CP-S1, CP-S3.
- Historia CP-S5. Suspender con `active=False` y bloqueo de login, y reactivar. AC: Given suspendo un tenant When ese usuario intenta entrar Then el login se bloquea, y Given lo reactivo When reintenta Then entra de nuevo. ADR: 0011. Talla S. Depende de: CP-S1.
- Historia CP-S6. Registrar logs por tenant con fecha, acción, usuario y resultado. AC: Given ejecuto instalar, suspender y reactivar When abro el log del tenant Then cada acto muestra fecha, acción, usuario y resultado. ADR: 0011. Talla S. Depende de: CP-S4, CP-S5.

## Épica CP-E3. Mora con gracia de 14 días

Requisito CP3: vencimiento más gracia de 14 días según ADR-0006 PA7, sin borrado.

- Historia CP-S7. Aplicar gracia de 14 días y pasar a solo lectura el día 15 sin borrar (0000 F8). AC: Given un tenant vence el día 1 When llega el día 15 sin pago Then queda en solo lectura y conserva sus datos. ADR: 0011, 0006. Talla M. Depende de: CP-S1.
- Historia CP-S8. Avisos y baja según tabla única de ADR-0006, manual en MVP y en contrato, sin billing automático. AC: Given reviso el flujo de mora When comparo con ADR-0006 Then avisos, gracia y baja coinciden y no hay cobro automático activo. ADR: 0006. Talla S. Depende de: CP-S7.
- Historia CP-S9. Vender por planes SaaS Básico, Plus y Pro, sin abono de 45 como regla ModoOps. AC: Given abro la oferta When busco el abono de 45 Then no aparece y solo figuran Básico, Plus y Pro. ADR: 0011. Talla S. Depende de: nada.

## Épica CP-E4. Stack y mapeo a Panel Inventario

Requisito CP4 y CP5: módulo reutilizable en master y mapeo directo a la tabla de kioscos.

- Historia CP-S10. Montar `modoops_admin` en base `modoops_master` en la misma VPS, sin usar base de cliente, con dependencia en `base, web, mail`, estilo Liquid Glass con hubs y acceso solo para rol ModoOps. AC: Given entro con un rol no ModoOps When pido el panel Then el acceso se deniega y la base cliente sigue intacta. ADR: 0011. Talla M. Depende de: CP-S1.
- Historia CP-S11. Orquestar con `provision_tenant.py` usando `odoo-bin -d tenant -i/-u`. AC: Given instalo un módulo When reviso el comando ejecutado Then usa `odoo-bin -d tenant` con `-i` o `-u` según corresponda. ADR: 0011. Talla M. Depende de: CP-S10, CP-S4.
- Historia CP-S12. Operar backups en Fase 1 nightly a S3 con RPO 24h y RTO 60min por unos 40 al mes, y Fase 2 en standby con floating IP por unos 78 al mes desde 10 tenants. AC: Given reviso la Fase 1 When simulo una pérdida Then el punto de recupero es de 24h y la restauración completa en 60min. ADR: 0011. Talla L. Depende de: CP-S2.
- Historia CP-S13. Mapear lista de tenants a tabla de kioscos, `db_name/slug/vertical` a ficha de cliente, `state` a habilitado o bloqueado, `modules_installed` a features por sucursal, vencimiento y backup a columnas PA, acciones a botones instalar, suspender y reactivar, y logs a auditoría PA. AC: Given abro la tabla de kioscos When comparo con el modelo Tenant Then cada campo y cada acción tiene su columna o botón mapeado. ADR: 0011, 0006. Talla M. Depende de: CP-S3, CP-S5, CP-S6.
- Historia CP-S14. Dejar fuera de alcance billing automático, editor runtime y self-service. AC: Given recorro el panel When busco esas tres funciones Then ninguna existe ni como ruta ni como botón. ADR: 0011. Talla S. Depende de: CP-S10.

## Épica CP-E5. Criterios transversales

Requisito CP6: ningún acto sin log, ninguna suspensión sin gracia y avisos, ningún módulo fuera de catálogo, panel que solo orquesta.

- Historia CP-S15. Verificar que ningún acto quede sin log. AC: Given ejecuto cualquier acción del panel When abro la auditoría Then el acto aparece con resultado. ADR: 0011. Talla S. Depende de: CP-S6.
- Historia CP-S16. Verificar que ninguna suspensión ocurra sin gracia de 14 días y avisos, y que el panel nunca lea datos del tenant. AC: Given audito una suspensión When reviso fechas y accesos Then pasaron 14 días con avisos y no hay lectura de datos de negocio. ADR: 0006. Talla S. Depende de: CP-S7, CP-S13.

## Dependencias externas

CP-S1 no espera a nadie. CP-S4 espera a CP-S1 y CP-S3. CP-S11 espera a CP-S10 y CP-S4. CP-S13 espera a listado, suspensión y logs. La mora de 14 días rige para CP-S7, CP-S8 y CP-S16 según ADR-0006.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Suspender con mora cumplida | Suspensión día 15 con avisos previos | Solo lectura, datos intactos y acto en auditoría |
| Fallo | Suspender sin gracia | Suspensión día 5 | Bloqueo y estado sin cambios |
| Regresión | Módulo fuera de catálogo | Instalar módulo no listado | Rechazo con log, catálogo intacto |

Arch-tests: AT1 panel nunca lee negocio tenant (test de imports y queries: falla si el código del panel referencia ventas, stock, caja o clientes finales). AT2 todo acto escribe auditoría (test: cada acción del panel deja fila con fecha, acción, usuario y resultado).
