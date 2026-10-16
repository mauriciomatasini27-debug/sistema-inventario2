---
id: MOD-08-PANEL-ADMIN-PARTE-1
tipo: spec
estado: propuesto
modulos: [admin]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: ""
---
> Origen: `PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 1 de 3).docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/admin`, `src/pages/api/admin/*`, `src/db/schema-admin.ts`

---

# PRD - Panel de Administración Multi-Kiosco para Sistema de Inventario (Parte 1 de 3)

Convención: igual que en los demás PRD, lo marcado [a verificar] son datos externos (políticas y precios de Meta, APIs de Google, Mercado Pago, proveedores de infraestructura) que hay que confirmar en la fuente oficial antes de implementar, y lo marcado [a verificar con un abogado] o [a verificar con el contador] son interpretaciones legales o fiscales que no reemplazan un asesoramiento profesional. Este documento no modifica los otros PRD: cuando detecta algo que habría que alinear allá, lo deja como propuesta en la sección 4.15 (Parte 2) o como pregunta abierta en la sección 7.3 (Parte 3).

Decisión del dueño (9/10/2026): solo datos de gestión. El panel es la herramienta de Superadmin de Mauricio para gestionar todos sus servidores y todos sus clientes (tenants): es multi-tenant y multi-servidor. Maneja estrictamente datos de gestión: directorio de clientes, suscripción y estado de cuenta, uso y costo de WhatsApp, servidores, bases, backups, migraciones, deploys, módulos, errores y contadores o eventos técnicos sin contenido de negocio. El Superadmin no puede ver ni tocar nada dentro de la app de un tenant (productos, stock, movimientos, ventas, caja, tickets, precios, facturas, órdenes de pago, consumos, clientes finales, empleados, saldos de fiado de los clientes del kiosco, diferencias en el traspaso de turno, conteos de stock o de caja, promociones y lotes con sus vencimientos): el panel no lee filas de las bases de los comercios, no tiene vistas de soporte, no tiene drill-down ni modo de impersonación, y no agrega métricas de negocio. Lo que quedó afuera está listado, con el motivo, en los no-objetivos (2.2).

Documento dividido en 3 partes por tamaño; la numeración es continua. Parte 1 (este documento): encabezado y secciones 1 a 3 (Resumen, Objetivos y no-objetivos, Usuarios). Parte 2: sección 4, Funcionalidades (4.0, PA1 a PA14 y 4.15): https://docs.google.com/document/d/1SMAn_GJ_7VzhCRcIdcJV_trVgyVE1V1Mxql-gazbf30/edit. Parte 3: secciones 5 a 8 y Anexo A (Flujos, Notas técnicas, Riesgos, decisiones tomadas y preguntas abiertas, Plan por fases, glosario): https://docs.google.com/document/d/1GRWikx4YvLcm2wbIz9_QRpOvNRK41FWRGBN9wsw0lR0/edit.

## 1. Resumen

### 1.1 Problema

Hoy el Control Plane está descripto en pedazos en varios PRD: el PRD principal (6.4) habla de una "lista de comercios, plan, estado de suscripción, uso, suspensión/reactivación"; el de onboarding (3.3, ON3.8 y ON12) de las altas en curso y los errores de aprovisionamiento; el del bot y el de costos de la tabla whatsapp_usage; el de modo offline de los dispositivos con sincronización atrasada; el de notificaciones de la entregabilidad de los emails; el de facturación ARCA de las tareas de delegación del proveedor. Falta el documento que lo junte y lo convierta en la herramienta de trabajo diaria del proveedor.

Con decenas o cientos de kioscos repartidos en varios servidores, Mauricio necesita responder todos los días, sin entrar a ningún comercio:

¿Quién me pagó, quién está en demora, quién está en gracia y a quién hay que suspender?

¿Cuánto me está costando WhatsApp este mes, por kiosco, y quién se va a pasar del cupo del plan?

¿Qué comercio tiene un problema técnico ahora (una sincronización que dejó anomalías de stock, un celular que no sincroniza hace dos días, una migración que falló, un backup que no corrió, la calidad del número central que bajó)?

¿Cómo están mis servidores, qué tenants viven en cada uno, cuánta capacidad me queda y cómo muevo tenants de un servidor a otro?

¿Cómo opero los releases, las migraciones y los módulos por plan sin conectarme por SSH ni correr SQL a mano?

Y con una restricción fuerte, decidida por el dueño: los datos de la app de cada comercio son del comercio y el proveedor no los mira. Además, la arquitectura es una base por cliente, así que todo lo que el panel necesita tiene que estar en la base de control o llegar a ella como contador técnico.

### 1.2 Visión

Un back-office único, seguro y auditado para el proveedor, que extiende el Control Plane existente con:

Gestión comercial propia del proveedor: directorio de clientes, estado de cuenta, cobranza y reglas de mora conectadas al estado del tenant.

Control de costos de WhatsApp del número central: cupo gratis compartido, mensajes de servicio y plantillas de utilidad pagas en USD por kiosco, contra los cupos del plan (solo contadores, nunca contenido).

Alertas técnicas a partir de contadores y eventos sin contenido de negocio.

Operación multi-servidor de la plataforma (rol Superadmin): registro de servidores y hosts de bases, qué tenants viven en cada uno, capacidad, mudanza de tenants entre servidores, backups, alta/baja/reactivación de tenants, módulos por plan con feature flags, errores por tenant, estado de deploys y rollouts de migraciones a través del pipeline de CI/CD. El panel no edita código en vivo.

### 1.3 Propuesta de valor (para el proveedor)

Una pantalla para arrancar el día: qué hay que resolver hoy en cobranza, costos, servidores y comercios con problemas técnicos.

Menos costo y menos sorpresas: WhatsApp es el 94–97% del costo por cliente (documento de costos, 0); verlo por kiosco y contra el cupo evita perder margen.

Cobranza ordenada: quién pagó, quién no y desde cuándo, con la regla de 14 días aplicada de forma pareja.

Operación segura de varios servidores: las acciones peligrosas (restaurar un backup, mover una base, dar de baja un cliente) tienen confirmación, reautenticación y auditoría.

Confianza de los clientes y cumplimiento: el proveedor no ve los datos de la app de ningún comercio, y cada acción del Superadmin sobre una cuenta queda registrada y es visible para su Dueño.

### 1.4 Alcance

Incluye: acceso con Google y rol Superadmin (allowlist en la base de control), auditoría inmutable, cumplimiento de la Ley 25.326 con el principio "solo datos de gestión", contadores técnicos y de uso (sin contenido de negocio), directorio de clientes, estado de cuenta y cobranza, reglas de mora, uso y costo de WhatsApp, alertas técnicas, ciclo de vida de los tenants (alta, baja, reactivación), infraestructura multi-servidor, módulos y feature flags, errores por tenant, y deploys y rollouts de migraciones.

No incluye (detalle y motivo en 2.2): nada que muestre o toque datos de la app de un comercio.

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos

Fuera de alcance por decisión del dueño (9/10/2026): solo datos de gestión. El Superadmin no puede ver ni tocar nada dentro de la app de un tenant. Por eso se sacaron del alcance, y no se van a construir ni dejar apagadas:

Si un Dueño necesita ayuda con sus datos, él mismo los mira en su app, comparte su pantalla o exporta lo que quiera (F8.5 del PRD principal); el panel no ofrece ningún atajo.

Otros no-objetivos:

No es un producto para los comerciantes: ningún dueño ni empleado tiene acceso, ni siquiera a una versión reducida.

No se opera dentro del comercio: el panel no crea, edita ni lee movimientos de stock, ventas, caja, precios, órdenes de pago ni facturas.

No se editan código ni esquemas en vivo: los cambios de código y las correcciones de bugs se hacen en el repositorio (git), pasan por CI y los despliega el pipeline. El panel muestra el estado, dispara deploys aprobados o rollbacks y ejecuta migraciones ya versionadas. No hay consola SQL ni "hotfix" desde el navegador.

No es un BI: solo contadores técnicos y de uso definidos en este PRD.

No reemplaza al contador ni al abogado: la emisión de los comprobantes fiscales del proveedor y los textos legales se validan con profesionales.

## 3. Usuarios

### 3.1 Superadmin (Mauricio, proveedor y dueño del sistema)

Quién es: el "Administrador de la plataforma (equipo propio)" de los demás PRD (PRD principal 3.3, onboarding 3.3, autenticación 3.3), concretado como un rol distinto: superadmin, guardado en la allowlist de la base de control (platform_admins), no en los tenants.

Separado de los roles del comercio: Dueño y Empleado son roles de una membership dentro de un tenant. El Superadmin no tiene membership en ningún comercio, no aparece en la lista de usuarios de ninguno y su sesión del panel es independiente de cualquier sesión de la app. Si Mauricio además es dueño de un kiosco de prueba, entra a ese kiosco con su membership de Dueño en la app normal, y al panel con su rol Superadmin: son dos sesiones distintas.

Ingreso: "Iniciar sesión con Google" con su cuenta de Google + presencia de esa cuenta en la allowlist con el rol superadmin + verificación en 2 pasos obligatoria en la cuenta de Google + sesiones cortas + reautenticación para acciones destructivas (PA1).

Necesidades: revisión diaria de cobranza, costos de WhatsApp, alertas técnicas y servidores; soporte técnico a un comercio puntual sin ver sus datos; operación de la infraestructura multi-servidor y de los releases.

Límite: no puede ver ni tocar nada dentro de la app de un tenant (decisión del dueño, 9/10/2026).

Contexto de uso: PC en la mayor parte de los casos; en el celular, solo lectura del inicio, las alertas y el estado de cuenta (las acciones destructivas se piden desde la PC, ver PA1.11).

### 3.2 Superadmin de respaldo ("break-glass")

Una segunda cuenta de Google del propio Mauricio (o de una persona de confianza a definir), con llave de seguridad física, guardada fuera de uso. Está en la allowlist en estado respaldo: cualquier ingreso con ella dispara una alerta inmediata por email. Sirve si se pierde el acceso a la cuenta principal (ver 7.3).

### 3.3 Roles futuros (P2, fuera del MVP)

operaciones (alertas, servidores y releases, sin cobranza) y finanzas (directorio y estado de cuenta, sin infraestructura). No se implementan en el MVP; el modelo de datos los contempla para no tener que rediseñar la allowlist.

### 3.4 Usuarios afectados indirectamente

Dueño del comercio: no usa el panel, pero (a) acepta los términos y la política de privacidad, que explican qué datos de gestión procesa el proveedor y que no accede a los datos de su app, y (b) ve en "Usuarios → Actividad" de su comercio cada acción del Superadmin sobre su cuenta (suspensión, reactivación, módulos, restauración o mudanza de su base, baja), replicada desde la auditoría del panel, como AU12.2 del PRD de autenticación.

Empleado: no ve nada del panel ni de esa actividad (es información del Dueño).

Continúa en la Parte 2 (sección 4, Funcionalidades): https://docs.google.com/document/d/1SMAn_GJ_7VzhCRcIdcJV_trVgyVE1V1Mxql-gazbf30/edit

Campo | Detalle
--- | ---
Producto | Panel de Administración Multi-Kiosco (back-office interno del proveedor), extensión del Control Plane del Sistema de Inventario para Kioscos y Comercios (nombre comercial a definir)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Usuario | Solo el proveedor (Mauricio, dueño del sistema), con el rol Superadmin. Ningún comerciante ve este panel: cada dueño y cada empleado sigue viendo únicamente su propio comercio.
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit), "PRD - Onboarding de Nuevos Clientes" (https://docs.google.com/document/d/136yVOwjMHnROHSavhJMdA4rPNWCzTcFrUfq7G71A6Qc/edit), "PRD - Autenticación y Gestión de Usuarios" (https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit), "PRD - Bot de WhatsApp" (https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Caja Digital" (https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit), "PRD - Reportes de Rotación de Productos" (https://docs.google.com/document/d/1ABXzORmd9_o3oYxmBm6878l2VZufCKgrIyAXTifdPeQ/edit), "PRD - Consumos de Servicios" (https://docs.google.com/document/d/1LbXg794HQq7DFq7CvhDosut8wYHlpldKNhzsJg9RWqE/edit), "PRD - Órdenes de Pago" (https://docs.google.com/document/d/1bXI3SwTzhnZDqViAAPUOsnU_2zL3zc0UopNElLiE_ik/edit), "PRD - Facturas de Proveedores" (https://docs.google.com/document/d/1I38DsgM56HRIyXimafn9wAGPNasTfV8sA4b4Fceoo50/edit), "PRD - Modo Offline" (https://docs.google.com/document/d/1NvVipeJhXBgH5oae8D2SWzpqzBLybEaQ5Tc77G03Vw4/edit), "PRD - Notificaciones por Email" (https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit), "PRD - Ticket de Venta" (https://docs.google.com/document/d/1dA4AIxaHbLXS8ZoATx9Bh4fmBhXKfHA4oWnXprku4cM/edit), "PRD - Gestión de Precios" (https://docs.google.com/document/d/15gnWW2l2lkCFC-3shvHe9A6WfxfF2xje6IDj20ysyso/edit), "PRD - Facturación Electrónica ARCA" (https://docs.google.com/document/d/1qzEZybC4oI2Y1rGKxGnzgaJn1xyR_7uI-rYiqjfBjzg/edit) y "Costos estimados por cliente" (documento de costos: https://docs.google.com/document/d/1h7YaBE-1ZcDfQxt7HWNG-qh5LEraybFIvSngqOnM1pA/edit)
Arquitectura de datos | Una base de datos PostgreSQL por cliente (por comercio), igual que ModoOps, más una base de control del Control Plane: catálogo de dónde vive la base de cada cliente, tenants, usuarios y memberships, suscripciones, identidades de WhatsApp, contadores de uso (whatsapp_usage). Este PRD suma a la base de control el esquema analytics (solo métricas técnicas y de uso por comercio y por servidor), el registro de servidores, el directorio de clientes y su estado de cuenta, la allowlist de Superadmins y el registro de auditoría del panel.
Stack | Astro + TypeScript (SSR), Drizzle, cola de jobs (pg-boss / Inngest / cron, como el resto), Postgres propio en VPS Hetzner (primario + réplica) según el documento de costos (3.2 y 3.4), Sentry, CI/CD con GitHub Actions (PRD principal, 6.9)
WhatsApp | Un único número central de WhatsApp Business (WABA y número del proveedor) compartido por todos los comercios. El cupo gratis de 1.000 mensajes de servicio por mes es por número, así que lo comparten todos los clientes (documento de costos, 0.1).

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Revisión diaria en menos de 5 minutos | Desde el login, el inicio y la bandeja de alertas cargan en menos de 2 s (p95) con 500 comercios, porque leen solo de la base de control
O2 | Cero datos de la app de los tenants en el panel | Ninguna pantalla ni endpoint del panel lee tablas de negocio de una base de comercio (test automático en CI, roles de base sin permisos sobre esas tablas, revisión del esquema de la base de control)
O3 | Frescura conocida de los contadores técnicos | Cada contador muestra "datos al [fecha y hora]"; las señales urgentes llegan a la base de control en menos de 5 minutos
O4 | Cobranza al día | El 100% de los cargos vencidos aparece en "En demora" el mismo día; la suspensión ocurre el día 15 sin pago, según la política configurada, sin intervención manual
O5 | Costo de WhatsApp visible | El costo estimado del mes por kiosco (servicio + plantillas) difiere menos de 5% de la factura de Meta en la conciliación mensual
O6 | Detección temprana | Las alertas críticas (backup fallido, migración fallida, calidad del número en rojo, servidor cerca del límite) llegan por email al Superadmin en menos de 15 minutos
O7 | Trazabilidad total | El 100% de las acciones del Superadmin y de las vistas de fichas de clientes quedan en el registro de auditoría inmutable, con motivo cuando corresponde
O8 | Acceso mínimo | Solo las cuentas de la allowlist entran; el 100% de las acciones destructivas pide reautenticación reciente

Función descartada | Motivo
--- | ---
Tablero de ventas de todos los kioscos, desglose por kiosco, ranking, tendencias y ticket promedio | Son datos de la app del tenant (ventas, tickets)
Comparación entre comercios (curvas superpuestas, mediana del rubro, señales de riesgo de baja por ventas) | Se basa en datos de negocio de los tenants
Deudas operativas de cada kiosco (pedidos de reposición impagos, órdenes de pago pendientes, facturas de proveedor impagas) | Son datos de la operación del comercio con sus propios proveedores
Comparación de consumos (luz, gas, agua, servicios) entre kioscos | Son datos del comercio (PRD de consumos)
Drill-down de solo lectura a un comercio (resumen de caja, reporte de rotación, datos clave con productos) | Implica leer la base del comercio
Modo soporte / impersonación, incluso de solo lectura y con consentimiento | Implica ver la app como el Dueño
Niveles de acceso que permitan datos de negocio (métricas agregadas con base en los términos, interruptor de "acceso de soporte", pedido de acceso puntual) | No hacen falta: el proveedor no accede a datos de negocio bajo ninguna condición
Agregación de métricas de negocio (ventas, consumos, deudas) en la base de control | El esquema analytics guarda solo métricas técnicas y de uso
Cualquier vista de saldos de fiado, diferencias en el traspaso de turno, conteos (de stock o de caja), promociones o lotes y vencimientos | Son datos de la app del tenant: el panel nunca los ve, ni en detalle ni como totales
