---
id: PRD-OPENCODE-01
tipo: prd
estado: hecho
modulos: []
depende_de: [ADR-0109, PRD-PS-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Modelo free por skill y agente para OpenCode, con siete perfiles (incluye `diseno` para UI),
  respaldo en orden, privacidad de Zen como primer criterio, aviso por stderr y log, y un runner
  que resuelve la cadena, reintenta Error: Upstream con el mismo modelo sin marcarlo caído y reinicia opencode serve.
---
# PRD-OPENCODE-01 - Modelo free por skill con respaldo

Fuente: `.opencode/modelos-por-skill.json`, `.opencode/modelos.mjs`, `.opencode/pstack-run.sh`, `opencode.json`, `tests/opencode-modelos.test.ts`, la sección "Benchmark" de este PRD, `scripts/opencode/bench-modelos.mjs` y la sección "Modelo por skill" de `docs/guias/desarrollo-windows-opencode.md`. Restringido por ADR-0109 y PRD-PS-01.

Data shape: `ModelosPorSkill = { ttlMinutos, perfilPorDefecto, privacidad, perfiles, agentes, skills }`. `privacidad` tiene `sinRetencion`, `retiene30dSinEntrenar` y `puedeEntrenar`. `perfiles` mapea nombre de perfil a una lista ordenada de modelos. `agentes` mapea agentes de OpenCode a perfil. `skills` mapea skills a perfil. La config es la única fuente de verdad. `opencode.json` conserva el modelo fijo de cada agente y el test exige que coincida con el primero del perfil.

## Problema

OpenCode Zen retira modelos free sin aviso. `space-bunny-free` y `muse-spark-1.3-contributor-free` ya no existen. Con un modelo fijo en `opencode.json`, una sesión que arranca con un slug retirado falla y no hay alternativa. Tampoco hay registro de qué modelo se usó cuando algo falló.

Zen es el proveedor y el código del repo viaja en cada prompt. La clasificación de privacidad de Zen (`opencode.ai/docs/zen`, 2026-10-20) separa modelos sin retención, modelos que retienen 30 días sin entrenar y modelos que pueden entrenar con los datos. Un modelo rápido no sirve como primario si puede entrenar con el código, aunque gane el benchmark.

Además, una sola elección para todo el stack cobra de más o rinde de menos. Una skill de prosa rioplatense, un juez adversarial, un worker de código y una skill de lectura de transcripts largos no se benefician del mismo modelo. El benchmark de 2026-10-20 muestra diferencias de velocidad y de calidad por tarea, aunque el puntaje automático saturado obliga a leer la revisión manual.

## Alcance

Incluye:

- La auditoría de las skills que usa o invoca `poteto-mode`, los playbooks de código y las skills del repo.
- El benchmark que sostiene el mapeo, con su límite n=1 explícito.
- El mapeo skill a perfil y a modelo, con el porqué de cada perfil y la regla de privacidad.
- El diseño de respaldo, aviso, cache, log y detección de fallos del runner.
- El uso en Ubuntu/WSL con Node 22 y sin dependencias nuevas.

No incluye:

- Elegir modelos pagos.
- Medir sesiones largas con herramientas.
- Cambiar el comportamiento interno de las skills de pstack.
- Reescribir `opencode.json` en cada corrida.
- Rotar la key de Zen ni administrar la cuenta.

## Auditoría de skills y playbooks

La tabla sale de `.opencode/modelos-por-skill.json` y de `.opencode/pstack-models.md`, revisada contra el código al 2026-10-20. La columna "Primario" es el primer modelo del perfil, no una promesa de que siempre se use.

| Skill o playbook | Cómo entra en poteto-mode | Perfil | Primario |
|---|---|---|---|
| poteto-mode | Skill raíz | razon | opencode/deepseek-v4.1-flash-free |
| architect | Diseño antes de codificar, cruza límites de función | razon | opencode/deepseek-v4.1-flash-free |
| arena | Bakeoff de diseño o código con base y grafting | razon | opencode/deepseek-v4.1-flash-free |
| how | Explica subsistemas y capas | razon | opencode/deepseek-v4.1-flash-free |
| why | Rastrea decisiones y evidencia | razon | opencode/deepseek-v4.1-flash-free |
| blast-radius | Qué puede romper un cambio fuera del diff | razon | opencode/deepseek-v4.1-flash-free |
| figure-it-out | Playbook a medida para trabajo grande o multi-parte | razon | opencode/deepseek-v4.1-flash-free |
| reflect | Revisión de transcript y learnings | razon | opencode/deepseek-v4.1-flash-free |
| interrogate | Revisión adversarial multi-modelo | juez | opencode/glm-5.3-flash-free |
| interface-review | Revisión de interfaz de una rama o PR | juez | opencode/glm-5.3-flash-free |
| swarm | Abanico de workers para cobertura o carreras | codigo | opencode/deepseek-v4.1-flash-free |
| prototype | Sketch descartable para decidir | diseno | opencode-go/claude-haiku-5-5 |
| variant | Variantes radicales de una misma ruta | diseno | opencode-go/claude-haiku-5-5 |
| better-ui | Criterio visual sobre una pantalla o componente | diseno | opencode-go/claude-haiku-5-5 |
| better-layout | Jerarquía, espaciado y grilla mobile-first | diseno | opencode-go/claude-haiku-5-5 |
| better-typography | Escala y ritmo tipográfico | diseno | opencode-go/claude-haiku-5-5 |
| better-colors | Paleta, contraste y estados de color | diseno | opencode-go/claude-haiku-5-5 |
| emil-design-eng | Craft de interacción y detalle de UI | diseno | opencode-go/claude-haiku-5-5 |
| build-design | Bajar un diseño a componentes respetando medidas | diseno | opencode-go/claude-haiku-5-5 |
| tdd | Test que falla primero, cuando se pide | codigo | opencode/deepseek-v4.1-flash-free |
| correct | Convierte una corrección repetida en guarda | codigo | opencode/deepseek-v4.1-flash-free |
| verify-inventario | Verificación E2E de la PWA | codigo | opencode/deepseek-v4.1-flash-free |
| verify-plan-cambio | Verificación formal y de comportamiento del plan | codigo | opencode/deepseek-v4.1-flash-free |
| verify-venta-sync | Verificación de la cola offline de venta | codigo | opencode/deepseek-v4.1-flash-free |
| technical-writing | Docs, RFC, README, PR y commits | prosa | opencode/deepseek-v4.1-flash-free |
| unslop | Cualquier superficie de prosa | prosa | opencode/deepseek-v4.1-flash-free |
| writing-guidelines | Revisión de prosa contra la guía | prosa | opencode/deepseek-v4.1-flash-free |
| better-writing | Copy de interfaz | prosa | opencode/deepseek-v4.1-flash-free |
| show-me-your-work | Bitácora de decisiones de una corrida larga | prosa | opencode/deepseek-v4.1-flash-free |
| no-comments | Revisión de comentarios antes de review | rapido | opencode/deepseek-v4.1-flash-free |
| setup-pstack | Configuración de modelos por rol | rapido | opencode/deepseek-v4.1-flash-free |
| recall | Reconstruir contexto desde transcripts | largo | opencode/minimax-m3.1-flash-free |
| automate-me | Destilar preferencias en una skill -mode | largo | opencode/minimax-m3.1-flash-free |
| Playbooks feature, refactoring, bug-fix, perf-issue, hillclimb | Delegación de código dentro de poteto-mode | codigo | opencode/deepseek-v4.1-flash-free |
| Playbooks de prosa y juicio, síntesis y veredictos | Delegación de juicio dentro de poteto-mode | juez | opencode/glm-5.3-flash-free |

Dos capas de modelo conviven. La skill que orquesta corre con su perfil de la tabla. Los subagentes que esa skill lanza usan el perfil del agente nombrado en `.opencode/pstack-models.md`. `poteto-agent` usa razon, `pstack-worker` usa codigo, `pstack-judge` usa juez y `comment-sicko` usa rapido. Por eso `reflect`, `how`, `why`, `arena`, `architect` e `interrogate` pueden mezclar familias dentro de una misma corrida. El juez glm queda de otra familia que el ejecutor deepseek, y eso es deliberado.

## Benchmark

Fuente: esta sección, con la copia verbatim del benchmark del 2026-10-20, y `scripts/opencode/bench-modelos.mjs`, el script versionado que lo reproduce. Es n=1 por celda, con tareas cortas. No mide sesiones largas con herramientas. El puntaje automático saturó en casi todas las celdas, así que la revisión manual es la que separa. El bloque se copia verbatim, incluida la sección de privacidad.

```text
# Benchmark modelos free OpenCode Zen — 2026-10-20 (corrida desde el box, OpenCode 1.19.3)

Disponibilidad: los 10 modelos free listados por `opencode models opencode` respondieron "OK" a un prompt trivial: beam-free, big-pickle, deepseek-v4.1-flash-free, glm-5.3-flash-free, longcat-2.5-preview-free, mimo-v2.6-flash-free, minimax-m3.1-flash-free, nemotron-3-ultra-free, nemotron-3.5-lightning-free, nemotron-3.5-super-vl-free. space-bunny-free ya no aparece.

Tareas (una corrida por modelo, `opencode run --attach`, timeout 150 s, puntaje automático 0..1 · segundos):
- bug: off-by-one `<=` en loop TS. bug2: `esHoy` compara contra fecha UTC (hoyAR es correcto en server UTC).
- codigo: `parsePrecioAR` evaluada contra 6 casos (puntaje = casos que pasan).
- prosa: párrafo rioplatense 60-90 palabras (voseo + largo).
- razon: DAG A→B,C con 2 workers (7 min). razon2: sync offline last-write-wins (FINAL 6, CORRECTO 3).
- juez: reduce sin valor inicial con carrito vacío → RECHAZAR. juez2: delete sin filtro tenantId → RECHAZAR.

| modelo | bug | bug2 | codigo | prosa | razon | razon2 | juez | juez2 |
|---|---|---|---|---|---|---|---|---|
| beam-free | 1.00 · 2s | 1.00 · 5s | 1.00 · 9s | 1.00 · 7s | 1.00 · 2s | 1.00 · 2s | 1.00 · 5s | 1.00 · 2s |
| big-pickle | 1.00 · 5s | 1.00 · 8s | 0.83 · 43s | 1.00 · 8s | 1.00 · 7s | 1.00 · 5s | 1.00 · 5s | 1.00 · 27s |
| deepseek-v4.1-flash-free | 1.00 · 3s | 1.00 · 5s | 1.00 · 13s | 1.00 · 5s | 1.00 · 3s | 1.00 · 12s | 1.00 · 3s | 1.00 · 3s |
| glm-5.3-flash-free | 1.00 · 3s | 1.00 · 10s | 1.00 · 9s | 1.00 · 10s | 1.00 · 4s | 1.00 · 8s | 1.00 · 5s | 1.00 · 7s |
| longcat-2.5-preview-free | 1.00 · 8s | 1.00 · 22s | 1.00 · 22s | 1.00 · 25s | 1.00 · 7s | 1.00 · 11s | 1.00 · 10s | 1.00 · 7s |
| mimo-v2.6-flash-free | 1.00 · 5s | 1.00 · 19s | 1.00 · 7s | 1.00 · 8s | 1.00 · 4s | 1.00 · 8s | 1.00 · 4s | 1.00 · 5s |
| minimax-m3.1-flash-free | 1.00 · 4s | 1.00 · 19s | 1.00 · 41s | 1.00 · 10s | 1.00 · 5s | 1.00 · 10s | 1.00 · 5s | 1.00 · 7s |
| nemotron-3-ultra-free | 1.00 · 6s | 1.00 · 10s | 1.00 · 3s | 1.00 · 5s | 1.00 · 9s | 1.00 · 6s | 1.00 · 7s | 1.00 · 6s |
| nemotron-3.5-lightning-free | 1.00 · 3s | 1.00 · 150s | 1.00 · 26s | 1.00 · 7s | 1.00 · 6s | 1.00 · 30s | 0.00 · 4s | 1.00 · 4s |
| nemotron-3.5-super-vl-free | 1.00 · 4s | 1.00 · 48s | 1.00 · 11s | 1.00 · 58s | 1.00 · 4s | 1.00 · 5s | 1.00 · 4s | 1.00 · 3s |

Revisión manual (el puntaje automático saturó; diferencian estas lecturas):
- bug2: deepseek, glm, mimo, longcat, beam identificaron `esHoy`; deepseek y glm además explicaron la ventana horaria exacta. big-pickle acertó pero mezcló una afirmación falsa (dice que `setHours(-3)` se anula). nemotron-3-ultra diagnosticó mal (culpó a `hoyAR`, que es correcto). minimax respondió con código en vez de la línea pedida. nemotron-3.5-lightning ignoró "no uses herramientas", ejecutó comandos y cortó por timeout (150 s).
- prosa: deepseek y glm, el voseo más natural y preciso; glm con un error ("no perdas"). nemotron-3.5-lightning mezcló "seguí" imperativo incorrecto; nemotron-3.5-super-vl tardó 58 s.
- codigo: todos pasan 6/6 salvo big-pickle (5/6, 43 s). minimax 41 s. Más rápidos: nemotron-3-ultra 3 s, mimo 7 s, glm 9 s, beam 9 s.
- juez: nemotron-3.5-lightning falló el caso del reduce (APROBAR). minimax el más exhaustivo pero verboso.
- velocidad: beam-free la más rápida y regular (2–9 s); contexto 1M (beam, minimax, nemotron-ultra/super-vl).
- Descartados como primarios: nemotron-3.5-lightning (ignora instrucciones, timeouts), nemotron-3.5-super-vl (lento en prosa, bug2 48 s), nemotron-3-ultra (diagnóstico erróneo en bug2), big-pickle (inestable/lento, último respaldo).

Límites: n=1 por celda, tareas cortas; no mide sesiones largas con herramientas. Re-correr con `node scripts/opencode/bench-modelos.mjs <modelos...>`.

## Privacidad (opencode.ai/docs/zen, 2026-10-20)
- Sin retención: glm-5.3-flash-free, deepseek-v4.1-flash-free, minimax-m3.1-flash-free, longcat-2.5-preview-free.
- beam-free: retiene 30 días, no entrena.
- Pueden entrenar/retener: big-pickle, mimo-v2.6-flash-free, mimo-v2.5-free, ll-alpha-free, exo-free, nemotron-* (trial NVIDIA: sin datos confidenciales).
- exo-free, ll-alpha-free, mimo-v2.5-free: no figuran en `opencode models opencode` (1.19.3) y `opencode run -m` da "UnknownError": no disponibles desde este cliente.
- Regla: el primero de cada perfil es sin retención; los que entrenan solo al final (test en tests/opencode-modelos.test.ts). Por eso comment-sicko pasó de beam-free a deepseek y mimo bajó al final.
```

Lo que sostiene el mapeo, y lo que no. El benchmark ordena por velocidad y calidad observada una vez. La privacidad ordena antes que el puntaje. Sin la regla de privacidad, `beam-free` sería el primario de `rapido` y `largo` porque es el más rápido y regular. Como retiene 30 días, baja a respaldo y el primario queda en un modelo sin retención. `mimo-v2.6` corre rápido, pero puede entrenar, así que solo aparece al final de tres perfiles. Los tres nemotron quedan fuera de todos los perfiles por la revisión manual. `mimo-v2.5`, `ll-alpha-free` y `exo-free` no están disponibles desde este cliente.

## Mapeo skill a perfil a modelo

Cada perfil es una lista en orden de preferencia. `.opencode/modelos.mjs` toma el primero disponible y salta los marcados caídos. Todos los slugs llevan el prefijo `opencode/` en el JSON. La tabla usa el nombre corto.

| Perfil | Orden | Por qué |
|---|---|---|
| codigo | deepseek-v4.1, glm-5.3, longcat-2.5, minimax-m3.1, mimo-v2.6, big-pickle | Necesita 6/6 en `parsePrecioAR` y velocidad en ciclos de edición. deepseek abre con 13 s y trato correcto en bug2. glm entra segundo por 9 s y 1.00. longcat tercero por 22 s. minimax cuarto por 41 s. mimo corre en 7 s pero puede entrenar, así que va después de todos los sin retención. big-pickle cierra por 5/6, 43 s e inestable. |
| razon | deepseek-v4.1, glm-5.3, longcat-2.5, minimax-m3.1, big-pickle | Diseño, grounding y DAG. deepseek resuelve razon en 3 s y razon2 en 12 s, y explica la ventana horaria. glm segundo por 8 s y misma precisión. longcat tercero por 11 s. minimax cuarto por 10 s y verbosidad. big-pickle último por inestable. mimo queda afuera porque puede entrenar y tarda 19 s en bug2. |
| juez | glm-5.3, longcat-2.5, minimax-m3.1, deepseek-v4.1, mimo-v2.6, big-pickle | El juez tiene que ser de otra familia que el ejecutor deepseek para no autoaprobar. glm encabeza por 5 s y 7 s en los dos casos. longcat segundo por 10 s y 7 s. minimax entra por exhaustividad, no por velocidad. deepseek baja al cuarto puesto por compartir familia con el ejecutor. mimo y big-pickle cierran por privacidad e inestabilidad. |
| prosa | deepseek-v4.1, glm-5.3, longcat-2.5, minimax-m3.1 | Voseo y largo controlado. deepseek y glm son los mejores en la revisión manual. glm paga el "no perdas", así que va segundo. longcat queda tercero por 25 s y minimax cuarto por 10 s. mimo queda afuera porque puede entrenar. |
| diseno | haiku-5-5, gemini-4-argon, gpt-6-luna, kimi-k3.1-pro, deepseek-v4.1-flash-free | Prototipos de UI mobile-first. Pesa más leer una captura a 360px y decidir jerarquía y gusto visual que resolver lógica, así que no arranca por el primario de código. haiku abre por criterio de diseño y bajo costo de iteración (3.850 req/5h); gemini-argon y gpt-6-luna entran por contexto largo y entrada de imagen para varias variantes en un archivo; kimi-k3.1-pro es el último Go; el deepseek free cierra para que la cadena siga viva sin key de Go. Todos los eslabones son sin retención porque el prototipo lleva copy y precios del producto. |
| rapido | deepseek-v4.1, glm-5.3, beam-free, mimo-v2.6 | Tareas cortas de revisión y routing. deepseek abre por 3 s y sin retención. glm segundo por 5 s. beam es el más rápido y regular (2 a 9 s), pero retiene 30 días, así que solo es respaldo. mimo cierra porque puede entrenar. |
| largo | minimax-m3.1, beam-free, deepseek-v4.1 | Lectura de transcripts y destilado. minimax y beam tienen 1M de contexto según `opencode.json`. minimax abre por ser sin retención. beam segundo por retención de 30 días. deepseek tercero por 250k de contexto, aunque sea el más rápido. |

`perfilPorDefecto` es `codigo`. Una skill nueva sin línea en el JSON hereda codigo y no queda sin modelo. `poteto-mode` corre en razon porque sus decisiones son de arquitectura y orquestación, no de tipeo.

`diseno` existe separado de `codigo` porque el prototipo de UI se juzga mirando el render, no leyendo el diff: el modelo tiene que ver la captura a 360px, proponer variantes y elegir. El primario de codigo optimiza otra cosa (6/6 en `parsePrecioAR` y velocidad de edición) y no es el mejor juez de espaciado, jerarquía o copy. El perfil lo pide la rama UI del skill `prototype` y las skills de diseño del repo (`better-ui`, `better-layout`, `better-typography`, `better-colors`, `emil-design-eng`, `build-design`, `variant`). Un test fija que esas skills no vuelvan a caer en codigo y que ningún eslabón de `diseno` pueda entrenar con los datos. Para centrar un prototipo de un flujo o modelo de estado, seguí usando el perfil `razon`.

La asignación por agente sale del mismo JSON. `poteto-agent` usa razon, `pstack-worker` usa codigo, `pstack-judge` usa juez y `comment-sicko` usa rapido. `tests/opencode-modelos.test.ts` exige que el `model` de cada agente en `opencode.json` sea el primero de su perfil, así no hay dos verdades.

## Diseño del respaldo y del aviso

**Resolución.** `perfilDe` limpia una barra inicial, busca el nombre en `perfiles`, después en `agentes`, después en `skills` y cae a `perfilPorDefecto`. `resolver` filtra los modelos que existen y los que no están caídos, y devuelve `perfil`, `asignado`, `elegido`, `disponibles` y `descartados`. Si no queda ninguno, `elegido` es `null` y la CLI sale con exit 3.

**Detección de disponibilidad.** `opencode models opencode` lista los modelos de Zen sin gastar tokens. El resultado se cachea `ttlMinutos` (10 por defecto, o `PSTACK_MODELOS_TTL_MIN`) en `~/.cache/pstack-modelos/estado.json`, movible con `XDG_CACHE_HOME` o `PSTACK_MODELOS_CACHE`. Si el comando falla, sigue sin filtrar para no bloquear por un problema del binario. `PSTACK_MODELOS_DISPONIBLES` reemplaza la lista y existe para tests. `OPENCODE_BIN` cambia el binario, con default `$HOME/.local/bin/opencode`. `PSTACK_MODELOS_CONFIG` cambia la ruta del JSON de perfiles.

**Cache de caídos.** `caido <modelo> [motivo]` guarda `{ hasta, motivo }` con vencimiento a `PSTACK_MODELOS_TTL_MIN` minutos. Mientras no vence, `resolver` lo saltea sin volver a probarlo. `revivir <modelo>` borra esa entrada para volver a probarlo sin esperar el vencimiento. La misma cache guardada por `PSTACK_MODELOS_CACHE` contiene la lista de modelos, así que un `caido` sobre una cache válida sin la clave `caidos` no rompe.

**Aviso.** Cuando el elegido no es el asignado, `avisar` escribe una línea `⚠ pstack-modelos: ...` en stderr y agrega una línea al log con timestamp, nombre, `perfil=`, `caido=` y `usa=`. El campo `caido=` lista todos los descartados, no solo los caídos por TTL. El log por defecto es `.opencode/modelos-caidos.log`, gitignored, y `PSTACK_MODELOS_LOG` lo reubica. El comando `overrides` avisa solo los agentes que cambiaron, no todos, y devuelve un JSON con la clave `agent`.

**Runner.** `.opencode/pstack-run.sh` llama a `overrides`, exporta el JSON en `OPENCODE_CONFIG_CONTENT` y arranca o reinicia `opencode serve` en `127.0.0.1:${PSTACK_PORT:-4096}`. Si el server vivo no tiene ese valor, o si esta shell tiene `GH_TOKEN` y el server no, lo reinicia. Sin `-m` ni `PSTACK_FALLBACK_MODELS`, la cadena sale de `modelos.mjs lista` para la skill. La skill se toma de `--skill`, o del `/skill` de la primera línea del prompt, o de `poteto-mode`. Cada intento corre con `timeout ${PSTACK_SESSION_TIMEOUT:-700}`.

**Detección de fallos.** Un fallo de cuota o rate limit se detecta solo en eventos `{"type":"error"}`, para no confundir el texto de la sesión con un error del modelo. Además, un intento con rc=0 que termina con una línea `Error: Upstream` o `Error: {` cuenta como fallo, aunque el proceso haya salido bien. El error vale solo si es la última línea no vacía o si lo único que sigue es el JSON de ese mismo error; si aparece en el medio y después hay respuesta normal, la sesión terminó bien. Para esa comparación, el runner quita los códigos ANSI. Un `Error:` de herramienta, como un permiso rechazado por el usuario, no cuenta como caída.

**Error: Upstream.** Un `Error: Upstream` es una caída del proveedor, no del modelo, así que no llama a `modelos.mjs caido`. El runner reintenta el mismo modelo `PSTACK_UPSTREAM_REINTENTOS` veces (default 2) con espera `PSTACK_UPSTREAM_ESPERA` segundos (default 5, duplicando: 5 s y 10 s). Cada reintento y el paso al siguiente se anuncian por stderr. Si se agotan los reintentos, pasa al siguiente modelo de la cadena solo para esa corrida, sin marcarlo caído. El resto de las indisponibilidades (modelo ausente, acceso deshabilitado, fondos insuficientes, cuota o rate limit, `Error: {"...UnknownError...}` y timeout) sí marca caído. Si el árbol cambió respecto del inicio, corta con exit 4 antes de reintentar o de pasar al siguiente, y decide el orquestador, para no mezclar dos sesiones a medio editar. `-m` y `PSTACK_FALLBACK_MODELS` pisan la cadena.

## Cómo funciona en Ubuntu/WSL de Mauri

Requisitos: Node 22, el binario de OpenCode en `~/.local/bin/opencode` o en `OPENCODE_BIN`, y bash con `curl`, `timeout`, `pgrep` y `seq`. No hay `npm install` ni dependencias nuevas. `modelos.mjs` usa solo módulos `node:`.

```bash
cd ~/sistema-inventario
node .opencode/modelos.mjs elegir poteto-mode       # modelo que va a usar
node .opencode/modelos.mjs lista technical-writing  # cadena de respaldo
node .opencode/modelos.mjs revivir <modelo>         # le borra la marca de caído
.opencode/pstack-run.sh "/poteto-mode <tarea>"      # elige por el /skill del prompt
.opencode/pstack-run.sh --skill tdd "<tarea>"       # o forzá la skill
tail -n 20 .opencode/modelos-caidos.log             # qué cayó y qué se usó
```

Detalles del entorno:

- La cache vive fuera del repo, en `~/.cache/pstack-modelos/estado.json`. `XDG_CACHE_HOME` la mueve.
- El runner exporta `TMPDIR=$PWD/.pstack-tmp`, así no escribe en `/tmp`.
- El log `.opencode/modelos-caidos.log` está gitignored.
- En WSL se corre desde `~/sistema-inventario`. Windows nativo no ejecuta el runner porque es bash.
- Fuera del box no se toma el lock de la Cadena. La config no toca `/workspace/.cadena.lock`.
- La TUI interactiva (`opencode` a secas) no recibe `OPENCODE_CONFIG_CONTENT`. Lee los modelos fijos de `opencode.json` y no ve el respaldo.
- La sección "Modelo por skill" de `docs/guias/desarrollo-windows-opencode.md` documenta los mismos comandos. Si cambia el JSON, esa guía y este PRD se actualizan juntos.

## Épica OE-E1. Mapeo, privacidad y contrato

Requisito OE-R1: la config JSON es la fuente única. Cada skill y agente apunta a un perfil existente, cada perfil solo usa modelos free vigentes, y el primero de cada perfil es sin retención.

- Historia OE-S1. Cada skill y agente apunta a un perfil existente y a modelos free. AC: Given el JSON de config When corro `tests/opencode-modelos.test.ts` Then pasa el caso "cada skill y agente apunta a un perfil existente con modelos free" y ningún slug sale del patrón `opencode/(...-free|big-pickle)`. Depende de: nada.
- Historia OE-S2. `opencode.json` y el JSON no se contradicen. AC: Given los cuatro agentes nombrados When corro el test "los agentes de opencode.json coinciden con el modelo asignado" Then el `model` de cada agente es el primero de su perfil. Depende de: OE-S1.
- Historia OE-S3. La privacidad manda en el orden. AC: Given la clasificación `privacidad` del JSON When corro el test "privacidad: el primero de cada perfil es sin retención y los que entrenan van al final" Then cada perfil empieza con un modelo de `sinRetencion` y ningún modelo de `puedeEntrenar` aparece antes que uno sin retención. Depende de: OE-S1.
- Historia OE-S4. Una skill desconocida no queda sin modelo y el prefijo `/` no rompe la búsqueda. AC: Given una skill inexistente y una entrada `/poteto-mode` When llamo a `perfilDe` Then la primera devuelve `perfilPorDefecto` y la segunda el perfil de poteto-mode, según el test "skill desconocida usa el perfil por defecto y acepta /skill". Depende de: OE-S1.
- Historia OE-S5. No vuelven los modelos retirados. AC: Given `pstack-run.sh`, `opencode.json` y el JSON de perfiles When corro el test "no queda ningún modelo retirado de Zen" Then ninguno contiene `space-bunny` ni `muse-spark`. Depende de: OE-S1.

## Épica OE-E2. Respaldo, cache y aviso

Requisito OE-R2: si el asignado no está o falló, el sistema elige el siguiente del perfil, lo informa y lo registra. Nunca elige en silencio un modelo que puede entrenar si hay uno sin retención disponible.

- Historia OE-S6. Con todo disponible gana el asignado. AC: Given la lista completa de modelos When resuelvo `pstack-judge` Then `elegido` es `asignado` y `descartados` queda vacío, según el test "con todo disponible elige el asignado". Depende de: OE-S3.
- Historia OE-S7. Si el asignado salió de Zen, cae al siguiente. AC: Given la lista sin el primer modelo del perfil juez When resuelvo `pstack-judge` Then `elegido` es el segundo y `descartados` contiene solo el primero, según el test "si el asignado salió de Zen cae al siguiente del perfil". Depende de: OE-S6.
- Historia OE-S8. Un caído se saltea hasta que vence el TTL. AC: Given un modelo marcado caído con `hasta: 2000` When resuelvo en `ahora: 1000` y en `ahora: 3000` Then elige el segundo antes del vencimiento y vuelve al primero después, según el test "un modelo marcado caído se saltea hasta que vence el TTL". Depende de: OE-S7.
- Historia OE-S9. Sin ningún modelo disponible no hay elección silenciosa. AC: Given un conjunto vacío de modelos When resuelvo `codigo` Then `elegido` es `null`, según el test "sin ningún modelo devuelve null". Depende de: OE-S6.
- Historia OE-S10. `overrides` avisa solo lo que cambió. AC: Given un modelo del perfil juez ausente When llamo a `overrides` Then incluye los cuatro agentes y todos los avisos nombran al caído, según el test "overrides avisa solo los agentes que cambiaron". Depende de: OE-S7.
- Historia OE-S11. El aviso llega a stderr y al log. AC: Given un modelo ausente en la lista When corro `node .opencode/modelos.mjs elegir juez` Then la salida es el segundo del perfil, stderr trae el aviso y el log contiene `caido=<modelo>`, según el test "CLI: con un modelo ausente avisa por stderr y deja una línea en el log". Depende de: OE-S7.
- Historia OE-S12. Un caído persiste en la cache. AC: Given que marco un modelo con `caido` y después pido `lista codigo` Then el primer lugar lo ocupa el siguiente del perfil y la cache existe en `PSTACK_MODELOS_CACHE`, según el test "CLI: caido persiste en la cache y la próxima elección lo saltea sin volver a probarlo". Depende de: OE-S8.
- Historia OE-S13. Una cache vieja sin `caidos` no rompe el marcado. AC: Given una cache válida con `lista` y sin `caidos` When marco un modelo con `caido` Then la cache queda con la clave `caidos` y el modelo marcado, según el test "CLI: caido tolera una cache válida que todavía no tiene la clave caidos". Depende de: OE-S12.
- Historia OE-S18. La marca de caído se puede borrar a mano. AC: Given un modelo marcado con `caido` When corro `node .opencode/modelos.mjs revivir <modelo>` Then la cache ya no lo tiene y `lista` vuelve a ponerlo primero, según el test "CLI: revivir borra la marca de caído y vuelve a elegir el asignado". Depende de: OE-S12.

## Épica OE-E3. Runner, server y detección de fallos

Requisito OE-R3: el runner usa el resolver, arma la cadena por skill y no confunde una salida con error de transporte con una sesión exitosa.

- Historia OE-S14. El runner usa el resolver. AC: Given el texto de `.opencode/pstack-run.sh` When corro el test "arranca el server con los modelos resueltos y marca caídos los que fallan" Then contiene `node "$RES" overrides`, exporta `OPENCODE_CONFIG_CONTENT`, usa `node "$RES" lista` y llama `node "$RES" caido "$m"`. Depende de: OE-S11.
- Historia OE-S15. Un `Error: Upstream` al final con rc=0 se reintenta con el mismo modelo y no lo marca caído. AC: Given un `opencode run` falso que primero termina con `Error: Upstream request failed: Endpoint is unavailable` y después responde `OK`, y `PSTACK_UPSTREAM_ESPERA=0` When corro el runner Then termina con exit 0, los dos intentos usan el mismo modelo, no marca ningún caído, escribe `reintento 1/2` y `done model=` en stderr y no escribe `trying next`, según el test "Upstream y después éxito: reintenta el MISMO modelo y no lo marca caído". Depende de: OE-S14.
- Historia OE-S20. Un `Error: Upstream` que se repite agota los reintentos y pasa al siguiente sin marcar caído. AC: Given un `opencode run` falso que devuelve Upstream tres veces y después responde `OK` con el siguiente modelo, y `PSTACK_UPSTREAM_ESPERA=0` When corro el runner Then el primer modelo aparece tres veces, el segundo una vez, no marca ningún caído y escribe `SIN marcarlo caído` en stderr, según el test "Upstream 3 veces: agota los reintentos y pasa al siguiente SIN marcarlo caído". Depende de: OE-S15.
- Historia OE-S21. Un Upstream con códigos ANSI también se reintenta sin marcar caído. AC: Given un `opencode run` falso que devuelve `Error: Upstream` con códigos ANSI y después `OK` When corro el runner Then usa dos veces el mismo modelo y no marca caído, según el test "Upstream con códigos ANSI también se reintenta sin marcar caído". Depende de: OE-S15.
- Historia OE-S22. Cualquier otro error del proveedor sigue marcando caído. AC: Given un `opencode run` falso que termina con `Error: {"name":"UnknownError","message":"boom"}` y después responde `OK` con el siguiente modelo When corro el runner Then termina con exit 0, marca caído el primer modelo, usa el segundo y escribe `trying next` en stderr, según el test `rc=0 con Error: {"name":"UnknownError"} marca caído y prueba el siguiente`. Depende de: OE-S15.
- Historia OE-S19. Un `Error: Upstream` en el medio no invalida una sesión que terminó bien. AC: Given un runner falso cuya salida trae `Error: Upstream` en una línea intermedia y después una respuesta normal When corro el runner Then termina con exit 0, no marca caídos y escribe `done model=`, según el test "un Error: Upstream en medio de la salida no cuenta como caída si la sesión termina bien". Depende de: OE-S15.
- Historia OE-S16. Un error de herramienta no cuenta como caída. AC: Given un runner falso que imprime `Error: permission denied by user` y sale con 0 When corro el runner Then termina con exit 0, no marca ningún caído y escribe `done model=`, según el test "un Error: de herramienta (permiso rechazado) no cuenta como caída". Depende de: OE-S15.
- Historia OE-S17. La cadena de respaldo del runner es la del perfil. AC: Given un prompt que empieza con `/poteto-mode` o un `--skill tdd` When el runner arma la lista sin `-m` Then la cadena sale de `modelos.mjs lista` para esa skill y no del fallback fijo. El test "arranca el server con los modelos resueltos y marca caídos los que fallan" verifica la llamada a `lista`, no la cadena completa. Depende de: OE-S14.

## Dependencias externas

- Node 22 para `modelos.mjs` y para el test.
- OpenCode 1.19.x con `opencode models opencode`, `opencode run --attach` y `opencode serve`. El benchmark usó 1.19.3. La 1.19.0 tiene un cuelgue conocido en el primer attach tras un arranque en frío; el runner lo quema con un warm-up.
- `bash`, `curl`, `timeout`, `pgrep` y `seq` para el runner.
- `GH_TOKEN` opcional para que `why` y `blast-radius` usen `gh`.
- Zen free. Si cambia la lista o la clasificación de privacidad, se actualiza el JSON a mano.
- El benchmark se conserva en la sección "Benchmark" de este PRD y se reproduce con el script versionado `scripts/opencode/bench-modelos.mjs`. Los resultados crudos van a `.pstack-tmp/bench-modelos/`, que está gitignored.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Config | Cobertura de perfiles | `tests/opencode-modelos.test.ts` | Cada skill y agente apunta a un perfil con modelos free |
| Contrato | Coherencia con agentes | `opencode.json` y el JSON | El primer modelo del perfil coincide con el `model` del agente |
| Privacidad | Primero sin retención | Clasificación `privacidad` | Ningún perfil arranca con un modelo que entrena o retiene 30 días |
| Unidad | Respaldo por ausencia | Lista sin el asignado | Elige el siguiente y registra el descartado |
| Unidad | Respaldo por caído | Cache con `hasta` futuro | Saltea el caído y respeta el vencimiento |
| Unidad | Sin modelos | Conjunto vacío | `elegido` es `null` |
| CLI | Aviso y log | `elegir juez` con un modelo ausente | stderr con aviso y línea `caido=` en el log |
| CLI | Persistencia | `caido` y después `lista` | La cache guarda el estado y el orden cambia |
| CLI | Revivir | `caido`, `revivir` y después `lista` | Borra la marca y vuelve el asignado |
| CLI | Cache sin `caidos` | Cache válida con solo `lista` | El marcado no rompe y agrega la clave |
| Runner | Cableado | Texto de `pstack-run.sh` | Usa `overrides`, `lista` y `caido` |
| Runner | Upstream con rc=0 | Salida que termina con `Error: Upstream`, después `OK` | Reintenta el mismo modelo y no lo marca caído |
| Runner | Upstream agotado | Upstream tres veces y después `OK` con el siguiente | Pasa al siguiente solo para la corrida, sin marcar caído |
| Runner | Otro error del proveedor | Salida que termina con `Error: {` | Marca caído y prueba el siguiente |
| Runner | Upstream en el medio | Error de un log leído y respuesta normal al final | No marca caído y termina bien |
| Runner | Error de herramienta | `Error: permission denied by user` | No marca caído y termina bien |
| Regresión | Modelos retirados | Los tres archivos de config | No aparecen `space-bunny` ni `muse-spark` |

## Preguntas abiertas

1. Benchmark. No hay rutina periódica (decisión de Mauri, 2026-10-21). El actual es n=1 y de tareas cortas, no mide sesiones largas con herramientas ni consumo de cuota. Se corre solo a demanda con `node scripts/opencode/bench-modelos.mjs <modelos...>` cuando se quiere revisar el orden; los resultados quedan en `.pstack-tmp/bench-modelos/resultados.jsonl`.
2. Privacidad. La clasificación es una foto de `opencode.ai/docs/zen` al 2026-10-20. ¿Quién la revisa y cada cuánto? Si Zen cambia la retención de un modelo, el orden queda viejo y el test no lo detecta.
3. `Error: Upstream`. Decidido: se reintenta el mismo modelo `PSTACK_UPSTREAM_REINTENTOS` veces (default 2) con backoff `PSTACK_UPSTREAM_ESPERA` (default 5 s, duplicando) y, agotados los reintentos, se pasa al siguiente solo para esa corrida sin marcarlo caído. Un endpoint caído es una falla del proveedor, no del modelo.
4. TUI interactiva. `opencode` a secas no recibe `OPENCODE_CONFIG_CONTENT`, así que usa los modelos fijos de `opencode.json` y no ve el respaldo. Opciones: regenerar `opencode.json` desde el JSON de perfiles, un wrapper para la TUI, o esperar soporte de config por sesión. Ninguna está decidida.
5. Reinicio de `opencode serve`. Cuando cambia el modelo de un agente, `pstack-run.sh` mata el server y las sesiones en curso se cortan. Falta drenar o aplicar la config por sesión.
6. Guarda del árbol. El exit 4 cuando el árbol cambió no tiene test. Solo está el código y el mensaje al orquestador.
7. Detección de altas. `opencode models opencode` detecta retiros, no altas. Agregar un modelo nuevo a un perfil es manual.
8. TTL de caído. Diez minutos puede ser corto para una caída de cuota larga y largo para un fallo transitorio. No hay medición.
9. `PSTACK_MODELOS_DISPONIBLES` es un hook de test. Usarlo a mano en producción puede esconder un modelo roto.
10. El runner reinicia el server también cuando cambia `OPENCODE_CONFIG_CONTENT` por un override de agente. Un cambio de privacidad en el JSON puede cortar una sesión en curso sin que el usuario lo pida.
