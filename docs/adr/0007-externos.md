---
id: ADR-0007
tipo: adr
estado: aceptado
modulos: []
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: "Fuente: https://accounts.google.com/.well-known/openid-configuration leída 2026-10-10."
---
# ADR-0007 - Verificación externos en fuentes oficiales

Estado: aceptado. Fecha: 2026-10-10.

## Google OIDC - VERIFICADO

Fuente: `https://accounts.google.com/.well-known/openid-configuration` leída 2026-10-10.

`issuer https://accounts.google.com`, `id_token RS256`, `scopes openid email profile`, `claims sub email email_verified picture`, `code_challenge S256`, `grant authorization_code refresh_token`. Valida AU1 Code+PKCE servidor, `sub` estable, `email_verified=true`, 2 apps OAuth separadas. Sin cambios al diseño.

## WhatsApp Cloud API pricing - VERIFICADO con cambio vigente

Fuentes: `developers.facebook.com/documentation/business-messaging/whatsapp/pricing` y `/docs/whatsapp/pricing`.

Per-message desde 1/7/2025 solo `type template`. No-template gratis solo en ventana. Utility en ventana gratis desde 1/7/2025 pero con cobro desde 1/10/2026 incluso en ventana. Service se cobra como utility/auth por mercado. Moneda ARS disponible. Tiers por mercado-categoría resetean mensual.

Impacto: confirma decisión costos 9/10/2026 número central + utility ~USD 0.026 AR + cupo 1000 servicio compartido + 3 notificaciones clave siempre pagas. Ajustar presupuesto a rate card ARS Oct-2026 antes de fijar planes.

## Gmail watch - VERIFICADO

Fuentes: `developers.google.com/workspace/gmail/api/guides/push` y `.../users/watch` 2026-09-15.

`POST gmail/v1/users/{userId}/watch` con `topicName` PubSub + permiso publish. Responde `historyId + expiration`. Renovar mínimo cada 7 días, recomendado diario. Notificación trae email + historyId, no contenido.

Valida CS: job diario renovación watch + fallback `history.list` 15min + `labelIds` por tipo. Sin cambios.

## Google Photos - VERIFICADO

Fuentes: `developers.google.com/photos/overview/authorization`, `/support/updates`, `/library/guides/upload-media`, `/library/guides/list`.

Desde 31/3/2025 solo app-created. Scopes muertos: `photoslibrary.readonly`, `sharing`, `photoslibrary`. Vivos: `appendonly` subir, `readonly.appcreateddata` listar, `edit.appcreateddata` organizar. Upload token 1 día. URLs contenido temporales.

Valida FP2/CS3: subir por `appendonly`, leer solo lo propio, repedir URL cada vista, conservar original en producto, Picker API si se elige existente. Sin cambios.

## ARCA WSFEv1 - VERIFICADO

Fuentes: `afip.gob.ar/ws/documentacion/ws-factura-electronica.asp`, manuales `wsfev1` v4.7/v4.0/v2.22.

`FECAESolicitar` homologación `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`, Auth Token/Sign/Cuit WSAA, `FECompUltimoAutorizado`, `FEParamGet*`, `FEDummy`, `FECompConsultar`, CAEA `FECAEASolicitar/Consultar/RegInformativo/SinMovimiento`. RG 4291 A/B/C/M.

Valida FE1-FE16 con `FiscalProvider` abstracción + cola/lock/idempotencia + homologación/producción. Sin cambios, usar manual v4.7 como base.

## Pendiente no verificable por docs

Verificación marca OAuth Google + CASA anual Gmail, aprobación plantillas ES_AR Meta, verificación negocio ~100 clientes, cuotas Photos, BarcodeDetector iOS, OPFS iOS. Requieren consola y pruebas en dispositivos reales Fase 0.
