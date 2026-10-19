---
id: PRD-CAT-02
tipo: prd
estado: en curso
modulos: [inventario, persistencia]
depende_de: [ADR-0101, ADR-0078, ADR-0062]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Persiste el sector del producto en products.sector con la migración 0029 y lecturas y escrituras
  DB-first en catálogo y conteo. Cierra el desajuste entre el schema Drizzle y la base y evita que
  el sector se pierda al reiniciar en multi.
---
# PRD-CAT-02 - Sector de producto persistido en `products`

Fuente: `docs/03-inventario-precios/inventario-parte-2.md` (F13), `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/modules/inventario/sectores.ts`, ADR-0101, ADR-0078.

## Problema

`src/db/schema.ts` declara `products.sector` desde el inicio, pero ninguna migración de `drizzle/` crea la columna. El repositorio de catálogo guarda el sector en `store.productSectores`, omite la columna en el insert crudo y lo lee solo de memoria. Esto produce cuatro fallas.

- El sector se pierde al reiniciar el proceso o al leer desde otra instancia. Todos los productos vuelven a `general`.
- El conteo por sector falla para cualquier sector distinto de `general`, porque `conteo_por_sector` compara contra el mapa en memoria.
- La edición masiva por sector de `/panel/alertas/umbrales` agrupa todo el catálogo como `general`.
- Un insert tipado de Drizzle en `products` incluye `sector` con su default y falla con `42703` en una base migrada solo desde `drizzle/`.

## Objetivo

`products.sector` es la fuente durable del sector del producto. La memoria queda como espejo de lectura y como almacenamiento en single sin base. El conteo por sector usa la misma fuente.

## Fuera de alcance

- Una tabla `product_sectors` o un catálogo de sectores con atributos.
- Derivar el sector de `location_id`.
- Llevar el sector en el payload de sync offline (PERS-06).
- La tabla `inventory_counts`, que también está en el schema y no tiene migración.
- Renombrar sectores en masa.

## Épica CAT-E4. Persistencia del sector

- Historia CAT-S7. La migración `drizzle/0029_products_sector.sql` agrega `products.sector` como `text NOT NULL DEFAULT 'general'` y un CHECK `products_sector_check` con el formato `^[a-z0-9][a-z0-9_-]{0,39}$`. La migración es idempotente y queda registrada en `drizzle/meta/_journal.json` y en `docs/roadmap/migraciones-aplicadas.md` antes del merge. AC: Given una base con productos When aplico 0029 Then todas las filas leen `general` y la columna existe; Given la aplico dos veces Then no falla; Given un valor fuera del CHECK When inserto Then la base lo rechaza; Given una base de tenant nueva When provisiono Then 0029 corre en esa base. ADR: 0101. Talla S. Depende de: aprobación de Mauri.

- Historia CAT-S8. `listarProductos` y `buscarProductoPorCodigo` seleccionan `products.sector`; `fichaDeFila` usa el sector de la fila cuando no hay espejo en memoria; `altaProducto` escribe el sector en la misma sentencia y `actualizarProducto` actualiza `sector` cuando el parche lo trae. El espejo en `store.productSectores` sigue. Se eliminan la omisión del insert y los comentarios que llaman desajuste a este caso. AC: Given un producto con sector `bebidas` When lo leo desde otro proceso o después de `resetStore` Then sigue `bebidas`; Given un PATCH con sector When leo Then veo el valor nuevo; Given los tenants A y B When leo Then cada uno ve su sector; Given multi sin base When leo Then 503 `base_no_disponible`. ADR: 0101. Talla M. Depende de: CAT-S7.

- Historia CAT-S9. `conteoPorSector` arma `sectorDe` DB-first desde `products.sector` antes de llamar a `conteo_por_sector`, con la memoria como fallback en single sin base. AC: Given un producto persistido con sector `heladera` y la memoria vacía When cuento `heladera` Then el conteo acepta el SKU; Given sector `general` Then el comportamiento no cambia; Given multi sin base Then 503. ADR: 0101. Talla S. Depende de: CAT-S8.

- Historia CAT-S10. `altaProducto` y `actualizarProducto` normalizan el sector con `normalizarSector` antes de persistir y de espejar. El CHECK de la migración y `SECTOR_RE` usan el mismo formato. AC: Given sector `Heladera A` When alta Then se guarda `general` y la respuesta lo muestra; Given `bebidas` Then se guarda `bebidas`; Given un valor de 41 caracteres Then se guarda `general`. ADR: 0101. Talla S. Depende de: CAT-S8.

- Historia CAT-S11. La suite PG A/B cubre el sector durable y el insert tipado. AC: Given una base migrada When ejecuto `db.insert(products).values({ sku, nombre, precioCentavos })` Then no falla con `42703`; Given un PATCH de sector y `resetStore` When leo Then el sector sigue; Given un conteo por sector persistido When confirmo Then se acepta; Given los tenants A y B When leo Then no hay fuga. ADR: 0101. Talla S. Depende de: CAT-S9.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Alta con sector `bebidas` | `POST /api/products` | La fila de `products` guarda `bebidas` y la lectura lo devuelve |
| Feliz | PATCH de sector | `PATCH /api/products?sku=...` | El sector nuevo sobrevive a `resetStore` |
| Feliz | Conteo por sector persistido | `POST /api/stock/conteo` con `heladera` | El SKU se acepta y se ajusta |
| Fallo | Sector inválido | `Heladera A` | Se normaliza a `general` |
| Fallo | CHECK de la base | `Sector!` por SQL directo | La base rechaza el valor |
| Aislamiento | Tenants A y B | Mismo SKU, sectores distintos | Cada tenant lee el suyo |
| Migración | Aplicar 0029 dos veces | Base con productos | Sin error y sin cambios |
| Regresión | Insert tipado | `db.insert(products)` sin sector | No falla y usa `general` |

## Rollout

1. Mauri aprueba la migración 0029 y la registra en `docs/roadmap/migraciones-aplicadas.md`. Hecho.
2. Se aplica 0029 en cada base de tenant, incluida la provisión de comercios nuevos. A/B local hecho; producción pendiente.
3. Se despliega el código. El código anterior ignora la columna, así que la migración es compatible hacia atrás. Hecho en la rama.
4. Se corre `npm run verify` con Postgres A/B. Hecho.

El rollback del código es seguro. `DROP COLUMN` borra los sectores, así que hay que exportarlos antes.

## Dependencias externas

- Aprobación de Mauri para la migración.
- Ningún servicio externo.

## Preguntas abiertas

- F13 usa nombres con espacios (`Heladera A`), pero `normalizarSector` los convierte a `general`. Este PRD mantiene la regla actual. Cambiar el formato es una decisión aparte.
- `sector` y `location_id` siguen siendo dos agrupaciones independientes. Unificarlas es una decisión aparte.
