---
id: ADR-0129
tipo: adr
estado: propuesto
modulos: [caja, inventario, fiado, fiscal, persistencia]
depende_de: [ADR-0127]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Cada campo de pantalla que no llega a una columna se corrige por regla: persistir (columna nueva), aceptar en memoria (estado de sesión) o quitar del payload (código muerto). Persistir es el default.
---
# ADR-0129 - Campo huérfano: persistir, aceptar en memoria o quitar

Estado: propuesto. Fecha: 2026-11-23. Fuentes: ADR-0127, PRD-AUD-03.

## Decisión

Cada hallazgo "huérfano" de la trazabilidad de ADR-0127 (un campo que la pantalla manda
y no llega a ninguna columna, o una configuración que solo vive en memoria) se corrige
aplicando una de tres reglas, en este orden de preferencia:

1. **Persistir** — columna nueva en una migración aprobada por Mauri — cuando el campo es
   dato de negocio que el dueño necesita después de un reinicio, en otra sesión/dispositivo,
   o para auditoría/reportes.
2. **Aceptar en memoria** — sin columna — cuando el campo es estado transitorio de una única
   instancia de proceso (wizard, modo de sesión) que no tiene valor fuera de esa corrida.
3. **Quitar del payload** — ni columna ni campo — cuando el campo es código muerto: nada lo
   consume y no es dato de negocio.

La regla por defecto es **persistir**: solo se acepta en memoria o se quita con una
justificación escrita en el issue (por qué el dato no sobrevive al reinicio ni se comparte).

## Por qué

La auditoría de ADR-0127 dejó campos huérfanos sin un criterio único para resolverlos.
Sin regla, cada hallazgo se discute de nuevo (persistir vs memoria vs borrar) y se corre el
riesgo de agregar columnas que nadie usa o de perder dato de negocio que el dueño sí
necesita. Una política única hace la corrección determinista y re-corrible.

## Qué cambia

- Agrega una regla de triage para los hallazgos huérfanos de `trazabilidad-*.md`.
- Los hallazgos "persistir" van con migración (aprobada y registrada, ADR-0112).
- Los hallazgos "memoria" y "quitar" se documentan en el issue con la justificación.
- No cambia `audit:db` ni `check:columnas`: siguen siendo los instrumentos que verifican
  que la columna nueva queda declarada y referenciada.

## Pendientes

- Aplicar la regla a los 5 huérfanos de la primera pasada en PRD-AUD-04.
- Re-correr `check:columnas` y el checklist de navegación después de cada corrección.
