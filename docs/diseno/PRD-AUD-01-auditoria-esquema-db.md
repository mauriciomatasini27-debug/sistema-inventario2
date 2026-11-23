---
id: PRD-AUD-01
tipo: prd
estado: propuesto
modulos: [persistencia]
depende_de: [ADR-0125]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Auditoría de esquema: detectar drift entre la base real (Supabase y local), src/db/schema*.ts y drizzle/*.sql. Alcance acotado a columnas, tipos, defaults e índices.
---
# PRD-AUD-01 - Auditoría de esquema (base de datos ↔ esquema y migraciones)

Fuente: iniciativa de auditoría integral base ↔ código ↔ UI/UX. Restringido por ADR-0125.

## Problema

La base real (SIstemadegestion y el cluster local) puede haberse desviado de lo que declaran `src/db/schema*.ts` (Drizzle) y `drizzle/*.sql`. Ya hay drift confirmado: migraciones 0056-0059 aplicadas tarde, tablas declaradas sin migración (P10-17/P10-19) y filas huérfanas en el journal. Sin un diff automatizado, cada cambio arriesga columnas faltantes/sobrantes o tipos divergentes que rompen en runtime.

## Épica AUD-E1. Auditoría de esquema

Requisito AUD-R1: un chequeo automatizado debe comparar la base real contra el esquema y las migraciones, y reportar drift sin modificar nada.

- Historia AUD-S1. Script `npm run audit:db` que lista tablas, columnas, tipos, defaults e índices de la base real (information_schema) y los diffea contra `src/db/schema*.ts` y `drizzle/*.sql`. AC: Given una base conectada When corro audit:db Then reporta por tabla las columnas faltantes, sobrantes y con tipo distinto, y sale con código distinto de 0 si hay drift. ADR: 0125. Talla M. Depende de: nada.
- Historia AUD-S2. Correr audit:db contra SIstemadegestion y el cluster local, y triagear el drift en `docs/roadmap/auditorias/drift-esquema.md` (cada ítem: columna, lado real, lado esperado, decisión corregir-schema o corregir-base). AC: Given el diff When triageo Then cada divergencia queda clasificada con dueño y ninguna queda ambigua. ADR: 0125. Talla M. Depende de: AUD-S1.

## Dependencias externas

Acceso de solo lectura a SIstemadegestion (Supabase MCP) y al cluster local (postgres-local). No escribe en ninguna base.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Esquema idéntico | base == schema | exit 0, 0 drift |
| Fallo | Columna faltante en base | schema con columna extra | reporta columna faltante, exit != 0 |
| Fallo | Tipo divergente | columna text vs integer | reporta tipo distinto, exit != 0 |
