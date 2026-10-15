# Plantilla de ADR

Regla de evidencia (ARQ-S8, arch-test `tests/arch/sin-preexistente.test.ts`):
la sección `## Evidencia de aceptación` no admite la palabra "preexistente"
sin un issue enlazado. Todo fallo se arregla o trae su issue
(`https://github.com/<org>/<repo>/issues/N` o `#N`). La evidencia se pega
textual desde `npm run evidencia`: los conteos nunca se parafrasean.

# ADR-XXXX - Título

Estado: propuesto. Fecha: AAAA-MM-DD. Fuentes: ...

## Decisión

...

## Qué cambia

...

## Alternativa descartada

...

## Consecuencias

...

## Evidencia de aceptación (AAAA-MM-DD)

- `npm run evidencia` pegado textual (tsc, vitest, build, sha).
- Fallos: ninguno, o cada uno con su issue enlazado.
