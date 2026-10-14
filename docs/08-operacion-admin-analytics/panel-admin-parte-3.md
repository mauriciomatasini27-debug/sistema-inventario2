> Origen: `PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 3 de 3).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/admin`, `src/pages/api/admin/*`

---

# PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 3 de 3)

Documento dividido en 3 partes por tamaño; la numeración es continua. Parte 1 (encabezado, secciones 1 a 3: Resumen, Objetivos y no-objetivos, Usuarios): https://docs.google.com/document/d/1n3E6NmmvCdnXJBuoSAm4YmPRoTCadOM8QI-MCzkSkFA/edit. Parte 2 (sección 4, Funcionalidades: 4.0, PA1 a PA14 y 4.15): https://docs.google.com/document/d/1SMAn_GJ_7VzhCRcIdcJV_trVgyVE1V1Mxql-gazbf30/edit. Parte 3 (este documento): secciones 5 a 8 y Anexo A (Flujos, Notas técnicas, Riesgos, decisiones y preguntas abiertas, Plan por fases, glosario).

## 5. Flujos

### Flujo 1: revisión de la mañana

Lunes 8:30. Mauricio abre admin.<dominio> en la PC, toca "Iniciar sesión con Google", Google le pide la llave de seguridad (2FA) y entra: su cuenta está en la allowlist como superadmin.

El inicio muestra: 500 comercios (482 activos, 9 en demora, 4 en gracia, 3 suspendidos, 2 en prueba); 4 servidores de base, el más cargado al 82% de bases; costo de WhatsApp del mes a la fecha y su proyección.

La bandeja de alertas (PA9) tiene 1 crítica (backup fallido en db-2 para 4 bases), 3 altas (una migración fallida, calidad del número en amarillo, db-2 por encima del 80% de capacidad) y 8 medias.

Abre la crítica: el backup de anoche falló por falta de espacio temporal; en PA11 ve que el reintento de las 06:00 terminó bien y la cierra con una nota.

Abre la migración fallida, ve el error y re-ejecuta la migración (PA11.7) después de reautenticarse; queda aplicada.

Por la alerta de capacidad, marca db-2 como drenando para que los tenants nuevos vayan a db-3 (Flujo 9).

Mira "Recordatorios por enviar" (PA7.5): hay 3 borradores del día (D+1, D+7 y D+12 de distintos clientes). Los revisa y los envía (Flujo 3).

Todo lo que hizo queda en la auditoría.

### Flujo 2: alerta de anomalías de stock (sin ver los datos del comercio)

El sábado, dos celulares de "Kiosco La Esquina" vendieron offline el mismo producto; al sincronizar, el stock quedó en −1 y se creó la anomalía (OF6.7). El Dueño recibió el aviso con el detalle en su app y en el bot. La base del comercio publicó en la base de control solo la señal "anomalías abiertas: 1".

El domingo a la noche la anomalía sigue abierta hace más de 24 h: aparece la alerta media "Anomalías de stock sin resolver: 1".

El lunes Mauricio la abre. Ve solo datos técnicos: 2 dispositivos, uno sincronizó hace 1 h, el otro tiene pendientes hace 30 h; la versión de la app de ese celular es vieja. No ve qué producto ni cuántas unidades.

Le escribe al dueño desde su WhatsApp personal: "Te quedó una diferencia de stock para revisar en la app y un celular sin sincronizar; abrilo con conexión y actualizá la app." El dueño sincroniza el celular y resuelve la anomalía en su app con un ajuste (F3.8).

La siguiente señal llega en cero y la alerta se cierra sola.

### Flujo 3: un kiosco con la suscripción vencida (regla de 14 días)

El cargo de octubre de "Almacén Don José" (plan Plus, ARS 53.900) vencía el 10/10 (D). Mercado Pago rechazó el cobro.

El 11/10 (D+1) la cuenta figura En demora · 1 día, con acceso completo. José recibe el aviso obligatorio de pago rechazado (NE7.3) y en "Recordatorios por enviar" aparece el borrador de D+1. Mauricio lo edita ("José, ¿te ayudo a actualizar la tarjeta?") y lo envía por email.

El 17/10 (D+7) aparece el segundo borrador; Mauricio elige "Abrir en mi WhatsApp" (wa.me, sin costo) y se lo manda desde su teléfono.

El 18/10 (D+8) el job diario pasa la cuenta a En gracia (tenant en gracia, acceso completo, aviso visible en la app con la fecha de suspensión: 25/10).

El 19/10 José contesta que pagó por transferencia. Mauricio verifica el ingreso en su banco, toca "Registrar pago manual", se reautentica y carga monto, fecha, número de operación y el motivo "Transferencia informada por el cliente".

El cargo queda pagado, la cuenta pasa a Al día y el tenant vuelve a activo en el momento (PA7.6). El registro de cumplimiento suma un pago "con atraso · 9 días". Todo queda en la auditoría.

Variante: sin pago, el 22/10 (D+12) aparece el tercer borrador, el 23/10 (D+13) sale el aviso obligatorio de suspensión próxima y el 25/10 (D+15) el job pasa el tenant a suspendido (solo lectura); José puede entrar, pagar y exportar sus datos.

### Flujo 4: control de los costos de WhatsApp a fin de mes

28/10. Mauricio abre "WhatsApp" (PA8). Tarjeta del número central: "Cupo gratis de servicio: 1.000 / 1.000 · agotado el 2/10". Mensajes de servicio del mes: 118.400; plantillas de utilidad: 22.150; costo estimado: USD 3.628 (servicio pago: 117.400 × ~0,026 = USD 3.052; plantillas: 22.150 × ~0,026 = USD 576) [cifras de ejemplo]; proyección a fin de mes y diferencia contra el escenario del documento de costos.

Ordena los kioscos por costo total del mes. El primero, plan Básico, lleva 210 / 100 mensajes del bot (se pasó del cupo) y 60 plantillas: queda con margen negativo. El panel muestra solo cantidades y costos, no el contenido de los mensajes.

Decide ofrecerle el plan Plus o un paquete extra y sugerirle la web/PWA para las consultas largas (documento de costos 9.2).

Ve 14 kioscos al 80% del cupo (ya estaban en la bandeja de alertas) y la calidad del número en verde; el límite de mensajería está al 45% del nivel actual.

A principios de noviembre carga el total de la factura de Meta de octubre: la diferencia contra el estimado es 2,1% (dentro del 5%).

### Flujo 5: soporte técnico a un kiosco sin ver sus datos

Un dueño le escribe a Mauricio: "El resumen de cierre de ayer me dio raro".

Mauricio busca el comercio en el directorio y abre su ficha de gestión (PA5.4): estado de cuenta al día, plan, módulos activos, versión de esquema, host de su base, último backup, errores en 24 h (PA13) y dispositivos con su última sincronización (uno con pendientes hace 30 h).

No hay forma de abrir el resumen de caja desde el panel. Con la información técnica le explica al dueño que ese celular tiene ventas sin sincronizar y que el resumen las va a incluir cuando lo abra con conexión (según el PRD de caja).

Si hiciera falta mirar los números, es el dueño quien los ve en su app o comparte su pantalla; el panel no ofrece ningún acceso.

Si en PA13 hubiera errores nuevos en ese módulo, Mauricio abre el issue en Sentry (sin datos personales) y sigue el Flujo 8.

### Flujo 6: alta asistida de un cliente

Mauricio vende el sistema en persona a una pyme con dos sucursales. En "Clientes → Nuevo" carga razón social, CUIT, plan Pro, email de facturación y el email de Google del dueño.

Crea los dos comercios: la política de ubicación elige el host con más capacidad libre (db-3) y el job de aprovisionamiento de onboarding crea las dos bases, las registra en el catálogo y deja los tenants esperando al Dueño.

Al dueño le llega la invitación de titularidad; acepta con su cuenta de Google, acepta los términos y la política, y entra a sus comercios. Mauricio no tiene membership en ninguno.

El primer cargo se genera según el plan; el estado de cuenta queda Pendiente hasta el vencimiento.

### Flujo 7: baja de un cliente

Un dueño pide la baja desde su app (F8.4). El tenant pasa a en_baja: solo lectura por 30 días para el Dueño y aviso por email con el plazo para exportar sus datos él mismo.

Mauricio ve el caso en el panel, revisa el estado de cuenta (saldo cero) y anota el motivo de baja.

A los 30 días, el job hace el backup final cifrado, borra la base viva y deja el tenant archivado.

Al vencer la retención, el job borra el backup y deja el certificado de eliminación en la auditoría. El directorio y el estado de cuenta se conservan el plazo fiscal.

### Flujo 8: corrección de un bug y rollout de una migración

Un comercio reporta un error en la pantalla de órdenes de pago. En PA13 Mauricio ve el error en 12 comercios desde el último release.

Corrige el bug en el repositorio: rama, PR, revisión, CI en verde, merge a la rama principal. El pipeline despliega a staging y luego a producción.

En PA14 ve el release nuevo en producción. El fix requería una migración (agregar un índice): lanza el rollout, se aplica a la base de control y al canario.

Sin errores en el canario, confirma "Avanzar a todos": el rollout migra por lotes, host por host ("500 / 500 · 0 errores").

Los errores de ese tipo bajan a cero en PA13. Si hubieran subido, el rollout se pausaba solo y (P1) podía hacer rollback del código al release anterior desde el panel.

### Flujo 9: mover tenants entre servidores (P1)

db-2 está al 82% de su capacidad de bases. Mauricio da de alta en el registro un servidor nuevo, db-4 (creado en Hetzner con la infraestructura como código del repositorio), y el panel verifica la conectividad y la versión de Postgres.

Marca db-2 como drenando: los tenants nuevos ya no van ahí.

Elige 100 tenants de db-2 y lanza "Mover a db-4" en lote. Para cada uno: copia, verificación técnica automática (conteos de filas por tabla, checksums, versión de esquema, sin mostrar contenido), ventana de solo lectura de menos de 5 minutos fuera del horario comercial, cambio en el catálogo.

El panel muestra el avance ("63 / 100 movidos · 0 errores"); cada Dueño ve en su actividad "Tu base se movió a otro servidor".

Las bases de origen se conservan 7 días y después se borran. db-2 queda al 62% y vuelve a activo.

## 6. Notas técnicas

### 6.1 Principios

Solo datos de gestión (decisión del dueño, 9/10/2026). El panel lee la base de control. Ninguna pantalla ni endpoint lee tablas de negocio de una base de comercio; las bases de comercios solo empujan señales técnicas sin contenido.

Mínimo privilegio en todo: roles de base distintos para las señales (ops_signals) y para las operaciones de infraestructura (ops_maintenance, usado solo por workers), token de GitHub acotado, sin consola SQL ni shell.

Auditoría primero: si no se puede auditar, no se ejecuta (falla cerrada).

Nada destructivo es inmediato: restaurar y mover crean bases nuevas; la baja pasa por solo lectura, archivo y eliminación programada.

### El código cambia solo por el repositorio y el pipeline.

### 6.2 Arquitectura y despliegue

App Astro + TypeScript (SSR) separada de la app de los comercios (mismo monorepo, despliegue y dominio propios: admin.<dominio>), con su propio cliente OAuth y sus propias cookies.

Backend del panel con acceso solo a la base de control (rol panel_app). No tiene credenciales de las bases de comercios.

Workers de la cola de jobs (los mismos de los otros PRD) para señales, mora, alertas, migraciones, backups, restauraciones y mudanzas; son los únicos con credenciales hacia las bases de comercios, con roles técnicos acotados.

Sin servidores nuevos en el MVP: corre en la infraestructura del documento de costos (3.4).

### 6.3 Modelo de datos en la base de control

Tablas existentes que el panel usa: tenants, users, memberships, invitations, sessions, auth_events, tenant_databases (catálogo), tenant_provisioning, whatsapp_identities / bot_links, whatsapp_usage, notification_schedules, tenant_fiscal_links (PRD de facturación ARCA).

Tablas nuevas o extendidas:

Esquema analytics (solo métricas técnicas y de uso; test automático sobre el esquema que rechaza columnas de negocio o de datos personales):

Montos del estado de cuenta en centavos enteros de ARS (como el resto del sistema), fechas en America/Argentina/Buenos_Aires y timestamptz.

### 6.4 Señales técnicas y contadores

Contrato con cada base de comercio: un outbox ops_signals_outbox (tipo, contador, estado, occurred_at) que llenan los módulos en la misma transacción del evento; las migraciones de las bases de clientes lo crean con el mismo runner. No tiene columnas de contenido.

Publicación: un worker con el rol ops_signals (solo SELECT y UPDATE sobre el outbox) copia las señales a tenant_health_signals y marca las publicadas; barrido cada 5 minutos, concurrencia limitada por host, reintentos con espera exponencial y advisory lock por tenant. Cada corrida deja un latido por tenant para el indicador de frescura (PA4.6).

Contadores de uso: un job diario arma analytics.tenant_daily_usage y analytics.host_daily_usage desde la base de control y el monitoreo de los hosts, sin tocar las bases de comercios.

### 6.5 Seguridad

Identidad: OIDC con Google, cliente OAuth propio, validación del ID token (firma, aud, iss, exp, nonce), email_verified, hd si es Workspace; decisión por google_sub contra platform_admins.

2FA: obligatorio en la cuenta de Google (forzado por política si es Workspace; documentado si es personal). P1: passkey propia del panel.

Sesiones: 30 min de inactividad, 8 h absolutas, reautenticación de 5 min para acciones destructivas; cookie __Host-, SameSite=Strict; revocación inmediata de todas las sesiones desde "Mi cuenta" del panel.

Red: HTTPS/HSTS, CSP estricta, sin scripts de terceros, rate limiting, (P1) Cloudflare Access o allowlist de IP.

Secretos: credenciales de bases, token de GitHub y claves de Meta y Mercado Pago solo en el servidor (variables de entorno o gestor de secretos), nunca en el navegador ni en logs; rotación periódica.

Bases de comercios: el backend web del panel no tiene credenciales; los workers usan ops_signals (solo el outbox de señales) y ops_maintenance (migraciones, backup, restauración y mudanza a nivel de base, sin exponer resultados de consultas de negocio). Ninguna respuesta de esos workers al panel incluye filas de negocio: solo estados, conteos y checksums.

Auditoría: append-only, cadena de hashes, verificación nocturna, (P1) copia WORM.

Privacidad: test automático sobre el esquema de la base de control, analytics y admin_audit_log.detalle (sin columnas de negocio ni de datos personales de terceros), Sentry sin PII, datos del directorio mínimos (PA5.9), backups cifrados.

Tests en CI: el panel no puede leer tablas de negocio de ninguna base de comercio (test con los roles reales) y no existe ninguna ruta del panel que lo intente.

### 6.6 Cobranza y mora

Webhooks de Mercado Pago (preapproval y pagos) con verificación de firma e idempotencia por id de pago [a verificar el esquema de firma vigente]; conciliación con billing_invoices.

Job diario de mora (06:00) idempotente: calcula D+n por cargo vencido, aplica la regla de dunning_policies (demora hasta dia_inicio_gracia − 1, gracia hasta dias_hasta_suspension, suspensión el día siguiente), escribe tenant_lifecycle_events y actualiza tenants.estado en la misma transacción; el middleware de la app aplica el solo lectura (AU4.7).

Recordatorios: el mismo job crea los borradores de billing_reminders en los días configurados; el envío por email usa la infraestructura de NE11; el wa.me se abre en el dispositivo del Superadmin y se registra como "enviado por WhatsApp personal".

### 6.7 Infraestructura multi-servidor, migraciones y deploys

Registro de servidores en infra_hosts como fuente de verdad; las máquinas se crean en el proveedor o con infraestructura como código en el repositorio, y el panel las registra y verifica.

Métricas de hosts y bases con un exportador (por ejemplo, postgres_exporter / métricas del sistema) y uptime monitoring; el panel muestra el resumen y enlaza al detalle [a definir herramienta].

Ubicación de tenants nuevos según host_placement_policy; los hosts drenando o mantenimiento no reciben altas.

Restaurar y mover como máquinas de estado (tenant_moves, pendiente → copiando → verificando → solo lectura → cambiando catálogo → terminado / revertido), con verificación por conteos y checksums y la base anterior conservada 7 días; lotes con concurrencia limitada por host.

Migraciones: runner Drizzle; migration_rollouts controla fases y lotes por host; pausa automática por umbral de errores; migraciones expand / contract.

Deploys: GitHub Actions (workflow_dispatch para deploy y rollback), con un token de permisos mínimos; el panel solo lista commits de la rama principal con CI en verde.

## 7. Riesgos, decisiones tomadas y preguntas abiertas

### 7.1 Riesgos

### 7.2 Decisiones tomadas

### 7.3 Preguntas abiertas

Legal: redacción de la cláusula de los términos y la política sobre los datos de gestión y el "no acceso" a los datos de la app; plazo de retención de la auditoría (5 años propuestos), del backup final (90 días propuestos) y del directorio tras la baja; inscripción de las bases en el Registro Nacional de Bases de Datos; vigencia de la Resolución AAIP 47/2018 [a verificar con un abogado].

Fiscal: ¿qué comprobante emite el proveedor (según su condición frente al IVA), cuándo corresponde una nota de crédito por un descuento y qué datos del cliente son obligatorios? [a verificar con el contador]

2FA: ¿la cuenta del Superadmin va a ser de Google Workspace (2FA forzado por política) o personal? ¿Se implementa la passkey propia ya en el MVP?

Recordatorios automáticos: ¿se activan desde el lanzamiento o se mantienen como borradores hasta tener volumen? ¿Por qué canal por defecto (email, wa.me personal o plantilla paga)?

Cupo gratis: ¿cómo se atribuye el cupo gratis del número a cada kiosco en los reportes: prorrateo (propuesta, como el documento de costos) o cronológico, como lo aplica Meta?

Tickets por el número central: ¿descuentan del cupo del plan? (pregunta abierta 4 del PRD de ticket).

Saldo de Meta: ¿se paga a Meta con tarjeta (línea de crédito) o con saldo prepago? Define cómo se mide y alerta el "saldo bajo" [a verificar].

Cuenta de respaldo: ¿de quién es y dónde se guarda la llave física?

Baja: ¿30 días de solo lectura alcanzan? ¿Y los 90 días de retención del backup final?

Servidores: capacidad real por host (CX33 ~100 bases, CX53 ~500, a confirmar con pruebas de carga), método de mudanza (dump/restore o replicación lógica) y herramienta de monitoreo.

Cloudflare Access / IP allowlist: ¿vale el costo y la fricción (Mauricio trabaja desde varias redes y el celular)?

## 8. Plan por fases

### Fase 0: diseño y validación legal (1 a 2 semanas)

Revisión con un abogado de los términos y la política de privacidad (datos de gestión, no acceso a los datos de la app, retención); con el contador, los comprobantes del proveedor.

Decidir la cuenta de Google del Superadmin (Workspace o personal) y la cuenta de respaldo.

Diseño de las pantallas (inicio, alertas, directorio, estado de cuenta, ficha de gestión del tenant, servidores) y del contrato de señales técnicas (ops_signals_outbox) con los otros módulos.

### Fase 1: MVP del panel (4 a 6 semanas, junto con los primeros clientes pagos)

PA1 acceso (Google + allowlist + sesiones cortas + reautenticación), PA2 auditoría append-only con réplica al comercio, PA3 aceptación de términos y test de "solo datos de gestión".

PA4 señales técnicas y contadores de uso, esquema analytics técnico, indicadores de frescura.

PA5 directorio, PA6 estado de cuenta (pago manual, crédito/descuento, recordatorio en borrador, lista por estado), PA7 regla de 14 días conectada al estado del tenant.

PA8 WhatsApp (cupo gratis del número, servicio, plantillas en USD por kiosco, cupo del plan, calidad, conciliación manual).

PA9 alertas con email.

PA10 alta asistida (job de onboarding), baja con solo lectura, archivo y eliminación programada, reactivación.

PA11 registro de servidores, tenants por host, capacidad, política de ubicación, backups, colas y re-ejecución de migraciones; PA12 módulos por plan y overrides; PA13 errores por tenant; PA14 estado de releases y rollout de migraciones canario → todos.

### Fase 2: operación avanzada (meses 2 y 3)

PA11 restaurar backups en base nueva y mover tenants entre servidores, de a uno o en lote (drenado de hosts).

PA14 disparar deploys aprobados y rollbacks desde el panel.

PA1 passkey propia y Cloudflare Access; PA2 copia WORM y verificación de la cadena.

PA6 emisión del comprobante fiscal desde el panel y recordatorios automáticos configurables; PA8 conciliación automática con Meta.

PA9 umbrales editables; PA12 rollout por porcentaje.

### Fase 3: escala (meses 4 a 12)

Roles adicionales (finanzas, operaciones) si se suma equipo.

Sharding de la base de control si se superan ~2.000 comercios (documento de costos 3.4: 4 shards de bases de clientes).

## Anexo A: glosario

Entidad | Campos principales
--- | ---
platform_admins | id, google_sub (único), email, rol (superadmin; reservados finanzas, operaciones), estado (activo / respaldo / revocado), passkeys (P1), created_by, created_at
admin_sessions | id (se guarda el hash), admin_id, created_at, last_seen_at, expira_at (8 h), idle_timeout (30 min), reauth_at, ip, user_agent, revocada_at
admin_audit_log (append-only) | id, occurred_at, admin_id, session_id, ip, user_agent, tenant_id, accion, recurso, motivo, resultado, detalle (JSON sin datos personales), hash_prev, hash
legal_acceptances | tenant_id, user_id, documento (términos / privacidad), versión, accepted_at, ip
customers | id, tipo (persona humana / pyme / empresa), razón social o nombre, CUIT, condición IVA (si hace falta), domicilio fiscal (si hace falta), email de facturación, teléfono de facturación, owner_user_id, plan_id, medio de cobro, created_at (alta), estado, notas
customer_tenants | customer_id, tenant_id
plans / plan_modules | plan: nombre, precio ARS vigente, cupo de mensajes, límites; plan_modules: plan_id, module_id, habilitado, límites
billing_invoices | id, customer_id, tenant_id, período, concepto, monto (centavos ARS), vencimiento, estado (pendiente / pagado / vencido / anulado), comprobante fiscal (tipo, punto de venta, número, CAE), mp_preapproval_id
billing_payments | id, customer_id, monto, fecha, medio (mercado_pago / transferencia / efectivo / otro), operación_id (único por medio), comprobante_url, registrado_por (admin o webhook), imputaciones
billing_ledger_entries (append-only) | id, customer_id, tipo (cargo / pago / nota_credito / bonificacion / ajuste), monto con signo, ref (invoice, payment), motivo, created_by, created_at
billing_credits | id, customer_id, tipo (porcentaje / monto), valor, períodos, desde, motivo, created_by
billing_reminders | id, customer_id, invoice_id, día programado (D+1 / D+7 / D+12), canal (email / wa.me / plantilla), estado (borrador / enviado / descartado), contenido, enviado_por, enviado_at
dunning_policies / dunning_exceptions | política: dias_hasta_suspension (por defecto 14), dia_inicio_gracia (por defecto 8), dias_recordatorio (por defecto [1, 7, 12]), envio_automatico (por defecto false), plan_id; excepción: customer_id, hasta, motivo
tenant_lifecycle_events | tenant_id, de_estado, a_estado, causa (mora / pago / baja / manual / job), admin_id, motivo, occurred_at
tenant_health_signals | tenant_id, tipo (anomalías de stock, hueco, dispositivo atrasado, cierre fallido, conexión vencida, discrepancia de conciliación, job de precios, cola ARCA), contador, estado, primera_vez, última_vez, último latido
alerts / alert_rules | alerta: tipo, tenant_id o host_id, severidad, estado (abierta / reconocida / pospuesta / resuelta), contador, abierta_at, resuelta_at, nota; regla: tipo, umbrales, severidad, versión
modules / tenant_feature_overrides | módulo: clave, nombre; override: tenant_id, module_id, habilitado, motivo, vence_at, created_by
infra_hosts | id, nombre, rol (app / db_primario / db_réplica / ocr / worker), proveedor, tipo, región, capacidad (bases máximas, disco, conexiones), estado (activo / drenando / mantenimiento / retirado), costo mensual, created_at
host_placement_policy | estrategia (más capacidad libre / host fijo), host por defecto, umbral de llenado
tenant_databases (extendida) | + host_id (primario), replica_host_id, tamaño, version_esquema, último backup, última restauración de prueba, estado (activa / migrando / mudándose / archivada)
backups | tenant_id, host_id, tipo (diario / semanal / final), ubicación, tamaño, checksum, estado, created_at, expira_at, verificado_at
tenant_moves | id, tenant_id, host_origen, host_destino, lote_id, estado (pendiente / copiando / verificando / solo_lectura / cambiando_catálogo / terminado / revertido), iniciado_por, motivo, fechas
migration_rollouts / migration_runs | rollout: migración, fase (control / canario / general), estado (en curso / pausado / terminado / abortado), lote; run: tenant_id, host_id, migración, estado, error, duración
deployments | entorno, commit, PR, estado, iniciado_por (pipeline / admin), created_at
whatsapp_rates / whatsapp_number_health | tarifa: categoría, país, USD, vigente_desde; salud: fecha, calidad, nivel de límite, uso del límite, plantillas pausadas

Tabla | Campos
--- | ---
analytics.tenant_daily_usage | tenant_id, fecha, logins, usuarios_activos, dispositivos_activos, mensajes_servicio, plantillas_por_tipo (JSON de cantidades), señales_por_tipo (JSON de contadores), errores, computed_at
analytics.host_daily_usage | host_id, fecha, bases, tamaño total, conexiones pico, disco, lag de replicación máximo, computed_at
analytics.daily_platform_costs | fecha, costo de WhatsApp estimado (servicio, plantillas), infraestructura prorrateada, computed_at

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Robo de la sesión o de la cuenta de Google del Superadmin (control de toda la plataforma) | Muy alto | Baja | 2FA con llave de seguridad, sesiones cortas, reautenticación, allowlist no editable desde el panel, passkey propia (P1), Cloudflare Access (P1), alertas por login nuevo
Soporte más lento porque el proveedor no ve los datos del comercio | Medio | Media | Ficha técnica completa (dispositivos, sincronización, versión, errores, señales), el Dueño mira sus datos en su app o comparte pantalla, mejores mensajes de error en la app
Una señal técnica mal diseñada filtra contenido de negocio | Alto | Baja | Outbox sin columnas de contenido, test de esquema en CI, revisión de cada tipo de señal nueva
Error humano en una acción destructiva (restaurar o mover el comercio equivocado) | Muy alto | Baja | Restaurar siempre en base nueva, pantalla de impacto, escribir el identificador, base anterior conservada 7 días
Un servidor se llena sin aviso | Alto | Media | Capacidad declarada por host, alerta al 80%, política de ubicación, drenado y mudanza en lote
Un solo Superadmin: si Mauricio pierde el acceso, nadie opera | Alto | Baja | Cuenta de respaldo con llave física guardada, procedimiento documentado
Costos de WhatsApp mal estimados (tarifas de terceros, cambios de Meta) | Alto | Media | Tarifas con vigencia, conciliación mensual con la factura de Meta, alertas de cupo
Morosidad más alta por los 14 días con acceso completo | Medio | Media | Recordatorios en D+1, D+7 y D+12, aviso obligatorio antes de la suspensión, registro de cumplimiento, política configurable
Suspensiones injustas por fallas del webhook de cobro | Alto | Baja | Pausa global de transiciones, alerta si no llegan webhooks, prórroga manual
Migración que rompe muchas bases a la vez | Muy alto | Baja | Canario, lotes por host, frenado automático, expand / contract

Fecha | Decisión
--- | ---
9/10/2026 | Solo datos de gestión. El Superadmin no puede ver ni tocar nada dentro de la app de un tenant. Quedan fuera del alcance el tablero de ventas, la comparación entre comercios, las deudas operativas de los kioscos, la comparación de consumos, el drill-down, el modo soporte / impersonación, los niveles de acceso a datos de negocio y la agregación de métricas de negocio (2.2). Solo se usan contadores y eventos técnicos sin contenido. Tampoco se ven saldos de fiado, diferencias en el traspaso de turno, conteos, promociones ni lotes (PA3.8).
9/10/2026 | Multi-tenant y multi-servidor: el panel gestiona todos los clientes y todos los servidores, con registro de hosts, tenants por host, capacidad y mudanza entre servidores.
9/10/2026 | Mora: 14 días antes de suspender. Desde el vencimiento, En demora (D+1 a D+7) y En gracia (D+8 a D+14) con acceso completo; suspensión el día 15. Configurable desde el panel (por defecto 14). Recordatorios como borradores en D+1, D+7 y D+12, salvo que se configure el envío automático.
9/10/2026 | El panel no edita código: los cambios van por el repositorio y el pipeline de CI/CD.
9/10/2026 | Rol Superadmin separado de los roles Dueño y Empleado, en la allowlist platform_admins de la base de control.

Término | Definición
--- | ---
Control Plane | Aplicación interna del proveedor para operar la plataforma; este PRD la define como el Panel de Administración Multi-Kiosco
Superadmin | Rol de plataforma del proveedor, guardado en la allowlist platform_admins de la base de control; distinto de los roles Dueño y Empleado de los tenants
Datos de gestión | Datos de la relación comercial del proveedor con su cliente (directorio, suscripción, estado de cuenta) y datos técnicos de la operación (uso, salud, errores, infraestructura). Excluyen todo dato de la app del comercio
Base de control | Base central que mapea cada cliente a su base de datos y guarda cuentas, planes, suscripciones, identidades de WhatsApp, uso, el directorio de clientes, el estado de cuenta, el registro de servidores, el esquema analytics y la auditoría del panel
Esquema analytics | Tablas de métricas diarias técnicas y de uso por comercio y por servidor, sin datos de negocio ni datos personales
Señal técnica | Contador o estado que una base de comercio empuja a la base de control, sin contenido de negocio (por ejemplo, "anomalías de stock abiertas: 1")
Host / servidor de base | Servidor de Postgres registrado en infra_hosts, donde viven las bases de muchos tenants
Drenar un host | Marcarlo para que no reciba tenants nuevos y mover sus bases a otros servidores
Estado de cuenta | Libro de cargos, pagos, créditos y saldo de un cliente con el proveedor
En demora / en gracia / suspendido | Etapas de la regla de mora: D+1 a D+7 y D+8 a D+14 con acceso completo; suspensión (solo lectura) desde D+15
Cupo gratis del número | 1.000 mensajes de servicio por mes que Meta no cobra por cada número de empresa; con un número central lo comparten todos los clientes
Plantilla de utilidad | Mensaje de WhatsApp aprobado por Meta (aviso matutino, resumen del viernes, cierre de caja, ticket); se paga siempre, ~USD 0,026 en Argentina [a verificar]
Canario | Grupo chico de bases (internas y beta) donde se aplica primero una migración antes de pasar a todas
