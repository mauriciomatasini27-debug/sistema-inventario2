# ADR-0049 - Driver postgres-js con TLS y flags derivados de la URL

Estado: propuesto. Fecha: 2026-10-13. Fuentes: `src/lib/db.ts`, `docs/migracion-supabase.md`, PRD `diseno/PRD-SUP-01-conexion-supabase.md`.

## Decisión

`clientFor` en `src/lib/db.ts` deriva todo desde la URL. `isTxPooler` es URL con `:6543`. `isLocal` es URL con `localhost` o `127.0.0.1`. Opciones: `max 1` en 6543 y `max 5` en el resto nube, `prepare false` solo en 6543, `ssl require` salvo local. Validación de config en el borde al leer env, nunca dentro de la lógica de negocio.

## Por qué

Hoy `clientFor` usa `max 10` sin TLS y falla contra Supabase o agota el pooler Free. El puerto 6543 no soporta prepared statements y sin `prepare false` falla con `prepared statement does not exist`. Centralizar la decisión en una función evita repetir la misma elección en cada módulo.

## Qué cambia

Solo `src/lib/db.ts` más scripts `db:migrate` y `db:studio` en `package.json`. Ningún cambio de schema. Ninguna tabla nueva. Migraciones siempre por directa o Session pooler 5432, nunca por 6543.

## Alternativa descartada

Pasar banderas `ssl`, `max` y `prepare` por variables propias en cada llamada. Se descarta porque duplica la elección y deja estados inválidos posibles como 6543 con `prepare true`. La URL ya trae puerto y host, así que derivar es la vía directa.

## Pendientes

Verificar `npm test` dominial con Supabase viva. Revisar `max` si el pooler reporta tope de clientes. Documentar el cambio a 6543 solo si el deploy pasa a serverless.
