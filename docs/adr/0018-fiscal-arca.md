---
id: ADR-0018
tipo: adr
estado: aceptado
modulos: [fiscal]
depende_de: [ADR-0007, PRD-FE-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  D1 FiscalProvider propio con abstracción. Desarrollo propio por volumen de comercios y no pagar por CUIT.
  pyafipws descartado (LGPL + TA en archivo 5 h) como runtime; solo referencia.
---
# ADR-0018 - Fiscal ARCA Nivel 3: FiscalProvider, WSAA/WSFEv1, cola y seguridad

Estado: aceptado. Fecha: 2026-10-10. Fuentes: PRD-FE-01 (FE1-FE16), ADR-0007 (WSFEv1 verificado), manual WSFEv1 v4.7, WSAA 1.2.2, RG 4291/4892/5616/5700/5782/5866, pyafipws, odoo-argentina-ce.

## Contexto

Ticket sigue no fiscal. Factura con CAE+QR vinculada a venta. Cada comercio necesita CUIT + PV webservice + delegación. Venta/caja/stock nunca bloquean por ARCA. Offline vende igual, factura al sync.

## Decisiones

- D1 `FiscalProvider` propio con abstracción. Desarrollo propio por volumen de comercios y no pagar por CUIT. `pyafipws` descartado (LGPL + TA en archivo 5 h) como runtime; solo referencia. `odoo-argentina-ce` descartado como modelo seguridad (clave en texto plano). Abstracción permite API terceros (AfipSDK/tusfacturas) si piloto lo pide. PRD-FE-01 FE-E5.
- D2 Delegación con computador fiscal único, no cert por comercio (FE2). Comercio delega `Facturación Electrónica` a CUIT proveedor (clave fiscal 3, F3283/E); proveedor acepta y asigna computador fiscal (un solo computador por relación, sin encadenar). Llamadas con `Auth.Cuit=comercio`. Error 601 = falta delegación. Costo: paso manual nuestro por comercio + estado `delegacion_pendiente_proveedor` + tarea Control Plane. Alternativa cert propio queda fuera MVP.
- D3 WSAA TA 12 h cacheado por (computador, servicio, ambiente). TRA firmado CMS (`uniqueId`, `generationTime -10 min`, `expirationTime +10 min`, `service wsfe`) con `node-forge` (Fase 0 decidido 2026-10-10; `openssl cms` descartado por dependencia binaria). Ver `src/modules/fiscal/tra.ts`. Renovación <1 h o ante 600/601. Lock advisory global + doble check evita `alreadyAuthenticated`. Tras error WSAA no-`alreadyAuthenticated`, espera 60 s. Nueva delegación con TA vigente puede dar 601 hasta renovar [a verificar en homo].
- D4 WSFEv1 lock por (CUIT, PV, tipo) estrictamente serial + un comprobante por `FECAESolicitar` en C (`CbteDesde=CbteHasta`). Secuencia `last_number+1` verificada con `FECompUltimoAutorizado` si no confirmada; respeta 10016 y regla fecha ≥ último. Outbox fiscal misma tx venta+ticket (`fiscal_documents` pendiente + `fiscal_jobs` en control). Paralelo entre comercios y PV/tipo; serial dentro. Cliente `fetch` + XML manual, timeout 30 s (Fase 0 decidido 2026-10-10; `soap` npm descartado). Ver `src/modules/fiscal/wsfe.ts`.
- D5 Idempotencia con `FECompConsultar` antes de reenviar (FE6.4/FE11). `idempotency_key sale:{sale_id}:{tipo}` / `return:{return_id}:{tipo}` único. Estados: `pendiente_de_sync → pendiente → enviando → autorizado | rechazado | respuesta_incierta → (autorizado | pendiente)` + `en_espera_de_datos`, `no_facturar`. Timeout = `respuesta_incierta` con lock lógico (`in_flight_document_id`) hasta resolver. Coincide (total, doc, fecha) → toma CAE; no existe → reenvía mismo número; difiere → pausa + alerta. Job diario vs `FECompUltimoAutorizado` detecta emitido fuera del sistema.
- D6 Offline factura al sync en orden cronológico con hora servidor (FE10). Fecha venta si válida concepto 1 (±5 d, mismo mes, ≥ último); sino fecha hoy + leyenda `Venta del ...`. Sin DNI sobre umbral → `en_espera_de_datos`. CAEA solo contingencia Fase 4 (RG 5782, `CbteFchHsGen` obligatorio), desactivado por defecto.
- D7 Letras y receptor parametrizados (FE3/FE5). Monotributo/exento siempre C (11/12/13). B/A Etapas 2-3 por `CondicionIVAReceptorId` (RG 5616, siempre informado). Tablas refrescadas `FEParamGetTiposCbte/CondicionIvaReceptor/PtosVenta` job diario. Umbral $10.000.000 (RG 5700/5866) en `fiscal_params`, no hardcodeado. QR `https://www.arca.gob.ar/fe/qr/?p=` + JSON v1 Base64 (RG 4892), URL parametrizada.
- D8 Ambientes separados + seguridad KMS (FE12/FE16). Dos computadores (homo WSASS, prod Certificados Digitales). Selección endpoint servidor por config comercio. Clave cifrada envoltura KMS, solo servicio descifra en memoria; TA cifrado en control. Nunca repo/env/DB cliente. Alertas cert 60/30/7 d + runbooks renovación (mismo alias) y revocación. Acceso consola solo 2 personas.
- Endpoints: homo WSFE `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`, prod `https://servicios1.afip.gov.ar/wsfev1/service.asmx`; homo WSAA `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`, prod `https://wsaa.afip.gov.ar/ws/services/LoginCms` (`?WSDL` para WSDL). Dominios técnicos siguen `afip.gov.ar`.

## Modelo mínimo

- Control: `fiscal_computers (ambiente, alias, cuit_proveedor, cert_pem, key_ciphertext, kms_key_id, not_after)`, `arca_tokens (fiscal_computer_id, servicio, ambiente, token/sign_ciphertext, expiration)` única, `tenant_fiscal_links (tenant_id, cuit, ambiente, fiscal_computer_id, estado, fechas)`, `fiscal_params (clave, valor)`, `fiscal_jobs (tenant_id, fiscal_document_id, estado, intentos, proximo_intento)`.
- Cliente: `fiscal_settings` versionado, `fiscal_points_of_sale (pto_vta, tipo, uso online/diferido/caea)`, `fiscal_sequences (pto_vta, tipo, last_number, last_cbte_fch, in_flight_document_id)` PK, `fiscal_documents` con únicos `(pto_vta, tipo, nro)` y una autorizada por venta + `qr_payload + cbtes_asoc + request/response jsonb`, `fiscal_customers`, `delivery_notes` Etapa 4.

## Contratos API (piloto R1)

- `POST /api/fiscal/settings` Dueño + reauth. Body Zod: `cuit, razon_social, domicilio, condicion_iva, iibb, inicio_actividades, pto_vta, modo`. Responde 201, 403 Empleado, 422 CUIT/PV inválido.
- `POST /api/fiscal/delegacion/confirmada` (`Ya lo hice`) → `delegacion_pendiente_proveedor` + tarea Control Plane. `POST /api/fiscal/retry` reencola rechazada tras corregir. `POST /api/sales` existente crea `fiscal_documents pendiente` misma tx en auto; `POST /api/returns` crea NC pendiente.
- `GET /api/fiscal/documents?numero=` + filtros FE13. Solo lectura; autorizados inmutables.

## Eventos outbox

- `factura_autorizada {op_id, sale_id, fiscal_document_id, tipo, pto_vta, nro, cae, cae_vto}`.
- `factura_rechazada {op_id, fiscal_document_id, codigo, motivo_castellano}`.
- `nc_autorizada {op_id, return_id, fiscal_document_id, cbtes_asoc}`.
- At-least-once por `op_id`. Consumidores bot/email + contador (CSV P1).

## Errores

- Transitorio (timeout, 5xx, `FEDummy` caído): backoff 30 s, 2 min, 10 min, 30 min, luego 1 h + `FECompConsultar` previo.
- Autorización (601, `notAuthorized`, `cert.expired`, 600): pausa cola comercio o global + alerta Control Plane + aviso dueño si revoca.
- Negocio (`R`: 10016, 10015, IVA receptor): no reintenta, bandeja con texto castellano.
- Venta/caja nunca bloquean. Hueco numeración offline → alerta Control Plane + Dueño.

## Fuera de corte

`wsfexv1`, `wsmtxca`, MiPyMEs, M, usados 49, remitos R/CAI, `wsremcarne`/`wsremharina`, COT, Libro IVA, DDJJ, cert propio por comercio, CAEA como principal.

## Riesgos abiertos

SLA aceptación manual delegación; TA vs delegación nueva hasta 12 h; regla fecha offline vieja vs CAEA; padrón Etapa 3 con nuestro cert; leyendas RG 1415/4892; conservación 10 años; precio add-on. Todos [a verificar] en PRD-FE-01 con contador en Fase 0 + piloto 5 comercios 2 semanas, 0 duplicados/huecos, >99% <1 min.
