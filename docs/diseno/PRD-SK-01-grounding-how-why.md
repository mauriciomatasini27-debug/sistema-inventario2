---
id: PRD-SK-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0006, ADR-0014]
reemplaza: []
reemplazado_por: ""
resumen: "Requisito SK-HW2: responder por qué X tiene esta forma, con evidencia y marco epistémico."
---
# PRD-SK-01 - Skills de grounding: how + why (R2)

Fuente: `~/.config/opencode/skills/how/SKILL.md`, `why/SKILL.md`. Uso en este sistema: antes de diseñar o tocar subsistemas heredados de ModoOps. Restringido por ADR-0014. Tipo proceso según ADR-0014.

## Épica HW-E1. How, explicación arquitectónica

Requisito SK-HW1: responder cómo funciona X con modelo mental de senior haciendo onboarding, sin anotar código línea por línea.

- Historia HW-S1. Resolver duda simple de un módulo con un lane directo que explora y explica en un pase. AC: Given pregunto por un módulo único When corre how simple Then recibo Overview, Key Concepts, How It Works, Where Things Live y Gotchas en un pase. ADR: 0014. Talla S. Depende de: nada.
- Historia HW-S2. Resolver duda compleja de sistema multi-archivo con 2 a 4 exploradores paralelos por ángulo más un sintetizador. AC: Given pregunto por un subsistema Advanced multi-archivo When corre how complejo Then hay 2 a 4 exploradores de solo lectura y una síntesis final. ADR: 0014. Talla M. Depende de: HW-S1.
- Historia HW-S3. Respetar modelos con exploradores solo lectura y sintetizador definido, con salida presentada casi intacta. AC: Given reviso la corrida When miro roles y salida Then los exploradores solo leyeron y la síntesis conserva las cinco secciones fijas. ADR: 0014. Talla S. Depende de: HW-S2.

## Épica HW-E2. Why, linaje de decisiones

Requisito SK-HW2: responder por qué X tiene esta forma, con evidencia y marco epistémico.

- Historia HW-S4. Anclar en código con blame, log con renames y PRs vía `gh`, con siete investigadores paralelos por categoría con MCP: source control siempre, tickets, docs largos, chat, observabilidad, errores y analytics. AC: Given pido el porqué de una decisión When corre why Then las siete categorías figuran con nulos declarados donde no hubo datos. ADR: 0014. Talla M. Depende de: HW-S1.
- Historia HW-S5. Registrar cada salto con justificación escrita en Sources Consulted y sintetizar separando lo hallado, lo inferido, hipótesis en competencia y lo desconocido. AC: Given leo la síntesis When reviso el marco Then cada afirmación cae en hallado, inferido, hipótesis o desconocido sin mezcla. ADR: 0014. Talla M. Depende de: HW-S4.
- Historia HW-S6. Cerrar con Preserve, Change, Avoid y Risk cuando sigue un cambio. AC: Given el why precede a un cambio When leo el cierre Then hay cuatro listas Preserve, Change, Avoid y Risk. ADR: 0014. Talla S. Depende de: HW-S5.

## Épica HW-E3. Cuándo usar cada una y uso en Inventario

Requisito SK-HW3 y SK-HW4: elegir how o why según la pregunta y aplicarlo antes de portar o copiar.

- Historia HW-S7. Usar how para pregunta de runtime, ubicación o capas, why para pregunta de motivo, tradeoff, regresión o umbral con número, y exigir why además de how para redefinir ownership. AC: Given pido redefinir ownership When reviso el plan Then incluye how y why antes del diseño. ADR: 0014. Talla S. Depende de: HW-S1, HW-S4.
- Historia HW-S8. Pasar how sobre `modoops_core` SCSS antes de portar Tema papel. AC: Given voy a portar el tema When busco el grounding Then existe un how sobre `modoops_core` SCSS previo al port. ADR: 0014. Talla S. Depende de: HW-S2.
- Historia HW-S9. Pasar why sobre mora de 14 días según ADR-0006 y sobre 1 DB por cliente antes de copiarlas al Panel. AC: Given voy a copiar mora o aislamiento When busco el linaje Then existe un why con fuentes que respeta gracia de 14 días. ADR: 0014, 0006. Talla S. Depende de: HW-S4.
- Historia HW-S10. Citar la fuente de toda decisión heredada o marcarla con `[a verificar]`. AC: Given audito una decisión heredada When leo su ficha Then cita fuente o muestra `[a verificar]`. ADR: 0014. Talla S. Depende de: HW-S5.

## Épica HW-E4. Criterios transversales

Requisito Criterios: sin grounding no hay diseño, salvo greenfield real.

- Historia HW-S11. Verificar que ningún diseño arranca sin grounding salvo greenfield real, que ningún why sale sin Sources Consulted con nulos declarados y que ninguna reescritura del sintetizador cambia su lenguaje de confianza. AC: Given audito un diseño When pido su grounding Then hay how o why con Sources Consulted, o consta greenfield real. ADR: 0014. Talla S. Depende de: HW-S7, HW-S10.

## Dependencias externas

HW-S1 no espera a nadie. El modo complejo espera al simple. La síntesis espera a los investigadores. El uso en Inventario espera a how y why previos. La mora citada es siempre de 14 días según ADR-0006.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | How simple | Duda de un módulo | Un lane directo con Overview, Key Concepts, How It Works, Where Things Live y Gotchas |
| Fallo | Why sin Sources Consulted | Why sin nulos declarados | Rechazo hasta completar las siete categorías |
| Regresión | Decisión heredada sin fuente | Auditoría de ficha | Cita fuente o muestra `[a verificar]` |

Arch-tests: AT1 plantilla de salida valida secciones fijas (test: falla si falta una sección o si el sintetizador cambia su lenguaje de confianza).
