---
id: ADR-0112
tipo: adr
estado: propuesto
modulos: [dev]
depende_de: [ADR-0076]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El registro de migraciones aplicadas pasa a un archivo por migración en `docs/roadmap/migraciones/<tag>.json`.
  `docs/roadmap/migraciones-aplicadas.md` queda como derivado que regenera `main` y el gate de merge lee la carpeta.
  Así dos PRs con migraciones no chocan y la rama no puede autorizarse su propia migración.
---
# ADR-0112 - Registro de migraciones por ítem y docs derivados solo en main

Estado: propuesto. Fecha: 2026-10-22. Fuentes: `docs/roadmap/migraciones/README.md`, `scripts/docs-migraciones.mjs`, `scripts/cadena/puede-mergear.mjs`, `scripts/docs-generados-lib.mjs`, `docs/roadmap/avances/README.md`, ADR-0076.

## Decisión

Cada migración aplicada en la base real tiene su propio archivo `docs/roadmap/migraciones/<tag>.json`, con `tag`, `fecha`, `aprobado_por`, `evidencia` y `backup`. El tag es el nombre del `.sql` sin extensión.

`docs/roadmap/migraciones-aplicadas.md` es derivado. Lo regenera `main` con `npm run docs:migraciones` y entra en la lista de generados que una rama no commitea.

`node scripts/cadena/puede-mergear.mjs <PR>` lee la carpeta `docs/roadmap/migraciones/` de la rama base y exige el archivo del tag que el PR agrega. Sigue leyendo el `.md` como respaldo durante la transición. Un PR no puede autorizarse su propia migración.

`npm run docs:check` valida los registros y `npm run verify` corre `docs:migraciones` antes de `docs:estado`, porque `ESTADO.md` consume la lista.

## Por qué

El registro era un archivo único que cada PR con migración editaba al final. Dos PRs con migraciones chocaban siempre y la resolución manual podía perder evidencia.

El patrón del repo ya separa fuente por ítem (avances uno por archivo) de derivado en `main` (ROADMAP, ESTADO, INDEX, graph). Extenderlo al registro elimina el punto de escritura compartido en lugar de serializarlo.

## Qué cambia

- Nuevo `scripts/docs-migraciones.mjs` y su lib, más `docs/roadmap/migraciones/README.md`.
- `docs/roadmap/migraciones-aplicadas.md` entra en `ARCHIVOS_GENERADOS` y en los pasos de docs de `verify`.
- El gate de merge cambia la fuente de verdad a la carpeta y el mensaje de bloqueo nombra el archivo faltante.
- Los 39 tags existentes se migraron a JSON con su evidencia. Los 0037 y 0038 quedan registrados con la aprobación de Mauri del 2026-10-22.

## Alternativas

- `merge=union` en `.gitattributes` para el `.md`. Es barato y resuelve appends simples, pero puede duplicar líneas, no es estructural y no cubre barridos de otros docs.
- Serializar merges con la Cadena. Ya existe en el box, pero no evita conflictos de texto fuera de él y no corrige la fuente compartida.
- Dejar el registro en JSON único y resolver con un lock. Agrega coordinación donde no hace falta: los registros son hechos independientes.

## Consecuencias

Un PR con migración suma un archivo nuevo y no toca ningún archivo compartido. `main` regenera el `.md` en el primer `verify`. El costo es un generador chico y 39 archivos de datos.
