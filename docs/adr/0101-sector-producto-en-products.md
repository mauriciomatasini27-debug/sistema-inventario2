---
id: ADR-0101
tipo: adr
estado: aceptado
modulos: [inventario, persistencia]
depende_de: [ADR-0012, ADR-0062, ADR-0078]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El sector del producto se guarda en products.sector. La migración 0029 crea la columna con
  default general y un CHECK de formato, y catálogo y conteo la leen y escriben DB-first.
---
# ADR-0101 - Sector de producto en `products.sector`

Estado: aceptado. Fecha: 2026-10-19. Fuentes: PRD `diseno/PRD-CAT-02-sector-producto-db.md`, `src/db/schema.ts`, `src/lib/repos/catalogo.ts`, `src/lib/repos/stock.ts`, `src/modules/inventario/sectores.ts`, `drizzle/0017_locations_photos_counts.sql`, `drizzle/0021_products_location_id.sql`, `drizzle/0027_products_min_stock.sql`, ADR-0062, ADR-0078.

## Contexto

`src/db/schema.ts` declara `products.sector` como `text NOT NULL DEFAULT 'general'`. Al momento de escribir este ADR, ninguna migración de `drizzle/` creaba esa columna; la decisión la agrega en `drizzle/0029_products_sector.sql`. `catalogo.ts` guarda el sector en `store.productSectores`, omite la columna en el insert crudo y lo lee solo de memoria. Los comentarios del repositorio llaman a esto "drift conocido".

El efecto es que el sector dura lo que dura el proceso. Después de un reinicio, o en una segunda instancia, todos los productos leen `general`. `conteoPorSector` arma el mapa de sectores desde memoria, así que un conteo de un sector distinto de `general` se rechaza con `LINEA_INVALIDA`. La edición masiva por sector del panel agrupa todo el catálogo como `general`.

ADR-0078 creó con la migración 0017 las tablas y columnas que faltaban para ubicaciones, fotos y conteos, pero dejó afuera `products.sector`. `docs/diseno/PLAN-COM-01/b-refactor.md` ya recomienda agregar la migración y leer la columna.

## Decisión

1. `products.sector` es la fuente durable del sector del producto.
2. La migración `0029_products_sector.sql` agrega la columna con `text NOT NULL DEFAULT 'general'` y un CHECK `products_sector_check` que acepta `^[a-z0-9][a-z0-9_-]{0,39}$`.
3. `catalogo.ts` escribe la columna y la lee cuando el producto no está en el espejo del proceso. El espejo mantiene la precedencia de las escrituras recientes, igual que `location_id` y `min_stock`, y es el único almacenamiento en single sin base.
4. `conteoPorSector` arma `sectorDe` desde `products.sector` con precedencia de la base, y usa la memoria para los SKU que no están en la base o en single sin base.
5. `altaProducto` y `actualizarProducto` normalizan con `normalizarSector` antes de persistir. El CHECK de la base y `SECTOR_RE` comparten el mismo formato.
6. El aislamiento sigue siendo por base de tenant. `products` no lleva `tenant_id`.
7. No se crea una tabla `product_sectors` en este cambio.
8. La migración se aplica solo con aprobación de Mauri y se registra en `docs/roadmap/migraciones-aplicadas.md` antes del merge.

## Por qué

El sector es un atributo 1:1 del producto. No tiene atributos propios hoy, así que una tabla aparte agrega un join y un ciclo de vida sin beneficio. El dominio ya lo nombra como `products.sector` en `sectores.ts` y en F13, y el schema ya lo declara. Persistirlo alinea el contrato con la base.

La alternativa de borrar el campo del schema es más chica, pero confirma una regresión. El sector seguiría desapareciendo en cada reinicio, dos instancias podrían devolver valores distintos y el conteo por sector quedaría roto. ADR-0078 ya eligió el camino opuesto para las otras tablas que faltaban: crear la estructura faltante, no borrarla del schema.

El CHECK evita que la base acepte valores que `normalizarSector` convierte a `general` en el conteo. Sin el CHECK, el valor persistido y la regla del conteo podrían discrepar.

## Qué cambia

- `drizzle/0029_products_sector.sql`, la entrada en `drizzle/meta/_journal.json` y `docs/roadmap/migraciones-aplicadas.md`.
- `src/lib/repos/catalogo.ts`: lecturas y escrituras de `products.sector`.
- `src/lib/repos/stock.ts`: mapa de sectores DB-first para `conteoPorSector`.
- `src/db/schema.ts`: sin cambio de forma. La declaración existente pasa a ser verdadera.
- Tests PG A/B y unitarios para persistencia, normalización, conteo y aislamiento.
- Se eliminan los comentarios que tratan el sector como desajuste conocido.

## Alternativas descartadas

- Borrar `products.sector` del schema y dejar el sector solo en memoria. Es el diff más chico y no necesita migración, pero el sector sigue siendo volátil y el conteo por sector no sobrevive un reinicio. Se descarta.
- Crear `product_sectors`. Sirve si los sectores ganan atributos o si un producto puede estar en varios. Hoy no es el caso.
- Guardar el sector en un JSONB de atributos. Esconde un campo de dominio y pierde el CHECK.
- Agregar la columna sin CHECK. Acepta valores que el conteo normaliza a `general`.

## Consecuencias

- El orden de despliegue es migración primero, código después. El código anterior ignora la columna, así que 0029 es compatible hacia atrás.
- El relleno inicial usa el default `general`. Los sectores que solo vivieron en memoria no se recuperan. El Dueño puede volver a cargarlos por la API.
- El rollback del código es seguro. `DROP COLUMN` borra los sectores, así que hay que exportarlos antes.
- El espejo en memoria puede ocultar una escritura de otra instancia hasta que el proceso reinicie. Es el mismo comportamiento que ya tienen `location_id` y `min_stock`. Una lectura sin entrada en memoria usa la base.
- El sync offline no lleva sector. El conteo offline por sector necesita un cambio aparte en PERS-06.
- `inventory_counts` sigue en el schema sin migración. Queda fuera de este ADR.

## Pendientes

- Aplicar 0029 en las bases de producción de cada tenant. Las bases A/B locales ya están migradas.
- Decidir si los nombres de sector pueden llevar espacios. La regla actual dice que no.
- Evaluar si `sector` debe derivarse de `location_id` o seguir independiente.
