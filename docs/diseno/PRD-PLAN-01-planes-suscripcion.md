# PRD-PLAN-01 - Planes de suscripción mensual, cupos y estrategia comercial (R2)

Fuente: `docs/01-fundacion/costos-por-cliente.md` (precios de referencia Básico 15 / Plus 35 / Pro 59 USD, número central WABA, ~USD 0,026 por mensaje AR a verificar, WhatsApp dentro del precio del plan, "cupo y cobrar el excedente"), `docs/03-inventario-precios/inventario-parte-1.md:49` (suscripción mensual ARS con ajuste o USD, Mercado Pago o transferencia), `docs/03-inventario-precios/inventario-parte-2.md` (F8.4 prueba gratis, mora 14 días), `docs/02-identidad-onboarding/onboarding-parte-1.md` (prueba sin tarjeta) y `onboarding-parte-2.md` (cupo Básico 100 mensajes, ON5.8 mensajes de onboarding fuera del cupo), PRD-BOT-01, PRD-BOT-02, PRD-ALR-01, PRD-IA-01 (IA-S5 `ai_usage`), PRD-LP-04, PRD-DASH-01 (DASH-S8, DASH-S12), PRD-CP-01 (mora, CP-S8 sin billing automático en MVP), PRD-NEG-01, `src/pages/panel.astro`, `C:\Users\mauri\ModoOpsVideoTools\README-INSTALACION.md` (stack de video IA local con MoneyPrinterTurbo). Fecha extracción: 2026-10-12. Restringido por ADR-0047, ADR-0003, ADR-0006, ADR-0039, ADR-0041, ADR-0045, ADR-0046.

## Planes y funciones

Nombres tentativos tomados de `costos-por-cliente.md`. Precios: referencia interna de ese documento, no publicados, quedan a definir con precios oficiales vigentes. Cupos: a definir salvo el de Básico (100 mensajes, `onboarding-parte-2.md`).

| Función | Básico | Plus | Pro |
|---|---|---|---|
| Inventario, ventas, caja, ticket, fiado, offline | Sí | Sí | Sí |
| Alertas de stock bajo por email (PRD-ALR-01) | Sí | Sí | Sí |
| Bot de WhatsApp: consulta de stock (PRD-BOT-02) | Sí, cupo 100 mensajes | Sí, cupo a definir | Sí, cupo a definir |
| Alertas de stock bajo por WhatsApp y aviso matutino (PRD-ALR-01) | No, upsell | Sí | Sí |
| Módulos de rubro del bot (PRD-BOT-01) | No | `quiosco` | Todos los habilitados |
| Asistente IA `Preguntale al negocio` (PRD-IA-01) | No, upsell | Cupo chico a definir | Cupo mayor a definir |
| Chat de landing (PRD-LP-04) | Plataforma, sin plan | Plataforma, sin plan | Plataforma, sin plan |
| Precio mensual de referencia | USD 15, a definir | USD 35, a definir | USD 59, a definir |

El chat de landing no se vende por plan: vive en la landing pública del proveedor (ADR-0046) y es canal de captación (PLAN-E6). Las alertas por email entran en Básico porque cuestan centavos; las de WhatsApp van a Plus porque son plantillas pagas que se cobran siempre.

## Épica PLAN-E1. Modelo de planes

Requisito PLAN-1: un plan mensual define módulos y cupos; no hay venta por módulo.

- Historia PLAN-S1. Tablas de control `plans`, `plan_features(plan_id, feature, cupo_mensual)` y `subscriptions(tenant_id, plan_id, estado, desde, hasta, plan_programado)` con semilla Básico, Plus y Pro según la tabla de este PRD. AC: Given tenant en Básico When consulto `planIncluye(tenant, 'asistente_ia')` Then devuelve falso; Given tenant en Plus Then devuelve verdadero con su cupo. ADR: 0047, 0003. Talla M. Depende de: nada.
- Historia PLAN-S2. `tenant_bot_modules` (ADR-0039) se limita a lo que el plan habilita: un toggle fuera del plan no se puede encender. AC: Given Básico When intento encender `quiosco` por API Then 403 con motivo `fuera_de_plan`. ADR: 0047, 0039. Talla S. Depende de: PLAN-S1, BOT-S1.

## Épica PLAN-E2. Cambios de plan

Requisito PLAN-2: subir es inmediato, bajar es a fin de período, y nunca se pierden datos.

- Historia PLAN-S3. Upgrade inmediato con prorrateo por días restantes del período; el cupo nuevo se suma proporcional. AC: Given Básico el día 10 de 30 When paso a Plus Then los módulos se encienden al instante y el cobro es la diferencia por 20/30 días, a definir con el proveedor de cobro. ADR: 0047. Talla M. Depende de: PLAN-S1.
- Historia PLAN-S4. Downgrade programado al fin del período en `plan_programado`, sin reintegro. AC: Given Plus When pido bajar a Básico Then sigo con Plus hasta `hasta` y el panel muestra la fecha del cambio. ADR: 0047. Talla S. Depende de: PLAN-S1.
- Historia PLAN-S5. Al perder un nivel, datos y configuración se conservan congelados: historial del bot y del asistente quedan en solo lectura, umbrales siguen vigentes para email, toggles quedan guardados y se restauran si vuelve a subir en 90 días (plazo a definir). AC: Given bajé de Plus a Básico When abro `/panel/bot/historial` Then veo lo anterior en solo lectura con aviso; Given vuelvo a Plus Then los módulos se reactivan como estaban. ADR: 0047, 0039. Talla M. Depende de: PLAN-S4.
- Historia PLAN-S6. Mora: gracia de 14 días con todo encendido, día 15 solo lectura según ADR-0006 y F8.4; los módulos de pago se apagan primero que el núcleo. AC: Given día 15 sin pago When el bot recibe consulta Then responde que la cuenta está suspendida y no gasta cupo pago. ADR: 0006, 0047. Talla S. Depende de: PLAN-S1, CP-S8.

## Épica PLAN-E3. Planes en el panel del tenant

Requisito PLAN-3: cada plan ve lo suyo y lo que no tiene aparece como upsell discreto, sobre el ocultamiento de DASH-S12.

- Historia PLAN-S7. `/panel/plan` muestra plan actual, fecha de renovación, cupos usados y restantes (DASH-S8) y botones `Cambiar plan`; solo Dueño (AU4.5). AC: Given empleado When abro `/panel/plan` Then 403; Given Dueño Then veo cupo de WhatsApp e IA con número y texto, nunca solo color. ADR: 0047, 0036. Talla M. Depende de: PLAN-S1, DASH-S8.
- Historia PLAN-S8. Módulos fuera del plan: el índice de `/panel` muestra una tarjeta de upsell por módulo no incluido (máximo una a la vez, descartable 30 días) en lugar de ocultar todo; módulos apagados por el Dueño dentro del plan siguen ocultos como en DASH-S12. AC: Given Básico When abro `/panel` Then veo una tarjeta `Asistente IA en Plus` con un CTA y sin datos falsos; Given la descarto Then no vuelve en 30 días. ADR: 0047, 0020. Talla S. Depende de: DASH-S12, PLAN-S1.
- Historia PLAN-S9. Rutas de módulos fuera de plan (`/panel/bot/*`, `/panel/alertas/*` de WhatsApp, drawer asistente) responden con pantalla de upsell, no 404. AC: Given Básico When abro el drawer del asistente Then explica qué hace, en qué plan está y ofrece `Ver planes`. ADR: 0047, 0035. Talla S. Depende de: PLAN-S8, DASH-S7.

## Épica PLAN-E4. Cupos y costos pagos

Requisito PLAN-4: el costo variable de WhatsApp Cloud API y del LLM queda medido y con techo por plan.

- Historia PLAN-S10. Medición: `usage_counters(tenant_id, mes, feature, usado)` alimentado por `whatsapp_usage` (mensajes y plantillas, marca `onboarding` fuera de cupo según ON5.8) y `ai_usage` (IA-S5); costo estimado en centavos con tarifa en configuración, nunca hardcodeada. AC: Given 10 consultas al bot y 3 al asistente When cierro el día Then los contadores suben 10 y 3 y el costo usa la tarifa vigente. ADR: 0047, 0041, 0045. Talla M. Depende de: PLAN-S1, BOT2-S1, IA-S5.
- Historia PLAN-S11. Cupo agotado: WhatsApp degrada a link `wa.me` y email (como FC8.7) y avisa al 80% y al 100%; el asistente se bloquea con fecha de reinicio (DASH-S8); excedente pago queda como opción a definir, apagado por defecto. AC: Given cupo de WhatsApp al 100% When el bot recibe consulta Then responde una vez que se agotó y ofrece la web, sin seguir gastando; Given 80% Then el Dueño recibe aviso por email. ADR: 0047, 0045. Talla M. Depende de: PLAN-S10.
- Historia PLAN-S12. Margen por plan en el panel admin (PA8): costo de WhatsApp y LLM por tenant contra precio del plan, solo contadores técnicos según ADR-0006. AC: Given tenant con costo mayor a 50% del precio When reviso el panel admin Then aparece marcado. ADR: 0006, 0047. Talla S. Depende de: PLAN-S10.

## Épica PLAN-E5. Cobro

Requisito PLAN-5: el cobro de la suscripción se integra sin sumar credenciales del kiosco.

- Historia PLAN-S13. Interfaz `BillingProvider` con adaptador manual (transferencia, alta en panel admin, como CP-S8) y adaptador Mercado Pago débito automático pendiente de decisión. AC: Given adaptador manual When el admin marca pago Then la suscripción pasa a `activa` y queda en auditoría. ADR: 0047, 0006. Talla M. Depende de: PLAN-S1.
- Historia PLAN-S14. Factura de la suscripción por ARCA vía `FiscalProvider` (PRD-FE-01) al confirmar el pago, cuando el proveedor facture. AC: Given pago confirmado When corre la facturación Then queda CAE vinculado a la suscripción o error reintentable. ADR: 0018. Talla M. Depende de: PLAN-S13.

## Épica PLAN-E6. Marketing, ventas y captación

Requisito PLAN-6: el embudo lleva de contenido a prueba gratis y de prueba a plan pago, medido por etapa.

Embudo: contenido (videos, redes, referidos) a landing, de ahí a chat de landing o WhatsApp, luego alta con prueba gratis de 14 días sin tarjeta (con funciones de Plus para que vea bot y alertas), elección de plan al día 10 y pago. Canales: videos cortos en redes, WhatsApp del proveedor, referidos entre kiosqueros, distribuidores y mayoristas (a confirmar), y venta directa de descubrimiento (PRD-NEG-01). No hay freemium permanente (ADR-0047).

> Nota 2026-10-12: decisión del dueño: se elimina Descubrimiento (sin precio de servicio ni implementación; la carga de datos va incluida en el onboarding), ver PRD-LANDING-01; revisable.

- Historia PLAN-S15. Prueba gratis de 14 días con funciones de Plus y cupo de prueba a definir (pregunta abierta en `onboarding-parte-2.md:261`); al terminar baja sola a solo lectura hasta elegir plan. AC: Given día 14 sin plan When abro `/panel` Then veo los planes y mis datos intactos en solo lectura. ADR: 0047. Talla S. Depende de: PLAN-S1, PLAN-S6.
- Historia PLAN-S16. Chat de landing como captación: al detectar interés (precio, rubro, alta) ofrece `Probar 14 días` o derivar a WhatsApp y registra el lead sin datos personales más allá de los que la persona deja. AC: Given pregunto `¿cuánto sale?` When responde Then muestra planes como `a definir` o el precio publicado y un CTA de alta; Given dejo mi WhatsApp Then queda un lead con consentimiento. ADR: 0046, 0047. Talla S. Depende de: DASH-S10, LP4-S1.
- Historia PLAN-S17. Referidos: código por tenant; quien refiere y quien entra reciben un beneficio a definir (por ejemplo un mes de cupo extra) cuando el referido paga el primer mes. AC: Given referido paga When se confirma Then el beneficio se aplica una sola vez a cada uno. ADR: 0047. Talla M. Depende de: PLAN-S13.
- Historia PLAN-S18. Videos de venta con el stack de video IA de ModoOps (`C:\Users\mauri\ModoOpsVideoTools`: MoneyPrinterTurbo v1.3.6 con Ollama, Piper, faster-whisper, Shotcut y LosslessCut, pipeline #93 con revisión humana y etiqueta sintética): serie de piezas cortas 9:16 por plan (stock por WhatsApp, alerta de faltante, pregunta al asistente) con UTM por pieza hacia la landing. Si la app se ofrece además como producto a clientes de ModoOps, ese cruce queda a confirmar. AC: Given publico una pieza When alguien llega a la landing Then el alta registra la UTM de esa pieza; Given pieza sin etiqueta de contenido sintético Then no se publica. ADR: no aplica. Talla M. Depende de: PLAN-S16.
- Historia PLAN-S19. Métricas del embudo en el panel admin: visitas, leads del chat, altas, pruebas que pagan, plan elegido, upgrades y bajas, sin datos de negocio del tenant (ADR-0006). AC: Given cierro el mes When reviso el panel admin Then veo conversión por etapa y por canal UTM. ADR: 0006, 0047. Talla S. Depende de: PLAN-S15, PLAN-S16, PLAN-S18.

## Dependencias externas

Proveedor de cobro: Mercado Pago débito automático como decisión pendiente; mientras tanto cobro manual (CP-S8). Facturación ARCA de la suscripción espera a PRD-FE-01 y a confirmar con contador. Precios y cupos esperan a tarifas oficiales: WhatsApp Cloud API en https://developers.facebook.com/docs/whatsapp/pricing y LLM en https://www.anthropic.com/pricing y https://openai.com/api/pricing (ADR-0045), cifras a definir. PLAN-E3 espera a PRD-DASH-01. PLAN-S18 espera a confirmar uso comercial de las licencias del material (Mixkit, Coverr) y de MoneyPrinterTurbo.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Upgrade | Básico a Plus el día 10 | Módulos al instante, prorrateo 20/30 |
| Feliz | Downgrade | Plus a Básico | Sigue Plus hasta fin de período |
| Feliz | Upsell | Básico abre `/panel` | Una tarjeta de upsell, sin datos falsos |
| Feliz | Lead del chat | `¿cuánto sale?` en la landing | CTA de prueba y lead con consentimiento |
| Fallo | Cupo WhatsApp agotado | Consulta 101 en Básico | Un aviso, deriva a web, cero mensajes pagos extra |
| Fallo | Cupo IA agotado | Pregunta con cupo 0 | Cero llamadas al LLM, fecha de reinicio |
| Fallo | Toggle fuera de plan | Encender módulo en Básico | 403 `fuera_de_plan` |
| Fallo | Mora día 15 | Sin pago | Solo lectura, bot no gasta cupo |
| Regresión | Volver a subir | Básico a Plus antes de 90 días | Toggles y umbrales restaurados |
| Regresión | Prueba vencida | Día 14 sin plan | Datos intactos en solo lectura |

Arch-tests: AT1 ninguna pantalla ni handler decide acceso por plan fuera de `planIncluye` (lint de imports). AT2 ningún precio ni tarifa hardcodeado en `src/` (lint). AT3 todo envío pago de WhatsApp y toda llamada al LLM pasa por `usage_counters` antes de salir.
