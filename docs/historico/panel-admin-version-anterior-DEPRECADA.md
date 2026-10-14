> Origen: `PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/admin` (versión vieja, ver Parte 1-3 vigente)

---

# PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario

Convención: igual que en los demás PRD, lo marcado [a verificar] son datos externos (políticas y precios de Meta, APIs de Google, Mercado Pago, proveedores de infraestructura) que hay que confirmar en la fuente oficial antes de implementar, y lo marcado [a verificar con un abogado] o [a verificar con el contador] son interpretaciones legales o fiscales que no reemplazan un asesoramiento profesional. Este documento no modifica los otros PRD: cuando detecta algo que habría que alinear allá, lo deja como propuesta en la sección 4.20 o como pregunta abierta en la sección 7.2.

## 1. Resumen

### 1.1 Problema

Hoy el Control Plane está descripto en pedazos en varios PRD: el PRD principal (6.4) habla de una "lista de comercios, plan, estado de suscripción, uso, suspensión/reactivación y soporte con acceso auditado"; el de onboarding (3.3, ON3.8 y ON12) de las altas en curso, los errores de aprovisionamiento y el embudo; el del bot y el de costos de la tabla whatsapp_usage; el de modo offline de los dispositivos con sincronización atrasada; el de notificaciones de la entregabilidad de los emails. Falta el documento que lo junte y lo convierta en la herramienta de trabajo diaria del proveedor.

Con decenas o cientos de kioscos, Mauricio necesita responder todos los días, sin entrar comercio por comercio:

¿Cuánto venden mis clientes en total, quién crece y quién se está apagando (posible baja)?

¿Quién me pagó, quién está en demora, quién está en gracia y a quién hay que suspender?

¿Cuánto me está costando WhatsApp este mes, por kiosco, y quién se va a pasar del cupo del plan?

¿Qué comercio tiene un problema ahora (stock negativo después de sincronizar, un celular que no sincroniza hace dos días, una migración que falló, un backup que no corrió, la calidad del número central que bajó)?

¿Cómo opero la plataforma (servidores, bases, migraciones, deploys, módulos por plan) sin conectarme por SSH ni correr SQL a mano?

Y todo eso con una restricción fuerte: la arquitectura es una base por cliente, así que no hay una tabla única para consultar, y los datos del negocio de cada comercio son del comercio (y muchas veces son datos personales del dueño monotributista), así que el acceso del proveedor tiene que estar justificado, ser mínimo y quedar registrado (Ley 25.326).

### 1.2 Visión

Un back-office único, seguro y auditado para el proveedor, que extiende el Control Plane existente con:

Visión de negocio agregada de todos los kioscos (ventas, ticket promedio, tendencias, ranking, consumos, deudas operativas), calculada por jobs de agregación que escriben métricas diarias sin datos personales de clientes finales en el esquema analytics de la base de control. Nunca se consultan N bases en vivo para armar un tablero.

Gestión comercial propia del proveedor: directorio de clientes, estado de cuenta, cobranza, reglas de mora conectadas al estado del tenant.

Control de costos de WhatsApp del número central: cupo gratis compartido, plantillas de utilidad pagas en USD por kiosco y cupos del plan.

Alertas operativas y drill-down de solo lectura a un comercio puntual, con motivo, consentimiento y auditoría.

Operación de la plataforma (rol Superadmin): infraestructura, alta/baja/reactivación de tenants, módulos por plan con feature flags, errores por tenant, estado de deploys y rollouts de migraciones a través del pipeline de CI/CD. El panel no edita código en vivo.

### 1.3 Propuesta de valor (para el proveedor)

Una pantalla para arrancar el día: qué pasó ayer en toda la base de clientes y qué hay que resolver hoy.

Menos costo y menos sorpresas: WhatsApp es el 94–97% del costo por cliente (documento de costos, 0); verlo por kiosco y contra el cupo evita perder margen.

Cobranza ordenada: quién pagó, quién no y desde cuándo, con las reglas de gracia y suspensión aplicadas de forma pareja.

Operación segura: las acciones peligrosas (restaurar un backup, mover una base, dar de baja un cliente) tienen confirmación, reautenticación y auditoría, y no dependen de la memoria de nadie.

Cumplimiento: cada vez que el proveedor mira datos de un comercio queda registrado quién, cuándo, qué y por qué, y el dueño del comercio lo puede ver.

### 1.4 Alcance

Incluye: acceso con Google y rol Superadmin (allowlist en la base de control), auditoría inmutable, base legal y consentimiento de "acceso de soporte", jobs de agregación y esquema analytics, tablero de ventas y comparación, directorio de clientes, estado de cuenta y cobranza, deudas operativas de cada kiosco, comparación de consumos, uso y costo de WhatsApp, alertas, drill-down de solo lectura, ciclo de vida de los tenants (alta, baja, reactivación), infraestructura, módulos y feature flags, errores por tenant, deploys y rollouts de migraciones, y (P2) modo soporte / impersonación.

No incluye: la operación de un comercio desde el panel (cargar stock, registrar ventas, tocar la caja), un editor de código o una consola SQL, la facturación electrónica de los propios kioscos (ver la investigación de ARCA), ni la app del comerciante.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos

No es un producto para los comerciantes: ningún dueño ni empleado tiene acceso, ni siquiera a una versión reducida.

No se opera dentro del comercio: el drill-down es de solo lectura; el panel no crea ni edita movimientos de stock, ventas, caja, órdenes de pago ni facturas de un comercio (coherente con 6.11 del PRD principal: ni el soporte edita movimientos).

No se editan código ni esquemas en vivo: los cambios de código y las correcciones de bugs se hacen en el repositorio (git), pasan por CI y los despliega el pipeline. El panel muestra el estado, dispara deploys aprobados o rollbacks y ejecuta migraciones ya versionadas. No hay consola SQL ni "hotfix" desde el navegador.

No hay datos personales de los clientes finales del kiosco en los agregados (nombres, teléfonos de quienes reciben tickets, etc.).

No es un BI genérico: las métricas son las definidas en este PRD; nuevas métricas se agregan con una versión nueva del job.

No reemplaza al contador ni al abogado: la emisión de los comprobantes fiscales del proveedor y los textos legales se validan con profesionales.

Impersonación (entrar "como" el dueño) queda fuera del MVP: es P2, con consentimiento y auditoría.

## 3. Usuarios

### 3.1 Superadmin (Mauricio, proveedor y dueño del sistema)

Quién es: el "Administrador de la plataforma (equipo propio)" de los demás PRD (PRD principal 3.3, onboarding 3.3, autenticación 3.3), concretado como un rol distinto: superadmin, guardado en la allowlist de la base de control (platform_admins), no en los tenants.

Separado de los roles del comercio: Dueño y Empleado son roles de una membership dentro de un tenant. El Superadmin no tiene membership en ningún comercio, no aparece en la lista de usuarios de ninguno y su sesión del panel es independiente de cualquier sesión de la app. Si Mauricio además es dueño de un kiosco de prueba, entra a ese kiosco con su membership de Dueño en la app normal, y al panel con su rol Superadmin: son dos sesiones distintas.

Ingreso: "Iniciar sesión con Google" con su cuenta de Google + presencia de esa cuenta en la allowlist con el rol superadmin + verificación en 2 pasos obligatoria en la cuenta de Google + sesiones cortas + reautenticación para acciones destructivas (PA1).

Necesidades: revisión diaria del negocio, cobranza, control de costos de WhatsApp, atención de alertas, soporte a un comercio puntual, operación de la infraestructura y de los releases.

Contexto de uso: PC en la mayor parte de los casos; en el celular, solo lectura del tablero, alertas y estado de cuenta (las acciones destructivas se piden desde la PC, ver PA14).

### 3.2 Superadmin de respaldo ("break-glass")

Una segunda cuenta de Google del propio Mauricio (o de una persona de confianza a definir), con llave de seguridad física, guardada fuera de uso. Está en la allowlist en estado respaldo: cualquier ingreso con ella dispara una alerta inmediata por email. Sirve si se pierde el acceso a la cuenta principal (ver 7.2).

### 3.3 Roles futuros (P2, fuera del MVP)

soporte_lectura (solo tablero, alertas y drill-down con consentimiento) y finanzas (directorio y estado de cuenta, sin infraestructura). No se implementan en el MVP; el modelo de datos los contempla para no tener que rediseñar la allowlist.

### 3.4 Usuarios afectados indirectamente

Dueño del comercio: no usa el panel, pero (a) acepta los términos y la política de privacidad que habilitan el procesamiento agregado, (b) decide el interruptor de "acceso de soporte" en Configuración, y (c) ve en "Usuarios → Actividad" de su comercio cada acceso del soporte a sus datos (replicado desde la auditoría del panel, como AU12.2 del PRD de autenticación).

Empleado: no ve nada del panel ni de la actividad de soporte (es información del Dueño).

## 4. Funcionalidades

### 4.0 Priorización

### PA1. Acceso: Sign in with Google y rol Superadmin (P0)

Descripción: el panel vive en un subdominio propio (admin.<dominio>) y solo deja entrar a cuentas de Google que estén en la allowlist de Superadmins de la base de control. El rol superadmin es distinto de los roles Dueño y Empleado de los tenants y no se guarda en ninguna membership.

### Requerimientos:

PA1.1 Login con Google (OIDC), con un cliente OAuth separado del de la app de los comercios y solo los scopes openid email profile (igual que F8.6 del PRD principal). Sin contraseñas.

PA1.2 Allowlist: tabla platform_admins en la base de control (google_sub, email, rol superadmin, estado activo / respaldo / revocado, alta por, alta en). El acceso se decide por google_sub, no por email, y exige email_verified = true. Si la cuenta es de Google Workspace, se valida también el claim hd del dominio esperado.

PA1.3 Fuera de la allowlist no se entra: cualquier otra cuenta (incluidos los dueños de los comercios) recibe un 403 genérico ("No tenés acceso"), sin revelar que el panel existe para esa cuenta; el intento queda en la auditoría y, si se repite, dispara una alerta.

PA1.4 La allowlist no se edita desde el panel en el MVP: las altas y bajas de Superadmins se hacen con una migración o un script versionado en el repositorio (revisión de código + CI) o una CLI en el servidor, y quedan auditadas. Así, una sesión robada no puede darse de alta otra cuenta.

PA1.5 2FA obligatorio en la cuenta de Google: la cuenta del Superadmin tiene que tener la verificación en 2 pasos activa, preferentemente con llave de seguridad o passkey. Recomendación: usar una cuenta de Google Workspace del dominio del producto, con la verificación en 2 pasos forzada por política desde la consola de Workspace; con una cuenta @gmail.com personal, el sistema no puede comprobar desde el ID token que la cuenta tenga 2FA [a verificar: claims amr/acr de Google], y la exigencia queda como control documentado (y, como alternativa, el Programa de Protección Avanzada de Google).

PA1.6 (P1) Passkey propia del panel (WebAuthn) como segundo factor independiente de Google, pedido al iniciar sesión y en cada reautenticación de acciones destructivas. Es una excepción deliberada a F8.7 del PRD principal ("el sistema no implementa su propio 2FA"), que aplica a los comercios, no al panel.

PA1.7 Sesiones cortas: sesión del lado del servidor (cookie __Host-admin_session, HttpOnly, Secure, SameSite=Strict, solo para el host del panel; se guarda solo el hash del ID, como AU8.1). Vencimiento por inactividad: 30 minutos. Vencimiento absoluto: 8 horas. Sin "recordarme". Cerrar sesión la invalida en el servidor.

PA1.8 Reautenticación para acciones destructivas o sensibles: se pide volver a pasar por Google (con prompt=login / max_age [a verificar el soporte de Google], y la passkey en P1) si el último login tiene más de 5 minutos, para: restaurar un backup, mover una base, re-ejecutar o lanzar el rollout de una migración, disparar un deploy o un rollback, dar de baja o reactivar un tenant, suspender o levantar una suspensión a mano, cambiar módulos de un tenant, registrar un pago manual, aplicar un crédito o descuento, enviar un recordatorio, activar el modo soporte (P2) y exportar datos de un comercio.

PA1.9 Confirmación reforzada en las acciones irreversibles o de alto impacto (restaurar, mover, baja, rollout a todos): pantalla de impacto ("Afecta a: Kiosco La Esquina · base t_8f3a en db-2 · 0,4 GB · ventana estimada 3 min"), escribir el identificador corto del comercio para confirmar, y motivo obligatorio (texto libre de al menos 10 caracteres o elección de una lista).

PA1.10 Defensa en profundidad: CSP estricta sin scripts de terceros, CSRF en todos los formularios, rate limiting por IP y por cuenta, y (P1) Cloudflare Access o allowlist de IP delante del subdominio [a verificar costo].

PA1.11 Celular: el panel es responsive para mirar el tablero, las alertas y el estado de cuenta. Las acciones de PA15 (restaurar, mover) y PA18 (rollout a todos) solo se habilitan en pantallas de escritorio, para evitar toques accidentales.

PA1.12 Cuenta de respaldo: el ingreso con una cuenta en estado respaldo funciona pero dispara de inmediato un email de alerta a la cuenta principal y queda marcado en la auditoría.

### Criterios de aceptación:

☐ Entro con mi cuenta de Google de Superadmin y veo el tablero; en la base de control mi acceso está en platform_admins con rol superadmin y no tengo ninguna membership en ningún comercio.

☐ Un dueño de un comercio intenta entrar a admin.<dominio> con su cuenta de Google y recibe "No tenés acceso"; el intento aparece en la auditoría.

☐ Si cambio el email de mi cuenta de Google, sigo entrando (el acceso se decide por sub); si se crea otra cuenta con mi email anterior, no entra.

☐ No existe ninguna pantalla del panel para agregar Superadmins; el único camino es el script versionado del repositorio.

☐ Después de 30 minutos sin actividad, la siguiente acción me lleva al login; a las 8 horas la sesión vence aunque esté usándola.

☐ Quiero restaurar un backup con un login de hace 20 minutos: el panel me pide volver a pasar por Google antes de mostrar la confirmación.

☐ Para dar de baja un tenant tengo que escribir su identificador corto y un motivo; sin eso, el botón queda deshabilitado.

☐ La cookie del panel no se envía a la app de los comercios (host distinto, prefijo __Host-) y no hay tokens de Google en el navegador.

☐ Ingreso con la cuenta de respaldo y en menos de 1 minuto llega un email de alerta a la cuenta principal.

☐ (P1) Con la passkey activada, una reautenticación sin la passkey no habilita la acción destructiva.

### PA2. Auditoría inmutable del panel (P0)

Descripción: cada vez que el Superadmin ve datos de negocio de un comercio (aunque sean agregados) o hace una acción, queda un registro inmutable con quién, cuándo, qué tenant, qué y por qué. Es la base del cumplimiento (PA3) y de la confianza de los clientes.

### Requerimientos:

PA2.1 Tabla admin_audit_log en la base de control, append-only (sin permisos de UPDATE ni DELETE para ningún rol de la aplicación, con trigger que los rechaza, como stock_movements en 6.11 del PRD principal y auth_events en AU12.1), con cadena de hashes (hash = SHA-256(hash_anterior || registro)) para detectar alteraciones.

PA2.2 Campos: id, occurred_at (timestamptz del servidor), admin_id, session_id, IP, user agent, tenant_id (o null / lista de tenants si la vista es global), acción (catálogo cerrado: ver_tablero_global, ver_kiosco_agregado, ver_drill_down_caja, ver_drill_down_rotacion, ver_datos_clave, exportar, registrar_pago_manual, aplicar_credito, enviar_recordatorio, cambiar_modulo, rerun_migracion, restaurar_backup, mover_base, baja_tenant, reactivar_tenant, deploy, rollback, rollout_migracion, modo_soporte_inicio/fin, etc.), recurso (por ejemplo "resumen de caja del 9/10"), motivo, resultado (ok / error / denegado), y un detalle en JSON sin datos personales de clientes finales ni montos copiados.

PA2.3 Registrar antes de mostrar: en las vistas de datos de un comercio (PA13), si no se puede escribir el registro de auditoría, la vista no se muestra (falla cerrada).

PA2.4 Granularidad de las vistas globales: abrir el tablero global se registra una vez por sesión y por filtro (con la lista de tenants incluidos), no por cada repintado, para que el log sea útil.

PA2.5 Réplica al comercio: los accesos a datos de un tenant (drill-down, exportaciones, modo soporte) y las acciones sobre su cuenta (baja, reactivación, módulos, suspensión manual, restauración) se replican en el audit_log de la base del comercio como evento "Soporte de [Producto]", visible para el Dueño en "Usuarios → Actividad" (coherente con AU12.2). El texto incluye fecha, hora, qué se vio y el motivo.

PA2.6 Búsqueda y exportación del registro por tenant, acción y rango de fechas, desde el panel (la exportación también se audita).

PA2.7 Retención: mínimo 5 años [a verificar con un abogado]; no se borra al dar de baja un tenant (queda desvinculado de los datos borrados, con el id del tenant).

PA2.8 (P1) Copia externa inmutable: volcado diario firmado a un bucket con bloqueo de objetos (WORM, por ejemplo Backblaze B2 Object Lock [a verificar]), y verificación nocturna de la cadena de hashes con alerta si se rompe.

### Criterios de aceptación:

☐ Abro el resumen de caja de un comercio: aparece un registro con mi admin_id, la hora del servidor, el tenant, "ver_drill_down_caja", el día consultado y el motivo que elegí.

☐ Un UPDATE o DELETE sobre admin_audit_log con el usuario de la aplicación falla; si modifico un registro con un superusuario de la base, la verificación de la cadena de hashes lo detecta y alerta.

☐ Si simulo una falla al escribir la auditoría, el drill-down no muestra datos y explica que no se pudo registrar el acceso.

☐ El Dueño del comercio ve en "Usuarios → Actividad": "9/10 10:42 · Soporte de [Producto] vio el resumen de caja del 8/10 · Motivo: alerta de stock negativo".

☐ Exporto la auditoría de un tenant del último mes y la exportación misma aparece como un registro nuevo.

☐ El detalle de los registros no contiene nombres de clientes finales, teléfonos ni montos de movimientos.

### PA3. Base legal, minimización y "acceso de soporte" (P0)

Descripción: el proveedor accede a datos del negocio de sus clientes solo con una base legal clara, para fines concretos, con los datos mínimos y con registro. Varios PRD ya fijan el criterio "el Control Plane nunca ve montos, caja, stock ni contenido de un comercio sin consentimiento explícito y registro" (PRD principal 3.3 y 6.4, caja, consumos, facturas, órdenes de pago, bot, autenticación 3.3). Este PRD mantiene ese criterio y lo hace operativo en dos niveles.

### Niveles de acceso:

### Requerimientos:

PA3.1 Términos del servicio y política de privacidad con un apartado sobre el acceso del proveedor: qué datos procesa (N0 y N1), para qué (finalidades cerradas: operación técnica, facturación y cobranza, soporte pedido por el cliente, seguridad y prevención de fraude, control de costos, métricas agregadas para mejorar el producto), quién accede (el Superadmin), que todo acceso queda registrado y es visible para el Dueño, plazos de retención y cómo ejercer los derechos de acceso, rectificación y supresión [a verificar con un abogado].

PA3.2 Aceptación registrada: en el alta (pantalla ON1 del onboarding) se registra la versión aceptada de términos y política (legal_acceptances: tenant, usuario, documento, versión, fecha, IP). Si cambia la versión, el Dueño la acepta en el siguiente ingreso; hasta entonces, ese comercio no entra en los agregados N1 (aparece como "sin aceptación vigente").

PA3.3 Limitación de la finalidad: los datos N1 y N2 solo se usan para las finalidades declaradas; nunca se venden, se ceden a terceros, se usan para publicidad ni se comparten con otro comercio (por ejemplo, los benchmarks entre comercios no se muestran a los comerciantes en el MVP).

PA3.4 Datos mínimos: los agregados N1 no tienen nombres de clientes finales, teléfonos, emails, nombres de empleados ni de proveedores, CBU/alias ni contenido de facturas o emails. Los comercios se identifican por tenant_id y su nombre comercial (dato N0).

PA3.5 Atención con los monotributistas: si el comercio es de una persona humana, sus ventas y consumos pueden ser datos personales del propio dueño [a verificar con un abogado]. Por eso N1 se trata con el mismo cuidado que un dato personal: base legal, finalidad, mínimo, seguridad y registro.

PA3.6 Interruptor "Permitir acceso de soporte" en la app del comercio (Configuración → Privacidad, solo Dueño, con reautenticación según AU10): apagado por defecto; al activarlo se elige la duración (24 h, 7 días o "hasta que lo apague") y el alcance (resumen de caja, rotación, datos clave). Se guarda en la base de control (support_consents) con historial.

PA3.7 Pedido de acceso puntual: si el interruptor está apagado, el Superadmin puede tocar "Pedir acceso" con un motivo; el Dueño recibe un email (y la notificación en la app) con "Aprobar por 24 h" / "Rechazar". Sin respuesta, no hay acceso.

PA3.8 Encargado de tratamiento: respecto de los datos personales de terceros que el comercio carga (clientes que reciben tickets, empleados, proveedores personas humanas), el proveedor actúa como prestador de servicios de tratamiento por cuenta del comercio (art. 25 de la Ley 25.326): no los usa para otra finalidad y los destruye o devuelve al terminar el contrato (ver PA14) [a verificar con un abogado].

PA3.9 Seguridad y confidencialidad (arts. 9 y 10 de la Ley 25.326): cifrado en tránsito, accesos mínimos, auditoría (PA2), y revisión de las medidas de seguridad recomendadas por la AAIP [a verificar con un abogado: Resolución AAIP 47/2018 y su vigencia; inscripción de las bases en el Registro Nacional de Bases de Datos; eventuales cambios por una reforma de la ley].

PA3.10 Datos del directorio (N0): ver PA6.9.

### Criterios de aceptación:

☐ En el alta, el Dueño acepta los términos y la política de privacidad, y en la base de control queda la versión aceptada con fecha.

☐ Publico una versión nueva de la política: los comercios que todavía no la aceptaron aparecen como "sin aceptación vigente" y sus métricas N1 no se suman al tablero hasta que la aceptan.

☐ Con el interruptor de acceso de soporte apagado, el botón "Ver resumen de caja" de ese comercio está deshabilitado y ofrece "Pedir acceso".

☐ Pido acceso con el motivo "verificar alerta de stock negativo"; el Dueño aprueba por 24 h desde el email y a partir de ese momento puedo abrir el drill-down; a las 24 h vuelve a quedar bloqueado.

☐ El Dueño apaga el interruptor y el próximo intento de drill-down se rechaza, aunque el pedido anterior no hubiera vencido.

☐ Ninguna tabla del esquema analytics tiene columnas con nombres, teléfonos, emails o CBU (test automático sobre el esquema).

### PA4. Agregación entre N bases y frescura de los datos (P0)

Descripción: con una base por cliente, consultar N bases en vivo para armar un tablero no escala (cientos de conexiones, consultas lentas, carga sobre la base del comercio en horario comercial). El panel lee solo de la base de control: unos jobs de agregación recorren las bases de los comercios y escriben métricas diarias en el esquema analytics; el drill-down a un comercio puntual se hace bajo demanda con un rol de solo lectura (PA13).

### Requerimientos:

PA4.1 Job nocturno (03:30, hora de Buenos Aires, después del cierre automático de caja de C12.1, cuya hora de corte por defecto es medianoche y puede ser 03:00): por cada comercio activo, llama a una función versionada de la base del comercio (analytics_v1.daily_metrics(fecha)) que devuelve los totales del día cerrado, y hace un upsert idempotente en analytics.tenant_daily_metrics (clave: tenant, fecha, versión de la métrica). Re-procesa los últimos 3 días para captar las ventas offline que sincronizaron tarde (PRD de modo offline) y las anulaciones.

PA4.2 Job periódico liviano (cada 60 minutos, de 7 a 23 h) para el "día en curso": solo ventas del día, cantidad de tickets y anomalías de stock abiertas, para el tablero de la mañana y la tarde. Se puede apagar si la carga lo pide.

PA4.3 Señales empujadas (push) para las alertas: lo urgente no espera al job. Cada base de comercio escribe en un outbox local y un worker publica en la base de control (tenant_health_signals) solo contadores y estados: anomalía de stock creada (OF6.7), hueco de secuencia (OF4.8 / TV3.6), cierre de caja automático fallido, resumen no generado, conexión de Gmail o Google Photos vencida. Sin datos personales ni montos.

PA4.4 Lo que ya está en la base de control no se agrega: suscripción, estado de cuenta, whatsapp_usage, sesiones y dispositivos (sessions.last_seen_at), estado del aprovisionamiento y versión de esquema se leen directo.

PA4.5 Rol de base de datos por comercio: el job usa un rol analytics_reader con permiso de EXECUTE solo sobre las funciones del esquema analytics_v1 (definidas como SECURITY DEFINER, de solo lectura) y sin SELECT sobre las tablas; el drill-down (PA13) usa otro rol, support_readonly, con SELECT solo sobre vistas de soporte. Las credenciales se resuelven desde el catálogo; nunca las ve el navegador.

PA4.6 Cuidado de la carga: se lee de la réplica cuando existe; concurrencia limitada por host de base (por ejemplo, 4 comercios en paralelo por servidor), statement_timeout de 30 s por comercio, reintentos con espera exponencial y un advisory lock para que dos corridas no se pisen.

PA4.7 Registro de corridas: analytics.aggregation_runs (corrida, inicio, fin, comercios OK / con error / omitidos) y analytics.tenant_aggregation_status (tenant, última fecha agregada, último éxito, último error).

PA4.8 Indicadores de frescura en la UI: cada tarjeta y tabla muestra "Datos al 9/10 03:41". Un comercio con datos de más de 26 h aparece con un ícono amarillo ("Desactualizado: último dato del 7/10"); más de 50 h, rojo, y entra en la bandeja de alertas. El total global aclara cuántos comercios están desactualizados ("Incluye 498 de 500 comercios; 2 sin datos de ayer").

PA4.9 Versionado de métricas: si cambia una definición (por ejemplo, cómo se netean las devoluciones), se publica analytics_v2 y se re-calcula hacia atrás por lotes; el tablero indica la versión.

PA4.10 Consistencia con los reportes del comercio: los totales tienen que coincidir con lo que el Dueño ve en su app para el mismo día (ventas netas de devoluciones, según F10 del PRD principal y C14 de caja). Un test de conciliación compara, para una muestra de comercios, el agregado con el reporte de la app.

PA4.11 Comercios excluidos: en prueba vencida sin conversión, dados de baja, sin aceptación vigente (PA3.2) o en modo ejemplo (ON10 del onboarding: los datos de ejemplo nunca se agregan).

### Criterios de aceptación:

☐ Abro el tablero y ninguna consulta sale hacia una base de comercio (verificado con el log de conexiones del panel).

☐ A las 06:00 el 99% de los comercios activos tiene los datos del día anterior; cada tarjeta muestra la hora de los datos.

☐ Corro el job dos veces seguidas para el mismo día: los totales no se duplican.

☐ Una venta offline del 8/10 que sincroniza el 10/10 aparece en el total del 8/10 después de la corrida nocturna del 10/10.

☐ Si la base de un comercio no responde, el job sigue con los demás, ese comercio queda en amarillo y, si sigue así 50 h, aparece una alerta.

☐ Con el rol analytics_reader, un SELECT * FROM stock_movements falla por permisos.

☐ Las ventas del día de un comercio de prueba coinciden con el total de ventas del día de su app.

☐ Un comercio en modo ejemplo no suma nada al tablero.

### PA5. Tablero de ventas y comparación entre comercios (P0)

Descripción: la pantalla de inicio del panel. Responde "cuánto vendieron mis clientes, quién crece y quién se apaga".

### Requerimientos:

PA5.1 Totales globales (N1): ventas netas (ventas − devoluciones), cantidad de tickets, ticket promedio (ventas netas / tickets), unidades, para ayer, los últimos 7 y 30 días, el mes en curso y el anterior, con variación contra el período anterior y contra el mismo día de la semana anterior.

PA5.2 Desglose por comercio: tabla ordenable con ventas, tickets, ticket promedio, variación, días con ventas, último dato (frescura) y plan; filtro por rubro, plan, estado del tenant y antigüedad.

PA5.3 Ranking: top y bottom 10 por ventas, por crecimiento y por ticket promedio; se muestra la posición relativa del comercio ("percentil 80 en ventas entre los kioscos").

PA5.4 Tendencias: gráfico de los últimos 90 días (global y por comercio), con promedio móvil de 7 días para suavizar fines de semana.

PA5.5 Comparación: elegir 2 a 5 comercios y ver sus curvas y su ticket promedio superpuestos; comparar un comercio contra la mediana de su rubro.

PA5.6 Señales de riesgo de baja: comercios con caída de más de 40% en ventas en 14 días, sin ventas registradas en 3 días o sin logins en 7 días, marcados "En riesgo" (alimenta el seguimiento comercial).

PA5.7 Montos en ARS nominales, aclarado en la pantalla. (P2) Opción de ver las variaciones ajustadas por IPC [a verificar fuente del INDEC], porque con inflación una suba nominal puede ser una baja real.

PA5.8 Uso del producto (N0, de la base de control): logins, uso del bot y módulos activos por comercio, para cruzar ventas con adopción.

PA5.9 Toda vista del tablero se audita según PA2.4.

### Criterios de aceptación:

☐ El tablero muestra las ventas netas de ayer de todos los comercios, la cantidad de tickets y el ticket promedio, con la hora de los datos.

☐ Ordeno la tabla por variación semanal y veo primero los comercios que más cayeron.

☐ Elijo tres kioscos y veo sus curvas de 90 días superpuestas y su ticket promedio.

☐ Un kiosco sin ventas registradas hace 3 días aparece marcado "En riesgo".

☐ Una devolución de $5.000 resta $5.000 a las ventas netas del día en que se hizo.

☐ El tablero carga en menos de 2 s con 500 comercios.

### PA6. Directorio de clientes (P0)

Descripción: la ficha comercial y de facturación de cada cliente del proveedor. Vive toda en la base de control y es un dato propio del proveedor (N0): no viene de la base del comercio ni expone datos de su negocio, así que respeta la regla de "no ver datos del tenant".

### Requerimientos:

PA6.1 Tipo de cliente: kiosco o comercio de una persona humana (dueño, en general monotributista), pyme o empresa. Un cliente puede tener uno o varios comercios (tenants), por ejemplo una pyme con tres sucursales (AU14 del PRD de autenticación, P1).

PA6.2 Datos de la ficha (customers en la base de control):

Razón social o nombre y apellido; nombre comercial de cada comercio.

CUIT (validado con el dígito verificador).

Email de la cuenta de Google del Dueño titular (leído de users, no se duplica a mano) y, opcional, un email de facturación distinto.

Teléfono de contacto (por defecto, el número de WhatsApp verificado del Dueño en whatsapp_identities / bot_links; se puede cargar otro de facturación).

Plan (Básico, Plus, Pro, según el documento de costos, 9), medio de cobro (Mercado Pago Suscripciones o transferencia), y fecha de alta.

Solo si hacen falta para emitir el comprobante del proveedor: condición frente al IVA y domicilio fiscal [a verificar con el contador].

Estado del cliente (prueba, activo, en baja, dado de baja) y notas internas breves (sin datos sensibles).

PA6.3 Lista con búsqueda por nombre, CUIT, email o teléfono, y filtros por plan, tipo de cliente, estado de cuenta (PA7), estado del tenant, rubro y fecha de alta.

PA6.4 Ficha del cliente con pestañas: datos, comercios (tenants) y su estado, estado de cuenta (PA7), uso de WhatsApp (PA11), alertas abiertas (PA12) y actividad de soporte (PA2).

PA6.5 Edición de los datos de facturación por el Superadmin, con reautenticación y auditoría (valor anterior y nuevo en el registro, enmascarado). El email del Dueño no se edita desde el panel: es el de su cuenta de Google.

PA6.6 Sincronía con la app: si el Dueño cambia el CUIT o la razón social en su Configuración (AU10.1), la ficha se actualiza y queda el evento.

PA6.7 Exportar el directorio a CSV (auditado), por ejemplo para el contador.

PA6.8 (P1) Padrón de ARCA: completar razón social y condición frente al IVA desde la CUIT con el servicio de constancia de inscripción (ver la investigación de facturación ARCA) [a verificar].

PA6.9 Ley 25.326 para el directorio: son datos personales de los clientes del proveedor (sobre todo si son personas humanas). Su tratamiento es legítimo porque derivan de la relación contractual y son necesarios para cumplirla (art. 5, inc. 2 c) [a verificar con un abogado], pero aplican igual los principios: datos mínimos (solo los de la lista de PA6.2), finalidad (gestión del contrato, facturación, cobranza y soporte), seguridad, confidencialidad, derechos de acceso, rectificación y supresión, y conservación limitada (los datos que exige la normativa fiscal se guardan el plazo legal aunque el cliente se dé de baja [a verificar con el contador]). No se usan para marketing de terceros.

### Criterios de aceptación:

☐ Busco por CUIT y encuentro la ficha de la pyme con sus tres comercios y el estado de cada uno.

☐ La ficha muestra razón social, CUIT, email de la cuenta de Google del Dueño, teléfono, plan y fecha de alta.

☐ Un CUIT con dígito verificador inválido no se puede guardar.

☐ Cambio el email de facturación: me pide reautenticación y el cambio aparece en la auditoría con el valor anterior enmascarado.

☐ El Dueño cambia la razón social en su app y la ficha del panel la muestra actualizada.

☐ La tabla customers no tiene campos fuera de la lista de datos mínimos (test sobre el esquema).

### PA7. Estado de cuenta y cobranza (P0)

Descripción: por cada cliente, el estado de cuenta con lo que el proveedor le facturó o cobró, los pagos recibidos, el saldo y el estado; el historial de pagos y un registro de cumplimiento. Todo en la base de control, en un libro mayor inmutable.

### Requerimientos:

PA7.1 Libro de movimientos (billing_ledger_entries, append-only, montos en centavos de ARS): cargo (cuota del plan del período, paquete extra de mensajes del documento de costos, otros), pago, nota de crédito, bonificación/descuento y ajuste. Saldo = suma de los movimientos. Nada se edita ni se borra; los errores se corrigen con un movimiento compensatorio (mismo principio que el resto del sistema).

PA7.2 Cargos del período: se generan solos según el plan (precio en ARS con ajuste periódico, documento de costos 9.4) con su fecha de vencimiento. Con Mercado Pago Suscripciones (preapproval), el cobro llega por webhook y se concilia automáticamente con el cargo (PRD principal 6.8).

PA7.3 Comprobantes fiscales del proveedor: cada cargo referencia el comprobante emitido por el proveedor (tipo, punto de venta, número, CAE) cuando exista. En el MVP se emite fuera del panel y se carga la referencia; en P1 se emite desde el panel reusando el servicio de facturación del PRD de Facturación Electrónica ARCA [a verificar con el contador el tipo de comprobante según la condición del proveedor].

PA7.4 Estado de la cuenta del cliente (calculado, el peor que corresponda):

PA7.5 Pantalla de estado de cuenta: saldo, estado, próximos vencimientos, días de atraso, y la lista de movimientos con fecha, concepto, comprobante, debe, haber y saldo corrido. Exportable a PDF y CSV (auditado).

PA7.6 Historial de pagos: fecha de vencimiento, fecha de pago, medio (Mercado Pago, transferencia, efectivo, otro), id de la operación, y si fue a tiempo o con atraso (y cuántos días).

PA7.7 Registro de cumplimiento: en los últimos 12 meses, porcentaje de pagos a tiempo, promedio y máximo de días de atraso, cantidad de veces en gracia y en suspensión, y una etiqueta simple (Puntual, Con atrasos ocasionales, Moroso recurrente) con reglas explícitas (por ejemplo, Puntual = 100% a tiempo; Moroso recurrente = 3 o más atrasos de más de 7 días).

PA7.8 Registrar un pago manual (transferencia, efectivo): monto, fecha, medio, número de operación y, opcional, el comprobante adjunto. Se imputa al cargo vencido más viejo salvo que se elija otro; si cubre la deuda, el tenant vuelve a activo según PA8. Reautenticación, motivo y auditoría. Se detectan duplicados por número de operación.

PA7.9 Aplicar un crédito o un descuento: bonificación de un porcentaje o un monto sobre un cargo o sobre los próximos N períodos (por ejemplo, "50% por 2 meses por problemas del servicio"), o nota de crédito sobre un comprobante emitido [a verificar con el contador cuándo corresponde una nota de crédito fiscal]. Reautenticación, motivo y auditoría.

PA7.10 Enviar un recordatorio: por defecto se arma un borrador (email desde el dominio transaccional del producto, con el saldo, los cargos vencidos y el link de pago) que el Superadmin revisa, edita y envía a mano; también puede elegir abrir WhatsApp desde su propio teléfono (link wa.me, sin costo, como TV11 del PRD de ticket) o una plantilla del número central (paga, ~USD 0,026 [a verificar la categoría de la plantilla]). No hay envíos automáticos salvo que se configuren en la política (PA8.5). Cada envío queda auditado y en el historial de la cuenta.

PA7.11 Lista de cobranza: vista con filtros por estado (quién pagó, pendientes, en demora ordenados por días de atraso, en gracia con fecha límite, suspendidos), monto adeudado total y por cliente, plan, medio de cobro y fecha del último recordatorio. Totales arriba: facturado del mes, cobrado, pendiente, en demora.

PA7.12 Morosidad y salida del cliente: la baja de un cliente con saldo deudor no borra la deuda; la cuenta queda "dada de baja con saldo" (PA14).

### Criterios de aceptación:

☐ El estado de cuenta de un cliente muestra cada cargo con su comprobante, cada pago y el saldo corrido, y el saldo coincide con la suma de los movimientos.

☐ Un cargo del 1/10 que vence el 10/10 aparece como Pendiente hasta el 10/10; el 13/10, sin pago, como En demora · 3 días.

☐ Llega el webhook de Mercado Pago del pago y el cargo queda pagado sin intervención; el estado pasa a Al día.

☐ Registro una transferencia de $53.900 de un cliente en gracia: me pide reautenticación y motivo, el cargo queda pagado, el tenant vuelve a activo y queda todo en la auditoría.

☐ Registro dos veces el mismo número de operación y el sistema me avisa del duplicado antes de guardar.

☐ Aplico un descuento del 50% por 2 meses: los próximos dos cargos salen con la bonificación y el motivo figura en la cuenta.

☐ Toco "Enviar recordatorio" y veo un borrador editable; no sale nada hasta que toco "Enviar".

☐ La lista filtrada por "En demora" muestra a los clientes ordenados de mayor a menor atraso con el monto adeudado.

☐ El registro de cumplimiento de un cliente que pagó 12 de 12 meses a tiempo dice "Puntual · 100% a tiempo".

☐ Un UPDATE sobre billing_ledger_entries falla; una corrección se hace con un movimiento de ajuste.

### PA8. Reglas de mora y estado del tenant (P0)

Descripción: las reglas que conectan el estado de cuenta con el estado del comercio, de forma configurable y pareja para todos, siguiendo el patrón de ModoOps (F8.4 del PRD principal: gracia de 7 días, luego solo lectura, sin borrar datos).

### Requerimientos:

PA8.1 Política de mora (dunning_policies), con valores por defecto:

Tolerancia: 3 días después del vencimiento (estado En demora, el comercio sigue activo) [a definir].

Gracia: 7 días (estado En gracia, el tenant pasa a en gracia; la app muestra el aviso y se envían los avisos de NE7.3).

Suspensión: al terminar la gracia sin pago, el tenant pasa a suspendido (solo lectura, AU4.7: el Dueño puede pagar y exportar sus datos).

Con Mercado Pago, un pago rechazado puede iniciar la gracia directamente (como NE7.3), sin esperar la tolerancia [a verificar los reintentos de cobro de Mercado Pago].

PA8.2 La política se puede definir por plan y tener excepciones por cliente (por ejemplo, "acuerdo de pago hasta el 20/10"), con vencimiento, motivo y auditoría.

PA8.3 Job diario (06:00) que recalcula el estado de cada cuenta y aplica las transiciones del tenant, idempotente, con registro de cada cambio en tenant_lifecycle_events. Las transiciones automáticas se pueden pausar globalmente (por ejemplo, si falla el webhook de Mercado Pago y hay que revisar los cobros).

PA8.4 Acciones manuales del Superadmin: prórroga (extender la gracia N días), suspender ya (por ejemplo, abuso) y levantar la suspensión sin pago (cortesía), con reautenticación, motivo y auditoría; la acción se replica en la actividad del comercio.

PA8.5 Recordatorios automáticos (opcional, apagados por defecto): la política puede configurar recordatorios de cobranza, por ejemplo al entrar en demora y 2 días antes de la suspensión. Mientras no se configuren, los recordatorios de cobranza son manuales (PA7.10). Los avisos de estado de NE7.3 (pago rechazado, inicio de gracia, paso a solo lectura, reactivación) son notificaciones obligatorias del sistema del PRD de notificaciones y se mantienen.

PA8.6 Al pagar, el tenant vuelve a activo en el momento en que se registra el pago (webhook o pago manual), sin esperar al job diario.

### Criterios de aceptación:

☐ Con la política por defecto, un cargo vencido el 10/10 sin pago deja la cuenta En demora del 11 al 13/10, En gracia del 14 al 20/10 y Suspendida desde el 21/10, con el comercio en solo lectura.

☐ Cargo una excepción "acuerdo de pago hasta el 20/10" y el comercio no pasa a gracia antes de esa fecha.

☐ Pauso las transiciones automáticas y ningún comercio cambia de estado hasta que las reactivo.

☐ Un pago registrado durante la suspensión devuelve el acceso completo en menos de 1 minuto.

☐ Sin recordatorios automáticos configurados, el sistema no envía ningún recordatorio de cobranza por su cuenta (sí los avisos obligatorios de NE7.3).

☐ Cada transición queda en tenant_lifecycle_events y en la actividad del comercio.

### PA9. Lo que cada kiosco debe en su operación (P0 simple)

Descripción: además de lo que cada cliente le debe al proveedor (PA7), el panel muestra, como dato operativo del propio comercio (N1, agregado), cuánto debe ese kiosco a sus proveedores y servicios. Sirve para detectar comercios en problemas financieros (riesgo de baja o de mora) y para soporte, sin ver el detalle.

### Requerimientos:

PA9.1 Por comercio, del job de agregación: cantidad y monto total de pedidos de reposición impagos (payment_status pendiente, PRD principal 6.3) y cuántos están vencidos (payment_due_at pasado); órdenes de pago pendientes (estados Borrador, Lista para pagar, Enviada al comerciante, Vencida, PRD de órdenes de pago OP2) con su monto; facturas de proveedor impagas en cuenta corriente (FP6).

PA9.2 Sin detalle de beneficiarios: no se muestran nombres de proveedores, CBU, alias ni conceptos; solo cantidades, montos totales y antigüedad.

PA9.3 Separación visual explícita: "Lo que te debe a vos" (PA7, datos del proveedor) y "Lo que debe a sus proveedores" (PA9, datos del comercio), para no confundirlas.

PA9.4 (P1) Antigüedad de la deuda (0–30, 31–60, más de 60 días).

### Criterios de aceptación:

☐ La ficha de un kiosco muestra "4 pedidos impagos por $312.000 (2 vencidos) · 3 órdenes de pago pendientes por $180.500 · 1 factura impaga por $95.000", con la hora de los datos.

☐ En ningún lugar de esa vista aparecen nombres de proveedores ni datos de cobro.

☐ Un pedido marcado como pagado ayer ya no figura en el total de hoy.

### PA10. Comparación de consumos entre kioscos (P0)

Descripción: totales de servicios por comercio (N1), del PRD de consumos (CS2: luz, gas, agua, internet, teléfono, tasas municipales, ARCA y otros servicios), para comparar y detectar valores fuera de lo normal.

### Requerimientos:

PA10.1 Por comercio y por mes: total de luz, gas, agua, internet y teléfono y otros servicios (los impuestos se muestran aparte), según la fecha de la factura confirmada (CS4/CS5), y su variación contra el mes anterior y el mismo mes del año anterior.

PA10.2 Comparación entre kioscos: ranking por tipo de servicio, mediana del rubro, y peso de los servicios sobre las ventas netas del mes (por ejemplo, "la luz es 6% de las ventas").

PA10.3 Marcado de valores atípicos (por ejemplo, la luz del mes duplica el promedio de 3 meses del comercio) como señal para soporte; no se muestra al comerciante desde acá.

PA10.4 Solo comercios con el módulo de consumos activo y la conexión de email (CS1) vigente; el resto aparece como "sin datos". No se ven emails, comprobantes ni números de cuenta.

### Criterios de aceptación:

☐ Veo una tabla de comercios con el total de luz, gas y servicios de septiembre y su variación.

☐ Un kiosco cuya luz duplicó el promedio aparece marcado como atípico.

☐ Un comercio sin el módulo de consumos aparece como "sin datos", no como cero.

### PA11. Uso de mensajes del bot y costo de WhatsApp por kiosco (P0)

Descripción: WhatsApp es el principal costo variable (documento de costos, 0). Con un número central, hay que mirar dos cosas distintas: el cupo gratis del número (compartido por todos) y lo que se paga (mensajes de servicio por encima del cupo y plantillas de utilidad, que se pagan siempre).

### Cómo se cobra (según el documento de costos y la documentación de Meta, desde el 1/10/2026):

Mensajes de servicio (respuestas libres del bot dentro de la ventana de 24 h abierta por el usuario, es decir, conversaciones iniciadas por el usuario): 1.000 gratis por mes por número de la empresa, sin acumular. Con un solo número, ese cupo se reparte entre todos los clientes (2 mensajes por cliente con 500 clientes). Por encima, ~USD 0,026 cada uno.

Plantillas de utilidad (aviso matutino, resumen del viernes, resumen de cierre de caja, avisos de pedidos y vencimientos, ticket por el número central): ~USD 0,026 cada una [a verificar contra la tarifa oficial de Meta], cobradas incluso dentro de la ventana abierta y sin cupo gratis.

El cupo de cada plan (Básico 100, Plus 300, Pro 600 "mensajes del bot" por mes, documento de costos 9) cuenta mensajes de servicio; las plantillas de alerta van incluidas aparte. Los tickets por el número central descuentan del cupo según la propuesta del PRD de ticket (TV12.4, pendiente de confirmar). Los mensajes del onboarding se marcan onboarding y no descuentan del cupo (ON5.8).

### Requerimientos:

PA11.1 Tarjeta del número central (mes en curso): mensajes de servicio entregados en total y consumo del cupo gratis ("1.000 de 1.000 usados · agotado el 2/10"); mensajes de servicio pagos; plantillas por tipo; costo estimado total en USD y en ARS (tipo de cambio del documento de costos, con la fecha); proyección a fin de mes.

PA11.2 Por kiosco (de whatsapp_usage, sin contenido de mensajes): mensajes de servicio del mes contra el cupo del plan (barra "280 / 300"), plantillas pagas por tipo (aviso_matutino, resumen_semanal, resumen_cierre_caja, ticket_venta, pedidos, vencimientos, onboarding) con su costo en USD, costo de servicio en USD, su parte prorrateada del cupo gratis (1.000 / cantidad de comercios activos, como en la sección 8 del documento de costos) y el costo total estimado del mes.

PA11.3 Contra el documento de costos: cada kiosco se compara con el escenario de referencia (liviano, bajo, medio, alto: 5, 20, 35, 50 conversaciones por día) y con el margen de su plan (precio del plan − costo estimado de WhatsApp − infraestructura prorrateada), marcando los que quedan debajo del margen objetivo (60–80%, documento de costos 9).

PA11.4 Cupos: aviso cuando un kiosco llega al 80% y al 100% del cupo del plan (PA12), y sugerencia de paquete extra (USD 8 por 100 mensajes) o cambio de plan.

PA11.5 Límite de mensajería del portfolio (usuarios únicos fuera de ventana por 24 h: 250, 2.000 tras verificar el negocio, después 10.000, 100.000 e ilimitado) con el nivel actual y el uso del día, y alerta al 80% (documento de costos 0.1 y TV12.8).

PA11.6 Calidad del número (verde, amarillo, rojo) y estado de las plantillas (aprobada, pausada, rechazada), leídos de la API de Meta y de los webhooks de calidad [a verificar los campos y eventos de la Cloud API]; por kiosco, tasa de bloqueos o reportes cuando Meta la informe, para poder pausar el envío de un comercio (TV12.9).

PA11.7 Conciliación mensual: el costo estimado del mes se compara con la facturación real de Meta (P0 manual: cargar el total de la factura; P1 automático con la API de analíticas de precios de la WABA [a verificar]). Diferencia mayor a 5% → alerta.

PA11.8 Tarifa por categoría configurable (whatsapp_rates, con vigencia), para recalcular si Meta cambia precios (puede hacerlo el 1/1, 1/4, 1/7 y 1/10, documento de costos 9.5).

### Criterios de aceptación:

☐ La tarjeta del número central muestra cuántos de los 1.000 mensajes de servicio gratis se usaron este mes y la fecha en que se agotaron.

☐ Para un kiosco Plus veo "280 / 300 mensajes del bot", 55 plantillas pagas (21 avisos matutinos, 4 resúmenes del viernes, 30 cierres de caja) = USD 1,43, y el costo total estimado del mes.

☐ Las plantillas nunca descuentan del cupo gratis del número ni aparecen como "gratis".

☐ Los mensajes de onboarding aparecen separados y no suman al cupo del plan.

☐ Un kiosco que llega al 80% del cupo aparece en la bandeja de alertas.

☐ Cambio la tarifa de utilidad a USD 0,0247 con vigencia desde el 1/1 y los costos de enero se recalculan con la tarifa nueva, sin tocar los meses anteriores.

☐ Cargo el total de la factura de Meta de septiembre y veo la diferencia contra el estimado.

### PA12. Alertas de comercios con problemas (P0)

Descripción: una bandeja única con lo que hay que mirar, ordenada por severidad, con email al Superadmin para lo crítico.

### Requerimientos:

PA12.1 Catálogo de alertas (reglas versionadas en el código; umbrales configurables desde el panel en P1):

PA12.2 Deduplicación: una alerta por (tipo, tenant) abierta a la vez; las repeticiones suman un contador.

PA12.3 Ciclo: abierta → reconocida → resuelta (sola, cuando la condición desaparece, o a mano con nota); posponer 4 h, 24 h o hasta una fecha.

PA12.4 Avisos al Superadmin: las críticas y altas, por email inmediato (infraestructura de NE11 del PRD de notificaciones); las medias, en un resumen diario a las 08:00. No se usan plantillas de WhatsApp para estas alertas (costo y límite de mensajería), salvo que se configure (P1).

PA12.5 Cada alerta lleva a la pantalla donde se resuelve (ficha del kiosco, estado de cuenta, infraestructura) y, si corresponde, al drill-down (con las reglas de PA3).

PA12.6 Las alertas de un comercio muestran solo contadores y estados (N0/N1): por ejemplo, "3 anomalías de stock abiertas en 2 productos", sin nombres de productos hasta abrir el drill-down con acceso de soporte.

### Criterios de aceptación:

☐ Una sincronización que deja un producto en −1 genera la señal; si sigue abierta a las 24 h, aparece la alerta "Stock negativo sin resolver" en la bandeja.

☐ Un celular con pendientes sin sincronizar hace 60 h genera una alerta alta con el comercio y el identificador del dispositivo.

☐ La calidad del número pasa a amarillo y en menos de 15 minutos me llega un email.

☐ Dos fallas iguales del mismo comercio no crean dos alertas, sino una con contador 2.

☐ Pospongo una alerta 24 h y no vuelve a aparecer hasta entonces, salvo que suba de severidad.

☐ Cuando el dueño resuelve la anomalía en su app, la alerta se cierra sola en la siguiente señal.

### PA13. Drill-down de solo lectura a un comercio (P0)

Descripción: ver rápido el detalle de un kiosco puntual (resumen de caja, reporte de rotación, datos clave), bajo demanda, contra su base, con un rol de solo lectura, con motivo, con consentimiento (PA3) y con auditoría (PA2).

### Requerimientos:

PA13.1 Vistas disponibles (cada una una vista de base de datos versionada support_v1.* en la base del comercio, con las mismas definiciones que la app):

Resumen de caja de un día (C12 del PRD de caja): apertura y cierre (hora, tipo manual o automático), ingresos y egresos por medio de pago, resultado y saldo total. Sin detalle movimiento por movimiento en el MVP.

Reporte de rotación (PRD de rotación, RT1, RT4 y RT5): más y menos vendidos, baja rotación y recomendaciones de reposición, del período elegido.

Datos clave: cantidad de productos, con stock bajo y con stock negativo; anomalías de stock abiertas (OF6.7) con producto y dispositivo; usuarios activos (cantidad, sin emails) y dispositivos con su última sincronización; módulos activos; versión de esquema.

PA13.2 Antes de abrir: se elige el motivo (lista: alerta, pedido del cliente, cobranza, verificación técnica, otro con texto) y el sistema comprueba el consentimiento (PA3.6/PA3.7). Sin consentimiento vigente, se ofrece "Pedir acceso".

PA13.3 Conexión: se resuelve la base desde el catálogo, se usa la réplica si existe, con el rol support_readonly (SELECT solo sobre support_v1.*, default_transaction_read_only = on, statement_timeout 5 s). Ningún endpoint del drill-down puede escribir en la base del comercio.

PA13.4 Velocidad: cada vista responde en menos de 2 s (p95) para un comercio de 5.000 productos.

PA13.5 Marca de agua en pantalla y en los PDF exportados: "Vista de soporte · [tenant] · [fecha y hora] · solo lectura".

PA13.6 Sin datos de terceros: las vistas de soporte no incluyen teléfonos de clientes finales, CBU ni contenido de facturas o emails.

PA13.7 Cada vista abierta y cada exportación queda en la auditoría y en la actividad del comercio (PA2.5).

### Criterios de aceptación:

☐ Con acceso de soporte vigente, abro "Resumen de caja del 8/10" de un kiosco y lo veo en menos de 2 s, con la marca de agua.

☐ Abro "Datos clave" y veo las anomalías de stock abiertas con producto y dispositivo, sin datos personales de clientes.

☐ Desde las herramientas del navegador intento un POST a un endpoint del drill-down y recibo un error; con el rol support_readonly un INSERT falla.

☐ Sin consentimiento vigente no se abre ninguna vista y el botón ofrece "Pedir acceso".

☐ El Dueño ve en su actividad cada vista que abrí, con el motivo.

### PA14. Ciclo de vida del tenant: alta, baja y reactivación (P0)

Descripción: el Superadmin gestiona el ciclo de vida de cada comercio. El alta reusa el job de aprovisionamiento del onboarding; la baja nunca es un borrado inmediato.

### Requerimientos:

PA14.1 Alta asistida: el Superadmin crea un comercio (por ejemplo, una venta en persona) con nombre, rubro, plan, datos de facturación (PA6) y email de Google del futuro Dueño. El sistema crea el tenant y su base con el mismo job idempotente de ON3 / 6.2 del onboarding (tenant_provisioning, reintentos, rollback de 6.3) y envía al Dueño una invitación de titularidad (como AU6, con token de un solo uso). El Superadmin no recibe una membership: el comercio queda sin operar hasta que el Dueño acepta con su cuenta de Google.

PA14.2 Altas del onboarding: la lista de altas por estado (aprovisionando, activo, error) con el paso que falló y el botón "Reintentar" de ON3.8 se integran acá; también el embudo de ON12 y la bandeja de tareas de delegación de ARCA del proveedor (FE2.5 del PRD de facturación), marcadas como hechas con auditoría.

PA14.3 Estados de ciclo de vida (además de prueba, activo, en gracia, suspendido del PRD principal): baja_solicitada → en_baja (solo lectura) → archivado → eliminado.

PA14.4 Baja (pedida por el Dueño desde F8.4, o por el proveedor por mora prolongada o incumplimiento): el tenant pasa a en_baja con solo lectura durante 30 días [plazo a definir]: el Dueño puede entrar, ver y exportar todos sus datos (F8.5: productos, movimientos, caja, etc., en CSV/Excel). El bot deja de responder con datos y se cancelan las plantillas programadas. Se dan de baja los cobros futuros de Mercado Pago.

PA14.5 Archivado: al terminar el período, se hace un backup final cifrado de la base, se desconecta del catálogo activo y se borra la base viva. El backup se conserva el plazo de retención de la política (por ejemplo, 90 días) [a verificar con un abogado] para una eventual reactivación.

PA14.6 Eliminación: al vencer la retención, un job borra el backup final y las copias, y deja un certificado de eliminación (tenant, fecha, qué se borró, hashes) en la auditoría. Se conservan solo los datos que el proveedor necesita por obligación propia: directorio y estado de cuenta (PA6, PA7) el plazo fiscal, y la auditoría (PA2.7) [a verificar con un abogado y el contador]. La eliminación programada se puede cancelar hasta el último día y avisa al Dueño 7 días antes.

PA14.7 Nunca un borrado duro inmediato: no existe un botón para borrar una base en el momento. Si el Dueño pide la supresión anticipada (derecho de supresión), se adelanta el proceso con reautenticación, motivo y una espera mínima de 72 h cancelable.

PA14.8 Reactivación: desde suspendido (al pagar, PA8.6) o desde en_baja (vuelve a activo, con el mismo plan o uno nuevo) es inmediata; desde archivado se restaura el backup final en una base nueva (PA15) y se vuelve a registrar en el catálogo. Desde eliminado no hay reactivación: es un alta nueva.

PA14.9 Deudas y estado de pago visibles en cada paso: dar de baja a un cliente con saldo no cancela la deuda (PA7.12) y se avisa antes de confirmar.

PA14.10 Todas las transiciones con reautenticación (PA1.8), motivo, auditoría y aviso por email al Dueño (NE7).

### Criterios de aceptación:

☐ Doy de alta "Almacén Don José" desde el panel: se crea una sola base, el tenant queda esperando al Dueño y a José le llega la invitación; yo no aparezco como usuario del comercio.

☐ Ejecutar dos veces el alta asistida para el mismo comercio deja una sola base y un solo registro en el catálogo.

☐ Doy de baja un comercio: queda en solo lectura, el Dueño puede exportar todo durante 30 días y el bot le responde que el comercio está dado de baja.

☐ No existe ninguna acción que borre una base en el momento.

☐ Al terminar los 30 días queda el backup final cifrado y la base viva se elimina; al vencer la retención se borra el backup y queda el certificado de eliminación.

☐ Reactivo un comercio archivado: su base se restaura y el Dueño vuelve a entrar con sus datos.

☐ Al intentar dar de baja un cliente con $53.900 adeudados, el panel me lo avisa antes de confirmar.

### PA15. Infraestructura: servidores, bases, backups, colas y costos (P0 vista y re-ejecutar migración / P1 restaurar y mover)

Descripción: ver y gestionar la infraestructura sin conectarse por SSH: servidores y hosts de bases, dónde vive cada base de tenant, tamaño, salud, backups, versión de migraciones, colas y jobs, tasa de errores y costos. Las acciones son jobs versionados, con confirmación y auditoría; no hay consola SQL ni shell.

### Requerimientos:

PA15.1 Servidores (infra_hosts): app/API, hosts de Postgres (primario y réplica), OCR, workers; proveedor (Hetzner), tipo (CX33, CX43, CX53), región, estado, CPU, memoria, disco, y costo mensual (precios del documento de costos 3.1, editables con vigencia).

PA15.2 Bases de tenants (catálogo tenant_databases extendido): host, nombre de la base, tamaño, conexiones, versión de esquema, último backup exitoso y última restauración de prueba, estado (activa, en migración, en mudanza, archivada). Filtro por host para ver la ocupación (capacidad orientativa: CX33 ~100 bases, CX53 ~500, documento de costos 3.2 [a verificar con pruebas de carga]).

PA15.3 Salud: por host, lag de replicación, conexiones contra el límite de PgBouncer, uso de disco, y por servicio, tiempos de respuesta y uptime.

PA15.4 Backups: estado del backup diario por base y del export lógico semanal (PRD principal 6.4: RPO 24 h, RTO menor a 4 h), resultado de las restauraciones de prueba periódicas (por ejemplo, 5 bases al azar por semana) y tamaño en el almacenamiento (Backblaze B2).

PA15.5 Colas y jobs: pendientes, edad del más viejo, fallados y reintentos por tipo (aprovisionamiento, agregación, notificaciones, OCR, cobros, mora), con enlace al detalle del error.

PA15.6 Errores y costos: tasa de errores por servicio (PA17) y costo mensual total de infraestructura y por cliente (infraestructura fija / clientes activos), comparado con el documento de costos (3.4).

PA15.7 Acción: re-ejecutar una migración (P0) en una base que quedó atrasada o falló: usa el runner versionado (Drizzle); solo aplica migraciones del repositorio ya desplegadas; idempotente.

PA15.8 Acción: restaurar un backup (P1): siempre en una base nueva (nunca sobre la base viva), verificación automática (conteos, suma de movimientos = stock, versión de esquema), vista previa y, recién después, el cambio del catálogo a la base restaurada con el comercio en modo mantenimiento unos minutos. La base anterior queda renombrada y se conserva 7 días.

PA15.9 Acción: mover una base de host (P1), por ejemplo para balancear carga: copia (dump/restore o replicación lógica [a verificar]), verificación, ventana corta de solo lectura, cambio en el catálogo, y la base de origen se conserva 7 días antes de borrarse.

PA15.10 Las acciones de PA15.7–PA15.9 piden reautenticación, pantalla de impacto, escribir el identificador del comercio y motivo (PA1.8, PA1.9); se ejecutan como jobs con estado visible y quedan en la auditoría y en la actividad del comercio. Solo desde una pantalla de escritorio.

### Criterios de aceptación:

☐ Veo cada host de base con cuántas bases tiene, su disco, sus conexiones y su costo mensual.

☐ Busco un comercio y veo en qué host está su base, su tamaño, su versión de esquema y la hora de su último backup.

☐ Una base sin backup exitoso en 26 h aparece en rojo y genera la alerta crítica.

☐ Re-ejecuto la migración fallida de un comercio: el job la aplica, la versión de esquema se actualiza en el catálogo y queda auditado.

☐ (P1) Restauro el backup de ayer de un comercio: se crea una base nueva, pasa la verificación y recién al confirmar el comercio apunta a ella; la base anterior sigue existiendo 7 días.

☐ (P1) Muevo una base de db-1 a db-2 y el comercio queda en solo lectura menos de 5 minutos.

☐ No existe ninguna pantalla para escribir SQL ni comandos de servidor.

### PA16. Módulos por tenant o por plan con feature flags (P0)

Descripción: activar o desactivar módulos según el plan o para un comercio puntual (beta, cortesía, problema), sin desplegar código.

### Requerimientos:

PA16.1 Catálogo de módulos (modules): inventario (siempre activo), caja digital, facturas de proveedores, órdenes de pago, consumos de servicios, rotación, ticket por número central (TV12), lectura de Gmail (beta cerrada, C13/CS1), modo offline, bot de WhatsApp y los que se agreguen.

PA16.2 Por plan (plan_modules): qué módulos y límites trae cada plan (cupo de mensajes, usuarios, productos), en línea con el documento de costos (9). Un cambio en un plan se aplica a todos sus comercios.

PA16.3 Override por tenant (tenant_feature_overrides): activar o desactivar un módulo con motivo y vencimiento opcional (por ejemplo, "beta de Gmail hasta el 31/12").

PA16.4 Evaluación en el backend en cada request (con caché de pocos segundos e invalidación explícita): un módulo apagado oculta la UI y responde 403 en la API y en el bot. Apagar un módulo nunca borra sus datos; al volver a encenderlo, están.

PA16.5 (P1) Rollout por porcentaje de un módulo nuevo (por ejemplo, 10% de los comercios Pro) y lista de comercios beta.

PA16.6 Cada cambio con reautenticación, auditoría y aviso en la actividad del comercio.

### Criterios de aceptación:

☐ Activo "Órdenes de pago" para un comercio Básico con el motivo "prueba comercial" y vencimiento el 31/10: el Dueño lo ve en su app y el 1/11 desaparece.

☐ Apago "Consumos" para un comercio: la pantalla desaparece, la API responde 403 y, al reactivarlo, los consumos cargados siguen ahí.

☐ Cambio el cupo del plan Plus de 300 a 350 y se aplica a todos los comercios Plus desde el próximo período.

### PA17. Errores por tenant (P0)

Descripción: ver los errores de la app y del backend por comercio, al estilo Sentry, para detectar quién está teniendo problemas.

### Requerimientos:

PA17.1 Los eventos de Sentry (frontend, backend, bot, jobs) llevan las etiquetas tenant_id (identificador seudónimo, no el nombre), release y device_id cuando aplica; sin datos personales en los eventos (PRD principal 6.9).

PA17.2 El panel muestra por comercio la cantidad de errores en 24 h y 7 días, los tipos más frecuentes y el release, con enlace al issue en Sentry; y por release, cuántos comercios afectados.

PA17.3 Alerta cuando un comercio supera 5 veces su promedio de 7 días (PA12) o cuando un release nuevo aumenta los errores (P1, ligado a PA18).

### Criterios de aceptación:

☐ Un error en el bot de un comercio aparece en su ficha con el tipo, el release y el enlace al issue de Sentry.

☐ Los eventos de Sentry no contienen nombres, emails ni teléfonos (revisión con una muestra).

### PA18. Deploys y rollouts de migraciones por el pipeline de CI/CD (P0 estado y rollout de migraciones / P1 disparar deploys y rollbacks)

Descripción: el panel no edita código en vivo. Los cambios de código y las correcciones de bugs se hacen en el repositorio (git), con pull request, revisión y CI (lint, tests, tests de aislamiento entre comercios, PRD principal 6.9), y el pipeline los despliega (GitHub Actions hacia Cloudflare Workers, Vercel o el VPS, según el documento de costos 3.3). El panel muestra el estado, dispara deploys ya aprobados o rollbacks y ejecuta las migraciones versionadas en el repositorio.

### Requerimientos:

PA18.1 Estado de releases: por entorno (staging, producción), versión desplegada (commit, PR, autor, fecha), estado de CI y del deploy, y el historial de los últimos releases.

PA18.2 Rollout de migraciones por tenant (P0): la migración nueva se aplica primero a la base de control, después a un grupo canario (bases internas, comercios de prueba y beta, PRD principal 6.4), y recién después a todos, por lotes (por ejemplo, 50 bases a la vez por host), con avance visible ("312 / 500 migradas · 0 errores").

PA18.3 Frenado automático: si una migración falla en más de N bases (por defecto 1 en el canario, 1% en el rollout general) o suben los errores (PA17), el rollout se pausa y alerta (PA12). Se puede reanudar o abortar.

PA18.4 Migraciones compatibles hacia atrás (patrón expand / contract): como durante el rollout conviven bases con versiones distintas, el código desplegado tiene que funcionar con la versión anterior y la nueva del esquema; las migraciones destructivas (borrar columnas) van en un release posterior. Lo controla la revisión del PR y un check de CI.

PA18.5 (P1) Disparar un deploy aprobado: solo de un commit que ya está en la rama principal y pasó CI (llamada al workflow_dispatch del pipeline); el panel no permite elegir commits sin CI ni ramas arbitrarias.

PA18.6 (P1) Rollback al release anterior (redeploy del artefacto previo). Si el release incluía migraciones, el rollback de código es posible porque las migraciones son compatibles hacia atrás; no se revierten migraciones automáticamente: se corrige con una migración nueva desde el repositorio.

PA18.7 Todas las acciones con reautenticación, motivo y auditoría; el token del panel hacia GitHub tiene permisos mínimos (solo disparar los workflows de deploy y leer estados) y vive en el servidor.

### Criterios de aceptación:

☐ Veo qué commit está en producción, con su PR y el resultado de CI.

☐ Lanzo el rollout de una migración: se aplica a la base de control y al canario; recién cuando confirmo, avanza al resto por lotes.

☐ Simulo una falla en una base del canario y el rollout se pausa solo con una alerta.

☐ (P1) Disparo el deploy de un commit de la rama principal con CI en verde; un commit sin CI no aparece como opción.

☐ (P1) Hago rollback al release anterior y la app vuelve a funcionar con las bases ya migradas.

☐ No existe ninguna forma de editar código, archivos ni variables de entorno desde el panel.

### PA19. Modo soporte / impersonación (P2)

Descripción: para casos de soporte difíciles, ver la app como la ve el Dueño, en solo lectura, con consentimiento expreso.

### Requerimientos:

PA19.1 Solo con un consentimiento por sesión del Dueño (pedido desde el panel, aprobado desde la app o el email), con duración máxima de 60 minutos y alcance de solo lectura.

PA19.2 No crea membership (como fija el PRD de autenticación en su integración con el Control Plane: la impersonación no crea una membership y queda en auth_events); la sesión de soporte tiene su propia cookie, un banner fijo "Modo soporte · solo lectura" y no puede ejecutar acciones de escritura, exportaciones ni ver datos de cobro.

PA19.3 Inicio, fin y cada pantalla vista quedan en la auditoría y en la actividad del comercio; el Dueño puede terminar la sesión en cualquier momento.

### Criterios de aceptación:

☐ (P2) Sin aprobación del Dueño no puedo iniciar el modo soporte.

☐ (P2) En modo soporte, cualquier intento de escritura devuelve error y el banner está siempre visible.

☐ (P2) El Dueño termina la sesión desde su app y mi vista se cierra en la siguiente acción.

### 4.20 Integración con los demás PRD y con el documento de costos

## 5. Flujos

### Flujo 1: revisión de la mañana

Lunes 8:30. Mauricio abre admin.<dominio> en la PC, toca "Iniciar sesión con Google", Google le pide la llave de seguridad (2FA) y entra: su cuenta está en la allowlist como superadmin.

El tablero (PA5) muestra "Datos al 13/10 03:41 · 498 de 500 comercios". Ayer: ventas netas $186,4 M en total, 41.200 tickets, ticket promedio $4.524 (+3% contra el lunes anterior). Dos comercios en amarillo por datos desactualizados.

En "En riesgo" aparecen 3 kioscos: uno sin ventas hace 3 días y dos con caídas de más de 40%. Anota hacer seguimiento comercial.

La bandeja de alertas (PA12) tiene 1 crítica (backup fallido en db-2 para 4 bases), 2 altas (una migración fallida, calidad del número en amarillo) y 9 medias.

Abre la crítica: el backup de anoche falló por disco lleno en el almacenamiento temporal; ve en PA15 que el reintento de las 06:00 ya terminó bien y la cierra con una nota.

Abre la migración fallida, ve el error, re-ejecuta la migración (PA15.7) después de reautenticarse; queda aplicada.

Mira la lista de cobranza (PA7.11): 6 clientes en demora, 2 en gracia (uno vence mañana). Arma recordatorios en borrador para los dos en gracia (Flujo 3).

Todo lo que miró y lo que hizo queda en la auditoría.

### Flujo 2: alerta de stock negativo

El sábado, dos celulares de "Kiosco La Esquina" vendieron offline el mismo alfajor; al sincronizar, el stock quedó en −1 y se creó la anomalía (OF6.7). La base del comercio publicó la señal en la base de control (PA4.3).

El domingo a la noche la anomalía sigue abierta hace más de 24 h: aparece la alerta media "Stock negativo sin resolver · 1 anomalía · 1 producto" (sin nombre de producto).

El lunes Mauricio la abre. El Dueño tiene el acceso de soporte apagado, así que toca "Pedir acceso" con el motivo "Alerta de stock negativo sin resolver".

El Dueño recibe el email "[Producto] te pide acceso de lectura por 24 h para revisar una alerta de stock" y toca "Aprobar".

Mauricio abre "Datos clave" (PA13): ve la anomalía con el producto, los dos movimientos, sus dispositivos y sus horas. No toca nada (solo lectura).

Le escribe al dueño (desde su propio WhatsApp o por email) que la anomalía se resuelve con una carga o un ajuste desde su app (F3.8). El Dueño hace el ajuste y la alerta se cierra sola.

El Dueño ve en "Usuarios → Actividad": "Soporte de [Producto] vio los datos clave · Motivo: alerta de stock negativo".

### Flujo 3: un kiosco con la suscripción vencida

El cargo de octubre de "Almacén Don José" (plan Plus, ARS 53.900) vencía el 10/10. Mercado Pago rechazó el cobro.

El 11/10 la cuenta figura En demora · 1 día en la lista de cobranza. Según la política, el pago rechazado inicia la gracia: el tenant pasa a en gracia hasta el 17/10 y José recibe el aviso obligatorio de NE7.3.

Mauricio abre el estado de cuenta: ve el cargo, el rechazo y el registro de cumplimiento ("Con atrasos ocasionales · 10 de 12 a tiempo").

Toca "Enviar recordatorio": el sistema arma el borrador con el saldo y el link de pago. Lo edita ("José, ¿te ayudo a actualizar la tarjeta?") y, como prefiere un trato personal, elige "Abrir en mi WhatsApp" (wa.me, sin costo).

José contesta que pagó por transferencia. Mauricio verifica el ingreso en su banco, toca "Registrar pago manual", se reautentica, carga monto, fecha y número de operación, y el motivo "Transferencia informada por el cliente".

El cargo queda pagado, la cuenta pasa a Al día y el tenant vuelve a activo en el momento (PA8.6). Todo queda en la auditoría.

Variante: si no pagaba, el 18/10 el job diario pasaba el tenant a suspendido (solo lectura) y José seguía pudiendo entrar, pagar y exportar sus datos.

### Flujo 4: control de los costos de WhatsApp a fin de mes

28/10. Mauricio abre "WhatsApp" (PA11). Tarjeta del número central: "Cupo gratis de servicio: 1.000 / 1.000 · agotado el 2/10". Mensajes de servicio del mes: 118.400; plantillas de utilidad: 22.150; costo estimado: USD 3.628 (servicio pago: 117.400 × ~0,026 = USD 3.052; plantillas: 22.150 × ~0,026 = USD 576) [cifras de ejemplo]; proyección a fin de mes y diferencia contra el escenario del documento de costos.

Ordena los kioscos por costo total del mes. El primero, plan Básico, lleva 210 / 100 mensajes del bot (se pasó del cupo) y 60 plantillas: queda con margen negativo.

Abre su detalle: casi todo son consultas largas de stock por el bot. Decide ofrecerle el plan Plus o un paquete extra y sugerirle la web/PWA para las consultas largas (documento de costos 9.2).

Ve 14 kioscos al 80% del cupo (ya estaban en la bandeja de alertas) y la calidad del número en verde; el límite de mensajería está al 45% del nivel actual.

A principios de noviembre carga el total de la factura de Meta de octubre: la diferencia contra el estimado es 2,1% (dentro del 5%).

### Flujo 5: drill-down a un kiosco

Un dueño le escribe a Mauricio: "El resumen de cierre de ayer me dio raro". Ese comercio tiene el acceso de soporte activado por 7 días.

Mauricio busca el comercio en el directorio y abre la ficha: estado de cuenta al día, módulos activos, 2 dispositivos (uno sin sincronizar hace 30 h).

Toca "Ver resumen de caja", elige el día y el motivo "Pedido del cliente". El panel registra el acceso y muestra el resumen de cierre con la marca de agua: cierre automático a las 00:00, ingresos y egresos por medio de pago.

Abre "Datos clave" y ve que el segundo celular tiene ventas offline sin sincronizar: por eso el resumen no las incluía. Abre el reporte de rotación de la semana para confirmar que las ventas del producto principal bajaron solo en ese dispositivo.

Le explica al dueño que abra la app en ese celular con conexión. Al sincronizar, el resumen se recalcula (según el PRD de caja) y el agregado del día se corrige en la corrida nocturna (PA4.1).

### Flujo 6: alta asistida de un cliente

Mauricio vende el sistema en persona a una pyme con dos sucursales. En "Clientes → Nuevo" carga razón social, CUIT, plan Pro, email de facturación y el email de Google del dueño.

Crea los dos comercios: el job de aprovisionamiento de onboarding crea las dos bases, las registra en el catálogo y deja los tenants esperando al Dueño.

Al dueño le llega la invitación de titularidad; acepta con su cuenta de Google, acepta los términos y la política, y entra a sus comercios.

El primer cargo se genera según el plan; el estado de cuenta queda Pendiente hasta el vencimiento.

### Flujo 7: baja de un cliente

Un dueño pide la baja desde su app (F8.4). El tenant pasa a en_baja: solo lectura por 30 días y aviso por email con el plazo para exportar.

Mauricio ve el caso en el panel, revisa el estado de cuenta (saldo cero) y anota el motivo de baja.

A los 30 días, el job hace el backup final cifrado, borra la base viva y deja el tenant archivado.

Al vencer la retención, el job borra el backup y deja el certificado de eliminación en la auditoría. El directorio y el estado de cuenta se conservan el plazo fiscal.

### Flujo 8: corrección de un bug y rollout de una migración

Un comercio reporta un error en la pantalla de órdenes de pago. En PA17 Mauricio ve el error en 12 comercios desde el último release.

Corrige el bug en el repositorio: rama, PR, revisión, CI en verde, merge a la rama principal. El pipeline despliega a staging y luego a producción.

En PA18 ve el release nuevo en producción. El fix requería una migración (agregar un índice): lanza el rollout, se aplica a la base de control y al canario.

Sin errores en el canario, confirma "Avanzar a todos": el rollout migra por lotes ("500 / 500 · 0 errores").

Los errores del tipo bajan a cero en PA17. Si hubieran subido, el rollout se pausaba solo y (P1) podía hacer rollback del código al release anterior desde el panel.

## 6. Notas técnicas

### 6.1 Principios

El panel lee de la base de control. Los tableros nunca consultan N bases en vivo; solo el drill-down (PA13) abre una conexión a una base de comercio, de a una, con un rol de solo lectura.

Mínimo privilegio en todo: roles de base distintos para agregación (analytics_reader) y soporte (support_readonly), token de GitHub acotado, sin consola SQL ni shell.

Auditoría primero: si no se puede auditar, no se muestra ni se ejecuta (falla cerrada).

Nada destructivo es inmediato: restaurar y mover crean bases nuevas; la baja pasa por solo lectura, archivo y eliminación programada.

### El código cambia solo por el repositorio y el pipeline.

### 6.2 Arquitectura y despliegue

App Astro + TypeScript (SSR) separada de la app de los comercios (mismo monorepo, despliegue y dominio propios: admin.<dominio>), con su propio cliente OAuth y sus propias cookies.

Backend del panel con acceso a la base de control (rol panel_app) y a un servicio interno de drill-down que es el único con credenciales support_readonly hacia las bases de comercios.

Workers de la cola de jobs (los mismos de los otros PRD) para agregación, mora, alertas, migraciones, restauraciones y mudanzas.

Sin servidores nuevos en el MVP: corre en la infraestructura del documento de costos (3.4).

### 6.3 Modelo de datos en la base de control

Tablas existentes que el panel usa: tenants, users, memberships, invitations, sessions, auth_events, tenant_databases (catálogo), tenant_provisioning, whatsapp_identities / bot_links, whatsapp_usage, notification_schedules.

Tablas nuevas o extendidas:

Esquema analytics (sin datos personales, test automático sobre el esquema):

Montos en centavos enteros de ARS (como el resto del sistema), fechas en America/Argentina/Buenos_Aires y timestamptz.

### 6.4 Jobs de agregación

Contrato con cada base de comercio: funciones versionadas analytics_v1.daily_metrics(fecha), analytics_v1.monthly_consumos(mes) y analytics_v1.debts_snapshot(), creadas por las migraciones de las bases de clientes (mismo runner). Devuelven filas ya agregadas: el job nunca lee tablas crudas.

Orquestación: el job nocturno encola un trabajo por comercio (pg-boss), con concurrencia por host, prioridad para los comercios con datos más viejos, statement_timeout, reintentos (3) con espera exponencial y advisory lock por tenant.

Escritura: upsert por (tenant, fecha, versión); re-procesa los últimos 3 días; si una base falla, se registra en tenant_aggregation_status y no se pisa el último dato bueno.

Señales push: un outbox en cada base de comercio (insertado en la misma transacción del evento: anomalía, hueco, cierre fallido) que un worker copia a tenant_health_signals; un barrido cada 5 minutos cubre lo que se pierda (mismo patrón que el PRD de notificaciones).

Carga: lectura desde la réplica; con 500 comercios y ~1 s por comercio y 4 en paralelo por host, la corrida termina en minutos [estimado, a verificar con pruebas de carga].

Frescura: computed_at en cada fila y tenant_aggregation_status alimentan los indicadores de PA4.8.

### 6.5 Drill-down bajo demanda

Servicio interno que recibe (admin_id, tenant_id, vista, parámetros, motivo), verifica sesión, rol, reautenticación si corresponde y consentimiento vigente (support_consents), escribe la auditoría, y recién entonces abre una conexión (pool chico por host, PgBouncer) a la réplica de la base del comercio con support_readonly.

Vistas support_v1.* versionadas en la base de cada comercio; resultados no se cachean más de 5 minutos y nunca se guardan en la base de control.

Réplica del evento en el audit_log del comercio (PA2.5) por la cola.

### 6.6 Seguridad

Identidad: OIDC con Google, cliente OAuth propio, validación del ID token (firma, aud, iss, exp, nonce), email_verified, hd si es Workspace; decisión por google_sub contra platform_admins.

2FA: obligatorio en la cuenta de Google (forzado por política si es Workspace; documentado si es personal). P1: passkey propia del panel.

Sesiones: 30 min de inactividad, 8 h absolutas, reautenticación de 5 min para acciones destructivas; cookie __Host-, SameSite=Strict; revocación inmediata de todas las sesiones desde "Mi cuenta" del panel.

Red: HTTPS/HSTS, CSP estricta, sin scripts de terceros, rate limiting, (P1) Cloudflare Access o allowlist de IP.

Secretos: credenciales de bases, token de GitHub y claves de Meta y Mercado Pago solo en el servidor (variables de entorno o gestor de secretos), nunca en el navegador ni en logs; rotación periódica.

Bases: roles analytics_reader (solo EXECUTE sobre analytics_v1) y support_readonly (solo SELECT sobre support_v1, default_transaction_read_only); ningún rol del panel puede escribir en una base de comercio. Las acciones de infraestructura las ejecutan workers con un rol de operación separado, nunca el backend web.

Auditoría: append-only, cadena de hashes, verificación nocturna, (P1) copia WORM.

Privacidad: test automático sobre el esquema analytics y admin_audit_log.detalle (sin columnas ni claves con datos personales), Sentry sin PII, datos del directorio mínimos (PA6.9), backups cifrados.

Tests de aislamiento en CI (como el PRD principal): el panel no puede leer datos de un comercio sin pasar por el servicio de drill-down, y el servicio no responde sin consentimiento.

### 6.7 Cobranza y mora

Webhooks de Mercado Pago (preapproval y pagos) con verificación de firma e idempotencia por id de pago [a verificar el esquema de firma vigente]; conciliación con billing_invoices.

Job diario de mora (06:00) idempotente; las transiciones se escriben en tenant_lifecycle_events y actualizan tenants.estado en la misma transacción; el middleware de la app aplica el solo lectura (AU4.7).

Recordatorios: borradores en billing_reminders; el envío por email usa la infraestructura de NE11; el wa.me se abre en el dispositivo del Superadmin y se registra como "enviado por WhatsApp personal".

### 6.8 Infraestructura, migraciones y deploys

Métricas de hosts y bases con un exportador (por ejemplo, postgres_exporter / métricas del sistema) y uptime monitoring; el panel muestra el resumen y enlaza al detalle [a definir herramienta].

Restaurar y mover como máquinas de estado en la base de control (pendiente → copiando → verificando → esperando confirmación → cambiando catálogo → terminado / revertido), con la base anterior conservada 7 días.

Migraciones: runner Drizzle; migration_rollouts controla fases y lotes; pausa automática por umbral de errores; migraciones expand / contract.

Deploys: GitHub Actions (workflow_dispatch para deploy y rollback), con un token de permisos mínimos; el panel solo lista commits de la rama principal con CI en verde.

## 7. Riesgos y preguntas abiertas

### 7.1 Riesgos

### 7.2 Preguntas abiertas

Legal: ¿alcanza la cláusula de los términos para las métricas agregadas N1 o hace falta un consentimiento separado (casilla aparte en el alta)? ¿El interruptor de acceso de soporte tiene que estar apagado por defecto o puede venir activado con aviso? ¿Plazo de retención de la auditoría, del backup final y del directorio tras la baja? ¿Inscripción de las bases en el Registro Nacional de Bases de Datos? [a verificar con un abogado]

Fiscal: ¿qué comprobante emite el proveedor (según su condición frente al IVA), cuándo corresponde una nota de crédito por un descuento y qué datos del cliente son obligatorios? [a verificar con el contador]

2FA: ¿la cuenta del Superadmin va a ser de Google Workspace (2FA forzado por política) o personal? ¿Se implementa la passkey propia ya en el MVP?

Mora: ¿tolerancia de 3 días antes de la gracia, o la gracia empieza el día del vencimiento? ¿Un pago rechazado de Mercado Pago inicia la gracia directamente?

Recordatorios: ¿se activan recordatorios automáticos de cobranza desde el lanzamiento o se mantienen manuales hasta tener volumen?

Cupo gratis: ¿cómo se atribuye el cupo gratis del número a cada kiosco en los reportes: prorrateo (propuesta, como el documento de costos) o cronológico, como lo aplica Meta?

Tickets por el número central: ¿descuentan del cupo del plan? (pregunta abierta 4 del PRD de ticket).

Saldo de Meta: ¿se paga a Meta con tarjeta (línea de crédito) o con saldo prepago? Define cómo se mide y alerta el "saldo bajo" [a verificar].

Benchmarks para los comercios: ¿se le muestra algún día a un dueño su posición contra el promedio de su rubro? Requeriría revisar la base legal (PA3.3).

Cuenta de respaldo: ¿de quién es y dónde se guarda la llave física?

Plazo de solo lectura en la baja: ¿30 días alcanza? ¿Y el de retención del backup final (90 días propuestos)?

Cloudflare Access / IP allowlist: ¿vale el costo y la fricción (Mauricio trabaja desde varias redes y el celular)?

## 8. Plan por fases

### Fase 0: diseño y validación legal (1 a 2 semanas)

Revisión con un abogado de los términos, la política de privacidad, los niveles N0–N3 y los plazos de retención; con el contador, los comprobantes del proveedor.

Decidir la cuenta de Google del Superadmin (Workspace o personal) y la cuenta de respaldo.

Diseño de las pantallas (tablero, alertas, directorio, estado de cuenta, ficha del kiosco) y del contrato analytics_v1 / support_v1 con los otros módulos.

### Fase 1: MVP del panel (4 a 6 semanas, junto con los primeros clientes pagos)

PA1 acceso (Google + allowlist + sesiones cortas + reautenticación), PA2 auditoría append-only con réplica al comercio, PA3 aceptación de términos e interruptor de acceso de soporte con pedido puntual.

PA4 job nocturno y periódico, esquema analytics, señales push, indicadores de frescura.

PA5 tablero de ventas y comparación, PA9 deudas operativas, PA10 consumos.

PA6 directorio, PA7 estado de cuenta (pago manual, crédito/descuento, recordatorio en borrador), PA8 política de mora conectada al estado del tenant.

PA11 WhatsApp (cupo gratis del número, servicio, plantillas en USD por kiosco, cupo del plan, calidad, conciliación manual).

PA12 alertas con email; PA13 drill-down de solo lectura.

PA14 alta asistida (job de onboarding), baja con solo lectura, archivo y eliminación programada, reactivación.

PA15 vista de infraestructura y re-ejecución de migraciones; PA16 módulos por plan y overrides; PA17 errores por tenant; PA18 estado de releases y rollout de migraciones canario → todos.

### Fase 2: operación avanzada (meses 2 y 3)

PA15 restaurar backups en base nueva y mover bases entre hosts.

PA18 disparar deploys aprobados y rollbacks desde el panel.

PA1 passkey propia y Cloudflare Access; PA2 copia WORM y verificación de la cadena.

PA7 emisión del comprobante fiscal desde el panel y recordatorios automáticos configurables; PA11 conciliación automática con Meta.

PA12 umbrales editables; PA16 rollout por porcentaje; cohortes y antigüedad de deuda.

### Fase 3: escala (meses 4 a 12)

PA19 modo soporte / impersonación de solo lectura con consentimiento por sesión.

Roles adicionales (soporte_lectura, finanzas) si se suma equipo.

Ajuste por inflación en el tablero; sharding de la base de control o del esquema analytics si se superan ~2.000 comercios (documento de costos 3.4: 4 shards).

## Anexo A: glosario

Campo | Detalle
--- | ---
Producto | Panel de Administración Multi-Kiosco (back-office interno del proveedor), extensión del Control Plane del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Usuario | Solo el proveedor (Mauricio, dueño del sistema), con el rol Superadmin. Ningún comerciante ve este panel: cada dueño y cada empleado sigue viendo únicamente su propio comercio.
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit), "PRD - Onboarding de Nuevos Clientes" (https://docs.google.com/document/d/136yVOwjMHnROHSavhJMdA4rPNWCzTcFrUfq7G71A6Qc/edit), "PRD - Autenticación y Gestión de Usuarios" (https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit), "PRD - Bot de WhatsApp" (https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Caja Digital" (https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), "PRD - Reportes de Rotación de Productos" (https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit), "PRD - Consumos de Servicios" (https://docs.google.com/document/d/1LbXg794HQq7DFq7CvhDosut8wYHlpldKNhzsJg9RWqE/edit), "PRD - Órdenes de Pago" (https://docs.google.com/document/d/1bXI3SwTzhnZDqViAAPUOsnU_2zL3zc0UopNElLiE_ik/edit), "PRD - Facturas de Proveedores" (https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit), "PRD - Modo Offline" (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit), "PRD - Notificaciones por Email" (https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit), "PRD - Ticket de Venta" (https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit), "PRD - Gestión de Precios" (https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit), "PRD - Facturación Electrónica ARCA" (https://docs.google.com/document/d/1qzEZybC4oI2Y1rGKxGnzgaJn1xyR_7uI-rYiqjfBjzg/edit) y "Costos estimados por cliente" (documento de costos: https://docs.google.com/document/d/1h7YaBE-1ZcDfQxt7HWNG-qh5LEraybFIvSngqOnM1pA/edit)
Arquitectura de datos | Una base de datos PostgreSQL por cliente (por comercio), igual que ModoOps, más una base de control del Control Plane: catálogo de dónde vive la base de cada cliente, tenants, usuarios y memberships, suscripciones, identidades de WhatsApp, contadores de uso (whatsapp_usage). Este PRD suma a la base de control el esquema analytics (métricas diarias agregadas por comercio), el directorio de clientes y su estado de cuenta, la allowlist de Superadmins y el registro de auditoría del panel.
Stack | Astro + TypeScript (SSR), Drizzle, cola de jobs (pg-boss / Inngest / cron, como el resto), Postgres propio en VPS Hetzner (primario + réplica) según el documento de costos (3.2 y 3.4), Sentry, CI/CD con GitHub Actions (PRD principal, 6.9)
WhatsApp | Un único número central de WhatsApp Business (WABA y número del proveedor) compartido por todos los comercios. El cupo gratis de 1.000 mensajes de servicio por mes es por número, así que lo comparten todos los clientes (documento de costos, 0.1).

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Revisión diaria en menos de 5 minutos | Desde el login, el tablero y la bandeja de alertas cargan en menos de 2 s (p95) con 500 comercios, porque leen solo de la base de control
O2 | Cero consultas en vivo a N bases para los tableros | Ninguna pantalla agregada abre conexiones a bases de clientes (test automático y métrica de conexiones del panel)
O3 | Frescura conocida | Toda cifra agregada muestra "datos al [fecha y hora]"; el job nocturno termina para el 99% de los comercios antes de las 06:00 (hora de Buenos Aires)
O4 | Cobranza al día | El 100% de los cargos vencidos aparece en "En demora" el mismo día; las transiciones a gracia y suspensión siguen la política configurada sin intervención manual
O5 | Costo de WhatsApp visible | El costo estimado del mes por kiosco (servicio + plantillas) difiere menos de 5% de la factura de Meta en la conciliación mensual
O6 | Detección temprana | Las alertas críticas (backup fallido, migración fallida, calidad del número en rojo, stock negativo sin resolver) llegan por email al Superadmin en menos de 15 minutos
O7 | Trazabilidad total | El 100% de las vistas de datos de negocio de un comercio y de las acciones del Superadmin quedan en el registro de auditoría inmutable, con motivo
O8 | Acceso mínimo | Solo las cuentas de la allowlist entran; el 100% de las acciones destructivas pide reautenticación reciente

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para operar con los primeros clientes pagos
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Según escala y demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
PA1 | Acceso: Google + rol Superadmin | Sign in with Google, allowlist platform_admins en la base de control, 2FA obligatorio en la cuenta de Google, sesión corta, reautenticación para acciones destructivas | Passkey propia del panel como segundo factor (P1), Cloudflare Access / IP allowlist (P1), roles adicionales (P2)
PA2 | Auditoría inmutable | Registro append-only con cadena de hashes de cada vista de datos de un comercio y de cada acción, con motivo; réplica al comercio | Copia WORM externa (P1), informe exportable por comercio (P1)
PA3 | Base legal, minimización y "acceso de soporte" | Cláusulas en términos y política de privacidad, finalidad, datos mínimos, interruptor de acceso de soporte con vencimiento, pedido de acceso caso por caso | Panel de transparencia para el dueño (P1)
PA4 | Agregación y frescura | Job nocturno + job periódico liviano, esquema analytics, rol de solo lectura por base, indicadores de frescura | Re-cálculo selectivo por rango (P1), streaming de señales (P2)
PA5 | Tablero de ventas y comparación | Ventas totales, por kiosco, ranking, tendencia, ticket promedio, comparación entre comercios | Ajuste por inflación (IPC) (P2), cohortes (P1)
PA6 | Directorio de clientes | Ficha comercial y de facturación por cliente, búsqueda y filtros | Importar/actualizar datos desde el padrón de ARCA (P1)
PA7 | Estado de cuenta y cobranza | Cargos, pagos, saldo, estado, historial, registro de cumplimiento, pago manual, crédito/descuento, recordatorio como borrador | Emisión del comprobante fiscal desde el panel (P1), recordatorios automáticos configurables (P1)
PA8 | Reglas de mora y estado del tenant | Política configurable: tolerancia → gracia → suspensión, con prórroga manual auditada | Políticas por segmento (P1)
PA9 | Deudas operativas de cada kiosco | Totales agregados de pedidos impagos, órdenes de pago pendientes y facturas de proveedor impagas | Antigüedad de deuda (aging) (P1)
PA10 | Consumos comparados | Totales de luz, gas, agua y demás servicios por kiosco y su comparación | Por m² o por rubro (P2)
PA11 | Uso y costo de WhatsApp | Cupo gratis del número central, mensajes de servicio y plantillas pagas en USD por kiosco, contra el cupo del plan y el documento de costos | Conciliación automática con la facturación de Meta (P1)
PA12 | Alertas | Bandeja con severidad, deduplicación, reconocer/posponer, email al Superadmin | Reglas editables desde el panel (P1)
PA13 | Drill-down de solo lectura | Resumen de caja, reporte de rotación y datos clave de un comercio, con motivo, consentimiento y auditoría | Comparar dos comercios lado a lado (P1)
PA14 | Ciclo de vida del tenant | Alta (reusa el job de aprovisionamiento de onboarding), baja con solo lectura, exportación y retención, reactivación | Transferencia de titularidad guiada (P1)
PA15 | Infraestructura | Servidores y hosts de bases, ubicación, tamaño, salud, backups, versión de migraciones, colas, errores y costos; re-ejecutar una migración | Restaurar un backup (P1), mover una base de host (P1)
PA16 | Módulos y feature flags | Módulos por plan y overrides por tenant, con motivo y vencimiento | Rollout por porcentaje (P1)
PA17 | Errores por tenant | Conteo de errores por comercio y versión, enlace a Sentry | Agrupación por release y alerta por regresión (P1)
PA18 | Deploys y rollouts de migraciones | Estado de releases por entorno, rollout de migraciones canario → todos, frenado automático | Disparar deploys aprobados y rollbacks desde el panel (P1)
PA19 | Modo soporte / impersonación | — | Solo lectura "como el dueño", con consentimiento expreso por sesión y auditoría (P2)

Nivel | Qué ve el Superadmin | Base de acceso | Ejemplos
--- | --- | --- | ---
N0. Datos propios del proveedor | Directorio de clientes, suscripción, estado de cuenta, uso de WhatsApp (whatsapp_usage), salud técnica (versión, backups, errores, sincronización), estado del tenant | Relación contractual con el cliente: son datos comerciales del proveedor sobre su propio cliente | PA6, PA7, PA8, PA11, PA15, PA17
N1. Métricas agregadas del negocio | Totales diarios por comercio, sin detalle de movimientos ni datos personales de terceros | Cláusula específica de los términos y la política de privacidad, aceptada en el alta (y re-aceptada por los clientes existentes), para operar, dar soporte, prevenir fraude y mejorar el servicio | PA5, PA9, PA10
N2. Detalle de un comercio (drill-down) | Resumen de caja de un día, reporte de rotación, datos clave | Interruptor "acceso de soporte" activado por el Dueño, o pedido puntual aprobado por el Dueño; siempre con motivo y auditoría | PA13
N3. Modo soporte (P2) | Ver la app como la ve el Dueño, solo lectura | Consentimiento expreso por sesión, con vencimiento | PA19

Estado | Significado | Estado del tenant (PA8)
--- | --- | ---
Al día | No hay cargos vencidos impagos; el último cargo está pagado | activo
Pendiente | Hay un cargo emitido que todavía no venció | activo
En demora | Hay un cargo vencido impago, dentro de la tolerancia; se muestran los días de atraso | activo
En gracia | Se superó la tolerancia; corre el período de gracia (por defecto 7 días, F8.4), con la fecha límite | en gracia
Suspendido por falta de pago | Terminó la gracia sin pago; el comercio está en solo lectura, sin borrar datos | suspendido

Alerta | Fuente | Regla por defecto | Severidad
--- | --- | --- | ---
Stock negativo después de sincronizar | tenant_health_signals (anomalías de OF6.7) | Anomalía abierta hace más de 24 h, o más de 5 abiertas en un comercio | Media
Falla de sincronización / dispositivo sin sincronizar | Señales del modo offline y sessions.last_seen_at | Dispositivo con pendientes sin sincronizar hace más de 24 h (aviso) o 60 h (OF14.1); hueco de secuencia (OF4.8, TV3.6); operaciones rechazadas o en cuarentena | Media / Alta
Suscripción en demora, en gracia o por suspenderse | PA7 / PA8 | Entra en gracia; faltan 2 días para la suspensión; pago rechazado | Media
Saldo bajo | PA11 y cuenta de Meta | Kiosco con menos de 10% del cupo del plan o del paquete extra comprado; saldo o límite del medio de pago de Meta del proveedor cerca de agotarse [a verificar cómo lo expone Meta] (sin medio de pago, Meta deja de entregar los mensajes de servicio una vez agotado el cupo gratis) | Media / Crítica
Cupo de mensajes cerca del límite | PA11 | 80% y 100% del cupo del plan; 80% del límite de mensajería del portfolio | Media / Alta
Error de aprovisionamiento | tenant_provisioning (ON3.5) | Tenant en error_aprovisionamiento | Alta
Error de migración | PA18 | Migración fallida en una base | Alta
Calidad del número central | PA11.6 | Calidad amarilla (alta) o roja (crítica); plantilla pausada o rechazada | Alta / Crítica
Backup fallido o viejo | PA15 | Sin backup exitoso en 26 h; restauración de prueba fallida | Crítica
Datos desactualizados | PA4 | Comercio sin agregado hace más de 50 h | Media
Conciliación de stock | Job nocturno de 6.11 del PRD principal y O5 del de rotación | stock_actual ≠ suma de movimientos | Alta
Errores de la app | PA17 | Errores del tenant 5 veces por encima de su promedio de 7 días | Media
Entregabilidad de email | PRD de notificaciones (NE13.6) | Quejas > 0,1% o rebotes > 2% en 24 h | Alta
Cola de jobs | PA15 | Trabajo más viejo pendiente hace más de 30 min; fallas repetidas | Alta
Facturación ARCA | PRD de facturación ARCA (FE6.7, FE11, FE16) | Certificado del computador fiscal a menos de 30 días de vencer; cola de facturación de un comercio pausada por errores de autorización; tarea de delegación pendiente del proveedor (FE2.5) con más de 1 día hábil | Alta / Crítica
Precios | PRD de gestión de precios | Falla del job de ajustes programados o de la recomendación mensual; discrepancias de caché de precios | Media

Documento | Qué usa el panel | Qué habría que alinear allá (propuesta, sin editar ese PRD)
--- | --- | ---
PRD principal | 6.4 (una base por cliente, base de control, catálogo, migraciones escalonadas, backups RPO 24 h / RTO < 4 h, monitoreo por base, impersonación auditada), F8.4 (prueba, gracia de 7 días, solo lectura), F8.5 (exportación), F8.12 (transferencia de titularidad), 6.8 (Mercado Pago), 6.9 (CI/CD, Sentry), 6.11 (conciliación nocturna de stock), F10 (ventas netas de devoluciones) | Sumar al modelo de datos de 6.3 los estados de ciclo de vida (baja_solicitada, en_baja, archivado, eliminado) y aclarar en 3.3 y 6.4 los niveles de acceso N0–N3 de PA3 (las métricas agregadas N1 con base en los términos, el detalle N2 con acceso de soporte).
Onboarding | Job de aprovisionamiento (ON3, 6.2, 6.3) reusado en el alta asistida (PA14.1); lista de altas y "Reintentar" (ON3.8); embudo (ON12); whatsapp_usage con la marca onboarding (ON5.8); modo ejemplo excluido de los agregados (ON10) | Que ON1 registre la aceptación de términos y política en legal_acceptances (PA3.2), y que 3.3 remita a este PRD como definición del Control Plane y del rol Superadmin.
Autenticación | Login con Google, sesiones con hash (AU8), reautenticación (AU10), auditoría (AU12) y su réplica al comercio (AU12.2), suspensión por mora en solo lectura (AU4.7), invitaciones (AU6) para la titularidad en el alta asistida | Agregar el rol superadmin como rol de plataforma (allowlist platform_admins), separado de las memberships; el interruptor "Permitir acceso de soporte" (PA3.6) como acción de Dueño con reautenticación; y que la excepción de la passkey del panel (PA1.6) no cambie la regla de F8.7 para los comercios.
Bot de WhatsApp | whatsapp_identities / bot_links (teléfono del directorio), whatsapp_usage por categoría y tipo de plantilla, calidad del número y límites de mensajería (3.x y 6.4 de ese PRD) | Asegurar que whatsapp_usage registre por mensaje: tenant, categoría (servicio / utilidad), tipo de plantilla, si cuenta en el cupo del plan, si cayó dentro del cupo gratis del número y el costo estimado.
Caja Digital | Resumen de cierre (C12) en el drill-down; hora de corte del cierre automático (C12.1) para programar el job nocturno; devoluciones (C14) para las ventas netas | Exponer una vista support_v1.resumen_cierre con los mismos números del resumen.
Rotación de productos | RT1, RT4, RT5 en el drill-down; tablas diarias de rotación (product_daily_stats) como fuente de los agregados; conciliación nocturna (O5) | Exponer analytics_v1 y support_v1 reutilizando sus agregados diarios, para no recalcular.
Consumos de servicios | Totales por tipo de servicio (CS2, CS5) para PA10 | Ninguno más allá de exponer el total mensual por tipo en analytics_v1; ajustar la frase "nunca ve montos" a los niveles de PA3.
Órdenes de pago | Órdenes pendientes por estado y monto (OP2) para PA9 | Ídem: totales por estado en analytics_v1; la allowlist de dominios de pago (7.3 de ese PRD) se administra desde el panel.
Facturas de proveedores | Facturas impagas en cuenta corriente (FP6) para PA9; métricas de OCR | Ídem.
Modo offline | Anomalías de stock (OF6.7), huecos (OF4.8), dispositivos sin sincronizar y límite de 72 h (OF14.1), operaciones rechazadas | Publicar esas señales como contadores en tenant_health_signals (PA4.3).
Notificaciones por email | Infraestructura de envío (NE11) para las alertas al Superadmin y los recordatorios de cobranza; avisos de cuenta y suscripción (NE7.3); métricas de entregabilidad (NE13.6) | Agregar el tipo "recordatorio de cobranza" (manual por defecto) separado de los avisos obligatorios de NE7.3, y la notificación "Pedido de acceso de soporte" (PA3.7).
Ticket de venta | Envíos por número central (ticket_cliente en whatsapp_usage), calidad del número y suspensión del envío por comercio (TV12.9), huecos de numeración (TV3.6) | Confirmar si los tickets descuentan del cupo del plan (pregunta abierta 4 de ese PRD); el panel muestra ambos casos.
Gestión de Precios | Métricas técnicas de los jobs de ajustes programados y de recomendación mensual, y discrepancias de la verificación de cachés, como alertas (PA12); no se muestran precios ni márgenes de un comercio fuera del drill-down | Exponer contadores de fallas de jobs como señales (PA4.3); ajustar "sin ver precios ni montos" a los niveles de PA3.
Facturación Electrónica ARCA | Bandeja de tareas del proveedor para aceptar la delegación en ARCA y asignar el computador fiscal (FE2.5), alertas del certificado (FE16) y de la cola de facturación (FE6.7, FE11), estado fiscal por tenant (tenant_fiscal_links) en la ficha del comercio | Que las tareas de delegación se muestren en el panel con SLA y que marcarlas como hechas quede auditado (PA2); posible reuso del servicio de facturación para los comprobantes del propio proveedor (PA7.3).
Documento de costos | Tarifas de WhatsApp (1.1), cupo gratis compartido (0.1), escenarios por cliente (8), planes, cupos y paquete extra (9), infraestructura y capacidad por host (3), tipo de cambio | Agregar el costo del panel (sin servidores nuevos en el MVP; Cloudflare Access si se usa) y el costo de almacenamiento de los backups finales de bajas.

Entidad | Campos principales
--- | ---
platform_admins | id, google_sub (único), email, rol (superadmin; reservados soporte_lectura, finanzas), estado (activo / respaldo / revocado), passkeys (P1), created_by, created_at
admin_sessions | id (se guarda el hash), admin_id, created_at, last_seen_at, expira_at (8 h), idle_timeout (30 min), reauth_at, ip, user_agent, revocada_at
admin_audit_log (append-only) | id, occurred_at, admin_id, session_id, ip, user_agent, tenant_id (o lista), accion, recurso, motivo, resultado, detalle (JSON sin datos personales), hash_prev, hash
legal_acceptances | tenant_id, user_id, documento (términos / privacidad), versión, accepted_at, ip
support_consents | tenant_id, otorgado_por, alcance (caja, rotación, datos clave, modo soporte), desde, hasta, revocado_at, origen (interruptor / pedido puntual), request_id
support_access_requests | id, tenant_id, admin_id, motivo, alcance, estado (pendiente / aprobado / rechazado / vencido), respondido_por, respondido_at
customers | id, tipo (persona humana / pyme / empresa), razón social o nombre, CUIT, condición IVA (si hace falta), domicilio fiscal (si hace falta), email de facturación, teléfono de facturación, owner_user_id, plan_id, medio de cobro, created_at (alta), estado, notas
customer_tenants | customer_id, tenant_id
plans / plan_modules | plan: nombre, precio ARS vigente, cupo de mensajes, límites; plan_modules: plan_id, module_id, habilitado, límites
billing_invoices | id, customer_id, tenant_id, período, concepto, monto (centavos ARS), vencimiento, estado (pendiente / pagado / vencido / anulado), comprobante fiscal (tipo, punto de venta, número, CAE), mp_preapproval_id
billing_payments | id, customer_id, monto, fecha, medio (mercado_pago / transferencia / efectivo / otro), operación_id (único por medio), comprobante_url, registrado_por (admin o webhook), imputaciones
billing_ledger_entries (append-only) | id, customer_id, tipo (cargo / pago / nota_credito / bonificacion / ajuste), monto con signo, ref (invoice, payment), motivo, created_by, created_at
billing_credits | id, customer_id, tipo (porcentaje / monto), valor, períodos, desde, motivo, created_by
billing_reminders | id, customer_id, canal (email / wa.me / plantilla), estado (borrador / enviado / descartado), contenido, enviado_por, enviado_at
dunning_policies / dunning_exceptions | política: tolerancia_dias, gracia_dias, suspender (bool), recordatorios automáticos (JSON, apagados por defecto), plan_id; excepción: customer_id, hasta, motivo
tenant_lifecycle_events | tenant_id, de_estado, a_estado, causa (mora / pago / baja / manual / job), admin_id, motivo, occurred_at
tenant_health_signals | tenant_id, tipo (anomalía de stock, hueco, dispositivo atrasado, cierre fallido, conexión vencida), contador, estado, primera_vez, última_vez
alerts / alert_rules | alerta: tipo, tenant_id, severidad, estado (abierta / reconocida / pospuesta / resuelta), contador, abierta_at, resuelta_at, nota; regla: tipo, umbrales, severidad, versión
modules / tenant_feature_overrides | módulo: clave, nombre; override: tenant_id, module_id, habilitado, motivo, vence_at, created_by
infra_hosts | id, rol (app / db_primario / db_réplica / ocr / worker), proveedor, tipo, región, costo mensual, estado
tenant_databases (extendida) | + host_id, tamaño, version_esquema, último backup, última restauración de prueba, estado (activa / migrando / mudándose / archivada)
backups | tenant_id, tipo (diario / semanal / final), ubicación, tamaño, checksum, estado, created_at, expira_at, verificado_at
migration_rollouts / migration_runs | rollout: migración, fase (control / canario / general), estado (en curso / pausado / terminado / abortado), lote; run: tenant_id, migración, estado, error, duración
deployments | entorno, commit, PR, estado, iniciado_por (pipeline / admin), created_at
whatsapp_rates / whatsapp_number_health | tarifa: categoría, país, USD, vigente_desde; salud: fecha, calidad, nivel de límite, uso del límite, plantillas pausadas

Tabla | Campos
--- | ---
analytics.tenant_daily_metrics | tenant_id, fecha, versión, ventas_brutas, devoluciones, ventas_netas, tickets, unidades, ticket_promedio, productos_activos, productos_stock_bajo, anomalías_abiertas, computed_at
analytics.tenant_monthly_consumos | tenant_id, mes, tipo_servicio, total, cantidad_facturas, computed_at
analytics.tenant_debts_snapshot | tenant_id, fecha, pedidos_impagos (cantidad, monto, vencidos), órdenes_pendientes por estado, facturas_impagas, computed_at
analytics.aggregation_runs / analytics.tenant_aggregation_status | corrida, inicio, fin, ok, error, omitidos / tenant_id, última fecha agregada, último éxito, último error

Riesgo | Impacto | Probabilidad | Mitigación
--- | --- | --- | ---
Robo de la sesión o de la cuenta de Google del Superadmin (acceso a todos los comercios) | Muy alto | Baja | 2FA con llave de seguridad, sesiones cortas, reautenticación, allowlist no editable desde el panel, passkey propia (P1), Cloudflare Access (P1), alertas por login nuevo
Acceso del proveedor a datos de negocio percibido como invasivo o sin base legal | Alto | Media | Niveles N0–N3, términos y política claros, acceso de soporte apagado por defecto, actividad visible para el Dueño, revisión con un abogado
Sobrecarga de las bases por la agregación | Medio | Media | Funciones agregadas, réplica, concurrencia por host, horario nocturno, timeouts
Datos desactualizados que llevan a decisiones equivocadas | Medio | Media | Indicadores de frescura, alertas a las 50 h, re-proceso de 3 días
Diferencias entre el agregado y lo que ve el Dueño | Medio | Media | Mismas definiciones (funciones versionadas), test de conciliación, versionado de métricas
Error humano en una acción destructiva (restaurar sobre el comercio equivocado) | Muy alto | Baja | Restaurar siempre en base nueva, pantalla de impacto, escribir el identificador, base anterior conservada 7 días
Un solo Superadmin: si Mauricio pierde el acceso, nadie opera | Alto | Baja | Cuenta de respaldo con llave física guardada, procedimiento documentado
Costos de WhatsApp mal estimados (tarifas de terceros, cambios de Meta) | Alto | Media | Tarifas con vigencia, conciliación mensual con la factura de Meta, alertas de cupo
Suspensiones injustas por fallas del webhook de cobro | Alto | Baja | Pausa global de transiciones, alerta si no llegan webhooks, prórroga manual
Migración que rompe muchas bases a la vez | Muy alto | Baja | Canario, lotes, frenado automático, expand / contract
El panel se vuelve una "puerta trasera" para editar datos de comercios | Alto | Baja | Solo lectura por diseño (roles de base), sin consola SQL, tests de CI

Término | Definición
--- | ---
Control Plane | Aplicación interna del proveedor para operar la plataforma; este PRD la define como el Panel de Administración Multi-Kiosco
Superadmin | Rol de plataforma del proveedor, guardado en la allowlist platform_admins de la base de control; distinto de los roles Dueño y Empleado de los tenants
Base de control | Base central que mapea cada cliente a su base de datos y guarda cuentas, planes, suscripciones, identidades de WhatsApp, uso, el directorio de clientes, el estado de cuenta, el esquema analytics y la auditoría del panel
Esquema analytics | Tablas de métricas diarias agregadas por comercio, sin datos personales, escritas por los jobs de agregación
Drill-down | Consulta bajo demanda, de solo lectura, a la base de un comercio puntual, con motivo, consentimiento y auditoría
Acceso de soporte | Interruptor del Dueño (o aprobación puntual) que habilita el drill-down a su comercio por un tiempo
Estado de cuenta | Libro de cargos, pagos, créditos y saldo de un cliente con el proveedor
Tolerancia / gracia / suspensión | Etapas de la política de mora: atraso sin consecuencias, período de aviso con la app operativa, y solo lectura
Cupo gratis del número | 1.000 mensajes de servicio por mes que Meta no cobra por cada número de empresa; con un número central lo comparten todos los clientes
Plantilla de utilidad | Mensaje de WhatsApp aprobado por Meta (aviso matutino, resumen del viernes, cierre de caja, ticket); se paga siempre, ~USD 0,026 en Argentina [a verificar]
Canario | Grupo chico de bases (internas y beta) donde se aplica primero una migración antes de pasar a todas
Señal (health signal) | Contador o estado que una base de comercio publica en la base de control para alertas, sin datos personales
