---
id: MOD-04-TICKET-VENTA-PARTE-1
tipo: spec
estado: propuesto
modulos: [caja, fiado, ventas]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  En el kiosco, una venta termina con el cliente yéndose sin ningún papel en la mano, o con un "papelito"
  escrito a mano.
---
> Origen: `PRD - Ticket de Venta para Sistema de Inventario - Parte 1.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/sales/ticket_*`, `src/pages/api/tickets/*`

---

# PRD - Ticket de Venta para Sistema de Inventario — Parte 1 de 2

Documento dividido en dos partes por tamaño. Esta es la Parte 1: encabezado, secciones 1 a 3 y 4.0 Priorización. La Parte 2 (sección 4 desde TV1: TV1 a TV18 y 4.19; secciones 5 a 8 y Anexo A) está en: https://docs.google.com/document/d/1B5H9IVVS4WBAnaPBx-wycswOHR1V1qNF5vAaLqSg8yI/edit . La numeración es la del documento completo.

Principio rector: todo se opera al 100% desde un celular. Ver, buscar, compartir y devolver un ticket se hace completo desde la app del celular, con y sin conexión. La PC, el lector láser y la impresora térmica son accesorios opcionales.

Qué es y qué no es este ticket. Es un resumen de la venta para el comerciante y para el cliente (un comprobante interno, no fiscal). No es una factura ni reemplaza la obligación del comercio de facturar según las normas de ARCA. Lleva siempre la leyenda "DOCUMENTO NO VÁLIDO COMO FACTURA" [a verificar] (ver TV7).

Sobre el PRD principal: este documento se redactó contra la versión en edición del PRD principal, que está incorporando modo venta, descuentos, markup, devoluciones y la auditoría inmutable. Donde el PRD principal todavía no define algo (por ejemplo, las reglas de descuento), este PRD propone un comportamiento y lo marca como dependencia; al cerrarse esa edición, se revisan las referencias (ver 7.2).

Datos externos: lo marcado [a verificar] (leyenda de ARCA, políticas y precios de plantillas de WhatsApp de Meta, soporte de Web Share y Web Bluetooth en Safari iOS y Chrome Android, anchos de impresión de impresoras térmicas) debe confirmarse en la fuente oficial antes de implementar.

## 1. Resumen / visión general

### 1.1 Problema

En el kiosco, una venta termina con el cliente yéndose sin ningún papel en la mano, o con un "papelito" escrito a mano. El comerciante, a su vez, no tiene cómo encontrar una venta puntual cuando el cliente vuelve a reclamar ("ayer me cobraste dos veces", "quiero devolver esto"), ni cómo ver en un solo lugar qué se vendió, a qué precio, con qué descuento, cómo se cobró y qué stock se descontó.

Hoy el sistema registra la venta como movimientos de stock (PRD principal, F2.10) y el ingreso en la caja (PRD de Caja, C8), pero no hay un comprobante para el cliente ni un documento que agrupe la venta. El PRD de Onboarding lo detectó: el video de bienvenida muestra un "ticket" de "facturación" que no está definido en ningún otro PRD (ON6.4 y pregunta abierta 8.2 n.º 2). Este documento lo define.

### 1.2 Visión

Cada venta, por cualquier método (lector láser, cámara del celular, búsqueda de texto o búsqueda por foto), genera automáticamente un ticket: un resumen inmutable con el nombre del comercio, la fecha y hora, un número correlativo, quién vendió, el detalle de productos con sus descuentos, el descuento del ticket, el total y el medio de pago. El ticket:

Se ve en la app (en el celular o en la PC), con un historial con búsqueda y filtros.

Se comparte con el cliente gratis desde el WhatsApp del propio comerciante (link wa.me o PDF/imagen) y, opcionalmente, desde el número central de la plataforma (con costo y consentimiento) o impreso en una impresora térmica.

Es la puerta de entrada a las devoluciones: se busca por número y desde ahí se devuelve, con documentos vinculados.

Une en un solo lugar el stock (movimientos inmutables) y la plata (ingreso en la caja).

### 1.3 Propuesta de valor

"Cada venta deja su ticket: lo encontrás en segundos, se lo mandás al cliente por WhatsApp sin costo y, si te lo devuelven, lo resolvés desde el mismo ticket."

### 1.4 Alcance del módulo

Incluye: generación del ticket, numeración (también offline), contenido, descuentos tal como quedan registrados, medio(s) de pago, vínculos con stock y caja, inmutabilidad, leyenda no fiscal, historial, vista pública por link, PDF/imagen, envío al cliente (wa.me, Web Share, número central), impresión térmica (P2), documentos de devolución vinculados y la integración con los demás módulos.

No incluye: la lógica de la venta en sí (Modo venta, métodos de identificación, cálculo de ganancia: PRD principal F2), las reglas de negocio de descuentos y markup (PRD principal, en edición; acá solo se registran en el ticket), la lógica de la caja (PRD de Caja) ni la facturación electrónica de ARCA (fuera de alcance, ver 2.2).

## 2. Objetivos y no-objetivos

### 2.1 Objetivos

### 2.2 No-objetivos (fuera de alcance, al menos en el MVP)

Facturación electrónica de ARCA (factura B/C, CAE, puntos de venta, notas de crédito fiscales): fuera de alcance. Es una consideración futura para comercios más grandes (Fase 3, vía integración directa o partner; ver 8). El ticket no reemplaza la factura ni la obligación de emitirla.

Discriminar IVA, mostrar letra de comprobante o datos que imiten una factura (letra "B", "C" o "X", la palabra "Factura", CAE, punto de venta fiscal).

Identificar al cliente (DNI, CUIT, domicilio): fuera del MVP; solo se guarda, si el cliente lo da y hace falta, el número de WhatsApp para enviarle el ticket y, en las ventas "A cuenta (fiado)" (TV5.8), el cliente de la cuenta corriente que define el PRD de Fiado.

Editar o borrar un ticket emitido: nunca. Las correcciones se hacen con documentos vinculados (devolución/anulación, corrección de medio de pago).

Marketing al cliente final (promociones, listas de difusión) usando los números que dejan los clientes: prohibido.

Arqueo diario: no hay arqueo diario; la entrega de turno es opcional y cuenta solo efectivo (Caja C17).

Cobro integrado con el posnet, Mercado Pago Point o QR dinámico desde el ticket: el medio de pago se registra; la integración de cobro queda para más adelante (PRD de Caja, Fase 3).

Envío del ticket por email: P2, a evaluar junto con el PRD de notificaciones por email.

## 3. Usuarios

### 3.1 Dueño/a (rol Dueño)

Vende, revisa el historial de ventas, busca un ticket cuando un cliente reclama, autoriza descuentos fuera de límite y devoluciones, decide si el comercio usa el envío desde el número central (con costo dentro del cupo del plan) y si imprime. Opera casi siempre desde el celular.

### 3.2 Empleado/a (rol Empleado)

Vende desde el celular o la PC del mostrador, comparte el ticket con el cliente por WhatsApp y registra devoluciones dentro de los límites que fije el dueño (PRD principal F10.9). Ve los tickets que el dueño le habilite (por defecto, los propios de la jornada; todos, con permiso). No ve costos ni ganancias (PRD principal F7.6).

### 3.3 Cliente del comercio (destinatario, no usuario)

Persona que compra en el mostrador. No tiene cuenta. Puede recibir su ticket por WhatsApp (del comerciante o del número central, con su consentimiento) o abrirlo por link. Puede pedir no recibir más mensajes ("BAJA").

### 3.4 Administrador de la plataforma

Monitorea desde el Control Plane el uso del envío por número central (costo, cupo, fallas, calidad del número), los links públicos (accesos, abuso) y los controles de integridad (tickets vs. stock vs. caja), sin poder editar tickets.

## 4. Funcionalidades

### 4.0 Priorización

Continúa en la Parte 2 (TV1 a TV18, 4.19, secciones 5 a 8 y Anexo A): https://docs.google.com/document/d/1B5H9IVVS4WBAnaPBx-wycswOHR1V1qNF5vAaLqSg8yI/edit

Campo | Detalle
--- | ---
Producto | Ticket de Venta (comprobante de venta no fiscal) del Sistema de Inventario para Kioscos y Comercios (web y app móvil PWA)
Autor | Mauricio Matasini
Estado | Borrador v1
Fecha | 9 de octubre de 2026
Documentos relacionados | "PRD - Sistema de Inventario para Kioscos y Comercios" (en adelante, PRD principal: https://docs.google.com/document/d/1yqHU3xK1EYQle8J5Gag0wweTs9llCHH_X8uo4_km_AA/edit; F2 escaneo y Modo venta, F3 historial inmutable, F7 costo/precio/markup, F10 devoluciones, F11 operación desde el celular, 6.3 modelo de datos, 6.4 multi-tenant, 6.11 auditoría), "PRD - Caja Digital para Sistema de Inventario" (PRD de Caja: https://docs.google.com/document/d/14hdf2BbXewzSkjKE25zC8NEMJsDsy2ObI0IKBSt6u0U/edit; C3 movimientos, C4 medios de pago, C7 reversiones, C8 integración con ventas, C12 cierre, C13 comprobantes QR, C14 devoluciones), "PRD - Onboarding de Nuevos Clientes para Sistema de Inventario" (PRD de Onboarding: https://docs.google.com/document/d/136yVOwjMHnROHSavhJMdA4rPNWCzTcFrUfq7G71A6Qc/edit; ON6.4 y pregunta abierta 8.2 n.º 2, que este documento responde), "PRD - Bot de WhatsApp para Sistema de Inventario" (PRD del bot: https://docs.google.com/document/d/1lp7TnN3MiX60OJihJdv7h_26XEAZdmyPtwjwSGEgPv8/edit), "PRD - Autenticación y Gestión de Usuarios para Sistema de Inventario" (https://docs.google.com/document/d/18v4qo1sCDIfs31L1atBI3lxcaVC_2mlp9OpI4E1i2RM/edit), "Costos estimados por cliente - Sistema de Inventario" (documento de costos: https://docs.google.com/document/d/1h7YaBE-1ZcDfQxt7HWNG-qh5LEraybFIvSngqOnM1pA/edit) y "PRD - Modo Offline para Sistema de Inventario" (PRD de Offline, en redacción)
Terminología | La misma de los documentos relacionados: comercio/tenant, base de control, roles Dueño/Empleado, Modo venta, método de identificación (lector, cámara, búsqueda de texto, foto), movimiento de stock, movimiento compensatorio, caja, jornada, cierre, resumen de cierre, medio de pago (los cinco de la caja: Efectivo, Débito, Mercado Pago, QR, Transferencia bancaria), dispositivo (devices), origen, idempotency_key, número central de WhatsApp, ventana de 24 h, plantilla de utilidad. Términos nuevos en el Anexo A.
Stack | Astro + TypeScript (PWA: la misma app en el celular y en la PC), PostgreSQL con una base de datos por cliente más una base de control (igual que ModoOps), base SQLite local en el dispositivo para el modo offline, "Iniciar sesión con Google"

# | Objetivo | Cómo se mide
--- | --- | ---
TO1 | Que toda venta tenga su ticket | Ventas sin ticket = 0 (verificado por restricción de base y job de control)
TO2 | Encontrar cualquier venta en segundos | Búsqueda por número o filtro con primera página en menos de 1 s con 100.000 tickets
TO3 | Que el ticket sea la misma verdad que el stock y la caja | Diferencias entre total del ticket, suma de pagos e ingresos de caja vinculados = 0 (job nocturno)
TO4 | Compartir el ticket con el cliente sin costo para la plataforma por defecto | % de envíos por wa.me / Web Share vs. número central; costo de WhatsApp por ticket enviado
TO5 | Que funcione igual sin conexión | Tickets creados offline con número provisorio confirmados al sincronizar = 100%; duplicados = 0
TO6 | Que nadie lo confunda con una factura | 100% de los tickets (pantalla, link, PDF, imagen, impresión) con la leyenda no fiscal; 0 menciones de "Factura", letra, CAE ni IVA discriminado
TO7 | Devoluciones más rápidas y trazables | % de devoluciones iniciadas desde un ticket; tiempo medio de una devolución menor a 45 s

Prioridad | Significado
--- | ---
P0 - MVP | Imprescindible para el lanzamiento
P1 - Post-MVP cercano | Fase 2, dentro de los 2 a 3 meses posteriores al lanzamiento
P2 - Futuro | Fase 3 en adelante, según demanda

# | Funcionalidad | MVP (P0) | Más adelante (P1/P2)
--- | --- | --- | ---
TV1 | Generación automática del ticket | Toda venta (lector, cámara, texto, foto) genera un ticket en la misma transacción | —
TV2 | Contenido del ticket | Comercio, fecha y hora, número, vendedor, líneas (producto, cantidad, precio unitario, subtotal, descuento de línea), líneas de promoción y combo (RT12), descuento del ticket, total, medio de pago, leyenda | Logo del comercio y pie de texto libre (P1)
TV3 | Numeración | Correlativo por comercio sin huecos; offline: número provisorio (código de dispositivo + secuencia) confirmado al sincronizar | —
TV4 | Descuentos en el ticket | Descuento por línea y por ticket (porcentaje o monto fijo), con redondeo y prorrateo definidos | Motivos de descuento y reporte de descuentos (P1)
TV5 | Medio de pago | Uno de los cinco medios o "A cuenta (fiado)" con el nombre del cliente (PRD de Fiado); "Paga con" y vuelto en efectivo | Pago dividido entre varios medios (P1)
TV6 | Vínculos e inmutabilidad | Vínculo a los movimientos de stock y al ingreso de caja; ticket append-only | Cadena de hashes (P1, como F3.11)
TV7 | Leyenda no fiscal | Leyenda visible en todos los formatos; nada que imite una factura | Facturación ARCA (fuera de alcance; evaluación en Fase 3)
TV8 | Historial de tickets | Lista con búsqueda (número, producto, monto) y filtros (fecha, vendedor, medio, estado, dispositivo) | Exportar CSV/PDF del historial (P1)
TV9 | Vista del ticket y link público | Vista en la app; link público con token no adivinable y vencimiento | Estadísticas de acceso (P1)
TV10 | PDF e imagen | PDF y PNG con la misma plantilla (58/80 mm) | —
TV11 | Compartir desde el WhatsApp del comerciante | wa.me con texto y link (por defecto, gratis); Web Share con PDF/imagen | —
TV12 | Envío desde el número central | — | Plantilla de utilidad aprobada, consentimiento del cliente, ~USD 0,026 por mensaje, descuenta del cupo del plan (P1)
TV13 | Devoluciones y anulación | Documento de devolución vinculado (total o parcial); anulación = devolución total con motivo | Cambio por otro producto (P1, como F10.10)
TV14 | Corrección de medio de pago | — | Documento de corrección vinculado con reversión en la caja (P1)
TV15 | Impresión térmica | — | Impresora térmica de 58/80 mm (P2)
TV16 | Integraciones | Caja, inventario, descuentos, devoluciones, notificaciones (eventos) | Reportes de rotación sobre líneas de ticket (P1)
TV17 | Offline | Ticket, vista, imagen y wa.me sin conexión | —
TV18 | Permisos y privacidad | Matriz de permisos; datos del cliente mínimos y cifrados | —
