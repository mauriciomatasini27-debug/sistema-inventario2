# PRD-BOT-02 - Consulta de stock por WhatsApp en tiempo real (R2)

Fuente: `docs/07-canales-whatsapp-email/bot-whatsapp-parte-1.md` y `bot-whatsapp-parte-2.md` (B1 vinculación, B3 consulta texto libre), `src/modules/whatsapp/consulta.ts`, `src/modules/whatsapp/router.ts`, `src/pages/api/whatsapp/consult.ts` (lee `products` con fallback a memoria, `fuente: db|memoria`), `src/modules/whatsapp/cliente-cloud.ts`, `docs/01-fundacion/costos-por-cliente.md` (número central). Fecha extracción: 2026-10-12. Restringido por ADR-0007, ADR-0024, ADR-0039, ADR-0041, ADR-0042.

## Épica BOT2-E1. Consulta con saldo real

Requisito BOT2-1: el vendedor pregunta por WhatsApp y recibe el saldo vigente leído de Postgres vía Drizzle, nunca de memoria.

- Historia BOT2-S1. Consulta exacta. El vendedor vinculado escribe `¿tenés X?`, `stock X` o el código de barras; el bot responde nombre, saldo, unidad y precio vigente. AC: Given producto con match único y DB viva When consulto Then respondo en menos de 3 s con `fuente: db`. ADR: 0024. Talla S. Depende de: PERS-S4.
- Historia BOT2-S2. Match difuso. Búsqueda `pg_trgm` sobre `products.nombre` más `product_aliases`. AC: Given 2 a 5 candidatos When consulto Then lista numerada para elegir con `1`-`5`; Given más de 5 Then pide precisar; Given 0 Then `No lo encontré` más sugerencia más cercana. ADR: 0026. Talla M. Depende de: BOT2-S1.
- Historia BOT2-S3. Permisos por rol. AC: Given empleado sin permiso de costos When consulto Then no veo costo ni margen; Given teléfono no vinculado Then pido vincular con código de 6 dígitos y no muestro datos. ADR: 0039. Talla S. Depende de: BOT2-S1.
- Historia BOT2-S4. Detalle por lote. AC: Given producto con `controla_vencimiento` When respondo `detalle` Then muestro lotes en orden FEFO con fecha y cantidad. ADR: 0026. Talla S. Depende de: CAT-S3.

## Épica BOT2-E2. Proveedor de WhatsApp intercambiable

Requisito BOT2-2: el núcleo puro no depende del proveedor; la elección se cierra en ADR-0041.

- Historia BOT2-S5. Interfaz `WhatsAppTransport` (`enviar`, `recibir`, `estado`) con un adaptador por proveedor. AC: Given cambio de adaptador When corro los tests del router Then pasan sin tocar `consulta.ts` ni `router.ts`. ADR: 0042. Talla M. Depende de: nada.
- Historia BOT2-S6. Comparativa para el ADR: Cloud API oficial (pago por mensaje y plantilla, número central ya decidido, alta Meta única) vs Baileys (sin costo por mensaje, número personal, cliente no oficial con riesgo de bloqueo del número e incumplimiento de términos de WhatsApp). AC: Given la tabla costo, riesgo, límites y operación When se presenta Then ADR-0041 elige uno y descarta el otro con motivo. ADR: 0041. Talla S. Depende de: BOT2-S5.

## Dependencias externas

BOT2-S1 espera a PERS-S4 (cutover a DB). BOT2-S4 espera a CAT-S3. BOT2-S2 a BOT2-S4 esperan a BOT2-S1. BOT2-S6 espera a BOT2-S5. Envío real espera al alta Meta de ADR-0041.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Consulta exacta | `¿tenés coca 500?` | Saldo y precio, `fuente: db`, menos de 3 s |
| Feliz | Elegir candidato | `alfajor` con 3 matches, luego `2` | Saldo del segundo |
| Fallo | No vinculado | Mensaje de teléfono sin vínculo | Pide vincular, cero datos |
| Fallo | Ambiguo | 8 candidatos | Pide precisar |
| Regresión | Sin DB | DB caída | Responde `no pude consultar, probá en un rato`, nunca saldo de memoria |

Arch-tests: AT1 `consulta.ts` y `router.ts` no importan adaptadores de transporte. AT2 ninguna respuesta de saldo sale con `fuente: memoria`.