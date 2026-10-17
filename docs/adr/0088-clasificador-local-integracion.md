---
id: ADR-0088
tipo: adr
estado: propuesto
modulos: [bot, ia]
depende_de: [ADR-0087, ADR-0042, ADR-0045]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Si se adopta un clasificador local: sidecar Ollama en 127.0.0.1 detrás de una interfaz ClasificadorLocal con fake para tests,
  preguntas versionadas, cascada reglas → modelo → humano, umbrales por tarea y eval set en el repo. Condicional a ADR-0087.
---
# ADR-0088 - Integración de un clasificador local (condicional)

Estado: propuesto. Fecha: 2026-10-17. Fuentes: ADR-0087, ADR-0042 (patrón transport intercambiable), ADR-0045 (`LlmProvider` + fake), https://ollama.com/library/laya.

## Decisión

Aplica solo si ADR-0087 pasa a aceptado para alguna tarea. Hasta entonces no se escribe código.

- Forma: un sidecar en el mismo host, escuchando solo en `127.0.0.1`. Para el checkpoint ajustado (ADR-0087) se usa `laya-serve` del paquete Python: `LAYA_HOST=127.0.0.1` y `LAYA_API_KEY` siempre, porque por defecto escucha en 0.0.0.0 sin auth. Pico de RSS ~2,4 GB. Los checkpoints oficiales también se pueden servir con Ollama ≥ 0.40.0 (~0,8 GB), pineados por digest (`laya:322m-multilingual-bf16` = `sha256:4d8ab9c0…`). Importar el ajustado a Ollama no está verificado.
- Ajuste: `laya.train.finetune` (soft-CE, 4 épocas) sobre el set de train versionado, fuera de `verify` y fuera del repo de la app. El checkpoint resultante se guarda con hash y fecha y se reajusta la temperatura en un held-out.
- Interfaz `ClasificadorLocal.decidir(tarea, state) → {opcion, top_p, confidence, version}` con un adaptador HTTP `/v1/systemone` (timeout 800 ms; sirve igual para Ollama, `laya-serve` o Jev) y un `fake` determinista para los tests. `verify` nunca necesita Ollama.
- Preguntas versionadas en código (`tarea@vN`): instrucciones y descripciones de opciones, ≤ 20 opciones, siempre con `otro`. Para sí/no se usa `noul` (el `choice` A/B falló en la prueba).
- Cascada: reglas deterministas primero. El modelo solo se consulta si las reglas no resuelven y solo actúa si `top_p ≥ umbral[tarea]`. Si no, se pide aclaración o va a un humano. Si hay timeout o el sidecar está caído, se sigue como hoy.
- Umbrales por tarea, sacados del eval set para una precisión objetivo (no copiar el 0,85 del proveedor). Se corta sobre `top_p` después de reajustar una temperatura por (tipo, cantidad de opciones) en un held-out; `confidence` queda solo para monitoreo.
- Eval set en el repo (`tests/fixtures/clasificador/<tarea>.json`, etiquetado a mano) y script manual `npm run clasificador:eval` (fuera de `verify`) que informa acierto, cobertura al umbral, ECE y p50/p95.
- Monitoreo: log por decisión (tarea, versión, digest, opción, top_p, latencia, si actuó), sin texto del cliente salvo una muestra opt-in para etiquetar. Alarma si la cobertura o el acierto en la muestra caen más de 10 puntos.

## Por qué

Es el mismo patrón que `WhatsAppTransport` y `LlmProvider`: se puede cambiar de proveedor (Laya, Jev, LLM) sin tocar el núcleo, y los tests corren sin red. La cascada asegura que nunca quedemos peor que las reglas de hoy.

## Qué cambia

Nada hasta la aceptación. Después: `src/modules/clasificador/` (interfaz, adaptador HTTP, fake), fixtures, script de eval y un servicio sidecar en el deploy de Hetzner (+0,8–2,4 GB de RAM según runtime).

## Pendientes

Que Mauri apruebe el sidecar en el server de producción y su tamaño (CX33 vs CX43).
