---
id: PRD-LAYA-02
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0087, ADR-0088, ADR-0086]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Piloto en sombra de Laya en el box para las automatizaciones del asistente: clasificar fallas de verify/CI, enrutar eventos
  de la cadena y filtrar spam del inbox del bot. Solo registra sugerencias; no actúa ni toca el repo de producción.
---
# PRD-LAYA-02 - Clasificador local en las automatizaciones del box

Fuente: ADR-0087 (CI/verify 83–92%, p50 110–300 ms en el box), ADR-0086 (`verify` como gate), `scripts/cadena/*`, `/workspace/cadena-log.tsv`. Restringido por ADR-0087 y ADR-0088.

## Problema

La cadena (Grok Bot, OpenCode, verificador) relee logs largos para saber por qué falló `verify` y qué hacer después, y eso cuesta tokens en cada corrida. Una etiqueta barata y local ("tipos", "test", "lint", "infra", "lock", "docs") alcanzaría para elegir la acción: reintentar, esperar el lock, levantar Postgres o arreglar código.

## Épica LAYA2-E1. Piloto en sombra

Requisito LAYA2-R1: durante el piloto el clasificador solo sugiere; la decisión la toma la lógica actual y se registra si coincidieron.

- Historia LAYA2-S1. Sidecar Ollama en el box (user-space, `127.0.0.1`, digest pineado), fuera del repo. AC: Given el box reiniciado When arranca la cadena Then el sidecar responde o se sigue sin él. ADR: 0088. Talla S. Depende de: nada.
- Historia LAYA2-S2. Clasificar la última falla de `verify` en 6 clases (las del eval) y anotar en `cadena-log.tsv` la etiqueta, el top_p y si coincidió con la acción tomada. AC: Given `ECONNREFUSED 127.0.0.1:54329` When falla verify Then se registra infra junto a la acción real. ADR: 0088. Talla S. Depende de: LAYA2-S1.
- Historia LAYA2-S3. Filtro de spam/phishing del inbox del bot (`noul`, checkpoint inglés, corte 0,9): solo etiqueta, no borra ni responde. AC: Given un mail de phishing When llega Then queda marcado para revisión. ADR: 0088. Talla S. Depende de: LAYA2-S1.

## Épica LAYA2-E2. Pasar a activo

Requisito LAYA2-R2: solo con datos del piloto y aprobación de Mauri.

- Historia LAYA2-S4. Tras ≥ 100 fallas registradas, si la coincidencia es ≥ 90% al umbral, la etiqueta elige la acción de recuperación (nunca merge, push ni borrado). AC: Given etiqueta lock con top_p ≥ umbral When falla Then espera el lock en vez de reintentar verify. ADR: 0088. Talla S. Depende de: LAYA2-S2.

## Métricas de éxito

Coincidencia con la acción real ≥ 90%, menos tokens por corrida fallida, p95 ≤ 400 ms en el box y cero acciones externas tomadas por el clasificador.

## Dependencias externas

Aprobación de Mauri para el piloto. Lo hosteamos nosotros: el box tiene RAM de sobra (~0,9 GB por checkpoint), pero `ollama pull` falla por la red y hay que bajar los blobs a mano verificando el sha256 (ver ADR-0087).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Falla de tipos | `error TS2322 …` | Registra tipos, top_p y acción real |
| Fallo | Sidecar caído | Sin respuesta | La cadena sigue igual; se registra "sin clasificador" |
| Regresión | Sin efectos | Cualquier falla en sombra | Ninguna acción distinta a la lógica actual |
