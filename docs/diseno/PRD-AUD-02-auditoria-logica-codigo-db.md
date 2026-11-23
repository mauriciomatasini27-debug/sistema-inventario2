---
id: PRD-AUD-02
tipo: prd
estado: propuesto
modulos: [persistencia]
depende_de: [ADR-0126, PRD-AUD-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Auditoría de lógica: verificar que el código usa columnas existentes y que escrituras/lecturas hacen round-trip sin pérdida. Alcance acotado a repos y queries.
---
# PRD-AUD-02 - Auditoría de lógica (código ↔ base de datos)

Fuente: iniciativa de auditoría integral base ↔ código ↔ UI/UX. Restringido por ADR-0126. Depende de PRD-AUD-01 (esquema ya conocido).

## Problema

Aun con el esquema sin drift, el código puede referenciar columnas que no usa (o que no existen), y una escritura puede no persistir todo lo que la UI manda. Hoy no hay un chequeo que garantice que cada columna que toca el código existe, ni que los datos sobreviven el camino completo de escritura y lectura.

## Épica AUD-E2. Auditoría de lógica

Requisito AUD-R2: el código debe quedar verificado contra columnas reales y con round-trips por módulo crítico.

- Historia AUD-S3. Check estático que lista cada tabla/columna referenciada en `src/` (repos y queries) y falla si alguna no existe en `src/db/schema*.ts`. AC: Given el árbol de src When corro el check Then reporta cada referencia a tabla o columna inexistente con su file:line. ADR: 0126. Talla M. Depende de: PRD-AUD-01.
- Historia AUD-S4. Tests de round-trip por módulo crítico (ventas, caja, inventario, fiado, fiscal): insertar un registro con todos sus campos, leerlo y comparar sin pérdida ni cambio de tipo. AC: Given un registro completo When lo inserto y releo Then todos los campos coinciden en tipo y valor. ADR: 0126. Talla M. Depende de: AUD-S3.

## Dependencias externas

Postgres de test A/B (`pers_tenant_a` y `pers_tenant_b`) levantado con `pg-local.sh` para los round-trips.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Round-trip completo | registro con todos los campos | relectura idéntica |
| Fallo | Columna inexistente | query a columna borrada | el check estático la reporta |
| Fallo | Pérdida de tipo | entero leído como texto | el test de round-trip falla |
