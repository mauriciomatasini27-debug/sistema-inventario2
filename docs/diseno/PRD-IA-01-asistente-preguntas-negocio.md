# PRD-IA-01 - Asistente de IA para preguntas del negocio (R2)

Fuente: `docs/08-operacion-admin-analytics/reportes-rotacion.md` (RT1-RT11), `docs/04-ventas-caja-fiado/caja-digital-parte-1.md`, `docs/04-ventas-caja-fiado/fiado-cuenta-corriente.md`, `src/db/schema*.ts`, PRD-BOT-01. Fecha extracción: 2026-10-12. Restringido por ADR-0003 (aislamiento tenant), ADR-0006 (Ley 25.326), ADR-0039, ADR-0044, ADR-0045. Gap: reportes fijos; sin consulta en lenguaje natural.

## Épica IA-E1. Catálogo cerrado de preguntas

Requisito IA-1: el asistente responde solo un set fijo de preguntas, cada una respaldada por una función de lectura determinista.

- Historia IA-S1. Catálogo de 8 a 12 preguntas, cada una con una función tipada con zod y solo lectura sobre Drizzle: `top_productos`, `ventas_periodo`, `por_vencer`, `deudores`, `stock_bajo`, `margen_producto`, `caja_dia`, `rotacion_lenta`. AC: Given pregunta fuera del catálogo When llega Then responde `Todavía no sé responder eso` más la lista disponible. ADR: 0044. Talla M. Depende de: PERS-S4.
- Historia IA-S2. Function calling: el LLM (Claude o GPT) solo elige función y parámetros y redacta la respuesta; nunca genera SQL ni números. AC: Given `¿qué vendí más esta semana?` When proceso Then llamo `top_productos({desde, hasta})` y cada número citado sale del resultado. ADR: 0044. Talla M. Depende de: IA-S1.
- Historia IA-S3. Aislamiento: `tenant_id` y rol los pone el servidor desde la sesión, nunca el modelo. AC: Given prompt que pide datos de otro tenant When proceso Then la función usa el tenant de sesión; Given empleado Then no ve costos ni margen. ADR: 0003. Talla S. Depende de: IA-S1.

## Épica IA-E2. Canal, cupo y costo

Requisito IA-2: la API del LLM es de pago por uso; el costo queda acotado por plan y medido por tenant.

- Historia IA-S4. Disponible en `/panel` y por WhatsApp como módulo activable. AC: Given módulo apagado When pregunto Then no se llama al LLM. ADR: 0039. Talla S. Depende de: BOT-S1.
- Historia IA-S5. Cupo mensual por plan más registro `ai_usage(tenant_id, tokens_in, tokens_out, costo_centavos)`; modelo chico por defecto. AC: Given cupo agotado When pregunto Then aviso y no llamo; Given mes nuevo Then el cupo se reinicia. ADR: 0045. Talla S. Depende de: IA-S2.

## Dependencias externas

IA-S1 espera a PERS-S4. IA-S4 espera a BOT-S1 de PRD-BOT-01. IA-S5 espera a definición de planes en `docs/01-fundacion/costos-por-cliente.md`.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Más vendido | `¿qué vendí más esta semana?` | Top 5 igual a la consulta SQL directa |
| Feliz | Deudores | `¿quién me debe más?` | Lista igual a `deudores()` |
| Fallo | Escritura | `borrá el producto X` | Rechaza; no existen funciones de escritura |
| Fallo | Cross-tenant | Prompt con otro `tenant_id` | Ignora, usa tenant de sesión |
| Regresión | Cupo | Pregunta con cupo agotado | Cero llamadas al LLM |

Arch-tests: AT1 el registro de funciones del asistente no contiene ninguna escritura. AT2 ninguna función recibe `tenant_id` desde argumentos del modelo.