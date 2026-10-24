---
id: PRD-FE-01
tipo: prd
estado: en curso
modulos: [fiscal]
depende_de: [ADR-0003, ADR-0004, ADR-0007, ADR-0011, ADR-0017]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: PRD - Facturación Electrónica ARCA para Sistema de Inventario.docx (verificado 9/10/2026), ADR-0007
  (WSFEv1 verificado), manual WSFEv1 v4.7, WSAA 1.2.2, RG 1415 / 4291 / 4892 / 5616 / 5700 / 5782 / 5866.
---
# PRD-FE-01 - Fiscal ARCA Nivel 3 (FE1-FE16, FiscalProvider, WSAA/WSFEv1)

Fuente: `PRD - Facturación Electrónica ARCA para Sistema de Inventario.docx` (verificado 9/10/2026), `ADR-0007` (WSFEv1 verificado), manual WSFEv1 v4.7, WSAA 1.2.2, RG 1415 / 4291 / 4892 / 5616 / 5700 / 5782 / 5866. Restringido por ADR-0003 (offline), ADR-0004 (caja/ticket/fiado/precios), ADR-0011 (control plane), ADR-0017 (slice-0).
Principio: todo se opera al 100% desde el celular. Lo único que necesita conexión es la autorización en ARCA. Ticket sigue no fiscal (`DOCUMENTO NO VÁLIDO COMO FACTURA`).

> Estado al 2026-10-24: en curso. FE-S3/S7/S8/S10/S11/S14/S16/S17/S18/S20/S25/S28 implementados; FE-S26 parcial (KMS y TA durable hechos, faltan CSR/certificado WSASS, alertas y runbooks); FE-S12/S19/S21/S24/S27 pendientes; FE-S5/S6 parciales (wizard y delegación existen, falta la UI de control plane). FE-S3 versiona CUIT, condición IVA y punto de venta en la memoria del proceso (la fila vigente sigue siendo una; el historial en la base espera migración). Hechos además el punto de venta, QR, NC y padrón. La emisión real sigue bloqueada por P9-2/ADR-0090 y no hay UI fiscal en `src/pages/`.

## Épica FE-E1. Configuración fiscal y activación con delegación (FE1, FE2)

Requisito: emisor con CUIT válida, punto de venta WS correcto, ambiente por comercio, modo de facturación, wizard celular con delegación en CUIT proveedor + computador fiscal único.

- Historia FE-S1. Configurar datos fiscales del comercio (FE1). AC: Given cargo CUIT con dígito inválido When guardo Then rechaza antes de guardar. Given cargo PV 3 webservice When valido con `FEParamGetPtosVenta` Then confirma; si es de `Comprobantes en línea` avisa que no sirve. Given soy Empleado When pido configuración Then 403. ADR: 0018. Talla M. Depende de: nada.
- Historia FE-S2. Elegir modo automático vs a pedido (FE1.5). AC: Given soy monotributo nuevo When termino wizard Then modo = automático preseleccionado. Given cambio a a pedido When vendo Then solo se encola con botón Facturar. ADR: 0018. Talla S. Depende de: FE-S1.
- Historia FE-S3. Versionar cambios sensibles CUIT/condición/PV (FE1.6-FE1.7). AC: Given cambio condición IVA como Dueño When confirmo Then pide reauth Google (AU10) y audita anterior+nuevo sin tocar comprobantes emitidos. ADR: 0018. Talla S. Depende de: FE-S1.
- Historia FE-S4. Wizard pasos 0-3 desde celular con pausa (FE2.1-FE2.4). AC: Given completo hasta delegación y cierro app When vuelvo Then sigue en paso 4. Given soy RI en Etapa 1 When intento activar Then veo lista de espera. ADR: 0018. Talla M. Depende de: FE-S1.
- Historia FE-S5. Confirmación proveedor + prueba técnica (FE2.5-FE2.6). AC: Given marco `Ya lo hice` When confirmo Then se crea tarea en Control Plane con mi CUIT y veo `esperando confirmación del proveedor`. Given equipo marca hecha When corre `FEDummy + FEParamGetPtosVenta + FECompUltimoAutorizado` con `Auth.Cuit=comercio` Then paso a activo o veo `Falta confirmar delegación` ante 601, nunca `Error 601`. ADR: 0018. Talla M. Depende de: FE-S4.
- Historia FE-S6. Primera factura + revocación (FE2.7-FE2.8). AC: Given activo When vendo Then primera factura con CAE+QR o venta prueba + NC inmediata a elección. Given revoco delegación en ARCA When pido factura Then cola pausada + estado `delegacion_revocada` + aviso al dueño. ADR: 0018. Talla S. Depende de: FE-S5.

## Épica FE-E2. Tipo de comprobante y receptor (FE3, FE5)

Requisito: letra la decide el sistema. Tablas desde ARCA por job diario, no hardcodeadas. Umbral identificación como parámetro.

- Historia FE-S7. Determinar clase C/B/A (FE3). AC: Given emisor monotributo/exento When facturo a RI Then sale C (11/12/13). Given Etapa 2 emisor RI + receptor CF/exento/no categorizado When facturo Then sale B (6/7/8). Given monotributo pide selector letra When miro pantalla venta Then no existe selector. ADR: 0018. Talla S. Depende de: FE-S1.
- Historia FE-S8. Receptor por defecto + umbral + CUIT a pedido (FE5.1-FE5.4). AC: Given venta $3.500 sin datos When autorizo Then `DocTipo 99, DocNro 0, CondicionIVAReceptorId 5, A CONSUMIDOR FINAL`. Given venta $10.000.000 exacta sin DNI When facturo online Then bloquea y pide DNI/CUIL/CDI; offline queda `en_espera_de_datos`. Given venta $800 con CUIT a pedido When emito Then `DocTipo 80` + condición declarada, sigue C. ADR: 0018. Talla M. Depende de: FE-S7.
- Historia FE-S9. Guardar clientes fiscales + padrón Etapa 3 (FE5.5-FE5.6). AC: Given identifico CUIT When emito Then queda en `fiscal_customers` buscable por DNI/CUIT/nombre. Given Etapa 3 When consulto padrón (`ws_sr_constancia_inscripcion` o `a13`) Then trae razón/domicilio/condición. ADR: 0018. Talla M. Depende de: FE-S8.

## Épica FE-E3. Emisión desde venta + representación QR (FE4, FE7)

Requisito: 1 venta = 1 factura como máximo. Importe = total cobrado neto promos/combos/descuentos. Caja y stock no cambian al facturar.

- Historia FE-S10. Encolar factura en misma tx venta+ticket (FE4.1-FE4.4). AC: Given modo automático vendo $2.660 con conexión When pasan 10 s Then venta muestra `Factura C 00003-00000124` + CAE + vto. Given doble toque Facturar When proceso Then una sola factura (idempotency). Given venta pre-activación When reviso Then no auto, solo a pedido si fecha válida (FE10.3). ADR: 0018. Talla M. Depende de: FE-S5, slice-0.
- Historia FE-S11. Mapeo C a `FECAESolicitar` (FE4.2). AC: Given Factura C When armo pedido Then un solo comprobante `CbteDesde=CbteHasta`, concepto 1, `ImpTotal=ImpNeto` sin array IVA (validación 1443), `MonId PES`, `CondicionIVAReceptorId` siempre informado. ADR: 0018. Talla S. Depende de: FE-S10.
- Historia FE-S12. Promos/combos/fiados en total y representación (FE4.7-FE4.8). AC: Given 2x1 + combo When emito Then a ARCA solo total cobrado; PDF muestra línea promo negativa + combo con componentes y total = `ImpTotal` al centavo. Given venta $5.000 a cuenta When confirmo auto Then factura $5.000 al momento; cobro posterior no factura. Given B/A Etapas 2-3 When hay promo/combo Then base por alícuota prorrateada mayor resto, suma bases+IVA = total. ADR: 0018. Talla M. Depende de: FE-S11.
- Historia FE-S13. Representación + QR RG 4892 (FE7). AC: Given factura autorizada When abro Then pantalla + link público con token + PDF A4 y 80 mm + compartir WhatsApp, con letra/código, PV-número, fechas, emisor, receptor o `A CONSUMIDOR FINAL`, detalle, total, CAE+vto+QR. Given escaneo QR con app ARCA When valida Then CAE correcto (`https://www.arca.gob.ar/fe/qr/?p=` + JSON v1 Base64, `tipoCodAut E/A`). Given ticket de venta facturada When miro Then muestra `Factura C ...` con link, nunca CAE como si fuera factura. ADR: 0018. Talla M. Depende de: FE-S10.

## Épica FE-E4. NC desde devolución + ND manual (FE8, FE9)

Requisito: NC misma clase con `CbtesAsoc` obligatorio. Suma NC nunca supera facturado. Anular = NC total. ND solo Dueño.

- Historia FE-S14. NC automática por devolución (FE8.1-FE8.5). AC: Given devuelvo 1 de 3 de factura 124 When registro Then sale NC C con `CbtesAsoc {11, PV, 124}` por importe devuelto. Given factura pendiente (offline sin sync) When devuelvo Then NC espera a CAE y sale en orden. Given venta sin factura When devuelvo Then solo comprobante interno, sin NC. ADR: 0018. Talla M. Depende de: FE-S10.
- Historia FE-S15. Topes + prorrateo + medio reintegro (FE8.3, FE8.8-FE8.9). AC: Given intento devolver más que facturado When valido Then bloquea antes de ARCA. Given devuelvo 1 unidad de 2x1 When emito Then NC por lo cobrado prorrateado (RT12.7/RT12.11), no lista. Given reintegro con medio distinto al original When elijo Then NC igual por importe + auditoría (original, elegido, quién, cuándo). ADR: 0018. Talla S. Depende de: FE-S14.
- Historia FE-S16. ND C manual + vínculo caja (FE9). AC: Given Dueño desde factura 124 When emite ND $500 Then queda vinculada con CAE + `CbtesAsoc`. Given hubo cobro When emite ND Then exige movimiento caja asociado (C8). ADR: 0018. Talla S. Depende de: FE-S14.

## Épica FE-E5. FiscalProvider, WSAA/WSFEv1, cola/lock/idempotencia, errores (FE6, FE11)

Requisito: servicio aislado único con clave+TA. Cola persistente. Lock por (CUIT, PV, tipo) estrictamente serial. TA cacheado por (computador, servicio, ambiente) 12 h. Venta/caja nunca bloquean.

- Historia FE-S17. `FiscalProvider` + WSAA (FE6.1-FE6.5, FE16). AC: Given web/bot When piden factura Then solo encolan y leen; solo servicio firma CMS (TRA `uniqueId`, `generationTime -10 min`, `expirationTime +10 min`, `service wsfe`) vía `node-forge` u `openssl cms` (a decidir Fase 0). Given 2 workers arrancan When necesitan TA Then uno pide con advisory lock + doble check, otro lee caché; nunca otro TA vigente (`alreadyAuthenticated`). Given TA <1 h o 600/601 When chequeo Then renueva; respeta 60 s tras error WSAA no-`alreadyAuthenticated`. ADR: 0018. Talla L. Depende de: FE-S5.
- Historia FE-S18. Cola + lock + secuencia (FE6.2-FE6.3, FE6.6). AC: Given 20 ventas simultáneas mismo comercio 3 celulares When procesan Then números 125-144 consecutivos sin huecos/duplicados. Given combinaciones distintas (comercio o PV/tipo) When procesan Then paralelo; misma combinación serial. Given C When pido Then un comprobante por `FECAESolicitar`. ADR: 0018. Talla L. Depende de: FE-S17.
- Historia FE-S19. Idempotencia + conciliación (FE6.4, FE11.3-FE11.4). AC: Given timeout tras autorizar 145 When reintento a 30 s Then primero `FECompConsultar(11, PV, 145)`; si coincide (importe, doc, fecha) tomo CAE sin reenviar; si no existe reenvío mismo número; si difiere pauso cola + alerta crítica. Given job diario When compara base vs `FECompUltimoAutorizado` Then trae faltante con `FECompConsultar` o marca `emitido fuera del sistema`. Given 10016 When ocurre Then resync + 1 reintento, sino alerta. ADR: 0018. Talla M. Depende de: FE-S18.
- Historia FE-S20. Clasificación errores + bandeja (FE11.1-FE11.2, FE11.6). AC: Given ARCA caído 2 h When vendo Then ventas siguen; al volver facturan en orden con backoff (30 s, 2 min, 10 min, 30 min, luego 1 h). Given rechazo negocio `R` (10015, IVA receptor) When llega Then `Rechazada` con texto castellano en bandeja con acción (completar, reenviar, no facturar con motivo). Given error facturación When miro venta/caja Then nunca bloqueadas. ADR: 0018. Talla M. Depende de: FE-S19.
- Historia FE-S21. Métricas + guardado auditoría (FE6.7, FE13.3). AC: Given opero When miro Control Plane Then latencia ARCA, tasa rechazo por código, cola por comercio, pendiente más viejo. Given comprobante When audito Then pedido+respuesta guardados sin token/sign. Ningún log expone clave/token/sign. ADR: 0018. Talla S. Depende de: FE-S17.

## Épica FE-E6. Offline al sincronizar (FE10)

Requisito: vende igual sin conexión; factura al sync en orden cronológico con hora servidor. Ticket offline nunca dice factura.

- Historia FE-S22. Pendiente sync + fecha CbteFch (FE10.1-FE10.4). AC: Given 5 ventas offline When vuelve internet Then 5 facturas C en orden venta con fecha venta si válida (concepto 1: ±5 días, mismo mes, ≥ último comprobante); si no (mes anterior, >5 d, anterior a último) fecha hoy + representación `Venta del 30/9/2026`. Given reloj dispositivo mal When sync Then marca + factura fecha hoy (hora servidor). Given doble sync mismo `op_id` When proceso Then una factura. ADR: 0018. Talla M. Depende de: FE-S18, ADR-0003.
- Historia FE-S23. Espera datos + avisos (FE10.6-FE10.7, FE10.5 P1). AC: Given offline ≥ umbral sin DNI When sync Then `en_espera_de_datos` en bandeja Dueño. Given pendientes When hay conexión Then aviso `N ventas sin facturar, se facturan solas`. PV diferido offline (P1) solo si contador valida. ADR: 0018. Talla S. Depende de: FE-S22.

## Épica FE-E7. Homologación, historial, seguridad (FE12, FE13, FE16)

- Historia FE-S24. Ambientes separados + CI homologación (FE12). AC: Given CI despliega When corre Then emite Factura C + NC en homologación y verifica CAE. Given comercio homologación When pido Then imposible mandar a producción (selección servidor por config, nunca cliente). Representación homo con marca `PRUEBA - SIN VALIDEZ FISCAL`. Dos computadores (homo WSASS + prod Certificados Digitales). ADR: 0018. Talla M. Depende de: FE-S17.
- Historia FE-S25. Historial inmutable + exportación (FE13). AC: Given busco `00003-00000124` When abro Then CAE+QR; filtros fecha/tipo/estado/receptor/importe/número. Given autorizada When intento editar Then imposible; solo NC/ND. Export CSV/Excel mensual P1. Conservación ≥10 años [a verificar]. ADR: 0018. Talla S. Depende de: FE-S10.
- Historia FE-S26. Clave KMS + TA cifrado + runbooks (FE16). AC: Given volcado base control When leo Then sin clave ni TA sin KMS (envoltura, solo servicio descifra en memoria; nunca repo/env plano/DB cliente; contraste `odoo-argentina-ce` plano). Given cert a 60/30/7 d When miro Then alerta Control Plane + runbook renovación (mismo alias) y revocación. Acceso consola + Relaciones proveedor solo 2 personas con registro. ADR: 0018. Talla M. Depende de: FE-S17.

## Épica FE-E8. Etapa 4: CAEA + entrega/remitos (FE14, FE15)

- Historia FE-S27. CAEA contingencia opcional Fase 4 (FE14). AC: Given CAEA activo validado contador When vendo offline Then numera local con CAEA e informa (`FECAEARegInformativo`, incl. sin movimiento) en plazo; `CbteFchHsGen` obligatorio; RG 5782 solo contingencias (15016-15018). Desactivado por defecto. ADR: 0018. Talla L. Depende de: FE-S22.
- Historia FE-S28. Constancia entrega + chequeo remitos/COT (FE15). AC: Given entrego sin factura fiscal When emito Then constancia interna `DOCUMENTO NO VÁLIDO COMO REMITO`, sin palabra remito ni R (WSFEv1 no autoriza remitos; R necesita CAI RG 5678). Given cuestionario marca carne/harina/traslado BA >4.500 kg o $9.529.691 When guarda Then aviso `wsremcarne` RG 5259 / `wsremharina` RG 5264 / COT ARBA + link; solo avisa, no emite. ADR: 0018. Talla S. Depende de: nada.

## Dependencias externas

FE-S1 tras Auth (roles) y Onboarding (checklist ON8 P1). FE-S10 tras slice-0 venta+ticket+caja misma tx. FE-S12 tras Rotación RT12 (prorrateo) y Ticket TV4/TV13. FE-S14 tras Caja C14 (devolución tope). FE-S22 tras Offline OF2/OF8 + Ticket TV3.3. Todo tras Control Plane (tarea delegación, métricas, alertas cert).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Auto online | Venta $2.660 | Factura C + CAE + QR <1 min |
| Fallo | Timeout tras autorizar | Corte tras 145 | `FECompConsultar` recupera CAE, sin 146 duplicado |
| Concurrencia | 20 simultáneas | 3 celulares mismo PV | 125-144 sin huecos |
| Offline | 5 sin red + 1 mes anterior | Sync 2/10 venta 30/9 | Orden cronológico, última fecha hoy + leyenda venta |
| Rechazo | IVA receptor inválido | Envío C | Rechazada + texto + reenvío tras corregir |
| Seguridad | Volcado DB | Dump control | Clave/TA ilegibles sin KMS |
| Homologación | CI | Deploy | Factura + NC con CAE en homo |

Arch-tests: AT1 solo servicio fiscal importa clave/TA y llama ARCA (falla si web/bot importan `soap`/firma). AT2 dinero siempre bigint centavos + lint. AT3 comprobante autorizado inmutable (ningún `UPDATE` fuera de NC/ND). AT4 QR verifica contra payload `fiscal_documents.qr_payload`.

## Fuera de alcance (Etapas 1-3)

Exportación E (`wsfexv1`), detalle ítems (`wsmtxca`), MiPyMEs 201/206/211, M, usados 49, liquidación mensual, remitos R/CAI, `wsremcarne`/`wsremharina`, COT, Libro IVA, DDJJ, recategorización, percepciones/retenciones, certificado propio por comercio (ver 7.2 docx), facturas proveedores (PRD FP).

## Preguntas [a verificar] con contador/ARCA

Modo a pedido admisible por condición; offline vieja ¿fecha hoy o CAEA? ¿PV diferido?; automatizar aceptación delegación + SLA; ¿TA vigente incluye delegación nueva o demora 12 h?; padrón Etapa 3 ¿alcanza con nuestro certificado?; clase NC si cambió condición; leyendas RG 1415/4892; plazo conservación; add-on precio; alternativa cert propio.
