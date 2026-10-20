---
id: PRD-FE-03
tipo: prd
estado: hecho
modulos: [fiscal, persistencia]
depende_de: [PRD-FE-01, ADR-0098]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Endurece la persistencia de control fiscal de FE-S26. El alta del computador es idempotente
  entre workers, el camino de Postgres tiene test, y el fallback a memoria deja rastro. El
  store y el KMS nunca bloquean la emisión.
---
# PRD-FE-03 - Persistencia de control fiscal durable

Fuente: PRD-FE-01 (historia FE-S26, FE16), ADR-0018. Restringido por ADR-0098, ADR-0054 y ADR-0082.

## Problema

Las tablas `fiscal_computers` y `arca_tokens` existían sin uso. La clave privada salía de una variable de entorno y la TA de WSAA vivía 12 horas en memoria de un solo proceso. La primera versión de FE-S26 ya escribe el computador con la clave cifrada y la TA cifrada con vencimiento, pero deja tres huecos. El alta del computador devuelve un id local en vez del id persistido, y bajo dos workers rompe la FK de `arca_tokens`. El camino de Postgres no tiene test, así que un nombre de columna mal escrito pasa CI. Y el fallback del control DB a memoria es silencioso, así que un despliegue sin `CONTROL_DATABASE_URL` pierde la TA compartida sin que nadie lo vea.

## Épica FE3-E1. Alta idempotente y store probado

Requisito FE3-1: el alta del computador converge al mismo id corra una o dos veces, y el camino de Postgres se prueba contra una base real.

- Historia FE3-S1. Alta idempotente entre workers. AC: Given dos workers que dan de alta el mismo `(ambiente, alias)` a la vez When ambos guardan Then los dos reciben el id de la fila y `guardarTaFiscal` inserta sin error de FK. ADR: 0098. Talla S. Depende de: nada.
- Historia FE3-S2. Test del store drizzle. AC: Given el control DB disponible When guardo y leo un computador y una TA Then vuelven cifrados y con el mismo id. ADR: 0098, ADR-0024. Talla S. Depende de: FE3-S1.

## Épica FE3-E2. Fallback con rastro y sin bloqueo

Requisito FE3-2: una falla del control DB o del KMS deja traza y nunca traba la emisión.

- Historia FE3-S3. Fallback registrado. AC: Given un proceso sin `CONTROL_DATABASE_URL` When el repo cae a memoria Then `console.warn` nombra el motivo y el guardado sigue. ADR: 0098, ADR-0082. Talla S. Depende de: nada.
- Historia FE3-S4. Emisión sin store ni KMS. AC: Given el store o el KMS caídos When el provider pide la TA Then pide login a WSAA y emite. ADR: 0098, ADR-0018. Talla S. Depende de: FE-S17.
- Historia FE3-S5. Ambiente validado al leer. AC: Given una fila con `ambiente` distinto de `homo` o `prod` When la leo Then la descarto con un error nombrado, no con un cast. ADR: 0098. Talla S. Depende de: nada.

## Dependencias externas

- Postgres del control DB en `CONTROL_DATABASE_URL` (o el Postgres de servicio A/B de `verify`).
- KMS con `FISCAL_KMS_KEY_B64`.
- WSAA de ARCA. La emisión real queda detrás de FE2 (certificado y encuadre legal).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Alta y lectura con KMS | Computador y TA válidos | Clave y TA vuelven descifradas, mismo id |
| Feliz | TA durable vigente | TA persistida con 6 h | `get_ta` devuelve la TA durable sin login |
| Fallo | Alta concurrente | Dos `asegurar` a la vez | Ambos devuelven el id de la fila |
| Fallo | Sin KMS | `FISCAL_KMS_KEY_B64` ausente | Error nombrado, sin texto plano |
| Fallo | Control DB caído | `getControlDb` lanza | `console.warn` y la emisión sigue con login |
| Borde | Ambiente inválido | Fila con `ambiente = "qa"` | Se descarta, sin cast |
