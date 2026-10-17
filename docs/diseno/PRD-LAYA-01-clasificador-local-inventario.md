---
id: PRD-LAYA-01
tipo: prd
estado: propuesto
modulos: [bot, ia]
depende_de: [ADR-0087, ADR-0088, PRD-BOT-02, ADR-0006]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Usos posibles de un clasificador local (Laya) en Sistema de Inventario: capa 2 de intención del bot, filtro de spam/estafa,
  sugerencia de categoría y triage de tickets. Tal cual no sirve; ajustado da 96% en intención (prueba chica). Falta eval set real.
---
# PRD-LAYA-01 - Clasificador local en Sistema de Inventario

Fuente: ADR-0087 (prueba 2026-10-17), `src/modules/whatsapp/consulta.ts`, PRD-BOT-02. Restringido por ADR-0087, ADR-0088, ADR-0006 (Ley 25.326), ADR-0045.

## Problema

Las reglas del bot resuelven stock y precio, pero venta, fiado, cobranza y spam caen en "ninguna" y terminan en un pedido de aclaración. Mandarlo todo a un LLM cuesta por consulta y saca datos del server. Un clasificador local podría cubrir esa franja sin costo por consulta, pero tal cual no alcanzó en español; ajustado en CPU con 120 ejemplos llegó a 96% en intención (ADR-0087).

## Épica LAYA-E1. Medir antes de integrar

Requisito LAYA-R1: ninguna integración sin un eval set real que supere los criterios de ADR-0087.

- Historia LAYA-S1. Eval set de ≥ 200 mensajes reales anonimizados del bot (intenciones stock, precio, venta, fiado, spam y otro), ≥ 150 productos y ≥ 50 tickets, etiquetados a mano. AC: Given el eval set When corro `clasificador:eval` Then informa acierto, cobertura al umbral, ECE y p95 por tarea. ADR: 0088. Talla M. Depende de: BOT2-S1.
- Historia LAYA-S2. Fine-tune del multilingüe (`laya.train`, soft-CE) con la parte de train del eval set real, más temperatura reajustada en un held-out, comparado contra TF-IDF + regresión logística. AC: Given el checkpoint ajustado When evalúo sobre el test real Then precisión ≥ 90% con cobertura ≥ 60%, p95 ≤ 300 ms en la CPU del server y gana al control; si no, se descarta o queda TF-IDF. ADR: 0087. Talla M. Depende de: LAYA-S1.

## Épica LAYA-E2. Casos de uso (si LAYA-S2 pasa)

Requisito LAYA-R2: el modelo solo actúa por encima del umbral; si no, se comporta igual que hoy.

- Historia LAYA-S3. Capa 2 de intención: solo cuando `detectar_intencion` da "ninguna". AC: Given "anotale 2 leches fiado al vecino" When las reglas no resuelven y top_p ≥ umbral Then deriva a fiado; Given top_p bajo Then pide aclaración como hoy. ADR: 0088. Talla S. Depende de: LAYA-S2.
- Historia LAYA-S4. Filtro de spam/estafa en el número central: `noul` con corte alto (0,9 en la prueba). Marca y no responde; nunca bloquea un número vinculado sin humano. AC: Given "pasame el código de 6 dígitos" When noul ≥ corte Then no hay respuesta y queda registrado para revisión. ADR: 0088. Talla S. Depende de: LAYA-S2.
- Historia LAYA-S5. Sugerencia de categoría en el alta de producto (ajustado: 62%, por ahora no alcanza): precarga editable, nunca se aplica sola. AC: Given "Lavandina Ayudín 1L" When doy de alta Then se sugiere limpieza y el Dueño confirma. ADR: 0088. Talla S. Depende de: LAYA-S2.
- Historia LAYA-S6. Triage de tickets de soporte (bug, datos, cuenta, facturación, consulta) para ordenar la bandeja. AC: Given ticket con "error 500" When llega Then se etiqueta bug con su top_p visible. ADR: 0088. Talla S. Depende de: LAYA-S2.

## Métricas de éxito

Menos pedidos de aclaración del bot (medido sobre el log de BOT2), precisión ≥ 90% en lo que el modelo decide, cero acciones irreversibles tomadas por el modelo, p95 ≤ 300 ms y 0 USD por consulta.

## Privacidad y offline

El texto no sale del server (sidecar en 127.0.0.1). No se guarda el texto del cliente en el log del clasificador salvo una muestra opt-in para etiquetar. Si el sidecar falla, el bot sigue con reglas. El clasificador no corre en la PWA offline (~0,7–0,9 GB no entran en el celular).

## Dependencias externas

Decisión de Mauri (ADR-0087). Mensajes reales del número central (P9-3, BOT2-S1). Server con RAM para el sidecar (ADR-0088).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Capa 2 | "registrá que vendí un sixpack" con fake → venta 0,95 | Deriva a venta |
| Fallo | Bajo umbral | Fake → otro 0,40 | Pide aclaración, igual que hoy |
| Fallo | Sidecar caído | Timeout | Sigue con reglas, sin error al usuario |
| Regresión | Reglas primero | "cuántas coca me quedan" | No llama al clasificador |
