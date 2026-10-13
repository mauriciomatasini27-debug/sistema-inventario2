# ADR-0019 - Slice fiscal mínimo: 1 Factura C online en homo

Estado: aceptado. Fecha: 2026-10-10. Fuentes: ADR-0017 (slice-0), ADR-0018 (D1-D5), PRD-FE-01 FE-S1/S7/S8/S10/S11/S13/S17-S19, `src/modules/sales/vender_mostrador.ts:120`, `src/modules/fiscal/fiscal.ts`, `src/db/schema-fiscal.ts`, `tests/fiscal.test.ts` (7 verdes).

## Decisión

El primer incremento fiscal es vender 1 producto online en mostrador (slice-0) y obtener 1 Factura C (11) con CAE+QR en homologación. Comercio monotributo ya activo (delegación hecha a mano en homo). Nada de wizard UI, B/A, NC/ND, offline ni producción antes.

## Por qué este corte

Es el flujo de mayor valor fiscal (sin CAE no hay factura) y mayor riesgo (WSAA/WSFEv1, numeración, idempotencia). Valida ADR-0018 D1-D5 con tráfico real en homo antes del resto FE1-FE16.

## Alcance vertical

- Config mínima: `fiscal_settings (cuit, condicion monotributo, pto_vta homo, modo auto)` + `fiscal_sequences (pto_vta, 11, last_number)` + `fiscal_documents pendiente` creada en la misma tx que venta+ticket (patrón `vender_mostrador`: núcleo puro decide, adaptador persiste). Una autorizada por venta (`sale:{sale_id}:11` único).
- Núcleo puro ya implementado: `validar_cuit`, `idempotency_key_for_sale`, `siguiente_numero`, `armar_pedido_c` (total>0, PV 1-99998, nro≥1, fecha AAAAMMDD, `ImpTotal=ImpNeto`), `armar_qr_payload`, `resolver_consulta` (tomar-cae | reenviar-mismo-numero | pausar-alerta). Sin IO, sin Drizzle.
- Emisión: `FiscalProvider.autorizar_c(pedido)` → WSAA TA cache memoria por (computador,homo) 12 h con advisory lock → `FECompUltimoAutorizado` si secuencia no confirmada → `FECAESolicitar` 1 comprobante: concepto 1, `DocTipo 99, DocNro 0, CondicionIVAReceptorId 5`, `CbteDesde=CbteHasta=last+1`, `CbteFch=hoy`, `ImpTotal=ImpNeto=total`, `PES`, sin IVA (1443). Lock `pg_advisory_xact_lock(hash(cuit,pv,11))` serial. El adaptador SOAP/WSAA queda fuera del slice (Fase 0: `node-forge` vs `openssl`, `soap` vs `fetch`).
- Timeout tras enviar → `respuesta_incierta` con lock lógico retenido → `FECompConsultar(11,pv,nro)`: coincide → toma CAE; no existe → reenvía mismo número; difiere → pausa + alerta.
- Representación mínima: pantalla + link token + QR (`https://www.arca.gob.ar/fe/qr/?p=` + JSON v1 Base64, `tipoCodAut E`) con marca `PRUEBA - SIN VALIDEZ FISCAL`. Ticket muestra `Factura C PV-Nro` con link, nunca CAE como factura.
- Clave homo en env solo para el slice (KMS queda para ADR-0018 completo). Endpoints homo fijos servidor, nunca cliente.

## Criterios E2E (homo)

- Venta online $2.660 crea ticket definitivo + `fiscal_documents pendiente` en una tx.
- Worker autoriza en <60 s y venta muestra `Factura C 00003-00000N` + CAE + QR validable.
- Doble `POST /api/sales` mismo `Idempotency-Key` → 409, una sola factura.
- Corte tras `FECAESolicitar` (timeout simulado) → `FECompConsultar` recupera CAE sin duplicar.
- 10 ventas simultáneas mismo PV → N..N+9 sin huecos ni duplicados.

## Fuera del slice

Wizard pasos 0-6 UI, validación `FEParamGetPtosVenta`, modos a pedido, RI/B/A, DNI/umbral $10M, `fiscal_customers`/padrón, NC/ND, offline/sync, bandeja, job conciliación diario, métricas Control Plane, exportación contador, KMS productivo, CAEA, constancia entrega, producción.

## Contratos (slice)

- `POST /api/sales` existente: en auto crea `fiscal_documents pendiente` misma tx; responde 201 con `ticket_definitivo + fiscal_estado=pendiente|autorizada`.
- `GET /api/fiscal/documents?sale_id=` lectura estado + CAE + QR. Sin edición.
- `FiscalProvider` (slice): `get_ta()`, `ultimo_autorizado(cuit,pv,11)`, `autorizar_c(pedido)`, `consultar(11,pv,nro)`. Firma CMS con `node-forge` (decisión Fase 0 del slice; `openssl` queda alternativa documentada).

## Riesgos aceptados

Delegación manual homo (sin tarea Control Plane aún); TA memoria sin tabla `arca_tokens`; sin backoff completo (solo 1 reintento + `respuesta_incierta` visible). Todo se endurece al salir del slice hacia FE-E5/E6/E7.
