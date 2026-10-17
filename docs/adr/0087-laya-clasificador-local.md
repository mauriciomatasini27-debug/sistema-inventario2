---
id: ADR-0087
tipo: adr
estado: propuesto
modulos: [bot, ia]
depende_de: [ADR-0002, ADR-0041, ADR-0044, ADR-0045, PRD-BOT-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Laya (Convai, Apache-2.0) es un clasificador local, no un LLM. Tal cual no sirve en español (34–54% en el box); con fine-tune
  en CPU (4 min, 190 ejemplos) llega a 96% en intención del bot. Se propone medir con datos reales antes de producción.
---
# ADR-0087 - Evaluación de Laya como clasificador local

Estado: propuesto. Fecha: 2026-10-17. Fuentes: ver "Fuentes verificadas"; prueba en el box (`/workspace/laya-eval/`); `src/modules/whatsapp/consulta.ts`; ADR-0002, ADR-0045, `docs/01-fundacion/costos-por-cliente.md`.

## Decisión

1. Laya tal cual (zero-shot) no sirve para el Sistema de Inventario. Con ajuste sirve para la intención del bot, pero falta confirmarlo con mensajes reales (PRD-LAYA-01, LAYA-S1/S2) antes de producción. Para categorías de producto no sirve ni ajustado (62%).
2. Lo generativo sigue esperando el proveedor LLM de ADR-0045: Laya no genera texto y no lo reemplaza.
3. Automatizaciones del box (Grok Bot, cadena, verificador): piloto en modo sombra (PRD-LAYA-02), sin que Laya decida nada solo.
4. La forma de integración es la de ADR-0088.

## Contexto

Laya es un modelo de decisión de Convai Innovations (421M, base ModernBERT-large; variante multilingüe 322M sobre mmBERT-base). Recibe `state` (texto) y preguntas tipadas `choice` / `noul` / `score` por `POST /v1/systemone`, el mismo formato que Jev de TypeSafe, y devuelve probabilidades por opción. Corre local con Ollama ≥ 0.40.0. El bot hoy detecta intención con regex (`detectar_intencion`: stock, precio, alertas) y el resto cae en "ninguna".

## Lo que dijo Mauri vs lo que dicen las fuentes

| Afirmación | Verificado |
|---|---|
| Gratis y abierto | Sí: Apache-2.0 (GitHub, HF, PyPI). |
| ~850 MB, en Ollama | Sí: `laya:latest` 844 MB. Multilingüe 658 MB, tag aparte. |
| Offline, sin costo por consulta | Sí, una vez bajado; el costo es RAM/CPU del servidor. |
| Devuelve "porcentaje de confianza" | Parcial: `confidence` = 1 − H(p)/log k (qué tan concentrada está la distribución), no la probabilidad de acierto. Además da `probabilities`; `noul` en Ollama no trae `confidence`. |
| Responde en milisegundos | En GPU sí (33–40 ms en T4). En el box (CPU) medimos 110–600 ms. |
| Jev es lo mismo, pago, de TypeSafe | Jev es el modelo pago de TypeSafe (USD 0,042 por millón de tokens de entrada). Laya no es de TypeSafe: es de otro autor y solo copia la API. |
| ~6x más rápido según sus benchmarks | La tarjeta de HF dice 6–8× y Ollama ~10×. Comparan GPU in-process contra Jev por internet; no es comparable. En CPU, Laya inglés (p50 335 ms) no le gana a Jev medido (236–276 ms). |
| El multilingüe está peor calibrado en español | Parcial: el multilingüe sale sin temperaturas ajustadas (ECE 0,314 de fábrica, 0,106 tras reajuste); no hay cifra publicada para español (no verificado). Ojo: `laya` (default) es solo inglés. |

## Opciones

| Opción | A favor | En contra |
|---|---|---|
| Laya local | Sin costo por consulta, datos no salen del server (Ley 25.326), offline, se puede ajustar en CPU | Mal en español zero-shot; ajustado necesita eval set propio; 0,8 GB (Ollama) a 2,4 GB (Python) de RAM |
| Jev (TypeSafe, nube) | Mejor zero-shot y con muchas opciones, sin infra | Pago por token, datos salen, sin cifras en español (no verificado), otra credencial |
| LLM genérico (ADR-0045) | Ya previsto, entiende rioplatense | Costo y latencia por consulta; sobredimensionado para clasificar |
| TF-IDF + regresión logística | 93% en intención con los mismos 120 ejemplos, ~0 infra | Peor calibrado; no generaliza a frases nuevas (no medido) |
| Reglas/regex (hoy) | 100% en su dominio, ~1 µs, determinista | No cubre venta, fiado ni spam; mantenimiento manual |
| No hacer nada | Cero costo | Los mensajes fuera de reglas siguen pidiendo aclaración |

Criterios: acierto en español rioplatense, que alta confianza implique acierto, latencia p95 en CPU del server, RAM, costo, privacidad, mantenimiento.

## Resultados de la prueba (box, 2026-10-17)

59 ejemplos etiquetados a mano (28 WhatsApp con 6 intenciones, 21 productos en 7 categorías, 10 tickets en 5 tipos), una pregunta `choice` por ejemplo. Box: 8 vCPU x86_64, sin GPU, compartido.

| Checkpoint / idioma del prompt | Acierto total | WhatsApp | Productos | Tickets | p50 / p95 ms | AUROC confidence |
|---|---|---|---|---|---|---|
| `laya` (inglés), prompt es | 34% | 32% | 24% | 60% | 335 / 397 | 0,83 |
| `laya` (inglés), prompt en | 54% | 50% | 52% | 70% | 355 / 596 | 0,57 |
| multilingüe, prompt es | 51% | 43% | 52% | 70% | 118 / 187 | 0,78 |
| multilingüe, prompt en | 41% | 46% | 24% | 60% | 111 / 142 | 0,72 |
| Reglas del repo (`detectar_intencion`) | — | 54% (100% en stock/precio) | — | — | ~0,001 | — |

- Calibración: el multilingüe en español erra con mucha confianza (11 errores con confidence ≥ 0,7, p.ej. "hay yerba playadito?" → spam 0,98). En el de inglés con prompt es, confidence ≥ 0,5 acierta 100% pero cubre solo el 15%.
- 3 preguntas en una llamada: 558 / 742 ms (inglés), 229 / 348 ms (multilingüe).
- RAM (RSS del runner): ~870 MB inglés, ~770 MB multilingüe. Carga en frío ~2 s.
- Spam (`noul`, 4 positivos / 24 negativos): el de inglés detecta 4/4 con 5 falsos positivos al corte 0,5 y ninguno al 0,9 (el negativo más alto dio 0,69). El multilingüe da negativos de hasta 1,0. Como `choice` A/B contesta siempre "A" (14%).
- Errores de CI/verify (12 en 6 clases): 83% inglés, 92% multilingüe, p50 300 / 110 ms.

Muestra chica: sirve para descartar, no para aprobar.

### Ajuste con ejemplos propios ("ajustar los pesos")

Se puede: los pesos son abiertos en HF (`convaiinnovations/laya`, subcarpeta `multilingual`), la licencia Apache-2.0 permite modificarlos y el paquete trae `laya.train.finetune` (fine-tune completo, objetivo RLCD o soft-CE) y `laya.calibrate` (temperatura por tipo y cantidad de opciones, umbrales de abstención). LoRA no viene incluido. La guía oficial habla de 4–5 h en 2× T4 para ~30k preguntas.

Split sin fuga: 190 ejemplos nuevos para entrenar (120 WhatsApp, 20 por intención; 70 productos, 10 por categoría) y como test los 49 originales (28 WhatsApp, 21 productos), escritos antes y sin repetidos.

| Método (checkpoint multilingüe) | WhatsApp | Productos | Notas |
|---|---|---|---|
| Tal cual | 43% | 52% | ECE 0,30 |
| + temperatura (T = 2,9) | 43% | 52% | ECE 0,30 → 0,15; no cambia el acierto |
| Cabeza lineal sobre embeddings congelados | 86% | 33% | Al umbral fijado en train: 54% de cobertura con 100% de precisión |
| Fine-tune completo, soft-CE, 4 épocas | 96% | 62% | 3,5–4 min en el CPU del box. Con top_p ≥ 0,9: WhatsApp cubre 82% con 100% de precisión, productos 48% con 90% |
| Control sin modelo: TF-IDF de caracteres + regresión logística | 93% | 62% | Mal calibrado (ECE 0,25) |

- Veredicto: no sirve tal cual, sirve con ajuste para intención en WhatsApp. Para productos no alcanza: hace falta saber de marcas (qué es "Ayudín"), y eso no sale de 10 ejemplos por categoría.
- La ventaja sobre TF-IDF es chica en acierto (1 ítem de 28). Laya ajustado gana en que su confianza sirve para abstenerse.
- Inferencia del ajustado: p50 73–88 ms. Corre con el paquete Python (fp32), con pico de RSS de ~2,4 GB. Pasarlo a Ollama/GGUF no está verificado.
- Sesgo: train y test los escribió la misma persona, así que el 96% es optimista. Falta validarlo con mensajes reales.

## Riesgos

- Español: el default es solo inglés. El multilingüe sale sobreconfiado y no hay benchmark publicado para español.
- Licencia: Apache-2.0, sin riesgo para uso comercial. Se pinea el digest del modelo.
- Mantenimiento: proyecto joven y que cambia rápido (PyPI 0.4.11 mientras la tarjeta habla de 0.3.20; issue #185 abierto, `act_probability` no sirve). Eso suma un eval set y recalibrar con cada versión.
- Hosting: la app corre en VPS Hetzner CX33/43 sin GPU (ADR-0002, `costos-por-cliente.md`) con Node standalone. El box no es producción: allá hacen falta ~0,9 GB de RAM por checkpoint y un sidecar Ollama, y CPU compartida con PgBouncer/OCR.
- `ollama pull` falló en el box por la red (redirect a R2). En el server hay que validar la descarga o versionar el blob.

## Recomendación

Tal cual: no. Ajustado: sí para la capa 2 de intención del bot, una vez que pase con datos reales. Piloto en sombra en el box para fallas de CI/verify y para spam con corte alto. ModoOps: aplican las mismas conclusiones (español, CPU), pero no se probó con sus datos.

Para pasar a aceptado: un eval set real de ≥ 200 mensajes donde Laya ajustado logre ≥ 90% de precisión con ≥ 60% de cobertura al umbral, p95 ≤ 300 ms en la CPU del server y le gane a TF-IDF + regresión logística (si no le gana, conviene TF-IDF, que no necesita sidecar).

## Evaluación de la documentación de Laya

- Completa: API, límites (512/1.024 tokens, ≤ 20 opciones), arquitectura y "Honest limits" en HF están bien.
- Inconsistente: Ollama dice "calibrated, ECE 0,060" y HF dice que sale sobreconfiado (ECE 0,466). Ollama habla de ~10× y HF de 6–8×. Ollama muestra contexto 8K en los tags bf16 y en las notas dice 512.
- Faltantes: no hay cifras para español ni latencias en CPU por tamaño de input. No aclara que Ollama no enruta por idioma (el `Router` es solo del paquete Python) ni que `noul` en Ollama no trae `confidence`.
- `laya.studio` es un servicio comercial independiente, no de los autores: útil, pero con sesgo.

## Fuentes verificadas (2026-10-17)

- https://ollama.com/library/laya
- https://huggingface.co/convaiinnovations/laya
- https://github.com/NandhaKishorM/laya (Apache-2.0; issues #156 cerrado, #185 abierto)
- https://pypi.org/project/laya/
- https://docs.typesafe.ai/models, https://docs.typesafe.ai/api, https://docs.typesafe.ai/concepts/system-one
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
- https://openrouter.ai/docs/guides/community/jev
- Tercero, no oficial: https://laya.studio/compare/laya-vs-jev

## Pendientes

Que Mauri decida: (a) aprobar el piloto del box (PRD-LAYA-02); (b) armar el eval set real del bot (LAYA-S1, necesita mensajes reales anonimizados); (c) si el server de producción banca un sidecar de ~2,4 GB (Python) o se invierte en exportarlo a Ollama; (d) Jev queda descartado salvo que el ajuste falle con datos reales.
