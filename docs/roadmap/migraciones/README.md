# Registro de migraciones aplicadas

Un archivo JSON por migración aplicada en la base real. El nombre del archivo es `<tag>.json`, donde `tag` es el nombre del `.sql` sin extensión (por ejemplo `0037_admin_resumen.json`).

`docs/roadmap/migraciones-aplicadas.md` es derivado. Lo regenera `main` con `npm run docs:migraciones`; no se edita a mano ni se commitea en una rama.

## Formato

```json
{
  "tag": "0037_admin_resumen",
  "fecha": "2026-10-22",
  "aprobado_por": "Mauri",
  "evidencia": "Verificada aplicada en la base real: fila de journal id 38 con hash igual al archivo.",
  "backup": "/home/mauri/backups/pre-0037-0038-schema-20261022-0058.sql"
}
```

- `tag` obligatorio y debe coincidir con el nombre del archivo.
- `fecha` opcional, `AAAA-MM-DD`.
- `aprobado_por`, `evidencia` y `backup` opcionales.

## Cómo registrar una migración

1. Mauri aprueba y aplica la migración en la base real.
2. En la rama que trae el `.sql`, agregá `docs/roadmap/migraciones/<tag>.json` con la evidencia.
3. `npm run docs:migraciones` valida el registro. El `.md` lo regenera `main`.
4. `node scripts/cadena/puede-mergear.mjs <PR>` lee la carpeta de la rama base: sin el registro, el PR queda bloqueado.

Cada migración es un archivo propio, así dos PRs con migraciones no chocan.
