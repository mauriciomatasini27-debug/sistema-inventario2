---
id: PRD-DASH-01
tipo: prd
estado: en curso
modulos: [admin, bot, landing]
depende_de: [ADR-0006, ADR-0020, ADR-0029, ADR-0032, ADR-0038, ADR-0039, ADR-0041, ADR-0045, ADR-0046, PRD-ALR-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Implementación en el dashboard de bot, alertas, asistente IA y chat de landing. Hechos S1, S3, S4, S7 a S11
  y S13; pendientes DASH-S2, S5, S6 y el cierre de S12 (tarjeta de Alertas y pills).
---
# PRD-DASH-01 - Implementación en dashboard: bot, alertas, asistente IA y chat de landing (R2)

Fuente: PRD-BOT-02, PRD-ALR-01, PRD-IA-01, PRD-LP-04, PRD-BOT-01, PRD-OP-01, PRD-DS-02, PRD-UI-01 a PRD-UI-07, `docs/08-operacion-admin-analytics/dashboard-indice-navegacion.md`, `docs/07-canales-whatsapp-email/*`, `src/pages/panel.astro`, `src/pages/index.astro`, `src/components/ui/ChatLanding.astro`, `src/components/sections/Faq.astro`. Skills UI/UX: `.agents/skills/better-layout`, `better-typography`, `better-colors`, `better-writing`, `better-accessibility`, `better-ui`, `ask-sonner`, `state-machine`, `interface-review`, `break-ui`, `mobile-native`. Fecha extracción: 2026-10-12. Restringido por ADR-0006, ADR-0020, ADR-0029, ADR-0032 a ADR-0038, ADR-0039, ADR-0041 a ADR-0046.

> Estado al 2026-10-23: en curso. Hechos DASH-S1 (`/panel/bot/config`), S3 (tarjeta Bot), S4 (`/panel/alertas/umbrales`), S6 (`/panel/alertas/historial` con canal y estado de entrega, una fila por alerta aunque el job reintente; sin botón `Armar pedido`, ver `docs/roadmap/avances/DASH-S6.md`), S7/S8/S9 (drawer del asistente con estados y cupo), S10/S11 (chat de landing), S12 (índice con Bot, Alertas y Asistente desde `MODULOS_INDICE`) y S13 como gate de UI. Pendientes DASH-S2 (historial del bot) y S5 (destinatarios); el cierre de S13 sobre las 9 pantallas espera esas dos.

## Épica DASH-E1. Bot de WhatsApp en el panel de tenant

Requisito DASH-1: el Dueño configura y audita el bot sin salir de `/panel`.

- Historia DASH-S1. Pantalla `/panel/bot/config`: estado de vinculación por teléfono (vinculado, pendiente, pausado), botón `Generar código` (6 dígitos, 10 min, cuenta regresiva), opt-in por persona y toggles de módulos por rubro. AC: Given Dueño sin teléfonos vinculados When abre la pantalla Then ve estado vacío con un solo CTA `Vincular WhatsApp`; Given código vencido Then el botón regenera sin recargar. ADR: 0039, 0041. Talla M. Depende de: BOT-S1.
- Historia DASH-S2. Pantalla `/panel/bot/historial`: lista virtualizada de consultas (fecha, teléfono enmascarado, pregunta, respuesta, `fuente: db`), filtro por persona y por fecha. AC: Given 2.000 consultas When hago scroll Then no hay jank a 360 px; Given empleado Then no ve el historial ajeno. ADR: 0042, 0037. Talla M. Depende de: BOT2-S1.
- Historia DASH-S3. Tarjeta `Bot` en el índice de `/panel`: consultas de hoy, última consulta, estado del número central. AC: Given Cloud API caída When abro `/panel` Then la tarjeta muestra estado degradado en texto, nunca solo color. ADR: 0034, 0036. Talla S. Depende de: DASH-S1.

## Épica DASH-E2. Alertas de stock bajo

Requisito DASH-2: umbrales, destinatarios e historial de alertas se gestionan en una sola sección.

- Historia DASH-S4. Pantalla `/panel/alertas/umbrales`: tabla de productos con `min_stock` y `reorder_qty` editables en línea, sugerido por rotación en gris, edición masiva por categoría. AC: Given edito un mínimo When guardo Then confirmación con Sonner y deshacer; Given valor negativo Then error en línea que explica qué poner. ADR: 0043, 0035. Talla M. Depende de: ALR-S1.
- Historia DASH-S5. Pantalla `/panel/alertas/destinatarios`: Dueño fijo, encargados con canal (WhatsApp, email, ambos), horario matutino y pausa. AC: Given encargado sin opt-in WhatsApp When elijo WhatsApp Then se explica que debe vincularse primero y se ofrece el código. ADR: 0039, 0043. Talla S. Depende de: ALR-S3, DASH-S1.
- Historia DASH-S6. Pantalla `/panel/alertas/historial`: alertas enviadas (fecha, canal, ítems, estado de entrega) y botón `Armar pedido` que abre el borrador. AC: Given alerta duplicada por reintento When reviso historial Then aparece una sola vez. ADR: 0043, 0040. Talla S. Depende de: ALR-S5.

## Épica DASH-E3. Asistente IA en el panel

Requisito DASH-3: el asistente vive como chat dentro de `/panel`, con las preguntas disponibles a la vista.

- Historia DASH-S7. Panel lateral `Preguntale al negocio` (drawer a la derecha en escritorio, pantalla completa a 360 px): chips con las 8-12 preguntas del catálogo, input libre, respuestas con números en `tabular-nums` y link al reporte de origen. AC: Given pregunta fuera de catálogo When envío Then muestro la respuesta fija y resalto los chips; Given respuesta con números Then cada número coincide con su función. ADR: 0044, 0033. Talla M. Depende de: IA-S2.
- Historia DASH-S8. Medidor de cupo en el drawer y en `/panel/plan`: usado y restante del mes. AC: Given cupo agotado When abro el drawer Then el input queda deshabilitado con explicación y fecha de reinicio. ADR: 0045. Talla S. Depende de: IA-S5.
- Historia DASH-S9. Estados del chat modelados como máquina: `inactivo`, `enviando`, `respondiendo`, `error`, `sin_cupo`. AC: Given error de red When envío Then mensaje que dice qué pasó y botón `Reintentar`; nunca spinner infinito. ADR: 0038. Talla S. Depende de: DASH-S7.

## Épica DASH-E4. Chat flotante en la landing

Requisito DASH-4: el chat reemplaza al botón flotante actual sin perder la salida directa a WhatsApp.

- Historia DASH-S10. Componente `ChatLanding.astro` que reemplaza `FloatingWhatsApp.astro`: burbuja abajo a la derecha, panel con saludo, 3 sugerencias desde `Faq.astro` y botón WhatsApp siempre visible en el encabezado del panel. AC: Given landing a 360 px When abro el chat Then no tapa el CTA del Hero y cierra con `Esc`; Given JS deshabilitado Then queda el link directo a WhatsApp. ADR: 0046, 0036. Talla M. Depende de: LP4-S1.
- Historia DASH-S11. Mensajes con `aria-live`, límite de 20 mensajes con aviso, motion de apertura menor a 300 ms con `reduced-motion`. AC: Given mensaje 21 When envío Then el panel deriva a WhatsApp sin llamar al LLM. ADR: 0046, 0037. Talla S. Depende de: DASH-S10.

## Épica DASH-E5. Navegación y consistencia

Requisito DASH-5: las nuevas secciones respetan el índice visual y el sistema Tema Papel.

- Historia DASH-S12. Índice de `/panel` suma `Bot`, `Alertas` y `Asistente` sin hardcode (cierra `n-tickets=91` de PRD-OP-01) y con módulos apagados ocultos. AC: Given módulo apagado When abro `/panel` Then su tarjeta no aparece. ADR: 0020, 0029, 0039. Talla S. Depende de: DASH-S1, DASH-S4, DASH-S7.
- Historia DASH-S13. Revisión de interfaz y stress antes de merge sobre las 9 pantallas nuevas. AC: Given corro `npm run check:ui` y `check:contrast` When termina Then cero `alert()`, contraste AA y Sonner único. ADR: 0038. Talla S. Depende de: DASH-S1 a DASH-S12.

## Dependencias externas

DASH-E1 espera a PRD-BOT-02 y ADR-0041 (alta Meta). DASH-E2 espera a PRD-ALR-01 y migración Supabase. DASH-E3 espera a PRD-IA-01 y evaluación de ADR-0045. DASH-E4 espera a PRD-LP-04 y FAQ cerrada de PRD-LP-02. Todas esperan a tokens de PRD-DS-01 y componentes de PRD-DS-02.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Vincular bot | Dueño genera código y lo envía | Teléfono pasa a `vinculado` sin recargar |
| Feliz | Editar umbral | Mínimo 10 en un producto | Guardado, toast con deshacer, próxima alerta lo usa |
| Feliz | Preguntar | Chip `¿qué vendí más esta semana?` | Top 5 igual a reporte de rotación |
| Feliz | Chat landing | `¿sirve para mi almacén?` | Respuesta FAQ y botón WhatsApp |
| Fallo | Sin cupo IA | Cupo agotado | Input deshabilitado con fecha de reinicio |
| Fallo | Rol | Empleado abre historial del bot | Solo sus consultas |
| Regresión | 360 px | Las 9 pantallas y el chat | Sin scroll horizontal ni CTA tapado |

Arch-tests: AT1 componentes de `/panel` no importan `src/pages/api/landing-chat.ts` ni viceversa. AT2 toda pantalla nueva usa tokens de Tema Papel, sin colores sueltos (lint). AT3 ningún contador del índice está hardcodeado.