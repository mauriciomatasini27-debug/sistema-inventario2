---
description: Cierre del ítem $ARGUMENTS: gates en verde -> commit, push y PR a GitHub
---

Cierre y publicación del ítem $ARGUMENTS. Secuencia obligatoria, en orden: si un paso falla o no podés correrlo, frená ahí y reportá qué falló — **no** hagas commit, push ni PR.

1. **Gates (deben estar todos en verde):**
   - `npm run typecheck`
   - `npm run check:arch`
   - `npm run verify` — debe terminar `verify ok (N pasos)`. Si sale con exit 2 ("falta Postgres"), frená: no hay gate verde y no se pushea. `npm run verify -- --docs-only` **no** sirve como gate de este flujo.
   - `npm run roadmap -- --validate`
2. **Commit (solo si hay cambios del ítem):** commiteá únicamente los archivos del ítem, con mensaje `"<id>-<ítem>: <qué hace>"`. Nunca incluyas generados (`docs/ESTADO.md`, `docs/ROADMAP.md`, `docs/INDEX.md`, `docs/graph.json`, `docs/roadmap/migraciones-aplicadas.md`) ni `drizzle/*.sql` sin aprobación de Mauri. Si hay archivos ajenos al ítem en el working dir, dejalos sin commitear y avisá.
3. **Push:** `git push -u origin <rama actual>` (rama propia, nunca `main`; el push a `main` está denegado por permisos).
4. **PR:** `gh pr create --base main --head <rama> --title "<id>-<ítem>: <título>" --body-file <body>`. El body explica comportamiento, diseño, tests y cómo verificarlo con comandos concretos (comportamiento de `/pr`: el visual más chico que muestra el cambio, evidencia antes/después, y la puerta one-way o two-way).
5. **Reportá la URL del PR.** No hagas merge ni `gh pr merge` (está denegado): el merge lo hace Mauri.

Nota: si la sesión corre dentro de la Cadena del box (lock de `/workspace/.cadena.lock`), no hagas push — afuera de la cadena este flujo sí aplica.
