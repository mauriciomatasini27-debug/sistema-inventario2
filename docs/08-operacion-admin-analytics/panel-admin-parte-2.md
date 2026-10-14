> Origen: `PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 2 de 3).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/admin`, `src/pages/api/admin/*`

---

# PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 2 de 3)

Documento dividido en 3 partes por tamaño; la numeración es continua. Parte 1 (encabezado, secciones 1 a 3: Resumen, Objetivos y no-objetivos, Usuarios): https://docs.google.com/document/d/1n3E6NmmvCdnXJBuoSAm4YmPRoTCadOM8QI-MCzkSkFA/edit. Parte 2 (este documento): sección 4, Funcionalidades (4.0, PA1 a PA14 y 4.15). Parte 3 (secciones 5 a 8 y Anexo A: Flujos, Notas técnicas, Riesgos, decisiones y preguntas abiertas, Plan por fases, glosario): enlace en el índice de la Parte 1.

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

PA1.8 Reautenticación para acciones destructivas o sensibles: se pide volver a pasar por Google (con prompt=login / max_age [a verificar el soporte de Google], y la passkey en P1) si el último login tiene más de 5 minutos, para: restaurar un backup, mover una base, re-ejecutar o lanzar el rollout de una migración, disparar un deploy o un rollback, dar de baja o reactivar un tenant, suspender o levantar una suspensión a mano, cambiar módulos de un tenant, registrar un pago manual, aplicar un crédito o descuento, enviar un recordatorio, cambiar la política de mora, registrar o cambiar el estado de un servidor y exportar el directorio, los estados de cuenta o la auditoría.

PA1.9 Confirmación reforzada en las acciones irreversibles o de alto impacto (restaurar, mover, baja, rollout a todos): pantalla de impacto ("Afecta a: Kiosco La Esquina · base t_8f3a en db-2 · 0,4 GB · ventana estimada 3 min"), escribir el identificador corto del comercio para confirmar, y motivo obligatorio (texto libre de al menos 10 caracteres o elección de una lista).

PA1.10 Defensa en profundidad: CSP estricta sin scripts de terceros, CSRF en todos los formularios, rate limiting por IP y por cuenta, y (P1) Cloudflare Access o allowlist de IP delante del subdominio [a verificar costo].

PA1.11 Celular: el panel es responsive para mirar el inicio, las alertas y el estado de cuenta. Las acciones de PA11 (restaurar, mover) y PA14 (rollout a todos) solo se habilitan en pantallas de escritorio, para evitar toques accidentales.

PA1.12 Cuenta de respaldo: el ingreso con una cuenta en estado respaldo funciona pero dispara de inmediato un email de alerta a la cuenta principal y queda marcado en la auditoría.

### Criterios de aceptación:

☐ Entro con mi cuenta de Google de Superadmin y veo el inicio; en la base de control mi acceso está en platform_admins con rol superadmin y no tengo ninguna membership en ningún comercio.

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

Descripción: cada acción del Superadmin y cada vez que abre la ficha de un cliente o de un tenant (datos de gestión) queda un registro inmutable con quién, cuándo, qué tenant, qué y por qué. Es la base del cumplimiento (PA3) y de la confianza de los clientes.

### Requerimientos:

PA2.1 Tabla admin_audit_log en la base de control, append-only (sin permisos de UPDATE ni DELETE para ningún rol de la aplicación, con trigger que los rechaza, como stock_movements en 6.11 del PRD principal y auth_events en AU12.1), con cadena de hashes (hash = SHA-256(hash_anterior || registro)) para detectar alteraciones.

PA2.2 Campos: id, occurred_at (timestamptz del servidor), admin_id, session_id, IP, user agent, tenant_id (o null si es global), acción (catálogo cerrado: ver_ficha_cliente, ver_estado_cuenta, editar_datos_facturacion, exportar, registrar_pago_manual, aplicar_credito, enviar_recordatorio, prorroga, suspender, levantar_suspension, cambiar_modulo, rerun_migracion, restaurar_backup, mover_base, registrar_servidor, cambiar_estado_servidor, alta_tenant, baja_tenant, reactivar_tenant, deploy, rollback, rollout_migracion, reconocer_alerta, etc.), recurso, motivo (obligatorio en las acciones), resultado (ok / error / denegado) y un detalle en JSON sin datos personales ni valores sensibles (enmascarados).

PA2.3 Registrar antes de ejecutar: si no se puede escribir el registro de auditoría, la acción no se ejecuta (falla cerrada).

PA2.4 Granularidad de las vistas: abrir el inicio, las listas o las alertas se registra una vez por sesión y por filtro; abrir la ficha de un cliente o su estado de cuenta, cada vez.

PA2.5 Réplica al comercio: las acciones sobre la cuenta de un tenant (baja, reactivación, suspensión o levantamiento manual, prórroga, módulos, restauración o mudanza de su base, re-ejecución de una migración) se replican en el audit_log de la base del comercio como evento "Administración de [Producto]", visible para el Dueño en "Usuarios → Actividad" (coherente con AU12.2), con fecha, hora, acción y motivo. Es una escritura de un evento propio del panel por la cola, no una lectura de datos del comercio.

PA2.6 Búsqueda y exportación del registro por tenant, acción y rango de fechas, desde el panel (la exportación también se audita).

PA2.7 Retención: mínimo 5 años [a verificar con un abogado]; no se borra al dar de baja un tenant (queda con el id del tenant).

PA2.8 (P1) Copia externa inmutable: volcado diario firmado a un bucket con bloqueo de objetos (WORM, por ejemplo Backblaze B2 Object Lock [a verificar]), y verificación nocturna de la cadena de hashes con alerta si se rompe.

### Criterios de aceptación:

☐ Registro un pago manual: aparece un registro con mi admin_id, la hora del servidor, el tenant, "registrar_pago_manual" y el motivo.

☐ Un UPDATE o DELETE sobre admin_audit_log con el usuario de la aplicación falla; si modifico un registro con un superusuario de la base, la verificación de la cadena de hashes lo detecta y alerta.

☐ Si simulo una falla al escribir la auditoría, la acción no se ejecuta y el panel lo explica.

☐ El Dueño del comercio ve en "Usuarios → Actividad": "9/10 10:42 · Administración de [Producto] movió tu base a otro servidor · Motivo: balanceo de carga".

☐ Exporto la auditoría de un tenant del último mes y la exportación misma aparece como un registro nuevo.

☐ El detalle de los registros no contiene datos personales ni valores sin enmascarar.

### PA3. Ley 25.326 y principio "solo datos de gestión" (P0)

Descripción: el proveedor trata solo datos de gestión: los de su relación comercial con cada cliente (directorio, suscripción, estado de cuenta) y los técnicos de la operación (uso, salud, errores, infraestructura). No accede a los datos de la app de ningún tenant bajo ninguna condición (decisión del dueño, 9/10/2026). Esto mantiene, y endurece, el criterio de los demás PRD ("el Control Plane nunca ve montos, caja, stock ni contenido de un comercio"): ya no hay excepción por consentimiento.

### Requerimientos:

PA3.1 Términos del servicio y política de privacidad con un apartado sobre el proveedor: qué datos de gestión procesa (directorio, facturación, cobranza, uso de WhatsApp en cantidades, contadores técnicos, errores sin datos personales), para qué (finalidades cerradas: prestación y operación técnica del servicio, facturación y cobranza, seguridad y prevención de fraude, control de costos), que no accede a los datos de la app del comercio, que las acciones del Superadmin sobre la cuenta quedan registradas y son visibles para el Dueño, plazos de retención y cómo ejercer los derechos de acceso, rectificación y supresión [a verificar con un abogado].

PA3.2 Aceptación registrada: en el alta (pantalla ON1 del onboarding) se registra la versión aceptada de términos y política (legal_acceptances: tenant, usuario, documento, versión, fecha, IP). Si cambia la versión, el Dueño la acepta en el siguiente ingreso.

PA3.3 Limitación de la finalidad: los datos de gestión solo se usan para las finalidades declaradas; nunca se venden, se ceden a terceros ni se usan para publicidad.

PA3.4 Sin datos de la app en el panel, por diseño: (a) los roles de base que usa la plataforma desde el panel no tienen SELECT sobre ninguna tabla de negocio de las bases de comercios; (b) las señales técnicas (PA4) son contadores y estados sin contenido (sin nombres de productos, montos, clientes, empleados ni proveedores); (c) el esquema analytics de la base de control solo tiene métricas técnicas y de uso; (d) un test automático en CI falla si aparece en la base de control o en analytics una columna de negocio (montos de venta, productos, precios, consumos, saldos de fiado, diferencias de turno, conteos, promociones, lotes) o de datos personales de terceros.

PA3.5 Encargado de tratamiento: respecto de los datos personales de terceros que el comercio carga en su app (clientes que reciben tickets, empleados, proveedores personas humanas), el proveedor actúa como prestador de servicios de tratamiento por cuenta del comercio (art. 25 de la Ley 25.326): los aloja y los procesa solo para prestar el servicio, no los usa para otra finalidad y los destruye o devuelve al terminar el contrato (PA10) [a verificar con un abogado]. Las operaciones técnicas sobre la base completa (backup, restauración, mudanza, migración) se hacen sin mostrar su contenido a nadie.

PA3.6 Seguridad y confidencialidad (arts. 9 y 10 de la Ley 25.326): cifrado en tránsito y de los backups, accesos mínimos, auditoría (PA2), y revisión de las medidas de seguridad recomendadas por la AAIP [a verificar con un abogado: Resolución AAIP 47/2018 y su vigencia; inscripción de las bases en el Registro Nacional de Bases de Datos; eventuales cambios por una reforma de la ley].

PA3.7 Datos del directorio: ver PA5.9.

PA3.8 Lista explícita de datos del tenant que el panel nunca ve (ni en detalle, ni como totales, ni en señales): productos y stock, movimientos, ventas y tickets, caja y sus resúmenes, saldos de fiado y cuentas corrientes de los clientes del kiosco, diferencias en el traspaso de turno, conteos de stock o de caja, precios y márgenes, promociones, lotes y vencimientos, facturas de proveedores, órdenes de pago, consumos, clientes finales, empleados y proveedores. Si un PRD futuro agrega un dato de este tipo, entra en esta lista por defecto.

### Criterios de aceptación:

☐ En el alta, el Dueño acepta los términos y la política de privacidad, y en la base de control queda la versión aceptada con fecha.

☐ La política dice expresamente que el proveedor no accede a los datos de la app del comercio.

☐ No existe en el panel ninguna pantalla, botón ni endpoint que muestre productos, ventas, caja, precios, consumos, órdenes de pago, facturas, saldos de fiado, diferencias de turno, conteos, promociones o lotes de un comercio.

☐ Con los roles de base que usa el panel, un SELECT sobre stock_movements, sales o cash_movements de cualquier base de comercio falla por permisos.

☐ El test de esquema de CI falla si agrego a analytics una columna ventas_netas.

### PA4. Contadores técnicos y de uso, sin contenido de negocio (P0)

Descripción: con una base por cliente, el panel no consulta N bases en vivo. Lee solo de la base de control: lo que ya está ahí (suscripción, estado de cuenta, whatsapp_usage, sesiones, aprovisionamiento, catálogo) y señales técnicas que cada base de comercio empuja como contadores y estados sin contenido de negocio.

### Requerimientos:

PA4.1 Señales empujadas (push): cada base de comercio escribe en un outbox local, en la misma transacción del evento, y un worker publica en la base de control (tenant_health_signals) solo tipo, contador y estado: anomalías de stock abiertas tras sincronizar (OF6.7: solo la cantidad, sin producto ni cantidades), hueco de secuencia (OF4.8 / TV3.6), dispositivos con pendientes sin sincronizar y su antigüedad (OF14.1), operaciones rechazadas o en cuarentena (cantidad), cierre automático de caja fallido o resumen no generado (evento sin montos), conexión de Gmail o Google Photos vencida, discrepancia de la conciliación nocturna de stock (6.11 del PRD principal: solo "hay discrepancia", sin datos), falla de los jobs de precios (PRD de gestión de precios) y cola de facturación ARCA pausada (FE11).

PA4.2 Contadores de uso desde la base de control: logins, usuarios activos (cantidad), dispositivos activos y su última conexión (sessions.last_seen_at), módulos activos, mensajes de WhatsApp por categoría (whatsapp_usage), estado del aprovisionamiento y versión de esquema.

PA4.3 Esquema analytics solo técnico: un job diario consolida esos contadores en analytics.tenant_daily_usage (logins, usuarios activos, dispositivos activos, mensajes por categoría, señales por tipo, errores) para ver tendencias de uso y de salud. No hay métricas de negocio (ventas, tickets, consumos, deudas).

PA4.4 Sin lecturas de negocio: el worker de señales usa un rol ops_signals que en la base del comercio solo puede leer y marcar el outbox de señales; no tiene SELECT sobre ninguna otra tabla. Las credenciales se resuelven desde el catálogo; nunca las ve el navegador.

PA4.5 Barrido de respaldo cada 5 minutos por los comercios con señales pendientes (mismo patrón que el PRD de notificaciones), con reintentos y advisory lock.

PA4.6 Indicadores de frescura: cada contador muestra "Datos al 9/10 10:05". Un comercio sin señales ni latido (heartbeat) de su worker en más de 2 horas aparece en amarillo; más de 26 horas, rojo y alerta.

PA4.7 Comercios en modo ejemplo (ON10 del onboarding): sus señales se ignoran.

### Criterios de aceptación:

☐ Una sincronización que deja un producto en −1 genera en la base de control la señal "anomalías de stock abiertas: 1", sin nombre de producto ni cantidades.

☐ Abro el inicio del panel y ninguna consulta sale hacia una base de comercio (verificado con el log de conexiones).

☐ Con el rol ops_signals, un SELECT * FROM products en la base de un comercio falla por permisos.

☐ La tabla analytics.tenant_daily_usage tiene logins, usuarios activos, dispositivos y mensajes por categoría, y ninguna columna de ventas ni montos.

☐ Un comercio cuyo worker no envía latido hace 3 horas aparece en amarillo.

### PA5. Directorio de clientes (P0)

Descripción: la ficha comercial y de facturación de cada cliente del proveedor. Vive toda en la base de control y es un dato propio del proveedor: no viene de la base del comercio ni expone datos de su negocio, así que respeta la regla de "no ver datos del tenant".

### Requerimientos:

PA5.1 Tipo de cliente: kiosco o comercio de una persona humana (dueño, en general monotributista), pyme o empresa. Un cliente puede tener uno o varios comercios (tenants), por ejemplo una pyme con tres sucursales (AU14 del PRD de autenticación, P1).

PA5.2 Datos de la ficha (customers en la base de control):

Razón social o nombre y apellido; nombre comercial de cada comercio.

CUIT (validado con el dígito verificador).

Email de la cuenta de Google del Dueño titular (leído de users, no se duplica a mano) y, opcional, un email de facturación distinto.

Teléfono de contacto (por defecto, el número de WhatsApp verificado del Dueño en whatsapp_identities / bot_links; se puede cargar otro de facturación).

Plan (Básico, Plus, Pro, según el documento de costos, 9), medio de cobro (Mercado Pago Suscripciones o transferencia), y fecha de alta.

Solo si hacen falta para emitir el comprobante del proveedor: condición frente al IVA y domicilio fiscal [a verificar con el contador].

Estado del cliente (prueba, activo, en baja, dado de baja) y notas internas breves (sin datos sensibles).

PA5.3 Lista con búsqueda por nombre, CUIT, email o teléfono, y filtros por plan, tipo de cliente, estado de cuenta (PA6), estado del tenant, rubro y fecha de alta.

PA5.4 Ficha del cliente con pestañas: datos, comercios (tenants) y su estado, estado de cuenta (PA6), uso de WhatsApp (PA8), alertas abiertas (PA9), datos técnicos del tenant (host de su base, versión de esquema, último backup, dispositivos y su última sincronización, errores) y actividad del Superadmin sobre esa cuenta (PA2). Nunca datos de la app del comercio.

PA5.5 Edición de los datos de facturación por el Superadmin, con reautenticación y auditoría (valor anterior y nuevo en el registro, enmascarado). El email del Dueño no se edita desde el panel: es el de su cuenta de Google.

PA5.6 Sincronía con la app: si el Dueño cambia el CUIT o la razón social en su Configuración (AU10.1), la ficha se actualiza y queda el evento.

PA5.7 Exportar el directorio a CSV (auditado), por ejemplo para el contador.

PA5.8 (P1) Padrón de ARCA: completar razón social y condición frente al IVA desde la CUIT con el servicio de constancia de inscripción (ver la investigación de facturación ARCA) [a verificar].

PA5.9 Ley 25.326 para el directorio: son datos personales de los clientes del proveedor (sobre todo si son personas humanas). Su tratamiento es legítimo porque derivan de la relación contractual y son necesarios para cumplirla (art. 5, inc. 2 c) [a verificar con un abogado], pero aplican igual los principios: datos mínimos (solo los de la lista de PA5.2), finalidad (gestión del contrato, facturación, cobranza y soporte), seguridad, confidencialidad, derechos de acceso, rectificación y supresión, y conservación limitada (los datos que exige la normativa fiscal se guardan el plazo legal aunque el cliente se dé de baja [a verificar con el contador]). No se usan para marketing de terceros.

### Criterios de aceptación:

☐ Busco por CUIT y encuentro la ficha de la pyme con sus tres comercios y el estado de cada uno.

☐ La ficha muestra razón social, CUIT, email de la cuenta de Google del Dueño, teléfono, plan y fecha de alta.

☐ Un CUIT con dígito verificador inválido no se puede guardar.

☐ Cambio el email de facturación: me pide reautenticación y el cambio aparece en la auditoría con el valor anterior enmascarado.

☐ El Dueño cambia la razón social en su app y la ficha del panel la muestra actualizada.

☐ La tabla customers no tiene campos fuera de la lista de datos mínimos (test sobre el esquema).

### PA6. Estado de cuenta y cobranza (P0)

Descripción: por cada cliente, el estado de cuenta con lo que el proveedor le facturó o cobró, los pagos recibidos, el saldo y el estado; el historial de pagos y un registro de cumplimiento. Todo en la base de control, en un libro mayor inmutable.

### Requerimientos:

PA6.1 Libro de movimientos (billing_ledger_entries, append-only, montos en centavos de ARS): cargo (cuota del plan del período, paquete extra de mensajes del documento de costos, otros), pago, nota de crédito, bonificación/descuento y ajuste. Saldo = suma de los movimientos. Nada se edita ni se borra; los errores se corrigen con un movimiento compensatorio (mismo principio que el resto del sistema).

PA6.2 Cargos del período: se generan solos según el plan (precio en ARS con ajuste periódico, documento de costos 9.4) con su fecha de vencimiento. Con Mercado Pago Suscripciones (preapproval), el cobro llega por webhook y se concilia automáticamente con el cargo (PRD principal 6.8).

PA6.3 Comprobantes fiscales del proveedor: cada cargo referencia el comprobante emitido por el proveedor (tipo, punto de venta, número, CAE) cuando exista. En el MVP se emite fuera del panel y se carga la referencia; en P1 se emite desde el panel reusando el servicio de facturación del PRD de Facturación Electrónica ARCA [a verificar con el contador el tipo de comprobante según la condición del proveedor].

PA6.4 Estado de la cuenta del cliente (calculado, el peor que corresponda):

PA6.5 Pantalla de estado de cuenta: saldo, estado, próximos vencimientos, días de atraso, y la lista de movimientos con fecha, concepto, comprobante, debe, haber y saldo corrido. Exportable a PDF y CSV (auditado).

PA6.6 Historial de pagos: fecha de vencimiento, fecha de pago, medio (Mercado Pago, transferencia, efectivo, otro), id de la operación, y si fue a tiempo o con atraso (y cuántos días).

PA6.7 Registro de cumplimiento: en los últimos 12 meses, porcentaje de pagos a tiempo, promedio y máximo de días de atraso, cantidad de veces en gracia y en suspensión, y una etiqueta simple (Puntual, Con atrasos ocasionales, Moroso recurrente) con reglas explícitas (por ejemplo, Puntual = 100% a tiempo; Moroso recurrente = 3 o más atrasos de más de 7 días).

PA6.8 Registrar un pago manual (transferencia, efectivo): monto, fecha, medio, número de operación y, opcional, el comprobante adjunto. Se imputa al cargo vencido más viejo salvo que se elija otro; si cubre la deuda, el tenant vuelve a activo según PA7. Reautenticación, motivo y auditoría. Se detectan duplicados por número de operación.

PA6.9 Aplicar un crédito o un descuento: bonificación de un porcentaje o un monto sobre un cargo o sobre los próximos N períodos (por ejemplo, "50% por 2 meses por problemas del servicio"), o nota de crédito sobre un comprobante emitido [a verificar con el contador cuándo corresponde una nota de crédito fiscal]. Reautenticación, motivo y auditoría.

PA6.10 Enviar un recordatorio: por defecto se arma un borrador (email desde el dominio transaccional del producto, con el saldo, los cargos vencidos y el link de pago) que el Superadmin revisa, edita y envía a mano; también puede elegir abrir WhatsApp desde su propio teléfono (link wa.me, sin costo, como TV11 del PRD de ticket) o una plantilla del número central (paga, ~USD 0,026 [a verificar la categoría de la plantilla]). No hay envíos automáticos salvo que se configuren en la política (PA7.5). Cada envío queda auditado y en el historial de la cuenta.

PA6.11 Lista de cobranza: vista con filtros por estado (quién pagó, pendientes, en demora ordenados por días de atraso, en gracia con fecha límite, suspendidos), monto adeudado total y por cliente, plan, medio de cobro y fecha del último recordatorio. Totales arriba: facturado del mes, cobrado, pendiente, en demora.

PA6.12 Morosidad y salida del cliente: la baja de un cliente con saldo deudor no borra la deuda; la cuenta queda "dada de baja con saldo" (PA10).

### Criterios de aceptación:

☐ El estado de cuenta de un cliente muestra cada cargo con su comprobante, cada pago y el saldo corrido, y el saldo coincide con la suma de los movimientos.

☐ Un cargo del 1/10 que vence el 10/10 aparece como Pendiente hasta el 10/10; el 13/10, sin pago, como En demora · 3 días de atraso, con acceso completo y la suspensión prevista para el 25/10 (regla de 14 días, PA7).

☐ Llega el webhook de Mercado Pago del pago y el cargo queda pagado sin intervención; el estado pasa a Al día.

☐ Registro una transferencia de $53.900 de un cliente en gracia: me pide reautenticación y motivo, el cargo queda pagado, el tenant vuelve a activo y queda todo en la auditoría.

☐ Registro dos veces el mismo número de operación y el sistema me avisa del duplicado antes de guardar.

☐ Aplico un descuento del 50% por 2 meses: los próximos dos cargos salen con la bonificación y el motivo figura en la cuenta.

☐ Toco "Enviar recordatorio" y veo un borrador editable; no sale nada hasta que toco "Enviar".

☐ La lista filtrada por "En demora" muestra a los clientes ordenados de mayor a menor atraso con el monto adeudado.

☐ El registro de cumplimiento de un cliente que pagó 12 de 12 meses a tiempo dice "Puntual · 100% a tiempo".

☐ Un UPDATE sobre billing_ledger_entries falla; una corrección se hace con un movimiento de ajuste.

### PA7. Reglas de mora y estado del tenant (P0)

Descripción: la regla que conecta el estado de cuenta con el estado del comercio. Decisión del dueño (9/10/2026): 14 días de tolerancia antes de suspender. Desde la fecha de vencimiento, el comercio pasa por En demora y después En gracia, siempre con acceso completo, y el día 15 sin pago (después de 14 días) queda suspendido (solo lectura, patrón ModoOps, sin borrar datos). El valor es configurable desde el panel (por defecto, 14).

### Requerimientos:

PA7.1 Política de mora (dunning_policies), con valores por defecto:

Parámetros: dias_hasta_suspension (por defecto 14: se suspende el día siguiente, D+15) y dia_inicio_gracia (por defecto D+8, la mitad del plazo), ambos editables desde el panel con reautenticación y auditoría.

Un pago rechazado de Mercado Pago no acorta el plazo: la cuenta queda en demora desde el vencimiento y corre la misma regla.

PA7.2 La política se puede definir por plan y tener excepciones por cliente (por ejemplo, "acuerdo de pago hasta el 30/10"), con vencimiento, motivo y auditoría.

PA7.3 Job diario (06:00, hora de Buenos Aires) que recalcula el estado de cada cuenta y aplica las transiciones del tenant, idempotente, con registro de cada cambio en tenant_lifecycle_events. Las transiciones automáticas se pueden pausar globalmente (por ejemplo, si falla el webhook de Mercado Pago y hay que revisar los cobros).

PA7.4 Acciones manuales del Superadmin: prórroga (extender el plazo N días), suspender ya (por ejemplo, abuso) y levantar la suspensión sin pago (cortesía), con reautenticación, motivo y auditoría; la acción se replica en la actividad del comercio.

PA7.5 Recordatorios de cobranza: por defecto el sistema prepara borradores en los días D+1, D+7 y D+12 (configurables) y los deja en la bandeja "Recordatorios por enviar"; el Superadmin los revisa y los envía a mano (PA6.10). No se envían solos salvo que se active el envío automático en la política (P1). Los avisos obligatorios de estado de NE7.3 del PRD de notificaciones (pago rechazado, inicio de la gracia, aviso antes de la suspensión, paso a solo lectura, reactivación) se mantienen, ajustados al plazo de 14 días (ver 4.15).

PA7.6 Al pagar, el tenant vuelve a activo en el momento en que se registra el pago (webhook o pago manual), sin esperar al job diario.

### Criterios de aceptación:

☐ Con la política por defecto, un cargo vencido el 10/10 sin pago deja la cuenta En demora del 11 al 17/10 y En gracia del 18 al 24/10, con acceso completo en los dos tramos, y Suspendida desde el 25/10 (día 15), con el comercio en solo lectura.

☐ Cambio dias_hasta_suspension a 20 desde el panel: me pide reautenticación, queda auditado y los cargos vencidos pasan a suspenderse el día 21.

☐ Los días 11/10, 17/10 y 22/10 aparecen borradores de recordatorio en "Recordatorios por enviar" y no sale ningún mensaje hasta que yo toco "Enviar".

☐ Un pago rechazado de Mercado Pago el 10/10 no adelanta la suspensión: sigue siendo el 25/10.

☐ Cargo una excepción "acuerdo de pago hasta el 30/10" y el comercio no se suspende antes de esa fecha.

☐ Pauso las transiciones automáticas y ningún comercio cambia de estado hasta que las reactivo.

☐ Un pago registrado durante la suspensión devuelve el acceso completo en menos de 1 minuto.

☐ Cada transición queda en tenant_lifecycle_events y en la actividad del comercio.

### PA8. Uso de mensajes del bot y costo de WhatsApp por kiosco (P0)

Descripción: WhatsApp es el principal costo variable (documento de costos, 0). Con un número central, hay que mirar dos cosas distintas: el cupo gratis del número (compartido por todos) y lo que se paga (mensajes de servicio por encima del cupo y plantillas de utilidad, que se pagan siempre).

### Cómo se cobra (según el documento de costos y la documentación de Meta, desde el 1/10/2026):

Mensajes de servicio (respuestas libres del bot dentro de la ventana de 24 h abierta por el usuario, es decir, conversaciones iniciadas por el usuario): 1.000 gratis por mes por número de la empresa, sin acumular. Con un solo número, ese cupo se reparte entre todos los clientes (2 mensajes por cliente con 500 clientes). Por encima, ~USD 0,026 cada uno.

Plantillas de utilidad (aviso matutino, resumen del viernes, resumen de cierre de caja, avisos de pedidos y vencimientos, ticket por el número central): ~USD 0,026 cada una [a verificar contra la tarifa oficial de Meta], cobradas incluso dentro de la ventana abierta y sin cupo gratis.

El cupo de cada plan (Básico 100, Plus 300, Pro 600 "mensajes del bot" por mes, documento de costos 9) cuenta mensajes de servicio; las plantillas de alerta van incluidas aparte. Los tickets por el número central descuentan del cupo según la propuesta del PRD de ticket (TV12.4, pendiente de confirmar). Los mensajes del onboarding se marcan onboarding y no descuentan del cupo (ON5.8).

### Requerimientos:

PA8.1 Tarjeta del número central (mes en curso): mensajes de servicio entregados en total y consumo del cupo gratis ("1.000 de 1.000 usados · agotado el 2/10"); mensajes de servicio pagos; plantillas por tipo; costo estimado total en USD y en ARS (tipo de cambio del documento de costos, con la fecha); proyección a fin de mes.

PA8.2 Por kiosco (de whatsapp_usage, sin contenido de mensajes): mensajes de servicio del mes contra el cupo del plan (barra "280 / 300"), plantillas pagas por tipo (aviso_matutino, resumen_semanal, resumen_cierre_caja, ticket_venta, pedidos, vencimientos, onboarding) con su costo en USD, costo de servicio en USD, su parte prorrateada del cupo gratis (1.000 / cantidad de comercios activos, como en la sección 8 del documento de costos) y el costo total estimado del mes.

PA8.3 Contra el documento de costos: cada kiosco se compara con el escenario de referencia (liviano, bajo, medio, alto: 5, 20, 35, 50 conversaciones por día) y con el margen de su plan (precio del plan − costo estimado de WhatsApp − infraestructura prorrateada), marcando los que quedan debajo del margen objetivo (60–80%, documento de costos 9).

PA8.4 Cupos: aviso cuando un kiosco llega al 80% y al 100% del cupo del plan (PA9), y sugerencia de paquete extra (USD 8 por 100 mensajes) o cambio de plan.

PA8.5 Límite de mensajería del portfolio (usuarios únicos fuera de ventana por 24 h: 250, 2.000 tras verificar el negocio, después 10.000, 100.000 e ilimitado) con el nivel actual y el uso del día, y alerta al 80% (documento de costos 0.1 y TV12.8).

PA8.6 Calidad del número (verde, amarillo, rojo) y estado de las plantillas (aprobada, pausada, rechazada), leídos de la API de Meta y de los webhooks de calidad [a verificar los campos y eventos de la Cloud API]; por kiosco, tasa de bloqueos o reportes cuando Meta la informe, para poder pausar el envío de un comercio (TV12.9).

PA8.7 Conciliación mensual: el costo estimado del mes se compara con la facturación real de Meta (P0 manual: cargar el total de la factura; P1 automático con la API de analíticas de precios de la WABA [a verificar]). Diferencia mayor a 5% → alerta.

PA8.8 Tarifa por categoría configurable (whatsapp_rates, con vigencia), para recalcular si Meta cambia precios (puede hacerlo el 1/1, 1/4, 1/7 y 1/10, documento de costos 9.5).

### Criterios de aceptación:

☐ La tarjeta del número central muestra cuántos de los 1.000 mensajes de servicio gratis se usaron este mes y la fecha en que se agotaron.

☐ Para un kiosco Plus veo "280 / 300 mensajes del bot", 55 plantillas pagas (21 avisos matutinos, 4 resúmenes del viernes, 30 cierres de caja) = USD 1,43, y el costo total estimado del mes.

☐ Las plantillas nunca descuentan del cupo gratis del número ni aparecen como "gratis".

☐ Los mensajes de onboarding aparecen separados y no suman al cupo del plan.

☐ Un kiosco que llega al 80% del cupo aparece en la bandeja de alertas.

☐ Cambio la tarifa de utilidad a USD 0,0247 con vigencia desde el 1/1 y los costos de enero se recalculan con la tarifa nueva, sin tocar los meses anteriores.

☐ Cargo el total de la factura de Meta de septiembre y veo la diferencia contra el estimado.

### PA9. Alertas técnicas de comercios y servidores (P0)

Descripción: una bandeja única con lo que hay que mirar, ordenada por severidad, con email al Superadmin para lo crítico. Las alertas se arman solo con datos de gestión y contadores técnicos (PA4): nunca muestran contenido de la app del comercio.

### Requerimientos:

PA9.1 Catálogo de alertas (reglas versionadas en el código; umbrales configurables desde el panel en P1):

PA9.2 Deduplicación: una alerta por (tipo, tenant o host) abierta a la vez; las repeticiones suman un contador.

PA9.3 Ciclo: abierta → reconocida → resuelta (sola, cuando la condición desaparece, o a mano con nota); posponer 4 h, 24 h o hasta una fecha.

PA9.4 Avisos al Superadmin: las críticas y altas, por email inmediato (infraestructura de NE11 del PRD de notificaciones); las medias, en un resumen diario a las 08:00. No se usan plantillas de WhatsApp para estas alertas (costo y límite de mensajería), salvo que se configure (P1).

PA9.5 Cada alerta lleva a la pantalla de gestión donde se resuelve (ficha del cliente, estado de cuenta, infraestructura, releases). Cuando el problema necesita que el Dueño actúe sobre sus datos, la acción del panel es contactarlo (email o WhatsApp personal), nunca entrar a su comercio.

PA9.6 Las alertas de un comercio muestran solo contadores y estados técnicos: por ejemplo, "3 anomalías de stock abiertas · 1 dispositivo sin sincronizar hace 30 h".

### Criterios de aceptación:

☐ Una sincronización que deja un producto en −1 genera la señal; si sigue abierta a las 24 h, aparece la alerta "Anomalías de stock sin resolver: 1", sin nombre de producto.

☐ Un celular con pendientes sin sincronizar hace 60 h genera una alerta alta con el comercio y el identificador del dispositivo.

☐ La calidad del número pasa a amarillo y en menos de 15 minutos me llega un email.

☐ Un host de base al 80% de su capacidad genera una alerta alta.

☐ Dos fallas iguales del mismo comercio no crean dos alertas, sino una con contador 2.

☐ Pospongo una alerta 24 h y no vuelve a aparecer hasta entonces, salvo que suba de severidad.

☐ Cuando el dueño resuelve la anomalía en su app, la alerta se cierra sola en la siguiente señal.

### PA10. Ciclo de vida del tenant: alta, baja y reactivación (P0)

Descripción: el Superadmin gestiona el ciclo de vida de cada comercio. El alta reusa el job de aprovisionamiento del onboarding; la baja nunca es un borrado inmediato.

### Requerimientos:

PA10.1 Alta asistida: el Superadmin crea un comercio (por ejemplo, una venta en persona) con nombre, rubro, plan, datos de facturación (PA5) y email de Google del futuro Dueño. El sistema crea el tenant y su base con el mismo job idempotente de ON3 / 6.2 del onboarding (tenant_provisioning, reintentos, rollback de 6.3) y envía al Dueño una invitación de titularidad (como AU6, con token de un solo uso). El Superadmin no recibe una membership: el comercio queda sin operar hasta que el Dueño acepta con su cuenta de Google.

PA10.2 Altas del onboarding: la lista de altas por estado (aprovisionando, activo, error) con el paso que falló y el botón "Reintentar" de ON3.8 se integran acá; también el embudo de ON12 y la bandeja de tareas de delegación de ARCA del proveedor (FE2.5 del PRD de facturación), marcadas como hechas con auditoría.

PA10.3 Estados de ciclo de vida (además de prueba, activo, en gracia, suspendido del PRD principal): baja_solicitada → en_baja (solo lectura) → archivado → eliminado.

PA10.4 Baja (pedida por el Dueño desde F8.4, o por el proveedor por mora prolongada o incumplimiento): el tenant pasa a en_baja con solo lectura durante 30 días [plazo a definir]: el Dueño puede entrar, ver y exportar todos sus datos (F8.5: productos, movimientos, caja, etc., en CSV/Excel). El bot deja de responder con datos y se cancelan las plantillas programadas. Se dan de baja los cobros futuros de Mercado Pago.

PA10.5 Archivado: al terminar el período, se hace un backup final cifrado de la base, se desconecta del catálogo activo y se borra la base viva. El backup se conserva el plazo de retención de la política (por ejemplo, 90 días) [a verificar con un abogado] para una eventual reactivación.

PA10.6 Eliminación: al vencer la retención, un job borra el backup final y las copias, y deja un certificado de eliminación (tenant, fecha, qué se borró, hashes) en la auditoría. Se conservan solo los datos que el proveedor necesita por obligación propia: directorio y estado de cuenta (PA5, PA6) el plazo fiscal, y la auditoría (PA2.7) [a verificar con un abogado y el contador]. La eliminación programada se puede cancelar hasta el último día y avisa al Dueño 7 días antes.

PA10.7 Nunca un borrado duro inmediato: no existe un botón para borrar una base en el momento. Si el Dueño pide la supresión anticipada (derecho de supresión), se adelanta el proceso con reautenticación, motivo y una espera mínima de 72 h cancelable.

PA10.8 Reactivación: desde suspendido (al pagar, PA7.6) o desde en_baja (vuelve a activo, con el mismo plan o uno nuevo) es inmediata; desde archivado se restaura el backup final en una base nueva (PA11) y se vuelve a registrar en el catálogo. Desde eliminado no hay reactivación: es un alta nueva.

PA10.9 Deudas y estado de pago visibles en cada paso: dar de baja a un cliente con saldo no cancela la deuda (PA6.12) y se avisa antes de confirmar.

PA10.10 Todas las transiciones con reautenticación (PA1.8), motivo, auditoría y aviso por email al Dueño (NE7).

### Criterios de aceptación:

☐ Doy de alta "Almacén Don José" desde el panel: se crea una sola base, el tenant queda esperando al Dueño y a José le llega la invitación; yo no aparezco como usuario del comercio.

☐ Ejecutar dos veces el alta asistida para el mismo comercio deja una sola base y un solo registro en el catálogo.

☐ Doy de baja un comercio: queda en solo lectura, el Dueño puede exportar todo durante 30 días y el bot le responde que el comercio está dado de baja.

☐ No existe ninguna acción que borre una base en el momento.

☐ Al terminar los 30 días queda el backup final cifrado y la base viva se elimina; al vencer la retención se borra el backup y queda el certificado de eliminación.

☐ Reactivo un comercio archivado: su base se restaura y el Dueño vuelve a entrar con sus datos.

☐ Al intentar dar de baja un cliente con $53.900 adeudados, el panel me lo avisa antes de confirmar.

### PA11. Infraestructura: servidores, bases, backups, colas y costos (P0 vista y re-ejecutar migración / P1 restaurar y mover)

Descripción: ver y gestionar la infraestructura sin conectarse por SSH: servidores y hosts de bases, dónde vive cada base de tenant, tamaño, salud, backups, versión de migraciones, colas y jobs, tasa de errores y costos. Las acciones son jobs versionados, con confirmación y auditoría; no hay consola SQL ni shell.

### Requerimientos:

PA11.1 Servidores (infra_hosts): app/API, hosts de Postgres (primario y réplica), OCR, workers; proveedor (Hetzner), tipo (CX33, CX43, CX53), región, estado, CPU, memoria, disco, y costo mensual (precios del documento de costos 3.1, editables con vigencia).

PA11.2 Bases de tenants (catálogo tenant_databases extendido): host, nombre de la base, tamaño, conexiones, versión de esquema, último backup exitoso y última restauración de prueba, estado (activa, en migración, en mudanza, archivada). Filtro por host para ver la ocupación (capacidad orientativa: CX33 ~100 bases, CX53 ~500, documento de costos 3.2 [a verificar con pruebas de carga]).

PA11.3 Salud: por host, lag de replicación, conexiones contra el límite de PgBouncer, uso de disco, y por servicio, tiempos de respuesta y uptime.

PA11.4 Backups: estado del backup diario por base y del export lógico semanal (PRD principal 6.4: RPO 24 h, RTO menor a 4 h), resultado de las restauraciones de prueba periódicas (por ejemplo, 5 bases al azar por semana) y tamaño en el almacenamiento (Backblaze B2).

PA11.5 Colas y jobs: pendientes, edad del más viejo, fallados y reintentos por tipo (aprovisionamiento, señales técnicas, notificaciones, OCR, cobros, mora), con enlace al detalle del error.

PA11.6 Errores y costos: tasa de errores por servicio (PA13) y costo mensual total de infraestructura y por cliente (infraestructura fija / clientes activos), comparado con el documento de costos (3.4).

PA11.7 Acción: re-ejecutar una migración (P0) en una base que quedó atrasada o falló: usa el runner versionado (Drizzle); solo aplica migraciones del repositorio ya desplegadas; idempotente.

PA11.8 Acción: restaurar un backup (P1): siempre en una base nueva (nunca sobre la base viva), verificación técnica automática (conteos de filas por tabla, checksums, versión de esquema; sin mostrar contenido), vista previa y, recién después, el cambio del catálogo a la base restaurada con el comercio en modo mantenimiento unos minutos. La base anterior queda renombrada y se conserva 7 días.

PA11.9 Acción: mover una base de host (P1), por ejemplo para balancear carga: copia (dump/restore o replicación lógica [a verificar]), verificación, ventana corta de solo lectura, cambio en el catálogo, y la base de origen se conserva 7 días antes de borrarse.

PA11.10 Las acciones de PA11.7–PA11.9 y PA11.14 piden reautenticación, pantalla de impacto, escribir el identificador del comercio y motivo (PA1.8, PA1.9); se ejecutan como jobs con estado visible y quedan en la auditoría y en la actividad del comercio. Solo desde una pantalla de escritorio.

PA11.11 Registro de servidores (multi-servidor): infra_hosts es la fuente de verdad de todos los servidores de la plataforma (app/API, hosts de Postgres primario y réplica, OCR, workers), con alta y baja de un host desde el panel (solo registro y verificación de conectividad; la creación de la máquina se hace en el proveedor o con infraestructura como código en el repositorio). Cada host tiene capacidad declarada (bases máximas, disco, conexiones) y estado (activo, drenando = no recibe tenants nuevos, mantenimiento, retirado).

PA11.12 Qué tenants viven en cada servidor: vista por host con la lista de tenants y sus bases, ocupación contra la capacidad (por ejemplo, "db-2: 412 / 500 bases · disco 61% · conexiones 38%") y alerta al 80% de cualquier límite (PA9). Desde la ficha de un tenant se ve en qué host está su base primaria y su réplica.

PA11.13 Ubicación de tenants nuevos: el alta (PA10.1 y ON3) elige el host según una política de ubicación (el host activo con más capacidad libre, o uno fijo elegido a mano), registrada en el catálogo.

PA11.14 Mover tenants entre servidores (PA11.9), de a uno o en lote (por ejemplo, para drenar un host antes de retirarlo), con la misma secuencia de copia, verificación, ventana corta de solo lectura y cambio en el catálogo; un host drenando no se puede retirar mientras tenga bases.

### Criterios de aceptación:

☐ Veo cada host de base con cuántas bases tiene, su disco, sus conexiones y su costo mensual.

☐ Busco un comercio y veo en qué host está su base, su tamaño, su versión de esquema y la hora de su último backup.

☐ Una base sin backup exitoso en 26 h aparece en rojo y genera la alerta crítica.

☐ Re-ejecuto la migración fallida de un comercio: el job la aplica, la versión de esquema se actualiza en el catálogo y queda auditado.

☐ (P1) Restauro el backup de ayer de un comercio: se crea una base nueva, pasa la verificación y recién al confirmar el comercio apunta a ella; la base anterior sigue existiendo 7 días.

☐ (P1) Muevo una base de db-1 a db-2 y el comercio queda en solo lectura menos de 5 minutos.

☐ Veo la lista de todos los servidores con su rol, capacidad y ocupación, y por cada host de base la lista de tenants que viven ahí.

☐ Marco db-1 como drenando: los tenants nuevos se crean en otro host y (P1) puedo mover en lote sus bases; no puedo retirarlo hasta que quede vacío.

☐ Un host al 80% de su capacidad de bases genera una alerta.

☐ No existe ninguna pantalla para escribir SQL ni comandos de servidor.

### PA12. Módulos por tenant o por plan con feature flags (P0)

Descripción: activar o desactivar módulos según el plan o para un comercio puntual (beta, cortesía, problema), sin desplegar código.

### Requerimientos:

PA12.1 Catálogo de módulos (modules): inventario (siempre activo), caja digital, facturas de proveedores, órdenes de pago, consumos de servicios, rotación, ticket por número central (TV12), lectura de Gmail (beta cerrada, C13/CS1), modo offline, bot de WhatsApp y los que se agreguen.

PA12.2 Por plan (plan_modules): qué módulos y límites trae cada plan (cupo de mensajes, usuarios, productos), en línea con el documento de costos (9). Un cambio en un plan se aplica a todos sus comercios.

PA12.3 Override por tenant (tenant_feature_overrides): activar o desactivar un módulo con motivo y vencimiento opcional (por ejemplo, "beta de Gmail hasta el 31/12").

PA12.4 Evaluación en el backend en cada request (con caché de pocos segundos e invalidación explícita): un módulo apagado oculta la UI y responde 403 en la API y en el bot. Apagar un módulo nunca borra sus datos; al volver a encenderlo, están.

PA12.5 (P1) Rollout por porcentaje de un módulo nuevo (por ejemplo, 10% de los comercios Pro) y lista de comercios beta.

PA12.6 Cada cambio con reautenticación, auditoría y aviso en la actividad del comercio.

### Criterios de aceptación:

☐ Activo "Órdenes de pago" para un comercio Básico con el motivo "prueba comercial" y vencimiento el 31/10: el Dueño lo ve en su app y el 1/11 desaparece.

☐ Apago "Consumos" para un comercio: la pantalla desaparece, la API responde 403 y, al reactivarlo, los consumos cargados siguen ahí.

☐ Cambio el cupo del plan Plus de 300 a 350 y se aplica a todos los comercios Plus desde el próximo período.

### PA13. Errores por tenant (P0)

Descripción: ver los errores de la app y del backend por comercio, al estilo Sentry, para detectar quién está teniendo problemas.

### Requerimientos:

PA13.1 Los eventos de Sentry (frontend, backend, bot, jobs) llevan las etiquetas tenant_id (identificador seudónimo, no el nombre), release y device_id cuando aplica; sin datos personales en los eventos (PRD principal 6.9).

PA13.2 El panel muestra por comercio la cantidad de errores en 24 h y 7 días, los tipos más frecuentes y el release, con enlace al issue en Sentry; y por release, cuántos comercios afectados.

PA13.3 Alerta cuando un comercio supera 5 veces su promedio de 7 días (PA9) o cuando un release nuevo aumenta los errores (P1, ligado a PA14).

### Criterios de aceptación:

☐ Un error en el bot de un comercio aparece en su ficha con el tipo, el release y el enlace al issue de Sentry.

☐ Los eventos de Sentry no contienen nombres, emails ni teléfonos (revisión con una muestra).

### PA14. Deploys y rollouts de migraciones por el pipeline de CI/CD (P0 estado y rollout de migraciones / P1 disparar deploys y rollbacks)

Descripción: el panel no edita código en vivo. Los cambios de código y las correcciones de bugs se hacen en el repositorio (git), con pull request, revisión y CI (lint, tests, tests de aislamiento entre comercios, PRD principal 6.9), y el pipeline los despliega (GitHub Actions hacia Cloudflare Workers, Vercel o el VPS, según el documento de costos 3.3). El panel muestra el estado, dispara deploys ya aprobados o rollbacks y ejecuta las migraciones versionadas en el repositorio.

### Requerimientos:

PA14.1 Estado de releases: por entorno (staging, producción), versión desplegada (commit, PR, autor, fecha), estado de CI y del deploy, y el historial de los últimos releases.

PA14.2 Rollout de migraciones por tenant (P0): la migración nueva se aplica primero a la base de control, después a un grupo canario (bases internas, comercios de prueba y beta, PRD principal 6.4), y recién después a todos, por lotes (por ejemplo, 50 bases a la vez por host), con avance visible ("312 / 500 migradas · 0 errores").

PA14.3 Frenado automático: si una migración falla en más de N bases (por defecto 1 en el canario, 1% en el rollout general) o suben los errores (PA13), el rollout se pausa y alerta (PA9). Se puede reanudar o abortar.

PA14.4 Migraciones compatibles hacia atrás (patrón expand / contract): como durante el rollout conviven bases con versiones distintas, el código desplegado tiene que funcionar con la versión anterior y la nueva del esquema; las migraciones destructivas (borrar columnas) van en un release posterior. Lo controla la revisión del PR y un check de CI.

PA14.5 (P1) Disparar un deploy aprobado: solo de un commit que ya está en la rama principal y pasó CI (llamada al workflow_dispatch del pipeline); el panel no permite elegir commits sin CI ni ramas arbitrarias.

PA14.6 (P1) Rollback al release anterior (redeploy del artefacto previo). Si el release incluía migraciones, el rollback de código es posible porque las migraciones son compatibles hacia atrás; no se revierten migraciones automáticamente: se corrige con una migración nueva desde el repositorio.

PA14.7 Todas las acciones con reautenticación, motivo y auditoría; el token del panel hacia GitHub tiene permisos mínimos (solo disparar los workflows de deploy y leer estados) y vive en el servidor.

### Criterios de aceptación:

☐ Veo qué commit está en producción, con su PR y el resultado de CI.

☐ Lanzo el rollout de una migración: se aplica a la base de control y al canario; recién cuando confirmo, avanza al resto por lotes.

☐ Simulo una falla en una base del canario y el rollout se pausa solo con una alerta.

☐ (P1) Disparo el deploy de un commit de la rama principal con CI en verde; un commit sin CI no aparece como opción.

☐ (P1) Hago rollback al release anterior y la app vuelve a funcionar con las bases ya migradas.

☐ No existe ninguna forma de editar código, archivos ni variables de entorno desde el panel.

### 4.15 Integración con los demás PRD y con el documento de costos

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para operar con los primeros clientes pagos
P1 - Post-MVP cercano | Dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Según escala y demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
PA1 | Acceso: Google + rol Superadmin | Sign in with Google, allowlist platform_admins en la base de control, 2FA obligatorio en la cuenta de Google, sesión corta, reautenticación para acciones destructivas | Passkey propia del panel como segundo factor (P1), Cloudflare Access / IP allowlist (P1), roles adicionales (P2)
PA2 | Auditoría inmutable | Registro append-only con cadena de hashes de cada acción y de cada vista de fichas de clientes, con motivo; réplica al comercio de las acciones sobre su cuenta | Copia WORM externa (P1), informe exportable por comercio (P1)
PA3 | Ley 25.326 y principio "solo datos de gestión" | Cláusulas en términos y política, aceptación registrada, finalidad, datos mínimos, sin acceso a datos de la app, test de esquema | Panel de transparencia para el dueño (P1)
PA4 | Contadores técnicos y de uso | Señales técnicas empujadas por cada base (sin contenido de negocio), contadores de uso desde la base de control, esquema analytics solo técnico, indicadores de frescura | Re-cálculo selectivo (P1)
PA5 | Directorio de clientes | Ficha comercial y de facturación por cliente, búsqueda y filtros | Datos desde el padrón de ARCA (P1)
PA6 | Estado de cuenta y cobranza | Cargos, pagos, saldo, estado, historial, registro de cumplimiento, pago manual, crédito/descuento, recordatorio como borrador, lista por estado | Emisión del comprobante fiscal desde el panel (P1), recordatorios automáticos configurables (P1)
PA7 | Reglas de mora y estado del tenant | 14 días desde el vencimiento con acceso completo (demora y gracia), suspensión el día 15, configurable; prórroga manual auditada | Políticas por segmento (P1)
PA8 | Uso y costo de WhatsApp | Cupo gratis del número central, mensajes de servicio y plantillas pagas en USD por kiosco, contra el cupo del plan y el documento de costos (solo contadores) | Conciliación automática con la facturación de Meta (P1)
PA9 | Alertas técnicas | Bandeja con severidad, deduplicación, reconocer/posponer, email al Superadmin | Umbrales editables desde el panel (P1)
PA10 | Ciclo de vida del tenant | Alta (reusa el job de aprovisionamiento de onboarding), baja con solo lectura para el Dueño, exportación por el Dueño, retención y eliminación, reactivación | Transferencia de titularidad guiada (P1)
PA11 | Infraestructura multi-servidor | Registro de servidores y hosts de bases, qué tenants viven en cada uno, capacidad, salud, backups, versión de migraciones, colas, errores y costos; re-ejecutar una migración; política de ubicación de tenants nuevos | Restaurar un backup (P1), mover tenants entre servidores, de a uno o en lote (P1)
PA12 | Módulos y feature flags | Módulos por plan y overrides por tenant, con motivo y vencimiento | Rollout por porcentaje (P1)
PA13 | Errores por tenant | Conteo de errores por comercio y versión, enlace a Sentry (sin datos personales) | Alerta por regresión de release (P1)
PA14 | Deploys y rollouts de migraciones | Estado de releases por entorno, rollout de migraciones canario → todos, frenado automático | Disparar deploys aprobados y rollbacks desde el panel (P1)

Estado | Significado | Estado del tenant (PA7)
--- | --- | ---
Al día | No hay cargos vencidos impagos; el último cargo está pagado | activo
Pendiente | Hay un cargo emitido que todavía no venció | activo
En demora | Hay un cargo vencido impago, de D+1 a D+7 (por defecto); se muestran los días de atraso; acceso completo | activo
En gracia | Sigue impago de D+8 a D+14 (por defecto); acceso completo, con la fecha de suspensión visible | en gracia
Suspendido por falta de pago | Desde D+15 (después de 14 días sin pagar, valor configurable); el comercio está en solo lectura, sin borrar datos | suspendido

Días desde el vencimiento (D) | Estado de la cuenta | Estado del tenant | Acceso
--- | --- | --- | ---
Antes de D | Pendiente | activo | Completo
D+1 a D+7 | En demora (con los días de atraso) | activo | Completo
D+8 a D+14 | En gracia (con la fecha de suspensión) | en gracia | Completo, con aviso visible en la app
D+15 en adelante | Suspendido por falta de pago | suspendido | Solo lectura (AU4.7: el Dueño puede pagar y exportar sus datos)

Alerta | Fuente | Regla por defecto | Severidad
--- | --- | --- | ---
Anomalías de stock tras sincronizar | Señal de OF6.7 (solo la cantidad) | Anomalías abiertas hace más de 24 h o más de 5 en un comercio: indica un problema de sincronización a revisar técnicamente. El Dueño ya recibe el aviso con el detalle en su app | Media
Falla de sincronización / dispositivo sin sincronizar | Señales del modo offline y sessions.last_seen_at | Dispositivo con pendientes sin sincronizar hace más de 24 h (aviso) o 60 h (OF14.1); hueco de secuencia (OF4.8, TV3.6); operaciones rechazadas o en cuarentena | Media / Alta
Cuenta en demora, en gracia o por suspenderse | PA6 / PA7 | Entra en gracia (D+8); faltan 2 días para la suspensión (D+13); suspensión aplicada | Media
Saldo bajo | PA8 y cuenta de Meta | Kiosco con menos de 10% del cupo del plan o del paquete extra; saldo o límite del medio de pago de Meta del proveedor cerca de agotarse [a verificar cómo lo expone Meta] (sin medio de pago, Meta deja de entregar los mensajes de servicio una vez agotado el cupo gratis) | Media / Crítica
Cupo de mensajes cerca del límite | PA8 | 80% y 100% del cupo del plan; 80% del límite de mensajería del portfolio | Media / Alta
Error de aprovisionamiento | tenant_provisioning (ON3.5) | Tenant en error_aprovisionamiento | Alta
Error de migración | PA14 | Migración fallida en una base | Alta
Calidad del número central | PA8.6 | Calidad amarilla (alta) o roja (crítica); plantilla pausada o rechazada | Alta / Crítica
Backup fallido o viejo | PA11 | Sin backup exitoso en 26 h; restauración de prueba fallida | Crítica
Servidor cerca del límite | PA11.12 | 80% de la capacidad de bases, disco o conexiones de un host; lag de replicación alto | Alta
Señales atrasadas | PA4.6 | Comercio sin latido de su worker hace más de 26 h | Media
Conciliación de stock | Señal del job nocturno (6.11 del PRD principal) | "Hay discrepancia" en un comercio (sin datos) | Alta
Errores de la app | PA13 | Errores del tenant 5 veces por encima de su promedio de 7 días | Media
Entregabilidad de email | PRD de notificaciones (NE13.6) | Quejas > 0,1% o rebotes > 2% en 24 h | Alta
Cola de jobs | PA11 | Trabajo más viejo pendiente hace más de 30 min; fallas repetidas | Alta
Facturación ARCA | PRD de facturación ARCA (FE6.7, FE11, FE16) | Certificado del computador fiscal a menos de 30 días de vencer; cola de facturación de un comercio pausada por errores de autorización; tarea de delegación pendiente del proveedor (FE2.5) con más de 1 día hábil | Alta / Crítica
Precios | PRD de gestión de precios | Falla del job de ajustes programados o de la recomendación mensual; discrepancias de caché (solo el contador) | Media

Documento | Qué usa el panel (solo datos de gestión y técnicos) | Qué habría que alinear allá (propuesta, sin editar ese PRD)
--- | --- | ---
PRD principal | 6.4 (una base por cliente, base de control, catálogo, migraciones escalonadas, backups RPO 24 h / RTO < 4 h, monitoreo por base), F8.4 (prueba, mora, solo lectura sin borrar datos), F8.5 (exportación por el Dueño), F8.12 (transferencia de titularidad), 6.8 (Mercado Pago), 6.9 (CI/CD, Sentry), señal de la conciliación nocturna de 6.11 | F8.4 dice "gracia de 7 días": actualizarlo a la decisión de 14 días con acceso completo y suspensión el día 15 (PA7). Quitar de 3.3 y 6.4 la "impersonación con consentimiento": por decisión del dueño no existe. Sumar a 6.3 los estados de ciclo de vida (baja_solicitada, en_baja, archivado, eliminado).
Onboarding | Job de aprovisionamiento (ON3, 6.2, 6.3) reusado en el alta asistida (PA10.1); lista de altas y "Reintentar" (ON3.8); embudo de activación (ON12, eventos sin datos de negocio); whatsapp_usage con la marca onboarding (ON5.8); modo ejemplo ignorado (ON10) | Que ON1 registre la aceptación de términos y política en legal_acceptances (PA3.2), y que 3.3 remita a este PRD como definición del Control Plane y del rol Superadmin.
Autenticación | Login con Google, sesiones con hash (AU8), reautenticación (AU10), auditoría (AU12) y su réplica al comercio (AU12.2), suspensión en solo lectura (AU4.7), invitaciones (AU6) para la titularidad en el alta asistida | Agregar el rol superadmin como rol de plataforma (allowlist platform_admins), separado de las memberships; quitar de 3.3 y de la tabla de integración la impersonación de soporte; aclarar que la passkey del panel (PA1.6) no cambia F8.7 para los comercios.
Bot de WhatsApp | whatsapp_identities / bot_links (teléfono del directorio), whatsapp_usage por categoría y tipo de plantilla, calidad del número y límites de mensajería | Asegurar que whatsapp_usage registre por mensaje: tenant, categoría (servicio / utilidad), tipo de plantilla, si cuenta en el cupo del plan, si cayó dentro del cupo gratis del número y el costo estimado, sin contenido.
Caja Digital | Solo el evento técnico "cierre automático fallido / resumen no generado" (sin montos) | Publicar ese evento como señal (PA4.1). Quitar la mención de acceso del Control Plane "con consentimiento".
Rotación de productos | Solo métricas técnicas de los jobs (duración, fallas) y el consumo de plantillas en whatsapp_usage | Ninguno (ese PRD ya dice "nunca datos comerciales"); quitar la excepción de soporte con consentimiento.
Consumos de servicios | Solo contadores técnicos (conexiones de email activas o vencidas, fallas del clasificador) | Quitar la excepción "sin consentimiento explícito y registro": el panel nunca ve montos ni comprobantes.
Órdenes de pago | Allowlist de dominios oficiales de pago (7.3 de ese PRD) administrada desde el panel; plantillas de WhatsApp | Ídem: sin excepción por consentimiento.
Facturas de proveedores | Solo métricas técnicas del OCR (cantidad procesada, tasa de acierto, costo) | Ídem.
Modo offline | Señales de anomalías de stock (solo la cantidad), huecos, dispositivos sin sincronizar, operaciones rechazadas | Publicar esas señales como contadores en tenant_health_signals (PA4.1).
Notificaciones por email | Infraestructura de envío (NE11) para las alertas al Superadmin y los recordatorios de cobranza; avisos de cuenta y suscripción (NE7.3); métricas de entregabilidad (NE13.6) | Ajustar NE7.3 a la regla de 14 días (inicio de la gracia en D+8, aviso 2 días antes de la suspensión en D+13, suspensión en D+15) y agregar el tipo "recordatorio de cobranza" (borrador manual en D+1, D+7 y D+12 por defecto), separado de los avisos obligatorios.
Ticket de venta | Envíos por número central (ticket_cliente en whatsapp_usage, solo cantidades), calidad del número y suspensión del envío por comercio (TV12.9), señal de huecos de numeración (TV3.6) | Confirmar si los tickets descuentan del cupo del plan (pregunta abierta 4 de ese PRD); el panel muestra ambos casos.
Gestión de Precios | Solo fallas de los jobs y el contador de discrepancias de caché (sin precios) | Quitar la excepción "salvo con consentimiento y registro".
Facturación Electrónica ARCA | Bandeja de tareas del proveedor para aceptar la delegación y asignar el computador fiscal (FE2.5), alertas del certificado (FE16) y de la cola (FE6.7, FE11), estado fiscal por tenant (tenant_fiscal_links) | Que las tareas se muestren en el panel con SLA y que marcarlas como hechas quede auditado; posible reuso del servicio de facturación para los comprobantes del propio proveedor (PA6.3). El panel no ve los comprobantes emitidos por los comercios.
Documento de costos | Tarifas de WhatsApp (1.1), cupo gratis compartido (0.1), escenarios por cliente (8), planes, cupos y paquete extra (9), infraestructura y capacidad por host (3), tipo de cambio | Agregar el costo del panel (sin servidores nuevos en el MVP; Cloudflare Access si se usa) y el de almacenamiento de los backups finales de bajas.
