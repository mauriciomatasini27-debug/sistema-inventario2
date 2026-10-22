---
id: PRD-SK-03
tipo: prd
estado: en curso
modulos: []
depende_de: [ADR-0008, ADR-0016, PRD-DS-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: .agents/skills/technical-writing/SKILL.md, unslop/SKILL.md, interrogate/SKILL.md. Uso en
  este sistema: todo PRD, ADR, email y plantilla WhatsApp. Restringido por ADR-0016.
---
# PRD-SK-03 - Skills de prosa y revisión: technical-writing + unslop + interrogate (R2)

Fuente: `.agents/skills/technical-writing/SKILL.md`, `.agents/skills/unslop/SKILL.md`, `.agents/skills/interrogate/SKILL.md`. Uso en este sistema: todo PRD, ADR, email y plantilla WhatsApp. Restringido por ADR-0016. Tipo proceso según ADR-0016.

## Épica PR-E1. Technical-writing, cuatro capas

Requisito SK-PR1: un documento un modo, frases al lector, sin doble lectura.

- Historia PR-S1. Elegir modo Diátaxis primero: tutorial para hacer más aprender, how-to para hacer más trabajar, reference para entender más trabajar y explanation para entender más aprender, con un documento un modo sin mezclar. AC: Given abro un doc When identifico su modo Then hay uno solo declarado y el contenido lo respeta. ADR: 0016. Talla S. Depende de: nada.
- Historia PR-S2. Escribir frases al lector en presente y con comandos, con una instrucción por frase, condición antes del paso y caso común primero. AC: Given leo un how-to When reviso cada paso Then cada frase trae una sola instrucción con su condición delante. ADR: 0016. Talla S. Depende de: PR-S1.
- Historia PR-S3. Evitar doble lectura con `only` junto a lo que cambia, pronombres con un solo referente, sin barras ni `(s)`, cada cosa con un solo nombre y ritmo variado con vista propia donde el modo lo permite. AC: Given reviso un doc When busco barras o `(s)` Then no hay ninguna y cada concepto usa un solo nombre. ADR: 0016. Talla S. Depende de: PR-S2.

## Épica PR-E2. Unslop, catálogo de tells

Requisito SK-PR2: pasar unslop sobre todo lo que toca technical-writing, con sentido intacto.

- Historia PR-S4. Aplicar reglas estables citables sobre frases `-ing` superficiales, atribuciones vagas, vocabulario IA, formas rebuscadas de decir es, `not just X but Y`, regla de tres forzada, cycling de sinónimos, rangos falsos, colon conector, bold e inline-headers decorativos, title case, emojis, comillas curvas, frases de chatbot, adulación, relleno, hedging, conclusiones genéricas, metáforas abstractas y prosa amanerada. AC: Given paso unslop a un borrador When comparo salida con entrada Then el sentido sigue intacto y los tells listados desaparecen. ADR: 0016. Talla M. Depende de: PR-S1.
- Historia PR-S5. Dejar constancia de qué reglas se aplicaron en cada pasada. AC: Given abro un doc revisado When busco su nota Then lista las reglas aplicadas con ejemplo antes y después. ADR: 0016. Talla S. Depende de: PR-S4.

## Épica PR-E3. Interrogate, revisión adversarial

Requisito SK-PR3: un reviewer por modelo con mismo prompt, rúbrica y lente, sin auto-aplicar cambios.

- Historia PR-S6. Correr un reviewer por modelo con el mismo prompt, rúbrica y lente de calidad, sin auto-aplicar cambios. AC: Given cierro un diseño When pido interrogate Then hay un veredicto por modelo con la misma rúbrica. ADR: 0016. Talla M. Depende de: PR-S4.
- Historia PR-S7. Tratar el consenso de 2 o más modelos como la señal más alta y cerrar con veredicto del lead Act on que bloquea, Consider como tradeoff, Noted como válido no accionable y Dismissed como mal o nitpick, con modelo y motivo por hallazgo más mapa de acuerdos y desacuerdos. AC: Given hay dos modelos de acuerdo en un hallazgo When leo el veredicto Then queda marcado como señal alta con su mapa de acuerdos. ADR: 0016. Talla M. Depende de: PR-S6.

## Épica PR-E4. Pipeline en Inventario y criterios

Requisito SK-PR4 y Criterios: orden fijo y tres prohibiciones.

- Historia PR-S8. Seguir orden fijo de how y why para grounding, architect para sketch, technical-writing más unslop para PRD y ADR, e interrogate antes de cerrar diseño, con el que salieron PRD-DS-01 a 03 y ADR-0008 y 0009. AC: Given audito PRD-DS-01 a 03 When reviso su historial Then hay grounding, sketch, prosa y revisión en ese orden. ADR: 0016. Talla S. Depende de: PR-S6.
- Historia PR-S9. Pasar emails y plantillas WhatsApp por technical-writing más unslop por ser superficies de prosa. AC: Given abro un email o una plantilla WA When reviso su historial Then pasó por technical-writing más unslop. ADR: 0016. Talla S. Depende de: PR-S4.
- Historia PR-S10. Verificar que ningún PRD mezcla modos, ningún doc con tells sale sin pasar unslop y ningún diseño one-way-door cierra sin interrogate previo. AC: Given audito un diseño one-way-door When pido su cierre Then hay modo único, pasada unslop e interrogate previos. ADR: 0016. Talla S. Depende de: PR-S8.

## Dependencias externas

PR-S1 no espera a nadie. Unslop espera a technical-writing. Interrogate espera a unslop. El pipeline espera a grounding y sketch previos.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Pipeline completo | Diseño one-way-door | Grounding, sketch, prosa con unslop e interrogate en ese orden |
| Fallo | PRD con modos mezclados | Doc con tutorial y referencia juntos | Rechazo hasta dejar un solo modo Diátaxis |
| Regresión | Tells sin unslop | Borrador con tells del catálogo | Detección y reescritura con sentido intacto |

Arch-tests: AT1 un modo por documento (lint: falla si mezcla tutorial, how-to, reference y explanation). AT2 cierre one-way-door exige interrogate previo con veredictos por modelo (checklist con evidencia).
