---
id: ADR-0098
tipo: adr
estado: aceptado
modulos: [fiscal, persistencia]
depende_de: [ADR-0018, ADR-0054, ADR-0082, PRD-FE-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La persistencia de control fiscal guarda clave y TA solo cifradas por KMS, da de alta el
  computador de forma idempotente ante dos workers y registra el fallback a memoria. Si el
  store o el KMS fallan, la emisión sigue con login de WSAA.
---
# ADR-0098 - Persistencia de control fiscal: KMS obligatorio, alta idempotente y fallback registrado

Estado: aceptado (2026-10-19, evidencia: `npm run verify` 10 pasos y `tests/fiscal-control-pg.test.ts`). Fecha: 2026-10-19. Fuentes: PRD `diseno/PRD-FE-03-persistencia-control-fiscal.md`, PRD-FE-01 (historia FE-S26), ADR-0018, ADR-0054, ADR-0082, `src/lib/repos/fiscal-control.ts`, `src/lib/fiscal-control-almacen.ts`, `src/modules/fiscal/arca-provider.ts`.

## Decisión

- La clave privada del computador fiscal y la TA de WSAA se guardan solo cifradas por KMS. El repo escribe `key_ciphertext`, `token_ciphertext` y `sign_ciphertext`, nunca el plano. Sin `FISCAL_KMS_KEY_B64` el guardado falla, no cae a texto plano.
- `asegurarComputadorFiscal` es idempotente. `guardarComputador` hace upsert sobre `(ambiente, alias)` y devuelve el id persistido con `.returning`, no el `crypto.randomUUID()` local. Bajo dos workers, `guardarTaFiscal` recibe siempre el id de la fila y la FK de `arca_tokens` se sostiene.
- El fallback del control DB a memoria se registra con `console.warn`. No esconde un despliegue sin `CONTROL_DATABASE_URL`.
- `crear_arca_provider` recibe una `TaDurable` opcional. Antes de pedir login lee la TA persistida por otro worker y, después del login, guarda la nueva. Una falla del store o del KMS avisa y sigue con login, nunca bloquea la emisión.

## Por qué

FE-S26 pide que un volcado de la base de control no exponga clave ni TA, y que dos workers no pidan dos TA a ARCA. Un alta que devuelve un id local rompe la FK de `arca_tokens` bajo carrera. Un fallback silencioso convierte un control DB mal configurado en una TA que vive por proceso sin que nadie lo vea. Un catch que traga viola E7 y ADR-0082.

## Qué cambia

- `src/lib/fiscal-control-almacen.ts`: `guardarComputador` devuelve el id con `.returning({ id })`.
- `src/lib/repos/fiscal-control.ts`: `guardarComputadorFiscal` devuelve el id persistido; `almacenPorDefecto` registra el motivo del fallback; el ambiente se valida al leer.
- `tests/fiscal-control-persistencia.test.ts` y un test del store drizzle contra el control DB con el patrón de `tests/sync-durable.test.ts`.

## Alternativas descartadas

- Guardar la clave en una variable de entorno o en texto plano. Viola FE-S26 y expone un volcado.
- Devolver el uuid local y confiar en el `onConflictDoUpdate`. Solo es correcto sin carrera, y la carrera es justo el caso de dos workers.
- Relanzar el error del fallback. Trabaría la emisión por una base de control caída, que es lo contrario del objetivo de FE-S26.

## Consecuencias

El alta del computador converge al mismo estado corra una o dos veces. La TA durable se comparte entre workers por la base de control y no por proceso. Un control DB ausente o un KMS ausente dejan rastro en el log. Ningún status ni shape de `/api/fiscal/emitir` cambia.

## Pendientes

- Implementar el `.returning`, el log del fallback y la validación del ambiente.
- Test del store drizzle contra el control DB.
- Cablear `leerComputadorFiscal` cuando el provider lea el computador persistido en vez de env.
- CSR y alta del certificado WSASS, alertas de vencimiento a 60, 30 y 7 días, y runbooks de renovación y revocación.

## Evidencia de aceptación (2026-10-19)

- `npm run verify` verde, 10 pasos. `check-skips: sin skips`. `docs:check ok: 337 doc(s)`.
- `npm run evidencia`: tsc 0 errores, `Test Files 255 passed (255)`, `Tests 2027 passed (2136)`, build `Complete!`. Baselines sin cambio (`storeRepos 72`, `esModoMulti 33`, `asNeverTestsTotal 1`, `comentariosNoExiste 7`).
- `tests/fiscal-control-pg.test.ts` contra el control DB (`asegurarBasePrivada("pers_ficontrol", PG_TEST_URL_A)`). Prueba que el alta repetida devuelve el id persistido y que la TA vuelve descifrada.
- TDD: con la conducta vieja (`guardarComputador` devolviendo el uuid local) el test falla con `AssertionError: expected '<uuid>' to be '<uuid>'`. Con `.returning({ id })` pasa.
- Sin migración.
