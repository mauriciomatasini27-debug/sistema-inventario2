# PRD-SK-02 - Skill de diseño: architect (R2)

Fuente: `~/.config/opencode/skills/architect/SKILL.md` más `references/design-red-flags.md` y `rationale-template.md`. Uso en este sistema: toda decisión one-way-door (multitenancy, auth, offline, panel). Restringido por ADR-0015. Tipo proceso según ADR-0015.

## Épica AR-E1. Fases obligatorias

Requisito SK-AR1: Ground, Sketch, Agree opt-in, Implement y Scrap, con todolist previo.

- Historia AR-S1. Abrir todolist con una entrada por fase antes de empezar, con Ground que salta solo en greenfield sin sistema alrededor. AC: Given arranco un diseño When miro el todolist Then hay una entrada por cada fase o consta greenfield. ADR: 0015. Talla S. Depende de: nada.

## Épica AR-E2. Sketch con arena

Requisito SK-AR2: mínimo dos candidatos estructuralmente distintos, con filtro de red flags.

- Historia AR-S2. Producir dos candidatos estructuralmente distintos aunque el primero parezca suficiente, con runners definidos y fallback acordado. AC: Given pido el sketch When lo recibo Then hay dos formas distintas comparadas con sus tradeoffs. ADR: 0015. Talla M. Depende de: AR-S1.
- Historia AR-S3. Filtrar cada candidato contra red flags de módulos superficiales, fuga de información, descomposición temporal y pass-through, y declarar ganadora a la interfaz que esconde más complejidad tras menos superficie. AC: Given leo la comparación When reviso el filtro Then cada candidato trae su chequeo de los cuatro red flags y una ganadora justificada. ADR: 0015. Talla M. Depende de: AR-S2.
- Historia AR-S4. Documentar la síntesis en el rationale con uso, sketch de tipos y firmas. AC: Given abro el rationale When lo leo Then hay uso, tipos y firmas de la forma ganadora. ADR: 0015. Talla S. Depende de: AR-S3.

## Épica AR-E3. Checkpoint

Requisito SK-AR3: directo a implementar por defecto, con pausa solo explícita.

- Historia AR-S5. Ir directo a implementar por defecto y pausar con diseño visible solo si se pide explícito, con todo empuje en contra que reabre Ground y Sketch sin editar el sketch a mano. AC: Given hay objeción al sketch When la proceso Then Ground y Sketch se reabren y el sketch original queda intacto. ADR: 0015. Talla S. Depende de: AR-S4.

## Épica AR-E4. Scrap

Requisito SK-AR4: tirar el sketch ante patrón de fricción confirmado.

- Historia AR-S6. Tirar el sketch ante mismo workaround repetido, ramas especiales en casos no relacionados, `any` o casts para compilar, reflejo de pedir lock, o callers que conocen reglas internas, con dos desvíos independientes del mismo tipo como confirmación. AC: Given registro dos desvíos del mismo tipo When evalúo Then el sketch se marca para rediseño y no sigue parchado. ADR: 0015. Talla S. Depende de: AR-S4.
- Historia AR-S7. Rediseñar como si la restricción nueva fuera suposición del día uno, restando antes de sumar. AC: Given arranca el rediseño When leo el plan Then primero quita código o reglas y después agrega. ADR: 0015. Talla M. Depende de: AR-S6.

## Épica AR-E5. Uso en Inventario y criterios

Requisito SK-AR5 y Criterios: cada ADR de arquitectura cita candidatos y síntesis.

- Historia AR-S8. Respaldar ADR-0001 de monolito modular frente a servicios con RLS y ADR-0005 de PaddleOCR propio frente a nube, cada uno con sus dos candidatos y su síntesis. AC: Given abro ADR-0001 y ADR-0005 When leo su rationale Then cada uno cita dos candidatos y la síntesis ganadora. ADR: 0015. Talla S. Depende de: AR-S4.
- Historia AR-S9. Verificar que ningún ADR sale sin dos candidatos, ninguna implementación va contra el sketch sin registrar desvíos y ningún sketch condenado sigue parchado. AC: Given audito un ADR When reviso su sketch Then hay dos candidatos y los desvíos figuran por escrito o no hay implementación. ADR: 0015. Talla S. Depende de: AR-S6, AR-S8.

## Dependencias externas

AR-S1 no espera a nadie. El sketch espera al todolist. El checkpoint y el scrap esperan a la síntesis. El uso en Inventario espera al sketch con arena.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Sketch con arena | Decisión one-way-door | Dos candidatos comparados con ganadora justificada y rationale con tipos y firmas |
| Fallo | Implementación contra sketch sin desvíos | Código que diverge sin registro | Bloqueo hasta registrar desvíos por escrito |
| Regresión | Sketch condenado parchado | Dos desvíos del mismo tipo | Marca para rediseño, sin parches |

Arch-tests: AT1 todo ADR de arquitectura cita dos candidatos (lint de docs: falla si falta un candidato o la síntesis).
