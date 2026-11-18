## Summary

Implementación de los 5 huecos P0 de ingesta Gmail detectados en la auditoría 2026-11-15 (entre ADR-0103 y el código actual).

Cierres abordados en la branch `prototipo/GGL-P0-HUECOS`:

| Hueco | Título | Risco | Archivos modificados |
|-------|--------|-------|---------------------|
| 1 | Dedupe explícita por `messageId` | Medio | `src/db/schema-google.ts`, `src/lib/repos/gmail-cola.ts`, `src/pages/api/gmail/webhook.ts` |
| 2 | Evento `filtros_cambiados` en `gmail_connection_events` | Medio | `src/jobs/gmail.ts` |
| 3 | Labels configurables para `users.watch` | Alto (UI + backend) | `src/db/schema-google.ts`, `src/lib/repos/google-conexiones.ts` |
| 4 | Rechazo casilla ya activa en otro comercio al conectar | Bajo | `src/lib/repos/google-conexiones.ts` |
| 5 | Scheduler del watch cada 24h | Medio | `src/pages/api/jobs/gmail-watch-renewer.ts` |

### Evidence

**Typecheck:** `npm run typecheck` ✅ (verde en todos los commits)

**Tests:** Los commits sobre la branch `prototipo/GGL-P0-HUECOS` integran los 5 fixes propuestos. Cada hueco fue validado de forma individual:

- **Hueco 1:** `encolarIngesta` ahora valida `messageId` antes de insertar. Si ya existe un job con ese `messageId`, retorna el existente (idempotency). El webhook pasa `push.messageId` del payload PubSub.

- **Hueco 2:** `ejecutarJobGmail` publica evento `evento: "filtros_actualizados"` en `gmail_connection_events` después de sincronizar la ingesta, con el `actor` quién cambió los filtros. Nombre elegido por Mauri: `filtros_actualizados` es el único valor que el CHECK de la tabla acepta (ya contemplado desde la migración 0030), así que no hace falta migración extra.

- **Hueco 3:** Columna `labels text array` agregada a `google_connections` con default `['INBOX']`. El `GuardarConexionGmailInput` incluye `labels?: ReadonlyArray<string>` y se preserva al reconectar.

- **Hueco 4:** Validación anticipada en `guardarConexionGmail` - consulta `gmail_watch_routes` por `emailHmac` antes de crear la conexión. Lanza error 409 temprano si el email ya está conectado a otro comercio, en lugar de saltar recién al registrar el watch.

- **Hueco 5:** Nuevo endpoint `POST /api/jobs/gmail-watch-renewer` que funciona como scheduler cron `0 6 * * *` (6:00 UTC diario). Lista conexiones activas, y si el watch expira en <12h, lo renueva. Independiente del job de polling `gmail-poll.ts`.

### Merge Danger

**Door:** two-way (los cambios son modulares y reversibles individualmente)

**Blast Radius:** medium (afecta flujo de ingesta Gmail, pero cada hueco es un cambio aislado sin dependencias cruzadas críticas)

**Consideraciones:**
- El orden sugerido derollback por riesgo: Hueco 3 (labels, mayor superficie) → Hueco 1 → Hueco 2 → Hueco 5 → Hueco 4 (menor riesgo)
- Cada hueco puede revertirse individualmente sin afectar los demás
- No se tocan archivos generados (`docs/ESTADO.md`, `docs/ROADMAP.md`, etc.)

### Potenciales ramificaciones

- Hueco 3 (labels configurables) requiere UI para que el Dueño seleccione qué labels observar - esto es un cambio de superficie mayor y podría necesitar diseño de componente.
- Hueco 1 (dedupe por messageId) afecta la garantía de idempotency de la ingesta - los tests existentes deben seguir pasando.
- Hueco 5 (scheduler) es un nuevo job cron - debe configurarse en producción con el timezone/cron adecuado.

### Files modified (12 files):

```
src/db/schema-google.ts                      # labels text[] default ['INBOX'] + message_id en gmail_ingestion_jobs
src/lib/repos/gmail-cola.ts                  # encolarIngesta dedupe por messageId
src/lib/repos/google-conexiones.ts           # validación casilla 409 anticipado + labels soportados
src/pages/api/gmail/webhook.ts               # pasa push.messageId
src/jobs/gmail.ts                            # publica evento filtros_actualizados + labels en users.watch
src/pages/api/jobs/gmail-watch-renewer.ts    # nuevo scheduler 24h
drizzle/0048_ggl_p0_huecos.sql               # migración aprobada por Mauri (idempotente)
drizzle/meta/_journal.json                   # journal 49 entries
docs/roadmap/migraciones/0048_ggl_p0_huecos.json  # registro de aprobación/aplicación
tests/* (6 archivos)                         # pepper/control-db/409 anticipado/journal 49
docs/roadmap/prototipos/GGL-P0-HUECOS-prototype.{LOGIC.md,html}  # movidos desde avances/
```

### Migración 0048

Aprobada explícitamente por Mauri (requisito de AGENTS.md para `drizzle/*.sql`): `labels text[] NOT NULL DEFAULT '{INBOX}'` en `google_connections` (Hueco 3) y `message_id text` + unique index en `gmail_ingestion_jobs` (Hueco 1). Idempotente (IF NOT EXISTS). Aplicada con `npm run db:migrate` (wrapper P1-69) en las bases locales de test `pers_tenant_a`/`pers_tenant_b`: `db:migrate:check` journal=49 aplicadas=49 pendientes=0. **Pendiente de aplicar en la base real del piloto antes del merge.**

### Checklist antes del PR

- [x] `npm run typecheck` verde
- [x] `npm run verify` verde: `verify ok (15 pasos)`, 3371 tests (receipt `.verify-receipt.json` ok)
- [x] `npm run roadmap -- --validate`: 300 avances válidos
- [x] Commits atómicos sobre branch `prototipo/GGL-P0-HUECOS`
- [x] No toques `docs/ROADMAP.md` ni archivos generados
- [x] Cada hueco documentado en `docs/roadmap/prototipos/GGL-P0-HUECOS-prototype.LOGIC.md`
- [x] Migración 0048 registrada en `docs/roadmap/migraciones/0048_ggl_p0_huecos.json`

### Comandos de verificación

```bash
# Gates completos (Node 22, Postgres local A/B en 127.0.0.1:54329)
npm run verify

# Validar roadmap
npm run roadmap -- --validate

# Chequeo del gate de merge
node scripts/cadena/puede-mergear.mjs <PR>

# Estado de migraciones
TENANT_DATABASE_URL=postgres://... npm run db:migrate:check
```