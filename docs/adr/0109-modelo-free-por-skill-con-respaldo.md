---
id: ADR-0109
tipo: adr
estado: propuesto
modulos: []
depende_de: [PRD-PS-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  OpenCode elige el modelo free por skill y por agente desde seis perfiles ordenados,
  con privacidad de Zen como primer criterio, respaldo automático, aviso por stderr y log,
  y un runner que reintenta Error: Upstream sin marcar el modelo caído y trata el resto de los fallos como caída.
---
# ADR-0109 - Modelo free por skill con respaldo

Estado: propuesto. Fecha: 2026-10-20. Fuentes: `.opencode/modelos-por-skill.json`, `.opencode/modelos.mjs`, `.opencode/pstack-run.sh`, `opencode.json`, `tests/opencode-modelos.test.ts`, `docs/diseno/PRD-OPENCODE-01-modelos-por-skill.md` (sección "Benchmark", copia verbatim del n=1 del 2026-10-20), `scripts/opencode/bench-modelos.mjs` y `opencode.ai/docs/zen` (clasificación de privacidad al 2026-10-20). Extiende el cableado de PRD-PS-01.

## Decisión

1. La fuente de verdad es `.opencode/modelos-por-skill.json`. Define seis perfiles (`codigo`, `razon`, `juez`, `prosa`, `rapido`, `largo`), cada uno como lista ordenada de modelos free. `agentes` mapea `poteto-agent` a razon, `pstack-worker` a codigo, `pstack-judge` a juez y `comment-sicko` a rapido. `skills` mapea cada skill a un perfil. `perfilPorDefecto` es razon, así una skill nueva nunca queda sin modelo.

2. Regla de privacidad, en este orden. El primero de cada perfil es un modelo sin retención. `beam-free` retiene 30 días y no entrena, así que nunca es primario y solo entra como respaldo. Los modelos que pueden entrenar con los datos van solo como último respaldo, después de los sin retención y de beam. La clasificación vive en la clave `privacidad` del JSON.
   - Sin retención: `glm-5.3-flash-free`, `deepseek-v4.1-flash-free`, `minimax-m3.1-flash-free`, `longcat-2.5-preview-free`.
   - Retiene 30 días sin entrenar: `beam-free`.
   - Puede entrenar o retener: `big-pickle`, `mimo-v2.6-flash-free`, `mimo-v2.5-free`, `ll-alpha-free`, `exo-free` y los tres `nemotron-*` (`nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `nemotron-3.5-super-vl-free`).

3. Disponibilidad al 2026-10-20. `exo-free`, `ll-alpha-free` y `mimo-v2.5-free` no están disponibles hoy. No figuran en `opencode models opencode` de OpenCode 1.19.3 y `opencode run -m` devuelve `UnknownError`. No aparecen en ningún perfil. `mimo-v2.5` queda en la lista de `puedeEntrenar` porque la clasificación de Zen lo nombra, pero no se usa. `space-bunny-free` y `muse-spark-1.3-contributor-free` ya no existen en Zen.

4. Respaldo. `.opencode/modelos.mjs` resuelve el perfil, descarta los modelos que no existen y los marcados caídos, y elige el primero que queda. La lista de modelos se obtiene con `opencode models opencode` y se cachea 10 minutos (`PSTACK_MODELOS_TTL_MIN`). Un fallo del modelo lo marca caído por ese TTL en `~/.cache/pstack-modelos/estado.json` (`PSTACK_MODELOS_CACHE`). `revivir <modelo>` borra esa marca para volver a probarlo sin esperar el vencimiento. Si no queda ninguno, sale con exit 3 y no inventa una elección.

5. Aviso. Cuando el elegido no es el asignado, el resolver escribe `⚠ pstack-modelos: ...` en stderr y agrega una línea al log `.opencode/modelos-caidos.log` (`PSTACK_MODELOS_LOG`) con nombre, perfil, descartados y modelo usado. `overrides` avisa solo los agentes que cambiaron.

6. Runner. `.opencode/pstack-run.sh` exporta los overrides en `OPENCODE_CONFIG_CONTENT`, arranca o reinicia `opencode serve`, y arma la cadena de intentos desde el perfil de la skill (`--skill` o el `/skill` de la primera línea). Un intento con rc=0 que termina con `Error: Upstream` o `Error: {` cuenta como fallo; el error vale solo si es la última línea no vacía o si lo único que sigue es el JSON de ese mismo error. Si aparece en el medio, por ejemplo en el texto de un log que leyó una herramienta, y después hay respuesta normal, el intento es exitoso. Un `Error:` de herramienta no cuenta.
   - `Error: Upstream` no marca el modelo caído: se reintenta el mismo modelo `PSTACK_UPSTREAM_REINTENTOS` veces (default 2) con espera `PSTACK_UPSTREAM_ESPERA` segundos (default 5, duplicando: 5 s y 10 s). Agotados los reintentos, pasa al siguiente modelo solo para esa corrida, sin llamar a `modelos.mjs caido`, y avisa por stderr cada reintento y el paso.
   - El resto de las indisponibilidades (modelo ausente, acceso deshabilitado, fondos insuficientes, cuota o rate limit, `Error: {"...UnknownError...}` y timeout) marca caído como antes.
   - Si el árbol cambió respecto del inicio, corta con exit 4 antes de reintentar o de pasar al siguiente, para no mezclar dos sesiones a medio editar.

7. `opencode.json` conserva el modelo fijo de cada agente como espejo del primer modelo de su perfil. `tests/opencode-modelos.test.ts` exige esa igualdad, la cobertura de perfiles, la regla de privacidad y el comportamiento del runner.

8. El orden de cada perfil se apoya en el benchmark n=1 del 2026-10-20 y en su revisión manual. Es una hipótesis de orden, no una medición repetida. La privacidad pesa antes que el puntaje.

## Por qué

Un modelo fijo en `opencode.json` se rompe cuando Zen retira el slug, como ya pasó con `space-bunny-free` y `muse-spark`. Además no hay registro de qué modelo falló ni de cuál se usó en su lugar.

La privacidad es el criterio que faltaba. El repo se manda al proveedor en cada prompt, y varios modelos free pueden entrenar con esos datos. Poner primero un modelo rápido que entrena ahorra segundos y cuesta privacidad. Por eso `beam-free`, el más rápido y regular del benchmark, no es primario en ningún perfil, y `mimo-v2.6` solo aparece al final de codigo, juez y rapido.

Una sola elección para todo el stack también rinde de menos. El benchmark muestra que deepseek y glm son los mejores en voseo, que glm y longcat responden rápido en juicio, que minimax y beam tienen 1M de contexto, y que big-pickle y los nemotron tienen fallas concretas. El juez usa glm para quedar en otra familia que el ejecutor deepseek y no autoaprobar sus cambios.

La solución no agrega dependencias. `modelos.mjs` usa solo módulos `node:` y el runner usa bash, `curl`, `timeout`, `pgrep` y `seq`, todo disponible en Ubuntu/WSL con Node 22.

## Qué cambia

- `.opencode/modelos-por-skill.json` es nuevo y contiene perfiles, agentes, skills y la clasificación de privacidad.
- `.opencode/modelos.mjs` es nuevo y resuelve perfiles, cachea disponibilidad, marca caídos, borra la marca con `revivir`, avisa y emite overrides.
- `.opencode/pstack-run.sh` resuelve la cadena por skill, exporta `OPENCODE_CONFIG_CONTENT`, reinicia el server si cambian los modelos o si esta shell tiene `GH_TOKEN` y el server no, reintenta `Error: Upstream` con el mismo modelo antes de pasar al siguiente sin marcarlo caído, y corta con exit 4 si el árbol cambió.
- `opencode.json` fija en cada agente el primer modelo de su perfil y declara los límites de contexto usados por el orden de `largo`.
- `tests/opencode-modelos.test.ts` cubre configuración, privacidad, resolución, cache, aviso, runner, Upstream y modelos retirados.
- `docs/guias/desarrollo-windows-opencode.md` documenta los comandos y el aviso para Ubuntu/WSL.
- `docs/diseno/PRD-OPENCODE-01-modelos-por-skill.md` describe el alcance, el benchmark, el mapeo y las historias.
- No hay tablas nuevas, migraciones ni cambios de dependencias.

## Pendientes

- Aprobación de Mauri. El ADR queda en propuesto hasta entonces.
- Correr `npm run verify` verde y `npm run docs:check` sobre esta rama.
- No hay rutina de benchmark periódica (decisión de Mauri). El benchmark se corre a demanda con `node scripts/opencode/bench-modelos.mjs <modelos...>` cuando se quiere revisar el orden, con tareas largas y con herramientas.
- Revisar la clasificación de privacidad cuando cambie `opencode.ai/docs/zen`. El test detecta un perfil que arranca con un modelo que entrena o retiene, pero no detecta que Zen cambió la retención de un modelo que el JSON sigue clasificando igual.
- Resolver la TUI interactiva, que no recibe los overrides y usa los modelos fijos de `opencode.json`.
- Evitar que el reinicio de `opencode serve` corte sesiones en curso, o drenarlas antes.
- Agregar test para el exit 4 cuando el árbol cambió.
- Revisar el TTL de 10 minutos y el uso manual de `PSTACK_MODELOS_DISPONIBLES`.
- Registrar las preguntas abiertas y su avance en PRD-OPENCODE-01.
