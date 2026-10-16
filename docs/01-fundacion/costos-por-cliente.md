---
id: MOD-01-COSTOS-POR-CLIENTE
tipo: spec
estado: propuesto
modulos: [bot, inventario]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  Decisión (dueño, 9/10/2026): un único número central de WhatsApp Business. La WABA y el número son del
  proveedor (nosotros). Los kioscos no necesitan su propia cuenta de WhatsApp Business ni cargar una tarjeta en
  Meta.
---
> Origen: `Costos estimados por cliente - Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/modules/payments`, `src/modules/whatsapp`, `src/modules/ocr`

---

# Costos estimados por cliente - Sistema de Inventario

Fecha de elaboración: 9 de octubre de 2026. Todas las fuentes se consultaron el 9/10/2026 salvo que se indique otra fecha. Tipo de cambio usado: USD 1 = ARS 1.540 (dólar oficial BNA, venta, 9/10/2026). Referencia: dólar tarjeta ARS 2.002 (lo que pagás de hecho si abonás servicios en USD con tarjeta argentina). Fuentes: Dólar Histórico BNA, TN, 9/10/2026, Sin Filtro, 9/10/2026. Alcance: costos variables y de infraestructura para operar el SaaS (inventario + caja digital + bot de WhatsApp + facturas de proveedores + órdenes de pago), según los PRD locales. No incluye sueldos, soporte humano, marketing, impuestos sobre la facturación propia (IVA, IIBB, Ganancias) ni el costo de adquisición de clientes. Actualización (9/10/2026): recalculado con la decisión de un número central de WhatsApp para todos los kioscos y las medidas de ahorro de 7.3 (ver 0.1). Actualización 2 (9/10/2026): se suman los costos de las tres notificaciones clave por WhatsApp + email según el "PRD - Notificaciones por Email" (nueva sección 10): el cierre de caja diario por WhatsApp agrega ~USD 0,78 por cliente al mes y el email de 2.000 clientes pasa a ~USD 89/mes. Totales, escenarios, márgenes y precios actualizados. Convención: las cifras con fuente son precios publicados. Lo marcado (estimado/a verificar) es un supuesto propio o un dato que no pude confirmar en una fuente primaria.

## 0. Resumen ejecutivo

Actualización 9/10/2026: arquitectura decidida, un único número central de WhatsApp (WABA y número propios del proveedor) para todos los kioscos (ver 0.1). El cupo gratis de 1.000 mensajes de servicio por mes se reparte entre todos los clientes. La alternativa de un número por kiosco quedó descartada y se muestra solo como comparación (1.4).

"Base" ya incluye las herramientas deterministas (1,5 mensajes por conversación, 90% de las consultas sin LLM). "Con medidas" suma la verificación de pagos de Mercado Pago leyendo Gmail y las reglas para limitar mensajes del bot (supuestos en 7.3). Desde la actualización 2, ambos incluyen las tres notificaciones clave por WhatsApp (aviso matutino, resumen del viernes y cierre de caja diario, +USD 0,78 por cliente) y su copia por email (sección 10).

### Los 3 mayores drivers de costo:

Mensajes de servicio de WhatsApp (las respuestas del bot dentro de la ventana de 24 h): USD 0,026 por mensaje en Argentina. El cupo de 1.000 gratis por mes es por número y, con un solo número, lo comparten todos los clientes: USD 0,52 por cliente con 50 clientes, USD 0,05 con 500 y USD 0,01 con 2.000. Es el 91–96% del costo total en los escenarios bajo a alto.

Plantillas de utilidad de WhatsApp (aviso matutino, resumen del viernes, cierre de caja diario, avisos de pedidos y vencimientos): USD 0,026 cada una, cobradas incluso dentro de la ventana abierta y fuera del cupo gratis. Unos USD 1,79–2,18 por cliente al mes (USD 1,50–1,70 con opt-in y agrupación). Solo las tres notificaciones clave son USD 1,44–1,67 (sección 10). El email, en cambio, cuesta ~USD 0,04 por cliente al mes.

Infraestructura fija amortizada (servidores de app, Postgres con una base por cliente, OCR, backups, monitoreo): USD 1,82 por cliente con 50 clientes, USD 0,38 con 500 y USD 0,30 con 2.000 (incluye el servidor de OCR y el email).

Conclusión: el costo lo define el uso del bot, no el hosting. Con un número central, el precio tiene que mantener un cupo de mensajes del bot y cobrar el excedente. Quedarse dentro de la ventana de 24 h no hace gratis los mensajes una vez agotado el cupo compartido: lo que ahorra es mandar menos mensajes (herramientas deterministas, una sola respuesta, verificación de pagos por Gmail, alertas con opt-in). En notificaciones, WhatsApp es el canal caro y el email es casi gratis: el email va siempre y WhatsApp queda para las tres clave (sección 10).

### 0.1 Decisiones tomadas

Decisión (dueño, 9/10/2026): un único número central de WhatsApp Business. La WABA y el número son del proveedor (nosotros). Los kioscos no necesitan su propia cuenta de WhatsApp Business ni cargar una tarjeta en Meta. Esta decisión reemplaza la idea anterior de un número por kiosco (descartada, ver 1.4).

Cupo gratis compartido. Meta da 1.000 mensajes de servicio gratis por mes por número de teléfono de la empresa (Meta – Pricing, actualizada el 30/9/2026). Con un solo número, esos 1.000 se reparten entre todos los clientes y por cliente el descuento es despreciable a escala (2 mensajes por cliente con 500 clientes).

Lo que se paga, según la documentación de Meta. Dentro de la ventana de 24 h, las respuestas libres (servicio) por encima de los 1.000 compartidos cuestan ~USD 0,026 cada una. Las plantillas de utilidad se cobran incluso dentro de la ventana desde el 1/10/2026 (~USD 0,026). Quedarse en la ventana no hace gratis los mensajes más allá del cupo compartido.

Notificaciones clave = plantillas iniciadas por la empresa. El aviso matutino de stock bajo, el resumen del viernes y el cierre de caja diario los manda el sistema sin que el usuario escriba: son plantillas de utilidad, se pagan siempre (~USD 0,026 cada una, a verificar) y no usan ni descuentan el cupo de 1.000 mensajes de servicio del número central, que solo cubre respuestas libres. Si el dueño responde a la plantilla, esas respuestas del bot son mensajes de servicio y van contra el cupo del plan (sección 9). Detalle en la sección 10.

Toda la facturación de WhatsApp es nuestra. WhatsApp es un costo del proveedor y va dentro del precio del plan (no es un costo directo del kiosco).

Tope de números por portfolio: el límite de 2 números por portfolio de negocio (20 tras verificar) no es un problema, porque se usa un solo número (Meta – Manage phone numbers).

Límites de mensajería (usuarios únicos por 24 h). Según Meta – Messaging limits (actualizada el 21/5/2026), el límite cuenta usuarios únicos a los que se les entrega un mensaje fuera de una ventana de atención en 24 h móviles. Se calcula por portfolio, compartido entre sus números. Arranca en 250, sube a 2.000 al verificar el negocio y después escala sola a 10.000, 100.000 e ilimitado (si la calidad es alta y se usó al menos la mitad del límite en los últimos 7 días; sube un nivel en ≤ 6 h). Las respuestas dentro de la ventana no cuentan. Impacto: el aviso matutino y el cierre de caja diario (plantillas que suelen salir fuera de ventana) a 1–2 usuarios por kiosco son ~50–100 usuarios únicos por día con 50 clientes (entra en 250), ~500–1.000 con 500 (requiere la verificación del negocio, nivel 2.000) y ~2.000–4.000 con 2.000 (requiere el escalado automático a 10.000). Como el cierre va a los mismos usuarios que el aviso matutino, casi no suma usuarios únicos nuevos, pero hace que cuenten todos los kioscos con movimientos todos los días, incluso los que no activaron el aviso matutino: el opt-in de alertas (7.3) ya no alcanza solo para bajar ese número.

Tarifas para Argentina: salen de fuentes de terceros que coinciden entre sí (marketing ~0,0618; utilidad, autenticación y servicio ~0,026), no del archivo oficial de tarifas de Meta. Conviene confirmarlas contra ese archivo (a verificar).

Medidas de ahorro adoptadas (detalle y números en 7.3): (1) herramientas deterministas antes de cualquier IA/LLM; (2) lectura de Gmail (beta cerrada en v1) para verificar pagos de Mercado Pago por número de operación, sin pedirle acciones al cliente; (3) limitar los mensajes iniciados por el bot, preferir respuestas dentro de la ventana de 24 h, combinar respuestas en un solo mensaje con botones y listas, y opt-in para las alertas proactivas.

## 1. WhatsApp Business Platform (Cloud API)

### 1.1 Modelo de precios vigente (desde el 1/10/2026)

Fuente: Meta – Pricing on the WhatsApp Business Platform (página actualizada el 30/9/2026). Las tarifas para Argentina de la tabla salen de fuentes de terceros que coinciden entre sí, no del archivo oficial de tarifas de Meta ("USD list rates"). Hay que confirmarlas contra ese archivo (a verificar).

Meta cobra por mensaje entregado, según la categoría y el país del destinatario. Los mensajes del usuario hacia la empresa no se cobran.

### Novedades desde el 1/10/2026, confirmadas en la documentación oficial:

Vuelven a cobrarse los mensajes de servicio (respuestas libres dentro de la ventana de 24 h). Eran gratis desde el 1/11/2024. Hay un cupo gratuito de 1.000 mensajes de servicio por mes por número de teléfono de la empresa ("For each business phone number, Meta provides 1,000 free service messages per month, which do not roll over but reset monthly."). No se acumula de un mes a otro y no cubre plantillas.

Se cobran las plantillas de utilidad enviadas dentro de una ventana de atención abierta, que eran gratis desde el 1/7/2025.

Sin un medio de pago cargado, Meta deja de entregar los mensajes de servicio una vez agotado el cupo gratuito.

Existen tramos por volumen solo para utilidad y autenticación. Para Argentina, el descuento empieza después de los 100.000 mensajes de utilidad por mes (USD 0,0247, −5%). Con un número central se llega a ese tramo con ~1.350 clientes (a ~74 plantillas por cliente, ya con el cierre de caja diario). Con 2.000 clientes ahorraría apenas ~USD 0,03 por cliente, así que por prudencia no se aplica en los cálculos.

Tramos de utilidad para Argentina: 0–100.000 a 0,026; 100.001–1.000.000 a 0,0247; 1.000.001–4.500.000 a 0,0234 (fuente: archivo "USD volume tiers" de la misma página).

### 1.2 Estimación mensual de un kiosco típico (número central compartido)

### Supuestos (estimado/a verificar con datos del piloto):

"Conversación" = una consulta o gestión iniciada por el usuario (dueño o empleado): "cuántos Milka tengo", "qué se acaba", armar un pedido.

1,5 mensajes del bot por conversación en promedio: la mayoría se responde con 1 mensaje y algunas necesitan desambiguar (lista + confirmación).

30 días de actividad por mes (los kioscos suelen abrir todos los días).

Plantillas de utilidad por mes: aviso matutino (30) + resumen del viernes (~4,3) + cierre de caja diario (~30, días con movimientos; agregado en la actualización 2, sección 10) + otros avisos (pedido para revisar, vencimientos, pedido enviado): 5 / 10 / 20 según el escenario.

El cupo gratuito de 1.000 mensajes de servicio es del número central y lo comparten todos los clientes: 1.000 / N mensajes gratis por cliente (20 con 50 clientes, 2 con 500, 0,5 con 2.000). La tabla muestra el costo antes de ese descuento; el descuento se aplica en la sección 8 (−USD 0,52 / −0,05 / −0,01 por cliente).

Notas:

En Argentina, una respuesta libre dentro de la ventana (servicio) y una plantilla de utilidad cuestan lo mismo (~0,026). Una vez agotado el cupo compartido, usar una u otra dentro de la ventana no ahorra nada: lo único que ahorra es mandar menos mensajes.

Las plantillas (incluido el cierre de caja diario) no entran en el cupo gratis de servicio: se pagan desde la primera.

Las reducciones por las medidas de ahorro están en 7.3.

### 1.3 Directo con Cloud API vs. BSP (proveedor de soluciones)

Recomendación: Cloud API directa. 360dialog solo si hace falta soporte. Twilio encarece demasiado un bot con muchos mensajes. Con un solo número, no hace falta Embedded Signup para los kioscos ni un chip o número por cliente.

### 1.4 Alternativa descartada: un número propio por kiosco (solo comparación)

Se evaluó y se descartó el 9/10/2026 (ver 0.1). Datos confirmados en ese análisis:

El cupo de 1.000 mensajes de servicio gratis es por número (Meta – Pricing) y solo cubre servicio, no plantillas de utilidad. Sin medio de pago, los mensajes de servicio se cortan al pasar los 1.000.

Para usarlo había que hacer el alta de cada kiosco con Embedded Signup v4 (v2 y v3 quedan obsoletas el 15/10/2026), con una WABA y un número por kiosco a nombre del kiosco y con su propia tarjeta (la facturación queda en cada cuenta). Eso evitaba el tope de 2/20 números por portfolio. El onboarding se limita a 10 clientes nuevos cada 7 días hasta verificar el negocio; después, 200.

Costo por número: línea prepaga Personal ~ARS 1.500 ≈ USD 0,97 por mes (recarga desde ARS 9.000 con vigencia de 180 días, Personal – Prepago, estimado) o número virtual Twilio de Argentina a USD 8 por mes (Twilio – Voice pricing Argentina). 360dialog pasaría a costar USD 59 por cliente.

(Número propio = cada número con sus 1.000 de servicio gratis, plantillas pagas, incluido el cierre de caja diario, línea prepaga de USD 0,97 incluida. Se descartó porque obliga a cada kiosco a tener su propia cuenta de WhatsApp Business, su número y su tarjeta, y agrega trabajo de onboarding).

## 2. Fotos en Google Photos (cuenta de Google del propio cliente)

Cada cuenta de Google incluye 15 GB gratis, compartidos entre Fotos, Drive y Gmail. Fuente: Google One – Planes (es_AR).

Precios de Google One en Argentina (pesificados desde fines de septiembre de 2026, anuales): Basic 100 GB ARS 29.885,05; Standard 200 GB ARS 44.835,05; Google AI Plus 400 GB ARS 74.735,05; 2 TB ARS 149.485,05. La página oficial todavía muestra USD 1,99/mes para 100 GB. Fuentes: Rosario3, 1/10/2026, Cienradios, HD Tecnología, 30/9/2026.

Volumen estimado (estimado/a verificar): facturas de proveedores, comprobantes y fotos de órdenes de pago.

Costo para el SaaS: ~USD 0. El almacenamiento lo pone la cuenta del cliente. Aun en el escenario alto se usa menos del 2% de los 15 GB por año. Si la cuenta del cliente se llena por su uso personal, el costo de Google One lo paga él.

Las fotos de productos (PRD principal) van al almacenamiento de objetos del producto (~200 KB por foto; 1.000 productos ≈ 0,2 GB). En Backblaze B2 (USD 6,95/TB/mes, 10 GB gratis) eso es < USD 0,01 por cliente al mes. Fuente: Backblaze B2 Pricing.

Riesgo: cambios en la Google Photos Library API (scopes, cuotas, verificación de la app OAuth) (a verificar). El plan B del PRD es guardar las fotos en almacenamiento propio: a 0,3 GB/año por cliente sigue costando centavos.

## 3. Hosting: una base de datos por cliente + base de control

### 3.1 Precios de referencia

### 3.2 Costo de la base de datos por cliente, según la opción

Supuestos: la base de un kiosco ocupa ~0,3 GB. Con un proyecto Neon por cliente, el cómputo mínimo de 0,25 CU queda activo unas 10 h por día (web, bot y jobs evitan que se suspenda) (estimado/a verificar).

Capacidad supuesta por servidor de base de datos: CX33 hasta ~100 bases chicas y CX53 ~500, con PgBouncer (estimado/a verificar con pruebas de carga).

### 3.3 Frontend Astro y API backend

### 3.4 Infraestructura fija total (arquitectura recomendada)

En los totales de la sección 8, el OCR va como línea propia (0,20 / 0,04 / 0,02) y el resto de la infraestructura aparece como "infraestructura fija" (1,62 / 0,34 / 0,29), con el email incluido (0,40 / 0,04 / 0,045 por cliente).

## 4. Dominio, email y Mercado Pago

Mercado Pago se calcula como porcentaje del precio cobrado, así que aparece en la sección de precios (9) y no en el costo base. Si podés esperar los fondos, el plazo de 35 días baja la comisión de 8,46% a 1,80%.

## 5. OCR: PaddleOCR autohospedado (opción elegida)

PaddleOCR (Baidu, código abierto, licencia Apache 2.0) corre en nuestro propio servidor. No hay costo por imagen: solo el cómputo.

### 5.1 Rendimiento publicado (PP-OCRv5, de punta a punta, 200 imágenes generales y de documentos)

Fuente: PaddleOCR – Introduction to PP-OCRv5 y material suplementario, CVPR 2026.

En una VPS compartida de 4–8 vCPU (Hetzner CX33/CX43) supongo ~3–4 s por imagen con el modelo mobile, es decir ~15–20 imágenes/min (estimado/a verificar con un benchmark propio).

### 5.2 Capacidad y costo amortizado

CPU alcanza de sobra. Aun con 2.000 clientes el OCR ocupa menos del 15% de un servidor. Se usa un segundo servidor por redundancia y para absorber los picos (llegada de mercadería a la mañana).

GPU chica (Hetzner GEX44, RTX 4000 SFF Ada, 20 GB): €234/mes + €114 de instalación según la página actual. Material más viejo indica €184/mes (Hetzner GEX44, GPUDeck). Con ~0,6 s/imagen podría procesar >100.000 imágenes/día. No se justifica con estos volúmenes: solo convendría con decenas de miles de clientes o si se necesitara latencia menor a 1 s.

Al ser autohospedado, la imagen de la factura no sale a un tercero (mejor para privacidad, PRD 6.4).

### 5.3 OCR en la nube (solo como fallback)

Uso sugerido: mandar a la nube solo las facturas que PaddleOCR + reglas no logran leer con confianza (por ejemplo, menos de 0,6). El costo por cliente es marginal.

## 6. Precios de LLM usados como referencia

Los tokens por llamada son estimados.

## 7. Herramientas deterministas para economizar el consumo del bot

Definición: herramientas deterministas = herramientas matemáticas y de reglas ya construidas (coincidencia exacta de códigos, reglas por palabras clave, plantillas y botones fijos, fórmulas ya desarrolladas como márgenes, totales, umbrales de stock y resúmenes de cierre) que se usan ANTES de cualquier IA para ahorrar consumo del bot. La IA entra solo cuando estas herramientas no alcanzan.

### 7.1 Qué se resuelve con herramientas deterministas

Regla general: determinista primero → si la confianza es menor al umbral, IA barata (gpt-5-nano / gpt-5-mini / Flash-Lite) → si sigue fallando, preguntar al usuario con botones.

### 7.2 Ahorro estimado

Supuesto (a validar en el piloto): entre el 80% y el 95% de las consultas y facturas se resuelven con herramientas deterministas. Base: todas las consultas del mes (conversaciones × 30) más las facturas.

### (a) Llamadas a LLM evitadas (USD por cliente al mes)

(b) Mensajes de WhatsApp evitados (el ahorro grande). Responder con plantillas, botones y listas en un solo mensaje, en lugar de un ida y vuelta generado por IA, baja el promedio de mensajes por conversación. Supuesto: de 2,0 a 1,5 mensajes (estimado). Con USD 0,026 por mensaje:

Los totales de la sección 8 ya suponen herramientas deterministas: 1,5 mensajes por conversación, 90% de las consultas y 80% de las facturas resueltas sin LLM, y PaddleOCR propio.

### 7.3 Medidas de ahorro con un número central (decididas) y su impacto

Con un número central, el cupo gratis compartido no alcanza a cubrir el uso: cada mensaje que no se manda ahorra ~USD 0,026. Dentro de la ventana de 24 h, las respuestas libres por encima de los 1.000 compartidos se pagan, y las plantillas de utilidad se cobran también dentro de la ventana. La ventana sirve para no depender de plantillas y no consumir el límite de mensajería (0.1), no para que los mensajes sean gratis.

(1) Herramientas deterministas antes de cualquier IA/LLM (7.1 y 7.2). Ya están incluidas en la "base": 1,5 mensajes por conversación en lugar de 2,0, el 90% de las consultas y el 80% de las facturas sin LLM, y PaddleOCR propio. Comparado con no usarlas, ahorran USD 7,80 / 13,65 / 19,50 en WhatsApp y ~USD 0,23 / 0,42 / 0,63 en LLM por cliente al mes (bajo / medio / alto).

(2) Lectura de Gmail para verificar pagos de Mercado Pago por número de operación (beta cerrada en v1). El sistema lee los emails de notificación de Mercado Pago de la cuenta del kiosco y concilia cada cobro por número de operación. El kiosco no tiene que mandar comprobantes ni preguntarle al bot "¿entró la transferencia?", y la confirmación aparece en la web/caja sin mensajes de WhatsApp.

Supuesto (estimado/a verificar en el piloto): de las conversaciones diarias, 1 / 3 / 6 / 10 (liviano / bajo / medio / alto) son verificaciones de pago que desaparecen.

Costo: la Gmail API no tiene cargo por uso dentro de las cuotas. Leer el correo usa un scope restringido de Google: para salir de la beta cerrada hace falta la verificación de la app OAuth y una evaluación de seguridad anual, de costo a verificar (no incluido). En beta, una app sin verificar tiene un tope de usuarios de prueba (a verificar).

### (3) Limitar los mensajes iniciados por el bot y responder en un solo mensaje dentro de la ventana.

Responder dentro de la ventana de 24 h abierta por el usuario, y combinar en un solo mensaje la respuesta y los avisos pendientes, con botones y listas para desambiguar sin ida y vuelta. Supuesto: baja de 1,5 a 1,3 mensajes por conversación (estimado).

Opt-in para alertas proactivas: el aviso matutino solo se manda a quien lo activa. Supuesto: lo mantiene el 70% (de 30 a 21 plantillas por mes de promedio) (estimado). El resumen del viernes se mantiene. El cierre de caja diario por WhatsApp (~30 plantillas, actualización 2) se suma igual en la base y con medidas: estas medidas no lo reducen. Las opciones para bajarlo están en 9 y 10.

Agrupar avisos: pedidos para revisar, vencimientos y pedidos enviados van dentro del aviso matutino o de la próxima respuesta. Supuesto: la mitad de esos avisos dejan de ser una plantilla aparte (estimado).

Efecto adicional: menos plantillas fuera de ventana = menos usuarios únicos contra el límite de mensajería (0.1).

### Impacto por cliente al mes (USD, ~0,026 por mensaje):

(El ahorro de Gmail se calcula a 1,5 mensajes por conversación y el de (3) sobre las conversaciones que quedan. El LLM residual se deja igual, por prudencia. Las plantillas incluyen las 30 del cierre de caja diario, que no se reducen).

## 8. Costo total estimado por cliente por mes (número central compartido)

Componentes: WhatsApp (servicio + plantillas, incluidas las tres notificaciones clave con el cierre de caja diario, menos la parte del cupo compartido de 1.000 que le toca a cada cliente; el cupo solo descuenta servicio, nunca plantillas) + LLM residual (10% de las consultas y 20% de las facturas con gpt-5-mini) + OCR PaddleOCR amortizado + infraestructura fija amortizada (incluye el email de notificaciones, sección 10) + fotos (~0). No incluye la comisión de Mercado Pago (ver 9) ni la evaluación de seguridad de Gmail (a verificar).

### 8.1 Con 500 clientes (caso base)

### 8.2 Según la escala (efecto de amortizar los costos fijos y el cupo compartido)

El cupo compartido le descuenta a cada cliente USD 0,52 con 50 clientes, USD 0,05 con 500 y USD 0,01 con 2.000: a escala es despreciable.

La escala casi no mueve el total: el costo es variable y lo domina WhatsApp. Las medidas de 7.3 bajan entre 23% y 30%. Respecto de la versión anterior, todos los totales suben ~USD 0,78 por el cierre de caja diario por WhatsApp (con 2.000 clientes, +USD 0,81: se suman ~USD 0,03 de email por el excedente de Resend). Sin el bot de consultas (solo web + plantillas de aviso + email), un cliente cuesta ~USD 2,2–4,0 por mes. La comparación con la alternativa descartada de número propio está en 1.4.

## 9. Precios sugeridos (SUGERENCIA, a validar con el mercado)

Objetivo de margen bruto sugerido: 60–80%, habitual en SaaS (sugerencia, no dato de mercado). El margen se calcula sobre el precio sin IVA, después de la comisión de Mercado Pago al instante (8,46%). Con acreditación a 35 días (1,80%) el margen sube 5–7 puntos. Costos con 500 clientes y número central.

Con un número central, se mantienen los cupos de mensajes del bot: cada mensaje de servicio cuesta ~USD 0,026 y el cupo gratis compartido no cambia nada por cliente. "Mensaje del bot" = mensaje de servicio enviado por el bot. Las plantillas de las notificaciones clave (aviso matutino, resumen del viernes y, desde la actualización 2, cierre de caja diario) van incluidas aparte y no consumen ese cupo ni el cupo gratis de Meta: se pagan siempre (sección 10). Los emails de notificación van incluidos en todos los planes (~USD 0,04 por cliente).

(El costo operativo incluye plantillas, con el cierre de caja diario, mensajes del cupo, la parte del cupo gratis compartido, infraestructura con 500 clientes, email, OCR y LLM residual).

Gracias a las medidas de 7.3, el mismo cupo rinde más: a 1,3 mensajes por conversación y sin verificaciones de pago por WhatsApp, 600 mensajes cubren ~15 consultas por día en lugar de ~13.

Referencia de lo que NO conviene: un "Pro ilimitado" a USD 99 con un uso de 2.000 mensajes cuesta ~USD 63 → margen ~36%. Con el bot ilimitado no se llega al margen objetivo con las tarifas actuales de Meta para Argentina y un número central.

Opciones para el plan Básico tras sumar el cierre de caja diario por WhatsApp (sugerencia, costos con 500 clientes, MP al instante). El cierre diario por WhatsApp le quita al Básico ~5 puntos de margen (de ~65% a ~60%). En todas las opciones el cierre diario sigue saliendo por email (casi gratis) y se mantienen PaddleOCR, las herramientas deterministas y el número central.

Recomendación (sugerencia): (e) + (c): en el Básico, resumen semanal de caja dentro del resumen del viernes por WhatsApp, cierre diario siempre por email y cierre diario por WhatsApp como opt-in. En Plus y Pro, el cierre diario por WhatsApp incluido. Si se prefiere no tocar el producto, subir el Básico a USD 17–18 (b). Además, pasar a email los 5–20 "otros avisos" (vencimientos, pedidos) ahorra USD 0,13–0,52 por cliente (sección 10).

Recomendaciones para el precio:

Cupo de mensajes por plan y venta de excedente. Mostrar el consumo en el Control Plane (tabla whatsapp_usage).

Llevar las consultas largas o de exploración a la web/PWA, que no tiene costo por mensaje, y dejar el bot para avisos y consultas rápidas.

Aplicar las medidas de 7.3 desde el día uno: alertas con opt-in, avisos agrupados, una respuesta por consulta y verificación de pagos por Gmail. Email primero para notificaciones: todo aviso que no sea una de las tres clave va solo por email (sección 10).

Precio en ARS con ajuste periódico: el costo está en USD (Meta, Hetzner y demás se pagan en dólares, con dólar tarjeta ~ARS 2.002 si se paga con tarjeta argentina).

Revisar el precio cada trimestre: Meta puede cambiar tarifas el 1/1, 1/4, 1/7 y 1/10, con al menos 1 mes de aviso.

Verificar el negocio en Meta antes de pasar de ~100 clientes: sin verificación, el límite de mensajería es de 250 usuarios únicos por día fuera de ventana (0.1).

## 10. Costos de notificaciones por cliente

Fuente de los volúmenes y derivaciones: "PRD - Notificaciones por Email para Sistema de Inventario" (mismo folder), secciones 7.2 y 7.3. Supuestos (estimado/a verificar en el piloto). Tipo de cambio USD 1 = ARS 1.540.

Resumen: WhatsApp es el canal caro; el email es casi gratis. Las tres notificaciones clave (aviso matutino de stock bajo, resumen del viernes y cierre de caja diario) salen por WhatsApp y por email. Por WhatsApp cuestan ~USD 1,44–1,67 por cliente al mes; todo el email de un cliente (~80 emails, incluidas las mismas tres) cuesta ~USD 0,04.

### 10.1 Por qué las plantillas se pagan siempre (conciliación con 0.1 y 1.1)

Las tres notificaciones clave son iniciadas por la empresa: el sistema las manda a horario, sin que el usuario haya escrito. En la Cloud API eso exige una plantilla de utilidad, ~USD 0,026 por mensaje entregado en Argentina [a verificar tarifa vigente] contra el archivo oficial de tarifas de Meta.

Se pagan siempre: desde el 1/10/2026 las plantillas de utilidad se cobran también dentro de una ventana de 24 h abierta (1.1).

No usan el cupo gratis: los 1.000 mensajes gratis por mes del número central son solo de servicio (respuestas libres del bot) y se reparten entre todos los clientes (0.1). Ninguna plantilla los consume ni se descuenta de ellos. Por eso, en las secciones 1.2 y 8 el cupo compartido se resta solo de los mensajes de servicio.

Número central: todas las plantillas salen del único número central (decisión de 0.1). El costo es nuestro y va dentro del precio del plan.

Conciliación con la versión anterior del doc: 1.2 ya incluía el aviso matutino (30) y el resumen del viernes (~4,3), pero no el cierre de caja diario por WhatsApp. Se agregó a 1.2, 7.3, 8 y 9. El cierre suele salir fuera de la ventana de 24 h y cuenta para el límite de mensajería (0.1), lo que refuerza verificar el negocio en Meta antes de los ~100 clientes.

Las respuestas a una plantilla (si el dueño contesta "ver detalle" o pide un pedido) son mensajes de servicio y se cuentan en el cupo de mensajes del bot del plan (9).

### 10.2 WhatsApp: las tres notificaciones clave (por cliente al mes)

Sumando los 5–20 "otros avisos" de 1.2 (pedidos para revisar, vencimientos, pedidos enviados), el total de plantillas por cliente queda en 69 / 69 / 74 / 84 (liviano / bajo / medio / alto), USD 1,79 / 1,79 / 1,92 / 2,18 en la base, y ~58–65 (USD 1,50–1,70) con las medidas de 7.3.

### 10.3 Email: todas las notificaciones (Resend)

Supuesto: ~80 emails por cliente al mes (aviso matutino 21–30, resumen del viernes 4,3, cierre de caja 30 con las ventas del día, vencimientos 4–8, sistema/seguridad/cuenta 3–5).

Por mensaje: WhatsApp ~USD 0,026; email USD 0,0001 (Amazon SES) a 0,0009 (excedente de Resend). El email es entre 30 y 260 veces más barato. Amazon SES queda como plan B a escala (~USD 0,01 por cliente).

El costo de email está dentro de la "infraestructura fija" (3.4). Cambio respecto de la versión anterior: con 2.000 clientes, de USD 35 a ~USD 89 por mes (+USD 54, +USD 0,03 por cliente).

### 10.4 Total de notificaciones por cliente y escenarios

El WhatsApp es el 88–97% del costo de notificaciones; la escala no lo diluye (es variable por cliente). El email sí se amortiza.

Con 2.000 clientes las plantillas superan los 100.000 por mes y entran en el tramo de USD 0,0247 (1.1): ahorro de ~USD 0,03 por cliente, no aplicado por prudencia.

### 10.5 Impacto en totales, márgenes y precios

Totales (8): cada escenario sube ~USD 0,78 por cliente (USD 0,81 con 2.000 clientes por el email). Con 500 clientes, base: 7,98 / 25,55 / 43,25 / 61,09; con medidas: 5,90 / 19,10 / 31,35 / 42,67 (liviano / bajo / medio / alto).

Márgenes (9): Básico de ~65% a ~60% (−5 puntos), Plus de ~65% a ~63%, Pro de ~62% a ~61%.

Opciones (detalle en 9): subir el Básico a USD 17–18; cierre diario por WhatsApp opt-in o solo en Plus/Pro; resumen semanal de caja por defecto en WhatsApp (dentro del resumen del viernes) con el cierre diario siempre por email; o combinar el cierre con el aviso matutino del día siguiente.

Contención sin suprimir canales: no mandar nada sin novedades (aviso matutino) ni sin movimientos (cierre); aviso matutino opt-in; todo lo que no es clave (vencimientos, sistema, seguridad, cuenta, ventas del día, consumos) solo por email. Pasar los 5–20 "otros avisos" de 1.2 a email ahorraría USD 0,13–0,52 por cliente al mes.

Eventos nuevos de v1 (10.6): por defecto van por email y en la app, sin plantillas de WhatsApp: no cambian los totales, márgenes ni precios de esta sección. Si el dueño los activa por WhatsApp, suman hasta ~USD 1,09 por cliente al mes (10.6).

### 10.6 Eventos nuevos de v1: entrega de turno, conteo, fiado, lotes y promos

Fuente: "PRD - Notificaciones por Email para Sistema de Inventario", NE17 (mismo folder). Supuestos (estimado/a verificar en el piloto). Tipo de cambio USD 1 = ARS 1.540; plantilla de utilidad ~USD 0,026 (ARS ~40) [a verificar tarifa vigente].

Por defecto, el costo de WhatsApp es cero. Solo las tres notificaciones clave (10.2) salen por WhatsApp. Los eventos nuevos (diferencia de turno fuera de tolerancia, entrega en disputa, ajuste grande por conteo, fiado vencido o sobre el tope, lote por vencer y promo por vencimiento sugerida) van por email y en la app. El lote por vencer va dentro del aviso matutino, que ya sale por WhatsApp y por email, así que no suma ninguna plantilla.

Si el dueño los activa por WhatsApp (interruptor "También por WhatsApp" por tipo, apagado por defecto; PRD de caja C17.6), cada aviso es una plantilla de utilidad que se paga siempre (10.1). Estimación por cliente al mes, con los avisos agrupados como en NE17:

Impacto en el margen: con todos activados, en el plan Básico (USD 15, 9) el margen bajaría hasta ~7 puntos en el peor caso (USD 1,09 / 15). Por eso quedan apagados por defecto; si se ofrecen, conviene incluirlos en Plus/Pro o contarlos dentro del cupo de mensajes del plan (9) (sugerencia).

Límite de mensajería: estos avisos suelen salir fuera de la ventana de 24 h y suman usuarios únicos contra el límite por portfolio (0.1).

Email: suman ~13–42 emails por cliente al mes (además de los ~80 de 10.3). Al excedente de Resend (USD 0,90 cada 1.000), son como máximo ~USD 0,04 por cliente al mes. Con 500 clientes el volumen pasa de 40.000 a ~46.500–61.000 emails por mes y puede requerir pasar de USD 20 (50.000) a USD 35 (100.000): +USD 15 por mes, +USD 0,03 por cliente (estimado).

## 11. Fuentes (todas consultadas el 9/10/2026)

Meta – WhatsApp pricing y tarifas en USD desde el 1/10/2026: https://developers.facebook.com/docs/whatsapp/pricing

Meta – Messaging limits (actualizada el 21/5/2026): https://developers.facebook.com/docs/whatsapp/messaging-limits

Meta – Manage phone numbers (topes de números por portfolio): https://developers.facebook.com/docs/whatsapp/business-management-api/manage-phone-numbers

Tarifas de WhatsApp para Argentina: fuentes de terceros coincidentes (no el archivo oficial de Meta, a verificar)

Alternativa descartada (número por kiosco): Twilio, números de Argentina https://www.twilio.com/en-us/voice/pricing/ar; Personal prepago https://www.personal.com.ar/prepago

Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing; aviso de octubre de 2026: https://help.twilio.com/articles/53100480177819

360dialog pricing: https://docs.360dialog.com/docs/get-started/pricing

Google One planes: https://one.google.com/about/plans?hl=es_AR; precios en ARS: https://www.rosario3.com/tecnologia/google-comenzo-a-pesificar-los-precios-de-sus-servicios-y-aplicaciones-en-argentina-20261001-0033.html

Neon pricing: https://neon.com/pricing; límites de bases: https://neon.com/docs/manage/databases

Supabase pricing: https://supabase.com/pricing

Hetzner, ajuste de precios del 15/6/2026: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/; GEX44: https://www.hetzner.com/dedicated-rootserver/gex44

DigitalOcean: https://www.digitalocean.com/pricing/droplets, https://www.digitalocean.com/pricing/managed-databases

Vercel: https://vercel.com/pricing; Netlify: https://www.netlify.com/pricing/; Cloudflare Workers: https://developers.cloudflare.com/workers/platform/pricing/

Railway: https://railway.com/pricing; Render: https://render.com/pricing; Fly.io (vía Findstack): https://findstack.com/resources/railway-vs-render-vs-fly-io

Backblaze B2: https://www.backblaze.com/cloud-storage/pricing; Sentry: https://sentry.io/pricing/

NIC Argentina aranceles: https://nic.ar/es/dominios/aranceles; .com en Cloudflare: https://domainoffer.net/tld/com/cloudflare

Resend: https://resend.com/pricing

Volúmenes y costos de notificaciones: "PRD - Notificaciones por Email para Sistema de Inventario" (mismo folder), secciones 7.2 y 7.3: https://docs.google.com/document/d/1RUZ1PY_98eE0cvmL5lL5Ij39cO0nC627I0qAgICf4W0/edit

Mercado Pago Suscripciones: https://www.mercadopago.com.ar/herramientas-para-vender/suscripciones

PaddleOCR PP-OCRv5: https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5.html

Google Cloud Vision: https://cloud.google.com/vision/pricing; Document AI: https://cloud.google.com/document-ai/pricing

Gemini API: https://ai.google.dev/gemini-api/docs/pricing; OpenAI: https://developers.openai.com/api/docs/pricing; xAI: https://docs.x.ai/developers/pricing

Tipo de cambio: https://dolarhistorico.com/dolar-banco-nacion, https://sinfiltro.ar/a-cuanto-cotiza-el-dolar-este-viernes-9-de-octubre/

Escenario (por cliente/mes, con 500 clientes) | Conv./día con el bot | Base (USD / ARS) | Con las medidas de ahorro de 7.3 (USD / ARS) | Reducción
--- | --- | --- | --- | ---
Uso liviano (sensibilidad) | 5 | 7,98 / 12.292 | 5,90 / 9.081 | −26%
Bajo | 20 | 25,55 / 39.350 | 19,10 / 29.412 | −25%
Medio | 35 | 43,25 / 66.608 | 31,35 / 48.282 | −28%
Alto | 50 | 61,09 / 94.081 | 42,67 / 65.705 | −30%

Categoría (Argentina, USD por mensaje entregado; fuentes de terceros) | Tarifa | Comentario
--- | --- | ---
Marketing | ~0,0618 | No se usa en el bot
Utilidad | ~0,026 | Avisos programados (plantillas iniciadas por la empresa: aviso matutino, resumen del viernes, cierre de caja diario). Desde el 1/10/2026 también se cobra dentro de la ventana. No entra en el cupo gratis
Autenticación | ~0,026 | Solo si se usa el código de vinculación por plantilla
Servicio | ~0,026 | Respuestas libres. 1.000 gratis por mes por número (compartidos entre todos los clientes)
Meta Business Agent | USD 2 por millón de tokens (~USD 0,04–0,05 por mensaje según Meta) | IA de Meta. No recomendado

Escenario | Conv./día | Mensajes de servicio/mes | Costo de servicio (USD) | Plantillas/mes | Costo de plantillas (USD) | Total WhatsApp (USD) | ARS
--- | --- | --- | --- | --- | --- | --- | ---
Liviano | 5 | 225 | 5,85 | 69 | 1,79 | 7,64 | 11.765
Bajo | 20 | 900 | 23,40 | 69 | 1,79 | 25,19 | 38.792
Medio | 35 | 1.575 | 40,95 | 74 | 1,92 | 42,87 | 66.020
Alto | 50 | 2.250 | 58,50 | 84 | 2,18 | 60,68 | 93.447

Opción | Cargo del proveedor | Impacto por cliente (escenario medio, 1 número central) | Fuente
--- | --- | --- | ---
Cloud API directa (Meta) | USD 0 | USD 0 adicional | Meta
360dialog | €49 / USD 59 por número por mes (Regular). Premium €99 / USD 119 | USD 1,18 (50 clientes); 0,12 (500); 0,03 (2.000) | 360dialog Pricing
Twilio | USD 0,005 por mensaje enviado o recibido, más las tarifas de Meta | ~1.649 enviados + ~1.575 recibidos ≈ 3.220 × 0,005 = +USD 16 por cliente | Twilio WhatsApp Pricing, aviso de octubre de 2026

Escenario (500 clientes) | Número central, base (decidido) | Número propio por kiosco (descartado), WhatsApp incluido | Número propio: solo nuestro costo si el kiosco le paga a Meta | Número propio: lo que el kiosco le paga a Meta
--- | --- | --- | --- | ---
Liviano | USD 7,98 | USD 3,15 | USD 1,36 | USD 1,79
Bajo | USD 25,55 | USD 3,17 | USD 1,38 | USD 1,79
Medio | USD 43,25 | USD 18,27 | USD 1,40 | USD 16,87
Alto | USD 61,09 | USD 36,11 | USD 1,43 | USD 34,68

Escenario | Fotos/mes | Tamaño medio (foto que llega por WhatsApp, ya comprimida) | MB/mes | GB/año
--- | --- | --- | --- | ---
Bajo | 20 | ~0,3 MB | 6 | ~0,07
Medio | 40 | ~0,3 MB | 12 | ~0,14
Alto | 80 | ~0,3 MB | 24 | ~0,29

Proveedor | Precio publicado | Fuente
--- | --- | ---
Neon Launch | Cómputo USD 0,106 por CU-hora; storage USD 0,35/GB-mes; scale-to-zero a los 5 min; 100 proyectos por organización | Neon Pricing
Neon Scale | USD 0,222 por CU-hora; 1.000 proyectos (ampliable a pedido) | Neon Pricing
Neon (límite de bases) | Hasta 500 bases por branch | Neon Docs – Manage databases
Supabase Pro | USD 25/mes por organización + cómputo por proyecto (Micro USD 10/mes; se incluyen USD 10 de crédito); 8 GB de disco por proyecto | Supabase Pricing
Hetzner Cloud (precios desde el 15/6/2026, sin IVA ni IPv4) | CX23 2 vCPU/4 GB USD 6,49; CX33 4 vCPU/8 GB USD 9,99 (€8,49); CX43 8 vCPU/16 GB USD 18,49; CX53 16 vCPU/32 GB USD 34,99. IPv4 ~€0,50/mes | Hetzner – Price adjustment, TrackVPS
DigitalOcean | Droplet 4 GB/2 vCPU USD 24; 8 GB/4 vCPU USD 48; PostgreSQL gestionado 4 GB USD 60,90 | DigitalOcean Droplets, Managed DB
Backups: Backblaze B2 | USD 6,95/TB/mes; 10 GB gratis | Backblaze
Monitoreo: Sentry | Team USD 26/mes (anual) o 29 (mensual); Business USD 80 (anual) | Sentry Pricing

Opción | 50 clientes | 500 clientes | 2.000 clientes | Comentario
--- | --- | --- | --- | ---
Neon, un proyecto por cliente | USD 8,05 (Launch) | USD 16,75 (Scale: más de 100 proyectos) | USD 16,75 + pedido de cupo (más de 1.000 proyectos) | Scale-to-zero ayuda poco en un negocio abierto todo el día
Neon, muchas bases en un proyecto (hasta 500 por branch) con cómputo compartido de 0,5–1 CU siempre encendido | ~USD 0,88 | ~USD 0,25 | ~USD 0,25 | Aislamiento por base, pero cómputo compartido (estimado)
Supabase, un proyecto por cliente (Micro) | USD 10,30 | USD 10,03 | USD 10,01 | Caro para este modelo
Postgres propio en VPS Hetzner (primario + réplica, muchas bases por servidor) | USD 0,33 | USD 0,14 | USD 0,14 | Recomendado, en línea con ModoOps (Docker/Coolify). Exige operar backups, actualizaciones y failover

Componente | Opciones (precio publicado) | Elegido para el cálculo
--- | --- | ---
Frontend Astro (SSR) | Vercel Pro USD 20 por usuario/mes + uso; Netlify Pro USD 20/mes; Cloudflare Workers Paid USD 5/mes (10 M de requests incluidos, sin cargo de egreso). Fuentes: Vercel, Netlify, Cloudflare Workers | Cloudflare Workers (USD 5, ~10 con 2.000 clientes, estimado)
API / webhooks / jobs | Fly.io shared-cpu-1x 1 GB ~USD 5,70/mes; Railway Pro USD 20 + uso; Render Starter USD 7. Fuentes: Railway, Render, Findstack (Fly.io) | VPS Hetzner (CX33/CX43)

Concepto (USD/mes) | 50 clientes | 500 clientes | 2.000 clientes
--- | --- | --- | ---
App/API (Hetzner) | 1× CX33: 9,99 | 2× CX43: 36,98 | 4× CX43: 73,96
Postgres primario + réplica (incluye la base de control) | CX33 + CX23: 16,48 | 2× CX53: 69,98 | 8× CX53 (4 shards): 279,92
OCR PaddleOCR (CPU, sección 5) | 1× CX33: 9,99 | 1× CX43: 18,49 | 2× CX43: 36,98
IPv4 (~€0,50 c/u, estimado) | 1,80 | 3,00 | 8,40
Backups B2 (retención diaria + semanal) | 0,35 | 6,95 | 27,80
Monitoreo (Sentry) | 26,00 | 26,00 | 80,00
Frontend (Cloudflare Workers) | 5,00 | 5,00 | 10,00
Email (Resend Pro, secciones 4 y 10; ~80 emails por cliente al mes) | 20,00 | 20,00 | 89,00 (USD 35 por 100.000 + 60.000 de excedente a USD 0,90/1.000)
Dominios (.com + .com.ar, sección 4) | 1,33 | 1,33 | 1,33
Total fijo | ~90,9 | ~187,7 | ~607,4
Por cliente | USD 1,82 (sin OCR: 1,62) | USD 0,38 (sin OCR: 0,34) | USD 0,30 (sin OCR: 0,29)

Concepto | Precio | Por mes | Fuente
--- | --- | --- | ---
Dominio .com.ar (NIC Argentina) | ARS 8.500 por año (alta y renovación) | ARS 708 ≈ USD 0,46 | NIC Argentina – Aranceles
Dominio .ar (zona abierta, opcional) | ARS 25.500 por año | ARS 2.125 | NIC Argentina
Dominio .com (Cloudflare Registrar, al costo) | USD 10,46 por año (estimado ~USD 11,17 tras la suba de Verisign del 1/11/2026, a verificar) | USD 0,87 | domainoffer.net, Cloudflare Registrar
Email transaccional (Resend Pro) | USD 20/mes por 50.000 emails; USD 35 por 100.000; excedente USD 0,90 cada 1.000 | ver tabla 3.4 y sección 10 (~USD 0,04 por cliente con 500 clientes; ~USD 89/mes en total con 2.000) | Resend Pricing
Mercado Pago – Suscripciones | Dinero disponible al instante 6,99% + IVA; a 10 días 4,49% + IVA; a 18 días 3,39% + IVA; a 35 días 1,49% + IVA. Puede variar por impuestos provinciales | Con IVA (21%): 8,46% / 5,43% / 4,10% / 1,80% del precio | Mercado Pago – Suscripciones

Configuración | GPU (Tesla V100) | CPU (Intel Xeon Gold 6271C, ~10 núcleos al 966–990%) | RAM (CPU)
--- | --- | --- | ---
PP-OCRv5 mobile | 0,62 s/imagen (~97 imágenes/min) | 1,75 s/imagen (~34 imágenes/min) | ~1,8–2,2 GB
PP-OCRv5 server | 0,74 s/imagen | 4,34 s/imagen | ~3,1–4,0 GB

 | 50 clientes | 500 clientes | 2.000 clientes
--- | --- | --- | ---
Imágenes/mes (escenario medio, 40 por cliente) | 2.000 | 20.000 | 80.000
Horas de CPU/mes (a 4 s/imagen) | ~2,2 h | ~22 h | ~89 h
Servidor | 1× CX33 (USD 9,99) | 1× CX43 (USD 18,49) | 2× CX43 (USD 36,98)
Costo por cliente | USD 0,20 | USD 0,04 | USD 0,02

Servicio | Precio publicado | Escenario medio (40 imágenes) | Fuente
--- | --- | --- | ---
Google Cloud Vision (Document Text Detection) | USD 1,50 por 1.000 (1.000 gratis por mes por cuenta) | ~USD 0,06 | Cloud Vision Pricing
Google Document AI (Invoice Parser) | USD 0,10 por documento (hasta 10 páginas) | USD 4,00 | Document AI Pricing
LLM con visión (Gemini 2.5 Flash-Lite) | USD 0,10/M tokens de entrada (incluye imagen), USD 0,40/M de salida → ~USD 0,0004 por imagen (estimado, ~1.500 tokens de entrada + 500 de salida) | ~USD 0,02 | Gemini API Pricing

Modelo | Entrada / salida (USD por 1 M de tokens) | Costo por llamada de intención (~800 tokens entrada / 100 salida) | Costo por estructurar una factura (~1.500 / 400) | Fuente
--- | --- | --- | --- | ---
OpenAI gpt-5-nano | 0,05 / 0,40 | USD 0,00008 | USD 0,00024 | OpenAI Pricing
OpenAI gpt-5-mini (referencia) | 0,25 / 2,00 | USD 0,0004 | USD 0,0012 | OpenAI Pricing
Gemini 2.5 Flash | 0,30 / 2,50 | USD 0,0005 | USD 0,0015 | Gemini API Pricing
Grok 4.3 (xAI) | 1,25 / 2,50 | USD 0,00125 | USD 0,0029 | xAI API Pricing
Meta Business Agent | USD 2 por M de tokens (~USD 0,04–0,05 por mensaje según Meta) | – | – | Meta

Necesidad | Herramienta determinista | Cuándo se escala a IA
--- | --- | ---
Identificar un producto por código | Coincidencia exacta en product_codes (índice único btree), normalización EAN/UPC y dígito verificador | Nunca
Buscar un producto por nombre | Índices pg_trgm + unaccent, tabla product_aliases, sinónimos del rubro | Si la similitud del mejor candidato es menor al umbral y no hay margen claro con el segundo
Entender consultas frecuentes ("cuántos X tengo", "qué se acaba", "a cuánto vendo X", "pedile 2 cajas a Carlos") | Parser de intención por palabras clave y regex, con normalización ("dos cajas" → 2, "80 mil" → 80.000) | Solo si ninguna regla matchea con confianza ≥ 0,8 (umbral sugerido)
Clasificar el tipo de servicio (luz, gas, ARCA) y el remitente de la factura | Reglas por palabras clave y por CUIT del emisor, más la lista de proveedores del comercio | Si no hay coincidencia de CUIT ni de palabras clave
Extraer fecha, total, CUIT y número de comprobante | Regex sobre el texto de PaddleOCR, validación del dígito verificador del CUIT, montos argentinos a centavos, chequeo total = suma de ítems | Si la confianza del campo es menor a 0,6, o fallan las reglas de coherencia
Márgenes, totales, umbrales de stock, resumen del viernes, cierre de caja | Fórmulas SQL y TypeScript ya desarrolladas (no hace falta "razonar") | Nunca
Responder al usuario | Plantillas fijas + botones de respuesta + listas interactivas, con la respuesta completa en un solo mensaje | Nunca se genera texto libre con IA para responder

Escenario | Si TODO fuera a LLM (gpt-5-mini) | Ahorro con 80% / 95% determinista | Si TODO fuera a LLM (Grok 4.3) | Ahorro con 80% / 95%
--- | --- | --- | --- | ---
Bajo (600 consultas + 20 facturas) | 0,26 | 0,21 / 0,25 | 0,81 | 0,65 / 0,77
Medio (1.050 + 40) | 0,47 | 0,37 / 0,45 | 1,43 | 1,14 / 1,36
Alto (1.500 + 80) | 0,70 | 0,56 / 0,66 | 2,11 | 1,68 / 2,00

Escenario | Ahorro en WhatsApp (USD/mes) | Costo evitado si se usara Meta Business Agent para responder (~USD 0,045 por mensaje)
--- | --- | ---
Bajo | 7,80 | 40,50
Medio | 13,65 | 70,88
Alto | 19,50 | 101,25

Escenario | Servicio/mes base → con medidas | Ahorro (2) Gmail | Ahorro (3) servicio | Plantillas base → con medidas | Ahorro (3) plantillas | Ahorro total (2)+(3)
--- | --- | --- | --- | --- | --- | ---
Liviano | 225 → 156 | 1,17 | 0,62 | 69 → 57,8 | 0,29 | 2,09
Bajo | 900 → 663 | 3,51 | 2,65 | 69 → 57,8 | 0,29 | 6,45
Medio | 1.575 → 1.131 | 7,02 | 4,52 | 74 → 60,3 | 0,36 | 11,90
Alto | 2.250 → 1.560 | 11,70 | 6,24 | 84 → 65,3 | 0,49 | 18,43

Concepto (USD) | Liviano | Bajo | Medio | Alto
--- | --- | --- | --- | ---
WhatsApp servicio | 5,85 | 23,40 | 40,95 | 58,50
Cupo gratis compartido (1.000 / 500 = 2 mensajes por cliente) | −0,05 | −0,05 | −0,05 | −0,05
WhatsApp plantillas (incluye cierre de caja diario, +0,78) | 1,79 | 1,79 | 1,92 | 2,18
LLM residual | 0,01 | 0,03 | 0,05 | 0,08
OCR PaddleOCR | 0,04 | 0,04 | 0,04 | 0,04
Infraestructura fija (sin OCR; incluye email ~0,04) | 0,34 | 0,34 | 0,34 | 0,34
Google Photos / fotos de productos | ~0 | ~0 | ~0 | ~0
Total base USD | 7,98 | 25,55 | 43,25 | 61,09
Total base ARS (1.540) | 12.292 | 39.350 | 66.608 | 94.081
Ahorro por medidas (2) + (3), ver 7.3 | −2,09 | −6,45 | −11,90 | −18,43
Total con medidas USD | 5,90 | 19,10 | 31,35 | 42,67
Total con medidas ARS (1.540) | 9.081 | 29.412 | 48.282 | 65.705

Escenario | 50 clientes: base / con medidas | 500 clientes: base / con medidas | 2.000 clientes: base / con medidas
--- | --- | --- | ---
Liviano | USD 8,95 (ARS 13.789) / USD 6,87 (ARS 10.578) | USD 7,98 (ARS 12.292) / USD 5,90 (ARS 9.081) | USD 7,95 (ARS 12.240) / USD 5,87 (ARS 9.029)
Bajo | USD 26,52 (ARS 40.847) / USD 20,07 (ARS 30.909) | USD 25,55 (ARS 39.350) / USD 19,10 (ARS 29.412) | USD 25,52 (ARS 39.298) / USD 19,07 (ARS 29.360)
Medio | USD 44,22 (ARS 68.105) / USD 32,32 (ARS 49.778) | USD 43,25 (ARS 66.608) / USD 31,35 (ARS 48.282) | USD 43,22 (ARS 66.556) / USD 31,32 (ARS 48.230)
Alto | USD 62,06 (ARS 95.578) / USD 43,64 (ARS 67.202) | USD 61,09 (ARS 94.081) / USD 42,67 (ARS 65.705) | USD 61,06 (ARS 94.030) / USD 42,63 (ARS 65.653)

Plan (sugerencia) | Precio USD/mes (ARS a 1.540) | Incluye | Costo estimado (USD) | Margen bruto
--- | --- | --- | --- | ---
Básico | 15 (ARS 23.100) | Web completa, alertas con opt-in (aviso matutino + resumen del viernes) + cierre de caja diario por WhatsApp, todo también por email, 100 mensajes del bot por mes (~2,5 consultas/día a 1,3 mensajes), OCR de facturas | 4,75 operativo (antes 3,97; +0,78 por el cierre diario) + 1,27 MP = 6,02 | ~60% (antes ~65%; ≈67% con MP a 35 días). Ver opciones abajo
Plus (nuevo) | 35 (ARS 53.900) | Todo lo del Básico + 300 mensajes del bot por mes (~8 consultas/día), verificación de pagos de Mercado Pago por Gmail (beta) | 10,10 operativo (antes 9,32) + 2,96 MP = 13,06 | ~63% (antes ~65%)
Pro | 59 (ARS 90.860) | Todo lo del Plus + 600 mensajes del bot por mes (~15 consultas/día), más avisos, órdenes de pago, varios usuarios | 18,14 operativo (antes 17,36) + 4,99 MP = 23,13 | ~61% (antes ~62%; ≈67% con MP a 35 días)
Paquete extra (add-on) | 8 (ARS 12.320) por 100 mensajes adicionales (antes 7) | – | 2,60 + 0,68 MP = 3,28 | ~59% (a USD 7 era ~54%)

Opción | Precio Básico | Costo total (operativo + MP) | Margen bruto | Comentario
--- | --- | --- | --- | ---
(a) Mantener todo como está | USD 15 | 4,75 + 1,27 = 6,02 | ~60% | Debajo del 65% de los demás planes; sigue dentro del objetivo 60–80% por poco
(b) Subir el precio | USD 17 (ARS 26.180) / USD 18 (ARS 27.720) | 6,19 / 6,27 | ~64% / ~65% | USD 18 recupera el margen anterior
(c) Cierre diario por WhatsApp opt-in en el Básico | USD 15 | 3,97 + ~0,23 (si lo activa ~30%, estimado) + 1,27 = 5,47 | ~64% (65% si nadie lo activa) | Email diario para todos; WhatsApp solo para quien lo pide
(d) Cierre diario por WhatsApp solo en Plus y Pro | USD 15 | 3,97 + 1,27 = 5,24 | ~65% | Diferencia clara entre planes; Plus y Pro lo absorben (−1 a −2 puntos)
(e) Resumen semanal de caja por defecto por WhatsApp (dentro del resumen del viernes o como plantilla aparte) | USD 15 | 5,24 a 5,35 | ~64–65% | Diario por email; diario por WhatsApp como opt-in o en planes superiores
(f) Combinar el cierre con el aviso matutino del día siguiente en una sola plantilla (PRD de notificaciones, pregunta abierta 1) | USD 15 | 5,24 | ~65% | El cierre llega a la mañana siguiente, no a la noche

Notificación clave | Plantillas/mes por cliente | USD/mes (a ~0,026) | ARS (a 1.540)
--- | --- | --- | ---
Aviso matutino de stock bajo (solo con novedades; 70% con opt-in, 7.3) | 21–30 | 0,55–0,78 | 840–1.200
Resumen semanal del viernes | 4,3 | 0,11 | 172
Cierre de caja diario (días con movimientos; nuevo) | ~30 | +0,78 | 1.200
Total de las tres clave | 55–64 | 1,44–1,67 | 2.220–2.570

Escala | Emails/mes | Costo Resend (USD/mes) | Por cliente (USD) | Por cliente (ARS)
--- | --- | --- | --- | ---
100 clientes | 8.000 | 20 (Pro; el plan gratis tiene tope de 100 por día) | 0,20 | 308
500 clientes | 40.000 | 20 (Pro, 50.000) | ~0,04 | ~62
2.000 clientes | 160.000 | ~89 (USD 35 por 100.000 + 60.000 × USD 0,90/1.000; o Scale 200.000 a USD 160) | ~0,045 | ~69

Escala | WhatsApp, tres clave (USD/cliente) | Email (USD/cliente) | Total notificaciones (USD/cliente) | Total para nosotros (USD/mes) | De eso, cierre diario por WhatsApp (USD/mes)
--- | --- | --- | --- | --- | ---
100 clientes | 1,44–1,67 | 0,20 | 1,64–1,87 | ~164–187 | ~78
500 clientes | 1,44–1,67 | 0,04 | 1,48–1,71 | ~740–855 | ~390
2.000 clientes | 1,44–1,67 | 0,045 | 1,49–1,72 | ~2.970–3.430 | ~1.560

Evento (si se activa por WhatsApp) | Plantillas/mes por cliente | USD/mes (a ~0,026) | ARS (a 1.540)
--- | --- | --- | ---
Diferencia de turno fuera de tolerancia (comercios con empleados) | 2–6 | 0,05–0,16 | 80–240
Entrega en disputa (aviso + resolución) | 0–4 | 0–0,10 | 0–160
Ajuste grande por conteo | 1–4 | 0,03–0,10 | 40–160
Fiado vencido o sobre el tope (agrupado por día, solo con novedades) | 8–20 | 0,21–0,52 | 320–800
Lote por vencer | 0 (va dentro del aviso matutino) | 0 | 0
Promo por vencimiento sugerida (agrupada por día) | 2–8 | 0,05–0,21 | 80–320
Total si se activan todos | 13–42 | 0,34–1,09 | ~520–1.680
