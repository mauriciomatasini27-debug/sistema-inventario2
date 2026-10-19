---
item: BOT-S8
estado: hecho
adr: ADR-0040
prd: PRD-BOT-01
fecha: 2026-10-19
---
BOT-S8 hecho: el resumen mensual suma hasta 3 acciones deterministas (`src/modules/bot/acciones-propuestas.ts`: `reponer` del stock en o bajo umbral, más urgente primero y desempate por sku, si `rotacion` está activo; `cobrar` al deudor de mayor saldo, si `cobranza` está activo) en `Acciones sugeridas`, el mismo texto para WhatsApp y email; por WhatsApp van como botones `acc:<tipo>:<ref>` de hasta 20 caracteres (sin acciones o con cuerpo de más de 1.024 caracteres sale solo texto) y la idempotencia por tenant+mes+canal no cambia; el toque se atiende antes del flujo OCR, exige Dueño y módulo activo y nunca ejecuta: `reponer` deja una OC abierta (borrador) con clave `bot-accion:reponer:<cuit>:<sku>:<AAAA-MM>` que se reusa en el mismo mes, y `cobrar` devuelve al Dueño el recordatorio con el `wa.me` del cliente sin escribirle; decisión: como `products` no guarda proveedor, se usa el del catálogo o el único proveedor activo, y con 0 o varios el bot no adivina y deriva al panel de proveedores; la respuesta aclara que no se envió nada y que se confirma desde el panel (no hay sesión de pedido para "Confirmar", AU10.4); sin costo en la ficha la línea usa el precio de venta como estimado; `pagos` de `flujo_caja` queda fuera de P1; sin migración ni dependencias.
