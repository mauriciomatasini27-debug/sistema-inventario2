# PRD-CAJA-01 - QR, vencimientos y ticket_payments

Fuente: `docs/04-ventas-caja-fiado/caja-digital-*.md` (C9, C13), `ticket-venta-*.md` (TV5.8 dividido P1). Gap: sin tabla `cash_qr_receipts|cash_due_items|ticket_payments`; sin `/api/cash/qr`.

## Épica CAJA-E1. Comprobantes QR (C13)

- CAJA-S1. Ingesta bot + Gmail (`gmail.readonly`, clasifica `comprobante QR`). AC: Given foto/PDF con monto/fecha/Op. When llega Then extrae + asocia monto exacto ±15min con toque; auto solo si Op. nuevo+monto exacto+único candidato + `[Deshacer]`. Tablas: `cash_qr_receipts(numero_operacion único)`. Depende de: nada.
- CAJA-S2. Dedup + filtro `QR sin comprobante` + cuenta en cierre. AC: Given Op. repetido When reingreso Then `ya registrado`. Depende de: CAJA-S1.

## Épica CAJA-E2. Vencimientos (C9)

- CAJA-S3. `POST/GET /api/cash/due-items` + `Registrar pago` precargado. AC: Given vencimiento a 3d When corre job Then aviso; pagar crea egreso + marca Pagada. Tablas: `cash_due_items`. Depende de: nada.

## Épica CAJA-E3. Medios divididos (TV5.8 P1)

- CAJA-S4. `ticket_payments` (Σpagos=total, 1 ingreso/medio). AC: Given pago dividido When confirmo Then 1 ticket + N ingresos `origen=venta`. Tablas: `ticket_payments(cash_movement_id)`. Depende de: PERS-S1.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | QR exacto único | asocia + avisa + deshacer |
| Fallo | QR ambiguo | pide toque, no asocia solo |
