# PRD-COM-01 - Poda de comentarios de código

Fuente: skill `no-comments` de pstack (agente `comment-sicko` en `.opencode/`). Uso en este sistema: todo `src/` de cualquier comercio, sin reglas por rubro salvo las que el código ya marca como propias de un rubro (por ejemplo kiosco). Restringido por ADR-0064. Tipo proceso según ADR-0016.

## Problema

Los agentes copian los comentarios junto con el código. Un comentario que explica un parche temporal hace que el parche se repita en otras rutas. Un comentario falso se repite como verdad: ya hubo comentarios que decían que una tabla no existía cuando la tabla estaba en `src/db`.

## Épica COM-E1. Política de comentarios

Requisito COM-R1: un comentario se queda solo si explica un por qué que el código no puede decir.

- Historia COM-S1. Conservar solo comentarios de por qué no obvio: particularidad de navegador o plataforma, regla fiscal o legal con referencia (norma, resolución ARCA, ley), invariante de seguridad o de aislamiento por tenant. AC: Given reviso un comentario When no entra en ninguna de las tres clases Then se borra o se convierte según COM-S2 y COM-S3. ADR: 0064. Talla S. Depende de: nada.
- Historia COM-S2. Borrar comentarios que repiten el código, quedaron obsoletos o son falsos frente al código actual. AC: Given un comentario afirma algo del código When lo verifico contra `src/` Then si es falso u obsoleto se borra en el mismo cambio. ADR: 0064. Talla S. Depende de: COM-S1.
- Historia COM-S3. Convertir cada comentario que explica un parche temporal en un refactor o en un issue con dueño; el código no guarda la explicación del parche. AC: Given un comentario dice temporal, por ahora, TODO o hack When lo trato Then hay un refactor hecho o un issue enlazado, y el comentario se va. ADR: 0064. Talla M. Depende de: COM-S1.

## Épica COM-E2. Inventario y plan

Requisito COM-R2: un plan revisado a mano antes de tocar código.

- Historia COM-S4. Relevar `src/` por área (rutas API, repositorios, `lib`, jobs, componentes de UI, `db`) con `/no-comments` en sesiones de OpenCode de hasta 250k de contexto, y verificar a mano cada comentario marcado falso u obsoleto. AC: Given cierro el relevamiento When abro el plan Then cada entrada trae archivo, línea, cita y motivo en uno de tres grupos: borrar, refactor, conservar. ADR: 0064. Talla M. Depende de: COM-S1.
- Historia COM-S5. Ejecutar el grupo borrar en un commit por área sin cambios de comportamiento. AC: Given aplico el grupo borrar When corro `npm test` y `tsc --noEmit` Then los resultados son los mismos que antes. ADR: 0064. Talla S. Depende de: COM-S4.
- Historia COM-S6. Abrir un issue por cada refactor del grupo refactor con talla y propuesta. AC: Given el plan tiene N refactors When reviso el tablero Then hay N issues enlazados desde el plan. ADR: 0064. Talla S. Depende de: COM-S4.

## Épica COM-E3. Cumplimiento

Requisito COM-R3: que la política no dependa de la memoria de quien revisa.

- Historia COM-S7. Regla de lint que falla con `TODO`, `FIXME`, `HACK`, `XXX`, `temporal` o `por ahora` sin un enlace a issue en la misma línea. AC: Given agrego `// TODO arreglar` When corro el lint Then falla; Given agrego `// TODO #123` Then pasa. ADR: 0064. Talla S. Depende de: COM-S6.
- Historia COM-S8. Punto en la checklist de revisión de PR: cada comentario nuevo cae en una de las tres clases de COM-S1 y cada afirmación sobre tablas, rutas o flags se verificó. AC: Given reviso un PR con comentarios nuevos When aplico la checklist Then cada comentario tiene su clase o se pide sacarlo. ADR: 0064. Talla S. Depende de: COM-S1.
- Historia COM-S9. Pasar `/no-comments` sobre el diff antes de cerrar un PR que agrega comentarios. AC: Given un PR suma comentarios When corro `/no-comments` sobre el diff Then no quedan hallazgos sin tratar. ADR: 0064. Talla S. Depende de: COM-S8.

## Dependencias externas

COM-S1 no espera a nadie. COM-S5 y COM-S6 esperan al plan de COM-S4. La regla de lint espera a que existan los issues de COM-S6, para no bloquear el build con los TODO actuales.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Comentario de regla fiscal | `// RG 5616 ARCA: ...` | Se conserva |
| Fallo | Comentario falso | `// la tabla X no existe` con X en `src/db` | Se borra en el mismo cambio |
| Fallo | Parche sin issue | `// TODO por ahora en memoria` | Lint falla hasta enlazar issue o refactorizar |
| Regresión | Poda sin cambios de comportamiento | Commit del grupo borrar | `npm test` y `tsc --noEmit` igual que antes |

Arch-tests: AT1 lint de marcadores temporales con enlace a issue obligatorio. AT2 checklist de PR con clase por comentario nuevo.
